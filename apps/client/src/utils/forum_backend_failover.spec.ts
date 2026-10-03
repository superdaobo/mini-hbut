/**
 * T6 论坛通道接入端点组单测（契约 §4/§6）。
 * 覆盖：候选解析（显式 / 组模型 / 关闭）+ 网络错误时按序切换。
 */
import { describe, expect, it, vi } from 'vitest'
import { buildForumApiBase, buildForumApiBases, createForumApiClient } from './forum_api'

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

/** 读取 mock 的调用 URL（避免空元组索引的 TS 报错） */
const calledUrls = (mockLike: { calls: readonly unknown[] }): string[] =>
  mockLike.calls.map((args) => String((args as string[])[0]))

describe('buildForumApiBases（契约 §4）', () => {
  it('显式 api_base 优先（非镜像），返回单候选', () => {
    const bases = buildForumApiBases(
      { api_base: 'https://forum.example.com' },
      { groups: [{ id: 'mini', base: 'https://mini.hbut.site' }] }
    )
    expect(bases).toEqual(['https://forum.example.com/api/forum'])
  })

  it('无显式值时按组顺序产出主 + 兜底', () => {
    const bases = buildForumApiBases(
      {},
      {
        groups: [
          { id: 'mini', base: 'https://mini.hbut.site' },
          { id: 'hf', base: 'https://mirror.example.com' }
        ]
      }
    )
    expect(bases).toEqual([
      'https://mini.hbut.site/api/forum',
      'https://mirror.example.com/api/forum'
    ])
  })

  it('论坛显式关闭 → 返回空数组', () => {
    expect(buildForumApiBases({ enabled: false })).toEqual([])
    expect(buildForumApiBase({ enabled: false })).toBe('')
  })

  it('无组无显式值 → 回落内置默认（主 + 兜底两域）', () => {
    const bases = buildForumApiBases({}, undefined)
    expect(bases.length).toBeGreaterThanOrEqual(1)
    expect(bases[0]).toBe('https://mini.hbut.site/api/forum')
  })
})

describe('createForumApiClient 候选切换（契约 §6）', () => {
  it('主候选网络错误 → 切兜底成功', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (String(url).includes('primary.example.com')) throw new TypeError('Failed to fetch')
      return jsonResponse({ ok: true, items: [] })
    })
    const client = createForumApiClient({
      apiBases: [
        'https://primary.example.com/api/forum',
        'https://fallback.example.com/api/forum'
      ],
      fetcher
    })
    await expect(client.listCategories()).resolves.toBeTruthy()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(calledUrls(fetcher.mock)[1]).toContain('fallback.example.com')
  })

  it('主候选正常 → 不触发兜底', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true, items: [] }))
    const client = createForumApiClient({
      apiBases: [
        'https://primary.example.com/api/forum',
        'https://fallback.example.com/api/forum'
      ],
      fetcher
    })
    await client.listCategories()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(calledUrls(fetcher.mock)[0]).toContain('primary.example.com')
  })

  it('只传 apiBase 时保持单候选行为（向后兼容）', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true, items: [] }))
    const client = createForumApiClient({
      apiBase: 'https://solo.example.com/api/forum',
      fetcher
    })
    await client.listCategories()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(calledUrls(fetcher.mock)[0]).toContain('solo.example.com')
  })
})
