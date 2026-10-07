/**
 * 启动页「最小展示时长」行为测试（#991）。
 *
 * 为什么单独测：延后摘除是纯时序逻辑（挂载 → 推迟 → 到点摘除；点击/兜底不受约束），
 * 只断言源码里存在某个字符串无法证明它真的按预期工作。这里用**虚拟时钟 + 最小假 DOM**
 * 直接把 `index.html` 的内联脚本跑起来，驱动时间并检查真实副作用。
 *
 * 两个状态必须分开：
 * - `removalInitiated()`：脚本已开始摘除（进入淡出或直接摘除）；
 * - `detached()`：元素真正从 DOM 移除（淡出路径在 280ms 后才 removeChild）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

const bootScript = (() => {
  const matches = Array.from(indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))
  const found = matches.map((m) => m[1]).find((body) => body.includes('__hbuBootDiag'))
  if (!found) throw new Error('未在 index.html 中找到启动诊断内联脚本')
  return found
})()

interface BootEntry {
  t: number
  name: string
  detail?: Record<string, unknown>
}

interface Harness {
  advance: (ms: number) => void
  entries: () => BootEntry[]
  /** 已开始摘除（进入淡出或直接摘除） */
  removalInitiated: () => boolean
  /** 元素已从 DOM 移除 */
  detached: () => boolean
  removeNativeSplash: (reason: string) => void
}

const createHarness = ({ splashEnabled }: { splashEnabled: boolean }): Harness => {
  // ── 虚拟时钟 ──
  let now = 0
  let seq = 1
  const timers = new Map<number, { at: number; fn: () => void; every?: number }>()

  const setTimeoutFn = (fn: () => void, ms?: number) => {
    const id = seq++
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn })
    return id as unknown as ReturnType<typeof setTimeout>
  }
  const setIntervalFn = (fn: () => void, ms?: number) => {
    const id = seq++
    const period = Math.max(1, Number(ms) || 1)
    timers.set(id, { at: now + period, fn, every: period })
    return id as unknown as ReturnType<typeof setInterval>
  }
  const clearTimer = (id: unknown) => {
    timers.delete(Number(id))
  }
  const advance = (ms: number) => {
    const target = now + ms
    for (let guard = 0; guard < 10_000; guard += 1) {
      let nextId: number | null = null
      let nextAt = Number.POSITIVE_INFINITY
      for (const [id, timer] of timers) {
        if (timer.at <= target && timer.at < nextAt) {
          nextAt = timer.at
          nextId = id
        }
      }
      if (nextId === null) break
      const timer = timers.get(nextId) as { at: number; fn: () => void; every?: number }
      now = timer.at
      if (timer.every) timer.at = now + timer.every
      else timers.delete(nextId)
      timer.fn()
    }
    now = target
  }

  // ── 最小假 DOM ──
  let detached = false
  let fadeStarted = false
  const style: Record<string, string> = {}
  Object.defineProperty(style, 'opacity', {
    get: () => '',
    set: () => {
      fadeStarted = true
    },
    configurable: true
  })
  const splashEl = {
    style,
    parentNode: { removeChild: () => { detached = true } },
    remove: () => {
      detached = true
    }
  }
  const documentStub = {
    readyState: 'loading',
    visibilityState: 'visible',
    documentElement: {
      getAttribute: (name: string) => (name === 'data-splash' && !splashEnabled ? 'off' : null)
    },
    getElementById: (id: string) => (id === 'native-splash' && !detached ? splashEl : null),
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {}
  }
  const windowStub: Record<string, unknown> = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    devicePixelRatio: 3
  }
  const storage = new Map<string, string>()
  const localStorageStub = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, String(v))
    },
    removeItem: (k: string) => {
      storage.delete(k)
    }
  }
  const ImageStub = function ImageStub(this: Record<string, unknown>) {
    this.naturalWidth = 0
  }

  const factory = new Function(
    'window',
    'document',
    'localStorage',
    'performance',
    'setTimeout',
    'setInterval',
    'clearTimeout',
    'clearInterval',
    'Image',
    'location',
    'navigator',
    'screen',
    'URL',
    'console',
    bootScript
  )

  factory(
    windowStub,
    documentStub,
    localStorageStub,
    { now: () => now },
    setTimeoutFn,
    setIntervalFn,
    clearTimer,
    clearTimer,
    ImageStub,
    { href: 'tauri://localhost/index.html' },
    { userAgent: 'test', hardwareConcurrency: 4 },
    { width: 440, height: 956 },
    URL,
    { info: () => {}, warn: () => {}, error: () => {} }
  )

  const snapshot = (windowStub.__HBU_BOOT_DIAG__ ?? {}) as { entries?: BootEntry[] }

  return {
    advance,
    entries: () => snapshot.entries ?? [],
    removalInitiated: () => fadeStarted || detached,
    detached: () => detached,
    removeNativeSplash: (reason: string) =>
      (windowStub.__removeNativeSplash as (r?: string) => void)(reason)
  }
}

