/**
 * 第三方 SDK 示例的契约测试（Epic #1243 · G5-03 / #1267）。
 *
 * 这份 SDK 就是「可运行的示例」——测试它等于测试「第三方照着文档接能不能通」。
 *
 * 守的契约：
 *   1. code 兑换：60s 一次性；`app_mismatch` / `code_used` / `code_expired` 原样透出；
 *   2. 分类读取：无快照 → `data:null` + `snapshot_missing`（**不是异常**）；
 *   3. 错误映射：401/403/429/5xx → 稳定机器码；429 带 `Retry-After`；
 *   4. **只展示 last_synced_at**，没有任何按数据年龄的判断；
 *   5. 不把 `sid` 当令牌用（读取必须用应用令牌）。
 */

import { describe, expect, it } from 'vitest'

import {
  ApiError,
  describeError,
  exchangeLaunchCode,
  fetchDomain,
  formatLastSynced,
  type FetchLike
} from './index'

const BASE = 'https://ocr.example.com'

interface Call {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}

const fakeFetch = (
  handler: (call: Call) => { status: number; json: unknown; retryAfter?: string }
): { fetchImpl: FetchLike; calls: Call[] } => {
  const calls: Call[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const call: Call = { url, method: init?.method, headers: init?.headers, body: init?.body }
    calls.push(call)
    const result = handler(call)
    return {
      status: result.status,
      json: async () => result.json,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? result.retryAfter ?? null : null) }
    }
  }
  return { fetchImpl, calls }
}

describe('exchangeLaunchCode', () => {
  it('成功 → 返回身份断言（不含宿主令牌）', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      status: 200,
      json: { sid: 'T9000001', app_id: 'app-a', aud: 'app-a', expires_in: 600, device_id: '' }
    }))
    const result = await exchangeLaunchCode(
      { baseUrl: BASE, fetchImpl },
      { code: 'c-1', appId: 'app-a' }
    )
    expect(result).toEqual({
      sid: 'T9000001',
      appId: 'app-a',
      aud: 'app-a',
      expiresIn: 600,
      deviceId: ''
    })
    expect(calls[0].url).toBe(`${BASE}/api/app-launch/v1/exchange`)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toContain('"code":"c-1"')
    // 断言响应里没有令牌类字段
    expect(JSON.stringify(result)).not.toContain('token')
  })

  it('code 已被用过 → ApiError(code_used)', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 400,
      json: { error: { code: 'code_used' } }
    }))
    await expect(
      exchangeLaunchCode({ baseUrl: BASE, fetchImpl }, { code: 'c-1', appId: 'app-a' })
    ).rejects.toMatchObject({ code: 'code_used', status: 400 })
  })

  it('票据过期 → ApiError(code_expired)（410）', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 410,
      json: { error: { code: 'code_expired' } }
    }))
    await expect(
      exchangeLaunchCode({ baseUrl: BASE, fetchImpl }, { code: 'c-1', appId: 'app-a' })
    ).rejects.toMatchObject({ code: 'code_expired', status: 410 })
  })

  it('跨应用兑换 → ApiError(app_mismatch)', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 403,
      json: { error: { code: 'app_mismatch' } }
    }))
    await expect(
      exchangeLaunchCode({ baseUrl: BASE, fetchImpl }, { code: 'c-1', appId: 'other' })
    ).rejects.toMatchObject({ code: 'app_mismatch' })
  })

  it('空 code / 空 appId → 本地直接拒绝（不发请求）', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, json: {} }))
    await expect(
      exchangeLaunchCode({ baseUrl: BASE, fetchImpl }, { code: '', appId: 'app-a' })
    ).rejects.toBeInstanceOf(ApiError)
    await expect(
      exchangeLaunchCode({ baseUrl: BASE, fetchImpl }, { code: 'c', appId: '' })
    ).rejects.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(0)
  })
})

describe('fetchDomain', () => {
  it('成功 → 带应用令牌读取，返回 data + meta', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({
      status: 200,
      json: { data: { items: [] }, meta: { domain: 'grades', data_version: 3, last_synced_at: '2026-11-13T08:00:00Z' } }
    }))
    const result = await fetchDomain(
      { baseUrl: BASE, fetchImpl },
      { token: 'app-token', domain: 'grades', semester: '2026-2027-1' }
    )
    expect(result.meta.last_synced_at).toBe('2026-11-13T08:00:00Z')
    expect(calls[0].headers?.authorization).toBe('Bearer app-token')
    expect(calls[0].url).toContain('/api/app-data/v1/grades?semester=2026-2027-1')
  })

  it('无快照 → 不是异常，data:null + snapshot_missing', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 200,
      json: { data: null, meta: { domain: 'grades', data_version: 0, last_synced_at: '', reason: 'snapshot_missing' } }
    }))
    const result = await fetchDomain({ baseUrl: BASE, fetchImpl }, { token: 't', domain: 'grades' })
    expect(result.data).toBeNull()
    expect(result.meta.reason).toBe('snapshot_missing')
  })

  it('撤销后 → consent_revoked 抛出', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 403,
      json: { error: { code: 'consent_revoked' } }
    }))
    await expect(
      fetchDomain({ baseUrl: BASE, fetchImpl }, { token: 't', domain: 'grades' })
    ).rejects.toMatchObject({ code: 'consent_revoked' })
  })

  it('429 → 透出 Retry-After 秒数', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 429,
      json: { error: { code: 'rate_limited' } },
      retryAfter: '30'
    }))
    try {
      await fetchDomain({ baseUrl: BASE, fetchImpl }, { token: 't', domain: 'grades' })
      throw new Error('应当抛错')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('rate_limited')
      expect((error as ApiError).retryAfterSeconds).toBe(30)
    }
  })

  it('空 domain → 本地拒绝', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, json: {} }))
    await expect(
      fetchDomain({ baseUrl: BASE, fetchImpl }, { token: 't', domain: '' })
    ).rejects.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(0)
  })
})

describe('formatLastSynced', () => {
  it('只输出「最后同步：YYYY-MM-DD HH:mm」，不含任何过期判断', () => {
    const text = formatLastSynced('2026-11-13T08:05:00Z')
    expect(text).toMatch(/^最后同步：\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    for (const banned of ['过期', '太久', '陈旧', 'stale']) {
      expect(text).not.toContain(banned)
    }
  })

  it('空/非法 → 从未同步', () => {
    expect(formatLastSynced('')).toBe('从未同步')
    expect(formatLastSynced(null)).toBe('从未同步')
    expect(formatLastSynced('not-a-date')).toBe('从未同步')
  })
})

describe('describeError', () => {
  it('每个稳定错误码都有可读文案', () => {
    const codes = [
      'identity_required',
      'app_not_approved',
      'consent_required',
      'consent_revoked',
      'consent_policy_stale',
      'code_used',
      'code_expired',
      'app_mismatch',
      'rate_limited',
      'service_unavailable'
    ] as const
    for (const code of codes) {
      const text = describeError(new ApiError(code, 400))
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toBe('请求失败')
    }
  })

  it('未知错误 → 兜底文案', () => {
    expect(describeError(new Error('boom'))).toBe('请求失败')
  })

  it('撤销文案要求删除缓存（不能只提示「无权限」）', () => {
    expect(describeError(new ApiError('consent_revoked', 403))).toContain('删除缓存')
  })
})
