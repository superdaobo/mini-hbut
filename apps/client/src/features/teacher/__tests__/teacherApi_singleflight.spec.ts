// src/features/teacher/__tests__/teacherApi_singleflight.spec.ts
//
// Teacher Portal V2（#1067）：教师只读 API 本层 in-flight singleflight 契约测试。
//
// 覆盖：
//   1. 同 scope/学期/筛选的并发调用合并为一次底层请求；
//   2. 不同 scope 的并发调用**不**复用（防切号串号）；
//   3. 请求结束后在途表清空，后续调用重新发起；
//   4. 失败不缓存，允许重试。

import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ bridgePost: vi.fn() }))

vi.mock('../../../utils/axios_adapter/bridge', () => ({
  hasTauri: false,
  bridgePost: bridge.bridgePost,
  invoke: vi.fn(),
  errorMessage: (error: unknown) =>
    String((error as { message?: unknown })?.message ?? error ?? ''),
  unwrapBridge: (response: unknown) => (response as { data?: unknown })?.data
}))

import {
  clearTeacherFetchInFlight,
  fetchTeacherNotices,
  fetchTeacherTeaching,
  teacherFetchInFlightCount
} from '../api/teacherApi'

const okTeaching = { success: true, data: { tasks: [], classes: [] } }

beforeEach(() => {
  bridge.bridgePost.mockReset()
  clearTeacherFetchInFlight()
})

describe('#1067 teacherApi singleflight', () => {
  it('同 scope/学期并发调用合并为一次底层请求', async () => {
    let release: (value: unknown) => void = () => {}
    bridge.bridgePost.mockImplementation(
      () => new Promise((resolve) => { release = resolve })
    )
    const first = fetchTeacherTeaching('2026-2027-1', { scope: 'T0001' })
    const second = fetchTeacherTeaching('2026-2027-1', { scope: 'T0001' })

    expect(teacherFetchInFlightCount()).toBe(1)
    expect(bridge.bridgePost).toHaveBeenCalledTimes(1)

    release(okTeaching)
    const [a, b] = await Promise.all([first, second])
    expect(a).toEqual(b)
    expect(bridge.bridgePost).toHaveBeenCalledTimes(1)
    expect(teacherFetchInFlightCount()).toBe(0)
  })

  it('不同 scope 的并发调用不复用（防切号串号）', async () => {
    bridge.bridgePost.mockResolvedValue(okTeaching)
    await Promise.all([
      fetchTeacherTeaching('2026-2027-1', { scope: 'T0001' }),
      fetchTeacherTeaching('2026-2027-1', { scope: 'T0002' })
    ])
    expect(bridge.bridgePost).toHaveBeenCalledTimes(2)
  })

  it('不同学期 / 筛选参数的并发调用不复用', async () => {
    bridge.bridgePost.mockResolvedValue(okTeaching)
    await Promise.all([
      fetchTeacherTeaching('2026-2027-1', { scope: 'T0001' }),
      fetchTeacherTeaching('2026-2027-2', { scope: 'T0001' })
    ])
    expect(bridge.bridgePost).toHaveBeenCalledTimes(2)

    bridge.bridgePost.mockClear()
    await Promise.all([
      fetchTeacherNotices({ page: 1, pageSize: 20 }, { scope: 'T0001' }),
      fetchTeacherNotices({ page: 2, pageSize: 20 }, { scope: 'T0001' })
    ])
    expect(bridge.bridgePost).toHaveBeenCalledTimes(2)
  })

  it('请求结束后在途表清空，重复调用会重新发起', async () => {
    bridge.bridgePost.mockResolvedValue(okTeaching)
    await fetchTeacherTeaching('2026-2027-1', { scope: 'T0001' })
    expect(teacherFetchInFlightCount()).toBe(0)
    await fetchTeacherTeaching('2026-2027-1', { scope: 'T0001' })
    expect(bridge.bridgePost).toHaveBeenCalledTimes(2)
  })

  it('失败结果不被缓存，允许下一次重试', async () => {
    bridge.bridgePost.mockResolvedValueOnce({ success: false, error: '请求超时' })
    const failed = await fetchTeacherTeaching('2026-2027-1', { scope: 'T0001' })
    expect(failed.status).toBe('error')
    expect(failed.error?.kind).toBe('timeout')
    expect(teacherFetchInFlightCount()).toBe(0)

    bridge.bridgePost.mockResolvedValueOnce(okTeaching)
    const retried = await fetchTeacherTeaching('2026-2027-1', { scope: 'T0001' })
    expect(retried.status).toBe('empty')
    expect(bridge.bridgePost).toHaveBeenCalledTimes(2)
  })
})
