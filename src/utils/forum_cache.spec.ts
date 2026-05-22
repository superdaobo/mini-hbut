import { describe, expect, it, vi } from 'vitest'

import {
  clearForumCache,
  createForumCache,
  createForumPendingActions,
  makeForumCacheKey,
  withForumCache
} from './forum_cache'

const installStorage = () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] || null,
    get length() {
      return storage.size
    }
  })
  return storage
}

describe('forum cache', () => {
  it('builds stable cache keys per user, api and scope', () => {
    expect(makeForumCacheKey({
      studentId: '2510231106',
      apiBase: 'https://example.com/api/forum',
      scope: 'feed:1'
    })).toBe('hbu_forum_cache:2510231106:https%3A%2F%2Fexample.com%2Fapi%2Fforum:feed%3A1')
  })

  it('serves fresh cache, refreshes expired values, and falls back to stale data on network failure', async () => {
    const storage = installStorage()
    let now = 1000
    const cache = createForumCache({
      studentId: '2510231106',
      apiBase: 'https://example.com/api/forum',
      now: () => now
    })
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ items: ['first'] })
      .mockResolvedValueOnce({ items: ['second'] })
      .mockRejectedValueOnce(new Error('offline'))

    try {
      await expect(withForumCache(cache, 'feed', () => fetcher())).resolves.toEqual({ items: ['first'] })
      await expect(withForumCache(cache, 'feed', () => fetcher())).resolves.toEqual({ items: ['first'] })
      now += 61_000
      await expect(withForumCache(cache, 'feed', () => fetcher(), { ttlMs: 60_000 })).resolves.toEqual({ items: ['second'] })
      now += 61_000
      await expect(withForumCache(cache, 'feed', () => fetcher(), { ttlMs: 60_000 })).resolves.toEqual({ items: ['second'] })

      expect(fetcher).toHaveBeenCalledTimes(3)
      expect(storage.size).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('clears cached scopes for mutating forum operations', () => {
    const storage = installStorage()
    const cache = createForumCache({
      studentId: '2510231106',
      apiBase: 'https://example.com/api/forum',
      now: () => 1000
    })

    try {
      cache.write('feed:1', { items: [1] })
      cache.write('thread:1', { id: 1 })
      cache.write('admin:reports', { items: [2] })
      clearForumCache(cache, ['feed', 'thread'])

      expect(cache.read('feed:1')).toBeNull()
      expect(cache.read('thread:1')).toBeNull()
      expect(cache.read('admin:reports')?.value).toEqual({ items: [2] })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('stores ETag metadata, reuses cached values on 304, and falls back to stale cache on failure', async () => {
    const storage = installStorage()
    let now = 1000
    const cache = createForumCache({
      studentId: '2510231106',
      apiBase: 'https://example.com/api/forum',
      now: () => now
    })
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ value: { items: ['first'] }, etag: '"v1"', notModified: false })
      .mockResolvedValueOnce({ etag: '"v1"', notModified: true })
      .mockRejectedValueOnce(new Error('offline'))

    try {
      await expect(withForumCache(cache, 'feed', ({ etag }) => fetcher({ etag }), { ttlMs: 60_000 })).resolves.toEqual({ items: ['first'] })
      expect(fetcher).toHaveBeenLastCalledWith({ etag: '' })
      now += 61_000
      await expect(withForumCache(cache, 'feed', ({ etag }) => fetcher({ etag }), { ttlMs: 60_000 })).resolves.toEqual({ items: ['first'] })
      expect(fetcher).toHaveBeenLastCalledWith({ etag: '"v1"' })
      now += 61_000
      await expect(withForumCache(cache, 'feed', ({ etag }) => fetcher({ etag }), { ttlMs: 60_000 })).resolves.toEqual({ items: ['first'] })

      const raw = JSON.parse(storage.values().next().value)
      expect(raw.etag).toBe('"v1"')
      expect(fetcher).toHaveBeenCalledTimes(3)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('prevents duplicate pending forum actions and emits duplicate feedback', async () => {
    const notices: Array<{ message: string; type?: string }> = []
    const guard = createForumPendingActions({
      notify: (message, type) => notices.push({ message, type })
    })
    let release: (() => void) | undefined
    const slowTask = vi.fn(() => new Promise((resolve) => {
      release = () => resolve('posted')
    }))

    const first = guard.run('thread:demo', slowTask, { duplicateMessage: '发布中，请勿重复提交' })
    const duplicate = await guard.run('thread:demo', slowTask, { duplicateMessage: '发布中，请勿重复提交' })
    expect(duplicate).toBeNull()
    expect(guard.isPending('thread:demo')).toBe(true)
    expect(slowTask).toHaveBeenCalledTimes(1)
    expect(notices).toEqual([{ message: '发布中，请勿重复提交', type: 'info' }])

    release?.()
    await expect(first).resolves.toBe('posted')
    expect(guard.isPending('thread:demo')).toBe(false)
  })
})
