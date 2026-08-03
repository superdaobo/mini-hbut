// 测试 fixture：forum_cache 模块类型声明（与 forum_cache.js 导出对齐）
export interface ForumCacheEntry<T = unknown> {
  value: T
  savedAt: number
  expiresAt: number
  etag: string
}

export interface ForumCache<T = unknown> {
  keyFor(scope: string): string
  read(scope: string): ForumCacheEntry<T> | null
  write(scope: string, value: T, options?: { ttlMs?: number; etag?: string }): T
  remove(scope: string): void
  clear(scopePrefixes?: string[]): void
  isFresh(entry: ForumCacheEntry<T> | null): boolean
}

export interface ForumPendingActions<T = unknown> {
  isPending(key: string): boolean
  run(
    key: string,
    task: () => Promise<T>,
    options?: { duplicateMessage?: string; duplicateType?: string }
  ): Promise<T | null>
}

export function makeForumCacheKey(options?: {
  studentId?: string
  apiBase?: string
  scope?: string
}): string

export function createForumCache<T = unknown>(options?: {
  studentId?: string
  apiBase?: string
  now?: () => number
}): ForumCache<T>

export function clearForumCache(cache: ForumCache<unknown> | null | undefined, scopePrefixes?: string[]): void

export function withForumCache<T>(
  cache: ForumCache<T> | null | undefined,
  scope: string,
  fetcher: (ctx: { etag: string; cached?: ForumCacheEntry<T> | null }) => Promise<T | { value: T; etag?: string; notModified?: boolean }>,
  options?: { ttlMs?: number }
): Promise<T>

export function createForumPendingActions<T = unknown>(options?: {
  notify?: (message: string, type?: string) => void
  onChange?: (pending: Set<string>) => void
}): ForumPendingActions<T>
