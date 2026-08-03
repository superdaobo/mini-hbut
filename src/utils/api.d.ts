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
export function getCachedData<T = unknown>(key: string, ttl?: number): CacheEntry<T> | null
export function getStaleCachedData<T = unknown>(key: string): CacheEntry<T> | null
export function setCachedData(key: string, data: unknown): void

export interface FetchWithCacheOptions {
  priority?: string
  staleWhileRevalidate?: boolean
  forceRemote?: boolean
  cacheOfflinePayload?: boolean
}

export function fetchWithCache<T = unknown>(
  key: string,
  fetcher: () => Promise<{ success?: boolean; offline?: boolean; [key: string]: unknown }>,
  ttl?: number,
  options?: FetchWithCacheOptions
): Promise<CacheEntry<T>>
