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

  it('refreshes a stale cached token once when an authorized request is rejected', async () => {
    const storage = new Map<string, string>()
    storage.set('hbu_forum_token:2510231106', JSON.stringify({
      token: 'stale-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    }))
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    })

    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const auth = String((init?.headers as Record<string, string>)?.Authorization || '')
      if (url.endsWith('/threads') && auth === 'Bearer stale-token') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ detail: '令牌签名无效' })
        }
      }
      if (url.endsWith('/auth/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: 'fresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600 })
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 88, title: '刷新后成功' })
      }
    }) as unknown as typeof fetch

    try {
      const client = createForumApiClient({
        apiBase: 'https://example.com',
        studentId: '2510231106',
        nickname: '管理员',
        fetcher
      })

      const thread = await client.createThread({
        category_id: 1,
        title: '刷新后成功',
        content_md: '内容',
        attachment_ids: []
      })

      expect(thread.title).toBe('刷新后成功')
      expect(calls.map((call) => call.url)).toEqual([
        'https://example.com/api/forum/threads',
        'https://example.com/api/forum/auth/token',
        'https://example.com/api/forum/threads'
      ])
      expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer stale-token' })
      expect(calls[2].init?.headers).toMatchObject({ Authorization: 'Bearer fresh-token' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('exposes extended forum endpoints used by the full community UI', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/auth/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: 'admin-token', expires_at: Math.floor(Date.now() / 1000) + 3600 })
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, items: [] })
      }
    }) as unknown as typeof fetch

    const client = createForumApiClient({
      apiBase: 'https://example.com',
      studentId: '2510231106',
      fetcher
    })

    await client.searchThreads({ q: '绩点查询', categoryId: 2, limit: 10 })
    await client.getMeSummary()
    await client.listMyThreads()
    await client.listMyReplies()
    await client.listMyBookmarks()
    await client.getUserProfile('2510231107')
    await client.listAdminReports(20)
    await client.listAdminUsers('251023')
    await client.listAdminBackups(5)
    await client.runBackup()
    await client.setUserBan({ student_id: '2510231107', banned: true, reason: 'spam' })
    await client.grantBadge({ student_id: '2510231107', badge_key: 'helper', display_name: '热心同学' })

    expect(calls.map((call) => call.url)).toEqual([
      'https://example.com/api/forum/search?q=%E7%BB%A9%E7%82%B9%E6%9F%A5%E8%AF%A2&category_id=2&limit=10',
      'https://example.com/api/forum/auth/token',
      'https://example.com/api/forum/me/summary',
      'https://example.com/api/forum/me/threads',
      'https://example.com/api/forum/me/replies',
      'https://example.com/api/forum/me/bookmarks',
      'https://example.com/api/forum/users/2510231107',
      'https://example.com/api/forum/admin/reports?limit=20',
      'https://example.com/api/forum/admin/users?query=251023',
      'https://example.com/api/forum/admin/backups?limit=5',
      'https://example.com/api/forum/admin/backups/run',
      'https://example.com/api/forum/admin/bans',
      'https://example.com/api/forum/admin/badges'
    ])
    expect(calls.slice(2).filter((call) => /\/(me|admin)\//.test(call.url)).every((call) => {
      const headers = call.init?.headers as Record<string, string>
      return headers?.Authorization === 'Bearer admin-token'
    })).toBe(true)
    expect(client.getAttachmentUrl('att_2510231106_demo')).toBe('https://example.com/api/forum/attachments/att_2510231106_demo')
    expect(client.getAttachmentUrl('/api/forum/attachments/att_demo')).toBe('https://example.com/api/forum/attachments/att_demo')
  })

  it('passes offset pagination and conditional ETag headers through forum read endpoints', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/auth/token')) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: () => null
          },
          json: async () => ({ token: 'paged-token', expires_at: Math.floor(Date.now() / 1000) + 3600 })
        }
      }
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name.toLowerCase() === 'etag' ? '"forum-etag"' : null
        },
        json: async () => ({ items: [] })
      }
    }) as unknown as typeof fetch

    const client = createForumApiClient({
      apiBase: 'https://example.com',
      studentId: '2510231106',
      fetcher
    })

    await client.listThreads({ categoryId: 3, limit: 20, offset: 40 }, { etag: '"old-feed"' })
    await client.searchThreads({ q: '绩点', categoryId: 2, limit: 10, offset: 30 }, { etag: '"old-search"' })
    await client.listMyThreads({ limit: 5, offset: 10 }, { etag: '"old-me"' })
    await client.listMyReplies({ limit: 5, offset: 15 })
    await client.listMyBookmarks({ limit: 5, offset: 20 })
    await client.listNotifications({ limit: 3, offset: 6 })
    await client.listMessages({ limit: 4, offset: 8 })
    await client.listAdminReports({ limit: 7, offset: 14 })
    await client.listAdminUsers({ query: '251023', limit: 9, offset: 18 })
    await client.listAdminBackups({ limit: 11, offset: 22 })
    await client.listBackups({ limit: 13, offset: 26 }, { etag: '"old-backups"' })

    expect(calls.map((call) => call.url)).toEqual([
      'https://example.com/api/forum/threads?category_id=3&limit=20&offset=40',
      'https://example.com/api/forum/search?q=%E7%BB%A9%E7%82%B9&category_id=2&limit=10&offset=30',
      'https://example.com/api/forum/auth/token',
      'https://example.com/api/forum/me/threads?limit=5&offset=10',
      'https://example.com/api/forum/me/replies?limit=5&offset=15',
      'https://example.com/api/forum/me/bookmarks?limit=5&offset=20',
      'https://example.com/api/forum/notifications?limit=3&offset=6',
      'https://example.com/api/forum/messages?limit=4&offset=8',
      'https://example.com/api/forum/admin/reports?limit=7&offset=14',
      'https://example.com/api/forum/admin/users?query=251023&limit=9&offset=18',
      'https://example.com/api/forum/admin/backups?limit=11&offset=22',
      'https://example.com/api/forum/backups?limit=13&offset=26'
    ])
    expect(calls[0].init?.headers).toMatchObject({ 'If-None-Match': '"old-feed"' })
    expect(calls[1].init?.headers).toMatchObject({ 'If-None-Match': '"old-search"' })
    expect(calls[2].url).toBe('https://example.com/api/forum/auth/token')
    expect(calls[3].init?.headers).toMatchObject({ Authorization: 'Bearer paged-token', 'If-None-Match': '"old-me"' })
    expect(calls[11].init?.headers).toMatchObject({ 'If-None-Match': '"old-backups"' })
  })

  it('returns cache metadata for 200 and 304 forum responses', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.headers as Record<string, string>)?.['If-None-Match'] === '"known"') {
        return {
          ok: true,
          status: 304,
          headers: {
            get: () => '"known"'
          },
          json: async () => ({})
        }
      }
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => name.toLowerCase() === 'etag' ? '"fresh"' : null
        },
        json: async () => ({ items: ['fresh'] })
      }
    }) as unknown as typeof fetch

    const client = createForumApiClient({
      apiBase: 'https://example.com',
      fetcher
    })

    await expect(client.listCategories({}, { includeMeta: true })).resolves.toEqual({
      value: { items: ['fresh'] },
      etag: '"fresh"',
      notModified: false
    })
    await expect(client.listCategories({}, { includeMeta: true, etag: '"known"' })).resolves.toEqual({
      value: undefined,
      etag: '"known"',
      notModified: true
    })
  })
})
