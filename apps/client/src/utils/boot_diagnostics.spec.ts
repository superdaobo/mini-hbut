import { beforeEach, describe, expect, it } from 'vitest'
import {
  BOOT_DIAG_STORAGE_KEY,
  formatBootDiagnosticsReport,
  getBootDiagBridge,
  markBootFinished,
  readBootDiagnostics,
  readStoredBootDiagnostics,
  recordBootStage,
  replayBootDiagnostics,
  resolveBootOutcome,
  resolveNativePreMs,
  resolveProcessAgeAtBootMs,
  sanitizeDetail,
  sanitizeText,
  sanitizeUrl
} from './boot_diagnostics'
import type { BootDiagSnapshot } from './boot_diagnostics'
import { clearDebugLogs, getDebugLogs } from './debug_logger'

const makeSnapshot = (over: Partial<BootDiagSnapshot> = {}): BootDiagSnapshot => ({
  v: 1,
  bootId: 'boot-test-1',
  startedAtWall: 1_700_000_000_000,
  entries: [],
  stalls: [],
  finished: true,
  finishedAt: 120,
  meta: {},
  ...over
})

/** 最小 localStorage 替身（node 环境下没有 Web Storage） */
const installStorage = (seed?: Record<string, string>) => {
  const store = new Map<string, string>(Object.entries(seed ?? {}))
  const fake = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear()
  }
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = fake
  return store
}

const installWindow = (value: Record<string, unknown> = {}) => {
  ;(globalThis as unknown as { window: unknown }).window = value
  return value as Window & Record<string, unknown>
}

beforeEach(() => {
  clearDebugLogs()
  installStorage()
  installWindow()
})

describe('boot_diagnostics 脱敏与截断', () => {
  it('sanitizeUrl 只保留 origin + pathname', () => {
    expect(sanitizeUrl('tauri://localhost/splash/app_icon.png?token=abc#frag')).toBe(
      'tauri://localhost/splash/app_icon.png'
    )
  })

  it('sanitizeText 抹掉敏感键值并截断', () => {
    const redacted = sanitizeText('access_token=secret-value cookie=abc')
    expect(redacted).not.toContain('secret-value')
    expect(redacted).toContain('[已脱敏]')

    const long = sanitizeText('x'.repeat(500), 10)
    expect(long.length).toBeLessThanOrEqual(11)
    expect(long.endsWith('…')).toBe(true)
  })

  it('sanitizeDetail 对 url 类键走 sanitizeUrl，丢弃 undefined', () => {
    const detail = sanitizeDetail({
      url: '/assets/index.js?v=1',
      gap: 1234,
      ok: true,
      missing: undefined,
      note: 'token=leak'
    })
    expect(detail).toBeDefined()
    expect(String(detail?.url)).not.toContain('?')
    expect(detail?.gap).toBe(1234)
    expect(detail?.ok).toBe(true)
    expect('missing' in (detail ?? {})).toBe(false)
    expect(String(detail?.note)).toContain('[已脱敏]')
  })

  it('空 detail 归一为 undefined', () => {
    expect(sanitizeDetail({})).toBeUndefined()
    expect(sanitizeDetail(undefined)).toBeUndefined()
  })
})

