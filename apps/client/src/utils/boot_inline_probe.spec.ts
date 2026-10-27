import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * #1039：直接执行 index.html 内联探针，验证真实启动代码的并发与超时行为。
 * 不复制一份探针实现，避免单测通过但真机脚本仍旧堆积请求。
 */
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const start = html.indexOf('      var nativeProbePending = false')
const end = html.indexOf('      // 安全网：即便启动始终未完成', start)
if (start < 0 || end < 0) throw new Error('启动页的资源探针代码未找到')
const probeScript = html.slice(start, end)

type ProbeResult = { ok: boolean }
type FetchOptions = { signal?: AbortSignal; cache?: string }
type FetchImplementation = (url: string, options: FetchOptions) => Promise<ProbeResult>

const createProbe = (fetchImpl: FetchImplementation) => {
  const entries: Array<{ name: string; detail: Record<string, unknown> }> = []
  const state = { meta: {} as Record<string, number> }
  const context = {
    state,
    NATIVE_PROBE_TIMEOUT_MS: 3000,
    NATIVE_STALL_MS: 1000,
    AbortController,
    Promise,
    document: { visibilityState: 'visible' },
    fetch: fetchImpl,
    nowFn: () => Date.now(),
    rel: (value: number) => value,
    push: (name: string, detail: Record<string, unknown>) => entries.push({ name, detail }),
    flush: () => {},
    setTimeout,
    clearTimeout
  }
  runInNewContext(
    probeScript + '\n;globalThis.__probeApi = { probeNativeResponsiveness, stopNativeProbe }',
    context
  )
  const api = (
    context as typeof context & {
      __probeApi: { probeNativeResponsiveness: () => void; stopNativeProbe: () => void }
    }
  ).__probeApi
  return { ...api, entries, state, document: context.document }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('启动内联同源静态资源探针 single-flight', () => {
  it('悬挂请求即使超时后 Abort 未结算，也不会累积第二条在途请求', async () => {
    vi.useFakeTimers()
    const calls: AbortSignal[] = []
    const fetchImpl = vi.fn((_url: string, options: FetchOptions) => {
      if (options.signal) calls.push(options.signal)
      return new Promise<ProbeResult>(() => {})
    })
    const probe = createProbe(fetchImpl)
    probe.probeNativeResponsiveness()
    probe.probeNativeResponsiveness()
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3000)
    expect(calls[0]?.aborted).toBe(true)
    expect(probe.state.meta.native_probe_timeouts).toBe(1)
    expect(probe.entries).toHaveLength(1)
    expect(probe.entries[0]?.detail?.timed_out).toBe(true)

    probe.probeNativeResponsiveness()
    await vi.advanceTimersByTimeAsync(20_000)
    probe.probeNativeResponsiveness()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    probe.stopNativeProbe()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('Abort 正常结算后可以探测恢复，请求成功会清空连续超时次数', async () => {
    vi.useFakeTimers()
    let attempt = 0
    const fetchImpl = vi.fn((_url: string, options: FetchOptions) => {
      attempt += 1
      if (attempt > 1) return Promise.resolve({ ok: true })
      return new Promise<ProbeResult>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    const probe = createProbe(fetchImpl)
    probe.probeNativeResponsiveness()
    await vi.advanceTimersByTimeAsync(3000)
    expect(probe.state.meta.native_probe_consecutive_timeouts).toBe(1)

    probe.probeNativeResponsiveness()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(probe.state.meta.native_probe_requests).toBe(2)
    expect(probe.state.meta.native_probe_consecutive_timeouts).toBe(0)
    probe.stopNativeProbe()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('文档隐藏和探针停止后不再发起新请求', () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true }))
    const probe = createProbe(fetchImpl)
    probe.document.visibilityState = 'hidden'
    probe.probeNativeResponsiveness()
    expect(fetchImpl).not.toHaveBeenCalled()
    probe.document.visibilityState = 'visible'
    probe.stopNativeProbe()
    probe.probeNativeResponsiveness()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