const removedEntry = (h: Harness) => h.entries().find((e) => e.name === 'splash-removed')

describe('启动页最小展示时长（#991）', () => {
  it('开启开屏动画：挂载时不立刻摘除，到最小时长才开始摘（入场动画得以播完）', () => {
    const h = createHarness({ splashEnabled: true })

    // 模拟「61ms 挂载完成」——此前这里会立刻摘掉启动页，只剩一闪
    h.advance(61)
    h.removeNativeSplash('vue-mount')

    expect(h.removalInitiated()).toBe(false)
    expect(h.entries().some((e) => e.name === 'splash-hold')).toBe(true)

    h.advance(1000) // 累计 1061ms，仍不足 MIN_VISIBLE_MS(1400)
    expect(h.removalInitiated()).toBe(false)

    h.advance(400) // 累计 1461ms，已过 1400ms → 进入淡出
    expect(h.removalInitiated()).toBe(true)
    expect(removedEntry(h)?.detail?.reason).toBe('hold-elapsed')
    expect(Number(removedEntry(h)?.detail?.elapsed)).toBeGreaterThanOrEqual(1400)

    // 淡出 280ms 后才真正从 DOM 摘除
    expect(h.detached()).toBe(false)
    h.advance(300)
    expect(h.detached()).toBe(true)
  })

  it('点击跳过不受最小时长约束（用户主动要走就必须立刻走）', () => {
    const h = createHarness({ splashEnabled: true })
    h.advance(200)
    h.removeNativeSplash('click')

    expect(h.removalInitiated()).toBe(true)
    expect(removedEntry(h)?.detail?.reason).toBe('click')
    expect(removedEntry(h)?.detail?.forced).toBe(true)
  })

  it('关闭开屏动画：原生启动页直接摘除，并记为 skipped 而非卡住', () => {
    const h = createHarness({ splashEnabled: false })
    h.advance(61)
    h.removeNativeSplash('vue-mount')

    expect(h.detached()).toBe(true)
    expect(h.entries().some((e) => e.name === 'splash-skipped')).toBe(true)
    expect(removedEntry(h)).toBeUndefined()
  })

  it('启动始终未完成时，2s 兜底仍能摘除（不受最小时长阻碍）', () => {
    const h = createHarness({ splashEnabled: true })
    h.advance(2100)

    expect(h.removalInitiated()).toBe(true)
    expect(removedEntry(h)?.detail?.reason).toBe('timeout-2s')
    h.advance(300)
    expect(h.detached()).toBe(true)
  })

  it('启动慢于最小时长时，挂载即摘除（不额外等待）', () => {
    const h = createHarness({ splashEnabled: true })
    h.advance(1800)
    h.removeNativeSplash('vue-mount')

    expect(h.removalInitiated()).toBe(true)
    expect(removedEntry(h)?.detail?.reason).toBe('vue-mount')
  })

  it('启动页可见时长被如实记录（报告据此判断动画是否播完）', () => {
    const h = createHarness({ splashEnabled: true })
    h.advance(61)
    h.removeNativeSplash('vue-mount')
    h.advance(1500)

    const elapsed = Number(removedEntry(h)?.detail?.elapsed)
    expect(elapsed).toBeGreaterThanOrEqual(1400)
    expect(elapsed).toBeLessThan(1600)
  })
})