describe('boot_diagnostics 读取与持久化', () => {
  it('无 window 桥时读取不抛错且返回空', () => {
    expect(getBootDiagBridge()).toBeNull()
    expect(readStoredBootDiagnostics()).toEqual({})
    expect(readBootDiagnostics()).toEqual({ current: null, previous: null })
    expect(() => recordBootStage('x')).not.toThrow()
    expect(() => markBootFinished()).not.toThrow()
  })

  it('从 localStorage 读取本次与上次启动', () => {
    const previous = makeSnapshot({ bootId: 'boot-prev', finished: false })
    const current = makeSnapshot({ bootId: 'boot-cur' })
    installStorage({
      [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current, previous, restarts: 3 })
    })
    const read = readBootDiagnostics()
    expect(read.current?.bootId).toBe('boot-cur')
    expect(read.previous?.bootId).toBe('boot-prev')
    expect(read.previous?.finished).toBe(false)
  })

  it('损坏的持久化内容被安全忽略', () => {
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: '{not-json' })
    expect(readStoredBootDiagnostics()).toEqual({})
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current: { nope: 1 } }) })
    expect(readStoredBootDiagnostics().current).toBeUndefined()
  })

  it('内存中的实时快照优先于持久化值', () => {
    installStorage({
      [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current: makeSnapshot({ bootId: 'stored' }) })
    })
    installWindow({ __HBU_BOOT_DIAG__: makeSnapshot({ bootId: 'live' }) })
    expect(readBootDiagnostics().current?.bootId).toBe('live')
  })

  it('recordBootStage 经桥写入并脱敏 detail', () => {
    const pushed: Array<{ name: string; detail?: Record<string, unknown> }> = []
    installWindow({
      __hbuBootDiag: {
        push: (name: string, detail?: Record<string, unknown>) => pushed.push({ name, detail }),
        flush: () => {},
        markFinished: () => {},
        snapshot: () => makeSnapshot()
      }
    })
    recordBootStage('splash-removed', { reason: 'timeout-5s', url: '/x?token=leak' })
    expect(pushed).toHaveLength(1)
    expect(pushed[0]?.name).toBe('splash-removed')
    expect(pushed[0]?.detail?.reason).toBe('timeout-5s')
    expect(String(pushed[0]?.detail?.url)).toBe('http://localhost/x')
  })

  it('markBootFinished 转发到桥', () => {
    let finishedWith = ''
    installWindow({
      __hbuBootDiag: {
        push: () => {},
        flush: () => {},
        markFinished: (name: string) => {
          finishedWith = name
        },
        snapshot: () => makeSnapshot()
      }
    })
    markBootFinished('app-mounted')
    expect(finishedWith).toBe('app-mounted')
  })
})

describe('boot_diagnostics 原生前置耗时推算', () => {
  it('用 time_origin 与进程启动墙钟算出「进程启动 → 页面开始加载」', () => {
    // 进程启动于 1_700_000_000_000，导航开始于 +10240ms ⇒ 原生前置 10240ms（白屏 10 秒）
    const snapshot = makeSnapshot({
      entries: [{ t: 81, name: 'native-uptime', detail: { process_started_at: 1_700_000_000_000 } }],
      meta: { time_origin: 1_700_000_010_240 }
    })
    expect(resolveNativePreMs(snapshot)).toBe(10_240)
  })

  it('证据不足时返回 null（不猜一个数字）', () => {
    expect(resolveNativePreMs(null)).toBeNull()
    // 缺 native-uptime 条目
    expect(resolveNativePreMs(makeSnapshot({ meta: { time_origin: 1_700_000_010_240 } }))).toBeNull()
    // 缺 time_origin
    expect(
      resolveNativePreMs(
        makeSnapshot({ entries: [{ t: 81, name: 'native-uptime', detail: { process_started_at: 1_700_000_000_000 } }] })
      )
    ).toBeNull()
    // ⚠️ 只有 rust_uptime_ms（旧的惰性值）时不得拿来反推 —— 会得到假的 0ms
    expect(
      resolveNativePreMs(
        makeSnapshot({
          entries: [{ t: 81, name: 'native-uptime', detail: { rust_uptime_ms: 0 } }],
          meta: { time_origin: 1_700_000_010_240 }
        })
      )
    ).toBeNull()
  })

  it('推算结果不为负（时钟抖动兜底）', () => {
    const snapshot = makeSnapshot({
      entries: [{ t: 81, name: 'native-uptime', detail: { process_started_at: 1_700_000_020_000 } }],
      meta: { time_origin: 1_700_000_010_240 }
    })
    expect(resolveNativePreMs(snapshot)).toBe(0)
  })

  it('进程已运行时长用于区分「旧进程内重载」与「冷启动」', () => {
    const reload = makeSnapshot({
      entries: [{ t: 81, name: 'native-uptime', detail: { rust_uptime_ms: 7_200_000 } }]
    })
    expect(resolveProcessAgeAtBootMs(reload)).toBe(7_200_000)
    expect(resolveProcessAgeAtBootMs(makeSnapshot())).toBeNull()
  })
})

