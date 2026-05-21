import { describe, expect, it, vi } from 'vitest'

import { normalizeRemoteConfig } from './remote_config'
import {
  buildForumApiBase,
  createForumApiClient,
  normalizeForumEndpoint
} from './forum_api'

describe('forum api config', () => {
  it('normalizes forum endpoint from remote config', () => {
    const config = normalizeRemoteConfig({
      forum: {
        enabled: true,
        api_base: 'https://example.com/forum'
      }
    })

    expect(config.forum.enabled).toBe(true)
    expect(config.forum.api_base).toBe('https://example.com/forum/api/forum')
  })

  it('uses default forum endpoint when config is missing', () => {
    const config = normalizeRemoteConfig({})

    expect(config.forum.api_base).toBe('https://mini-hbut-testocr1.hf.space/api/forum')
  })

  it('allows local forum api override for browser and Tauri verification', () => {
    vi.stubGlobal('window', {
      location: new URL('http://127.0.0.1:1421/?forumApiBase=http://127.0.0.1:7860')
    })
    try {
      const config = normalizeRemoteConfig({
        forum: {
          enabled: true,
          api_base: 'https://mini-hbut-testocr1.hf.space/api/forum'
        }
      })

      expect(config.forum.api_base).toBe('http://127.0.0.1:7860/api/forum')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('ignores non-loopback forum api overrides', () => {
    vi.stubGlobal('window', {
      location: new URL('http://127.0.0.1:1421/?forumApiBase=https://evil.example')
    })
    try {
      const config = normalizeRemoteConfig({
        forum: {
          enabled: true,
          api_base: 'https://mini-hbut-testocr1.hf.space/api/forum'
        }
      })

      expect(config.forum.api_base).toBe('https://mini-hbut-testocr1.hf.space/api/forum')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps /api/forum suffix only once', () => {
    expect(normalizeForumEndpoint('https://example.com/api/forum')).toBe('https://example.com/api/forum')
    expect(normalizeForumEndpoint('https://example.com/')).toBe('https://example.com/api/forum')
  })

  it('issues token and sends authorized forum requests', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/auth/token')) {
        return {
          ok: true,
          json: async () => ({ token: 'signed-token', profile: { student_id: '2510231106' } })
        }
      }
      return {
        ok: true,
        json: async () => ({ items: [{ id: 1, title: '测试帖' }] })
      }
    }) as unknown as typeof fetch

    const client = createForumApiClient({
      apiBase: buildForumApiBase({ enabled: true, api_base: 'https://example.com' }),
      studentId: '2510231106',
      nickname: '管理员',
      fetcher
    })

    const thread = await client.createThread({
      category_id: 1,
      title: '测试帖',
      content_md: '内容',
      attachment_ids: []
    })

    expect(thread.items[0].title).toBe('测试帖')
    expect(calls[0].url).toBe('https://example.com/api/forum/auth/token')
    expect(calls[1].url).toBe('https://example.com/api/forum/threads')
    expect(calls[1].init?.headers).toMatchObject({ Authorization: 'Bearer signed-token' })
  })

  it('allows guests to browse thread list without requesting a token', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return {
        ok: true,
        json: async () => ({ items: [] })
      }
    }) as unknown as typeof fetch

    const client = createForumApiClient({
      apiBase: 'https://example.com',
      studentId: '',
      fetcher
    })

    await client.listThreads({ categoryId: 1 })

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://example.com/api/forum/threads?category_id=1')
    expect(calls[0].init?.headers).not.toHaveProperty('Authorization')
  })
})
