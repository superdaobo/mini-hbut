/**
 * #1114 校园码刷新链/订单轮询回归测试。
 *
 * 仓库未引入 DOM 测试环境，因此这里全部针对「依赖可注入的纯控制器」做假时钟测试：
 * - 连续失败的有界退避（5/10/20/30s 封顶，永不永久停止、不风暴）；
 * - 失败后成功恢复周期；
 * - 鉴权失败/业务拒绝不自动重试（手动仍可）；
 * - 手动触发清理待执行 timer，旧请求晚到不覆盖；
 * - stop/dispose 后不再发请求；
 * - 订单轮询失败绝不产生成功载荷（不伪造已支付）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RETRY_DELAYS_MS,
  classifyCampusCodeFailure,
  createCampusCodeRefreshChain,
  createOrderStatusPoller,
  nextRetryDelayMs
} from './campus_code_refresh.js'

const flush = async () => {
  // 让 await request() 的拒绝/完成继续走完同步链（调度 timer）
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('nextRetryDelayMs', () => {
  it('按 5/10/20/30s 递增并在第 4 次后封顶', () => {
    expect(RETRY_DELAYS_MS).toEqual([5000, 10000, 20000, 30000])
    expect(nextRetryDelayMs(1)).toBe(5000)
    expect(nextRetryDelayMs(2)).toBe(10000)
    expect(nextRetryDelayMs(3)).toBe(20000)
    expect(nextRetryDelayMs(4)).toBe(30000)
    expect(nextRetryDelayMs(9)).toBe(30000)
  })

  it('非法/0/负数按第 1 次处理，永不返回 0', () => {
    expect(nextRetryDelayMs(0)).toBe(5000)
    expect(nextRetryDelayMs(-3)).toBe(5000)
    expect(nextRetryDelayMs(Number.NaN)).toBe(5000)
  })
})

describe('classifyCampusCodeFailure', () => {
  it('识别 A1 六类 kind 与可重试语义', () => {
    expect(classifyCampusCodeFailure({ kind: 'campus_code_auth_required' })).toMatchObject({
      kind: 'auth_required',
      retryable: false
    })
    expect(classifyCampusCodeFailure({ kind: 'campus_code_business_rejected' })).toMatchObject({
      kind: 'business_rejected',
      retryable: false
    })
    for (const kind of [
      'campus_code_empty_response',
      'campus_code_non_json',
      'campus_code_upstream_unavailable',
      'campus_code_transport'
    ]) {
      expect(classifyCampusCodeFailure({ kind })).toMatchObject({ retryable: true })
    }
  })

  it('兼容桥 payload / Tauri 对象 / Axios response / 字符串', () => {
    expect(
      classifyCampusCodeFailure({
        success: false,
        error: { kind: 'campus_code_non_json', message: 'not json' }
      })
    ).toMatchObject({ kind: 'non_json', message: 'not json', retryable: true })

    expect(
      classifyCampusCodeFailure({
        response: {
          data: { error: { kind: 'campus_code_auth_required', message: 'expired' } }
        }
      })
    ).toMatchObject({ kind: 'auth_required', message: 'expired' })

    expect(classifyCampusCodeFailure('network down')).toMatchObject({
      kind: 'unknown',
      message: 'network down',
      retryable: true
    })
  })
})

describe('createCampusCodeRefreshChain', () => {
  it('自动刷新连续失败按 5/10/20/30/30s 继续，不永久停止', async () => {
    const request = vi.fn().mockRejectedValue({ kind: 'campus_code_empty_response' })
    const states: any[] = []
    const chain = createCampusCodeRefreshChain({
      request,
      getIntervalMs: () => 60000,
      onState: (state: any) => states.push(state)
    })

    chain.start()
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    expect(states[states.length - 1]).toMatchObject({ status: 'failed', retryDelayMs: 5000 })

    // 每次失败后按当前阶梯退避；第 4 次起封顶 30s，仍会继续重试
    const delays = [5000, 10000, 20000, 30000, 30000]
    for (let index = 1; index < delays.length; index += 1) {
      await vi.advanceTimersByTimeAsync(delays[index - 1])
      await flush()
      expect(request).toHaveBeenCalledTimes(index + 1)
      expect(states[states.length - 1]).toMatchObject({ status: 'failed', retryDelayMs: delays[index] })
    }

    // 封顶后继续重试，证明「永不永久停止」
    await vi.advanceTimersByTimeAsync(30000)
    await flush()
    expect(request).toHaveBeenCalledTimes(6)
    expect(states[states.length - 1]).toMatchObject({ status: 'failed', retryDelayMs: 30000 })

    chain.stop()
  })

  it('失败后成功：恢复周期、重置失败计数并回调载荷', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce({ kind: 'campus_code_transport' })
      .mockResolvedValue({ qrcode: 'new-code' })
    const onSuccess = vi.fn()
    const states: any[] = []
    const chain = createCampusCodeRefreshChain({
      request,
      getIntervalMs: () => 60000,
      onSuccess,
      onState: (state: any) => states.push(state)
    })

    chain.start()
    await flush()
    expect(states[states.length - 1].status).toBe('failed')

    await vi.advanceTimersByTimeAsync(5000)
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledWith({ qrcode: 'new-code' })
    expect(states[states.length - 1]).toMatchObject({ status: 'ready', failureCount: 0, retryDelayMs: null })

    // 成功后回到正常周期（60s），而不是退避
    await vi.advanceTimersByTimeAsync(59999)
    expect(request).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(request).toHaveBeenCalledTimes(3)

    chain.stop()
  })

  it('鉴权失败不自动重试，手动触发仍可用', async () => {
    const request = vi.fn().mockRejectedValue({ kind: 'campus_code_auth_required' })
    const states: any[] = []
    const chain = createCampusCodeRefreshChain({
      request,
      getIntervalMs: () => 60000,
      onState: (state: any) => states.push(state)
    })

    chain.start()
    await flush()
    expect(states[states.length - 1].status).toBe('stopped_auth')

    await vi.advanceTimersByTimeAsync(120000)
    expect(request).toHaveBeenCalledTimes(1)

    chain.triggerNow()
    await flush()
    expect(request).toHaveBeenCalledTimes(2)

    chain.stop()
  })

  it('手动触发清理待执行 timer，旧请求晚到不覆盖新结果', async () => {
    let resolveFirst!: (value: unknown) => void
    const first = new Promise((resolve) => {
      resolveFirst = resolve
    })
    const request = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({ qrcode: 'fresh' })
    const onSuccess = vi.fn()
    const chain = createCampusCodeRefreshChain({
      request,
      getIntervalMs: () => 60000,
      onSuccess
    })

    chain.start()
    await flush()
    expect(request).toHaveBeenCalledTimes(1)

    chain.triggerNow()
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)

    // 旧请求此时才返回：必须被序号守卫丢弃
    resolveFirst({ qrcode: 'stale' })
    await flush()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith({ qrcode: 'fresh' })

    chain.stop()
  })

  it('stop 后清理 timer，不再发请求', async () => {
    const request = vi.fn().mockResolvedValue({ qrcode: 'ok' })
    const states: any[] = []
    const chain = createCampusCodeRefreshChain({
      request,
      getIntervalMs: () => 60000,
      onState: (state: any) => states.push(state)
    })

    chain.start()
    await flush()
    expect(request).toHaveBeenCalledTimes(1)

    chain.stop()
    expect(states[states.length - 1].status).toBe('stopped')
    await vi.advanceTimersByTimeAsync(120000)
    expect(request).toHaveBeenCalledTimes(1)
  })
})

describe('createOrderStatusPoller', () => {
  it('轮询失败按退避继续，且绝不产生成功载荷', async () => {
    const request = vi.fn().mockRejectedValue({ kind: 'campus_code_upstream_unavailable' })
    const onResult = vi.fn()
    const states: any[] = []
    const poller = createOrderStatusPoller({
      request,
      getIntervalMs: () => 3000,
      shouldContinue: () => true,
      onResult,
      onState: (state: any) => states.push(state)
    })

    poller.start()
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    expect(states[states.length - 1]).toMatchObject({ status: 'failed', failureCount: 1 })
    expect(onResult).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
    expect(onResult).not.toHaveBeenCalled()

    poller.stop()
  })

  it('二维码失效（shouldContinue=false）时停止轮询', async () => {
    let hasQr = true
    const request = vi.fn().mockResolvedValue({ status: '5' })
    const poller = createOrderStatusPoller({
      request,
      getIntervalMs: () => 3000,
      shouldContinue: () => hasQr
    })

    poller.start()
    await flush()
    expect(request).toHaveBeenCalledTimes(1)

    hasQr = false
    await vi.advanceTimersByTimeAsync(3000)
    await flush()
    expect(request).toHaveBeenCalledTimes(1)

    poller.stop()
  })
})