describe('boot_diagnostics 结局判定', () => {
  it('走完启动 + 记录到正常退出 → clean', () => {
    expect(resolveBootOutcome(makeSnapshot({ finished: true, cleanExit: true }))).toBe('clean')
  })

  it('走完启动但未记录正常退出 → abnormal-exit（崩溃/被系统终止/被划掉）', () => {
    expect(resolveBootOutcome(makeSnapshot({ finished: true, cleanExit: false }))).toBe('abnormal-exit')
    expect(resolveBootOutcome(makeSnapshot({ finished: true }))).toBe('abnormal-exit')
  })

  it('连启动都没走完 → incomplete-boot', () => {
    expect(resolveBootOutcome(makeSnapshot({ finished: false, cleanExit: false }))).toBe('incomplete-boot')
  })
})

describe('boot_diagnostics 回放', () => {
  it('把启动页阶段记录回放进调试日志，并标记上次未走完的启动', () => {
    const previous = makeSnapshot({
      bootId: 'boot-prev',
      finished: false,
      entries: [{ t: 10, name: 'inline-script' }]
    })
    const current = makeSnapshot({
      bootId: 'boot-cur',
      finished: true,
      entries: [
        { t: 5, name: 'inline-script' },
        { t: 900, name: 'resource-error', detail: { tag: 'img', url: 'tauri://localhost/splash/app_icon.png' } }
      ],
      stalls: [{ from: 400, to: 20_400, gap: 20_000 }]
    })
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current, previous }) })

    const replayed = replayBootDiagnostics()
    expect(replayed).toBeGreaterThan(0)

    const bootLogs = getDebugLogs(200).filter((item) => item.scope === 'Boot')
    const text = bootLogs.map((item) => item.message).join('\n')
    expect(text).toContain('上次启动结局')
    expect(text).toContain('启动未走完')
    expect(text).toContain('inline-script')
    expect(text).toContain('主线程冻结 20000ms')
    // 资源加载失败以 error 级别写入，便于在设置页筛选
    expect(bootLogs.some((item) => item.level === 'error' && item.message.includes('resource-error'))).toBe(true)
  })

  it('上次走完启动但未记录正常退出（突然崩溃）也会告警', () => {
    const previous = makeSnapshot({ bootId: 'boot-crashed', finished: true, cleanExit: false })
    installStorage({
      [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current: makeSnapshot(), previous })
    })

    replayBootDiagnostics()
    const text = getDebugLogs(200)
      .filter((item) => item.scope === 'Boot')
      .map((item) => item.message)
      .join('\n')
    expect(text).toContain('进程未正常结束')
  })

  it('上次正常结束时不产生告警噪音', () => {
    const previous = makeSnapshot({ bootId: 'boot-ok', finished: true, cleanExit: true })
    installStorage({
      [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current: makeSnapshot(), previous })
    })

    replayBootDiagnostics()
    const text = getDebugLogs(200)
      .filter((item) => item.scope === 'Boot')
      .map((item) => item.message)
      .join('\n')
    expect(text).not.toContain('上次启动结局')
  })

  it('无记录时回放不抛错', () => {
    expect(() => replayBootDiagnostics()).not.toThrow()
  })
})

