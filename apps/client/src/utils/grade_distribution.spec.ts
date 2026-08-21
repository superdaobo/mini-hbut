import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchGradeDistribution,
  requestJson,
} from './grade_distribution.js'

const jsonResponse = (body, { ok = true } = {}) => ({
  ok,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 永不 resolve 的 fetch；监听 signal.abort 以模拟真实 fetch 超时被终止。 */
const hangingFetch = vi.fn(
  (_url, opts) =>
    new Promise((_resolve, reject) => {
      opts?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      )
    })
)

describe('requestJson（给分查询请求层）', () => {
  it('正常请求返回解析后的数据', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, semesters: ['2025-2026-2'] })))
    const data = await requestJson('http://x/api', { method: 'GET' }, 2000)
    expect(data.success).toBe(true)
  })

  it('请求挂起超过超时 → 可读中文「查询超时」，不会无限等待', async () => {
    vi.stubGlobal('fetch', hangingFetch)
    await expect(requestJson('http://x/api', {}, 60)).rejects.toThrow('查询超时，请检查网络后重试')
  })

  it('网络失败（Failed to fetch）→ 可读中文「无法连接」', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    await expect(requestJson('http://x/api', {}, 2000)).rejects.toThrow(
      '无法连接给分查询服务，请检查网络后重试'
    )
  })

  it('业务失败（success=false）上抛服务端 error 原文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ success: false, error: '数据库繁忙' }))
    )
    await expect(requestJson('http://x/api', {}, 2000)).rejects.toThrow('数据库繁忙')
  })

  it('HTTP 非 2xx 抛 HTTP 状态错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { ok: false })))
    await expect(requestJson('http://x/api', {}, 2000)).rejects.toThrow('HTTP')
  })
})

describe('fetchGradeDistribution', () => {
  it('组装请求体并返回分页结构', async () => {
    let captured = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, opts) => {
        captured = JSON.parse(opts.body)
        return jsonResponse({ success: true, total: 36, page: 1, page_size: 50, items: [{ id: 1 }] })
      })
    )
    const out = await fetchGradeDistribution({ teacher_name: '闵锐', page: 1, page_size: 50 })
    expect(captured.teacher_name).toBe('闵锐')
    expect(captured.page).toBe(1)
    expect(out.total).toBe(36)
    expect(out.items).toHaveLength(1)
  })
})
