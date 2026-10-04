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
    // 启动完成后必须停掉心跳，避免应用整个生命周期被 250ms 定时器唤醒
    expect(bootScript).toContain('stopHeartbeat')
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