describe('boot_diagnostics 报告', () => {
  it('报告包含关键分区、长阻塞与资源失败明细', () => {
    const current = makeSnapshot({
      bootId: 'boot-cur',
      entries: [
        { t: 5, name: 'inline-script' },
        { t: 900, name: 'resource-error', detail: { tag: 'img', url: 'tauri://localhost/splash/cas_bg.webp' } }
      ],
      stalls: [{ from: 400, to: 20_400, gap: 20_000 }]
    })
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current, previous: undefined }) })

    const report = formatBootDiagnosticsReport()
    expect(report).toContain('=== Mini-HBUT 启动诊断报告 ===')
    expect(report).toContain('本次启动时间线')
    expect(report).toContain('上次启动时间线')
    expect(report).toContain('[主线程冻结]')
    expect(report).toContain('资源加载失败汇总')
    expect(report).toContain('/splash/cas_bg.webp')
    expect(report).toContain('启动阶段指标（boot_metrics）')
    expect(report).toContain('=== 报告结束 ===')
  })

  it('报告置顶给出上次启动结局，并显示启动页可见时长与存活时长', () => {
    const current = makeSnapshot({
      bootId: 'boot-cur',
      finished: true,
      cleanExit: false,
      entries: [
        { t: 5, name: 'inline-script' },
        { t: 63, name: 'splash-removed', detail: { reason: 'vue-mount', elapsed: 63 } }
      ],
      meta: { alive_ms: 12_000 }
    })
    const previous = makeSnapshot({ bootId: 'boot-prev', finished: true, cleanExit: true })
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current, previous }) })

    const report = formatBootDiagnosticsReport()
    expect(report).toContain('上次启动结局: 正常结束')
    expect(report).toContain('结局: 启动完成后进程未正常结束')
    expect(report).toContain('启动页可见时长: 63ms（移除原因 vue-mount）')
    expect(report).toContain('进程最后存活: 12000ms')
    expect(report).toContain('是否记录到正常退出: 否')
  })

  it('首次启动（无上次记录）时报告明确说明', () => {
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current: makeSnapshot() }) })
    expect(formatBootDiagnosticsReport()).toContain('这是本次诊断上线后的第一次启动')
  })

  it('本次启动仍在运行时标注「进行中」，不误报为「未正常结束」', () => {
    const live = makeSnapshot({ bootId: 'boot-live', finished: true, cleanExit: false })
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current: live }) })
    installWindow({ __HBU_BOOT_DIAG__: live })

    const report = formatBootDiagnosticsReport()
    expect(report).toContain('进行中（本次进程仍在运行，尚未记录退出）')
  })

  it('报告给出「原生前置」与「页面加载」两段耗时（白屏 10 秒的定位依据）', () => {
    const current = makeSnapshot({
      entries: [{ t: 81, name: 'native-uptime', detail: { process_started_at: 1_700_000_000_000, rust_uptime_ms: 120 } }],
      meta: { nav_ms: 240, time_origin: 1_700_000_010_240 }
    })
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current }) })

    const report = formatBootDiagnosticsReport()
    expect(report).toContain('原生前置（进程启动 → 页面开始加载）: 10240ms')
    expect(report).toContain('页面加载（导航开始 → 内联脚本）: 240ms')
    // 进程年龄小 ⇒ 不标注「旧进程内重载」
    expect(report).not.toContain('旧进程内重载，不是冷启动')
  })

  it('本次启动来自 #451 硬重载时明确标出（否则与冷启动无法区分）', () => {
    const current = makeSnapshot({
      entries: [{ t: 81, name: 'native-uptime', detail: { rust_uptime_ms: 7_200_000 } }],
      meta: { hard_reload_boot: true, hard_reload_age_ms: 800, hard_reload_count: 2 }
    })
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current }) })

    const report = formatBootDiagnosticsReport()
    expect(report).toContain('本次启动由 #451 硬重载触发')
    expect(report).toContain('旧进程内重载，不是冷启动')
  })

  it('出现原生无响应时给出「卡在原生主线程」的结论（JS 未冻结但原生无响应）', () => {
    const current = makeSnapshot({
      entries: [
        { t: 5_000, name: 'native-stall', detail: { cost_ms: 3_000, ok: false, timed_out: true } },
        { t: 10_000, name: 'native-stall', detail: { cost_ms: 2_500, ok: false } }
      ]
    })
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current }) })

    const report = formatBootDiagnosticsReport()
    expect(report).toContain('原生无响应: 2 次')
    expect(report).toContain('卡在**原生主线程**')
  })

  it('启动历史暴露「页面重载 / 崩溃循环」（相邻间隔 <5s 会被标注）', () => {
    const base = 1_700_000_000_000
    const current = makeSnapshot({
      history: [
        { at: base, finished: true, cleanExit: false, aliveMs: 3000 },
        { at: base + 3000, finished: true, cleanExit: false, aliveMs: 2500 },
        { at: base + 90_000, finished: false, cleanExit: false }
      ]
    })
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current }) })

    const report = formatBootDiagnosticsReport()
    expect(report).toContain('最近启动历史（新 → 旧）')
    expect(report).toContain('疑似页面重载 / 崩溃循环')
    expect(report).toContain('启动未走完')
    expect(report).toContain('走完启动')
  })

  it('无历史记录时该分区仍可用', () => {
    installStorage({ [BOOT_DIAG_STORAGE_KEY]: JSON.stringify({ current: makeSnapshot() }) })
    const report = formatBootDiagnosticsReport()
    expect(report).toContain('最近启动历史（新 → 旧）')
  })

  it('无记录时报告仍然可用', () => {
    const report = formatBootDiagnosticsReport()
    expect(report).toContain('（无记录）')
    expect(report).toContain('=== 报告结束 ===')
  })
})
