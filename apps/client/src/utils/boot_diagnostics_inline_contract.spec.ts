/**
 * 启动诊断采集脚本契约（#991 / #992）。
 *
 * `index.html` 的内联脚本是启动页阶段**唯一**的采集点：它必须在任何模块脚本之前
 * 建立 `window.__hbuBootDiag` 桥，否则 `initDebugLogger()` 之前的证据全部丢失。
 * 该脚本不在 TS 编译范围内，因此这里用源码契约测试把它锁住：
 * 1) 语法可编译（`new Function` 只编译不执行）；
 * 2) 桥的 API 形状与 `boot_diagnostics.ts` 的消费契约一致；
 * 3) 关键采集点存在（主线程心跳 / 资源加载失败 / 启动页移除归因 / 跨启动保留）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

/** 取出 index.html 中第一段不含 src 的内联脚本（即启动诊断脚本） */
const extractInlineBootScript = (): string => {
  const matches = Array.from(indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))
  const found = matches.map((match) => match[1]).find((body) => body.includes('__hbuBootDiag'))
  if (!found) throw new Error('未在 index.html 中找到启动诊断内联脚本')
  return found
}

const bootScript = extractInlineBootScript()

describe('启动诊断内联脚本契约（#991/#992）', () => {
  it('语法可编译（只编译不执行，避免依赖 DOM）', () => {
    expect(() => new Function(bootScript)).not.toThrow()
  })

  it('桥的 API 形状与 boot_diagnostics.ts 消费契约一致', () => {
    expect(bootScript).toContain('window.__hbuBootDiag')
    expect(bootScript).toContain('window.__HBU_BOOT_DIAG__')
    for (const method of ['push', 'flush', 'markFinished', 'snapshot']) {
      expect(bootScript, `桥缺少 ${method}`).toContain(`${method}:`)
    }
  })

  it('持久化键与 boot_diagnostics.ts 一致，且保留上一次启动', () => {
    expect(bootScript).toContain("'hbu_boot_diag_v1'")
    expect(bootScript).toContain('current: state')
    expect(bootScript).toContain('previous: previous')
  })

  it('包含主线程冻结心跳（这是判定「主线程被阻塞」的核心证据）', () => {
    expect(bootScript).toContain('main-thread-stall')
    expect(bootScript).toMatch(/HEARTBEAT_MS\s*=\s*\d+/)
    expect(bootScript).toMatch(/STALL_THRESHOLD_MS\s*=\s*\d+/)
    // 启动完成后必须停掉高频心跳，避免应用整个生命周期被 250ms 定时器唤醒
    expect(bootScript).toContain('stopHeartbeat')
  })

  it('启动完成后降频为存活心跳（用于捕捉「启动完成后突然崩溃」）', () => {
    expect(bootScript).toContain('startLiveness')
    expect(bootScript).toContain('stopLiveness')
    expect(bootScript).toMatch(/LIVENESS_MS\s*=\s*\d+/)
    expect(bootScript).toMatch(/LIVENESS_MAX_TICKS\s*=\s*\d+/)
    expect(bootScript).toContain('alive_ms')
  })

  it('正常退出留痕（cleanExit），否则下一轮无法区分「突然崩溃」与「走完启动」', () => {
    expect(bootScript).toContain('cleanExit')
    expect(bootScript).toContain("'pagehide'")
    expect(bootScript).toContain("'beforeunload'")
  })

  it('捕获子资源加载失败（捕获阶段，资源 error 不冒泡）', () => {
    expect(bootScript).toContain("document.addEventListener('error'")
    expect(bootScript).toContain('resource-error')
    // 必须使用捕获阶段，否则 img/link/script 的 error 收不到
    expect(bootScript).toMatch(/\},\s*true\s*\)/)
  })

  it('观测启动页三张图是否真的拿到（区分「没拿到」与「拿到了未上屏」）', () => {
    expect(bootScript).toContain('splash-image')
    expect(bootScript).toContain('splash-bg')
    expect(bootScript).toContain('/splash/cas_bg.webp')
    expect(bootScript).toContain('naturalWidth')
  })

  it('启动页移除记录「原因 + 耗时」', () => {
    expect(bootScript).toContain('splash-removed')
    expect(bootScript).toContain('elapsed')
    expect(bootScript).toContain('timeout-2s')
    expect(bootScript).toContain('timeout-5s')
  })

  it('启动页最小展示时长：入场动画播完前不摘除，但用户主动跳过与兜底超时不受约束', () => {
    expect(bootScript).toMatch(/MIN_VISIBLE_MS\s*=\s*\d+/)
    expect(bootScript).toContain('splash-hold')
    expect(bootScript).toContain('hold-elapsed')
    // 点击/按键跳过必须是强制路径（不能被最小时长挡住）
    expect(bootScript).toMatch(/reason === 'click' \|\| reason === 'keydown'/)
  })

  it('原生启动页必须在 #app 之外（否则 Vue 挂载会把它连同子节点一起清掉）', () => {
    const splashIndex = indexHtml.indexOf('class="native-splash"')
    const appIndex = indexHtml.indexOf('<div id="app">')
    expect(splashIndex).toBeGreaterThan(-1)
    expect(appIndex).toBeGreaterThan(-1)
    // 启动页先出现，且 #app 是空挂载点（启动页不再包在它里面）
    expect(splashIndex).toBeLessThan(appIndex)
    expect(indexHtml).toContain('<div id="app"></div>')
  })

  it('原生启动页 z-index 高于 Vue SplashScreen，避免双层启动页闪现', () => {
    // Vue 侧 SplashScreen.vue 用 99999；原生层必须更高
    expect(indexHtml).toMatch(/\.native-splash\s*\{[\s\S]*?z-index:\s*100000/)
  })

  it('尊重「开屏动画」开关：关闭时原生启动页不出现（否则开关形同无效）', () => {
    // 首绘前的 head 脚本读设置并打标记
    expect(indexHtml).toContain("localStorage.getItem('hbu_ui_settings_v2')")
    expect(indexHtml).toContain("setAttribute('data-splash', 'off')")
    // CSS 按标记隐藏原生启动页
    expect(indexHtml).toContain("html[data-splash='off'] .native-splash")
    // 采集侧把「跳过」与「卡住后移除」区分开
    expect(bootScript).toContain('splash-skipped')
    expect(bootScript).toContain('splash_enabled')

    // 打标记的脚本必须早于启动页标记出现（否则会先绘制一帧再隐藏 → 仍是一闪而过）
    const markIndex = indexHtml.indexOf("setAttribute('data-splash', 'off')")
    const splashMarkupIndex = indexHtml.indexOf('class="native-splash"')
    expect(markIndex).toBeGreaterThan(-1)
    expect(splashMarkupIndex).toBeGreaterThan(-1)
    expect(markIndex).toBeLessThan(splashMarkupIndex)
  })

  it('记录「页面加载」阶段耗时与导航起点（否则报告里的 +Nms 都相对内联脚本，看不见加载本身）', () => {
    expect(bootScript).toContain('nav_ms')
    expect(bootScript).toContain('timeOrigin')
    expect(bootScript).toContain("getEntriesByType('navigation')")
    expect(bootScript).toContain('nav_response_ms')
  })

  it('记录首帧 FCP / LCP（「白屏多久」的直接答案，且能区分是不是主线程被卡）', () => {
    expect(bootScript).toContain('recordPaintMetrics')
    expect(bootScript).toContain('first-contentful-paint')
    expect(bootScript).toContain('largest-contentful-paint')
    expect(bootScript).toContain('paint_fcp_ms')
    // 两个类型必须分开注册：LCP 不被支持时不能让 paint 一起失效
    expect(bootScript).toMatch(/PerformanceObserver\(onEntries\)\.observe\(\{ type: 'paint'/)
  })

  it('识别「本次启动是 #451 硬重载」而不是冷启动（新页面里两者无法区分）', () => {
    expect(bootScript).toContain("'hbu_hard_reload_state_v1'")
    expect(bootScript).toContain('hard-reload-boot')
    expect(bootScript).toContain('hard_reload_boot')
    expect(bootScript).toContain('hard_reload_age_ms')
  })

  it('原生响应探测：测「JS 还活着但原生主线程被卡」（心跳看不见这一类）', () => {
    expect(bootScript).toContain('probeNativeResponsiveness')
    expect(bootScript).toContain('native-stall')
    expect(bootScript).toMatch(/NATIVE_PROBE_MS\s*=\s*\d+/)
    expect(bootScript).toMatch(/NATIVE_STALL_MS\s*=\s*\d+/)
    expect(bootScript).toContain('native_probe_ms')
  })

  it('保留最近多次启动历史（只留两次会吃掉崩溃 / 重载循环）', () => {
    expect(bootScript).toMatch(/MAX_HISTORY\s*=\s*\d+/)
    expect(bootScript).toContain('history: history')
    expect(bootScript).toContain('historyEntry')
    // 历史条目必须同步结局，否则历史永远是「未走完」
    expect(bootScript).toContain('historyEntry.finished = state.finished')
    expect(bootScript).toContain('historyEntry.cleanExit = state.cleanExit')
  })

  it('URL 脱敏处理非特殊 scheme（tauri:// 的 origin 为字面量 "null"）', () => {
    expect(bootScript).toContain("url.origin !== 'null'")
  })

  it('脚本位于模块入口之前（否则启动页阶段证据仍会丢失）', () => {
    const bootIndex = indexHtml.indexOf('__hbuBootDiag')
    const moduleIndex = indexHtml.indexOf('type="module"')
    expect(bootIndex).toBeGreaterThan(-1)
    expect(moduleIndex).toBeGreaterThan(-1)
    expect(bootIndex).toBeLessThan(moduleIndex)
  })
})
