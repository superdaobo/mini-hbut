export const DEFAULT_TTL: number
export const LONG_TTL: number
export const EXTRA_LONG_TTL: number
export const SHORT_TTL: number

export interface SwrOptions {
  staleWhileRevalidate: boolean
  priority: string
}

export const DEFAULT_SWR_OPTIONS: SwrOptions

export interface CacheEntry<T = unknown> {
  data: T
  fromCache: boolean
  timestamp: number
  stale?: boolean
  demo?: boolean
}

export function getCacheKey(key: string): string
export function clearCacheByPrefix(prefix: string): void
export function clearUserScopedCaches(studentId: string): void
/** P0：清理游戏落盘身份（`*_rank_context_v1` 与当前学号的模块档案键）；登出/会话失效/换号时调用 */
export function clearGameIdentityCaches(studentId: string): void
/** P0：启动期会话收口——未确认可用会话且当前无身份时清设备级游戏身份键（幂等） */
export function reconcileGameIdentityOnBoot(sessionVerified: boolean, currentStudentId: string): void
export function getCachedData<T = unknown>(key: string, ttl?: number): CacheEntry<T> | null
export function getStaleCachedData<T = unknown>(key: string): CacheEntry<T> | null
export function setCachedData(key: string, data: unknown): void

export interface FetchWithCacheOptions {
  priority?: string
  staleWhileRevalidate?: boolean
  forceRemote?: boolean
  cacheOfflinePayload?: boolean
  /** 可选统一超时（ms）：>0 时用 withTimeout 包装 fetcher，超时抛 TimeoutError。 */
  timeoutMs?: number
}

export function fetchWithCache<T = unknown>(
  key: string,
  fetcher: () => Promise<{ success?: boolean; offline?: boolean; [key: string]: unknown }>,
  ttl?: number,
  options?: FetchWithCacheOptions
): Promise<CacheEntry<T>>
