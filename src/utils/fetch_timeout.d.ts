/**
 * 统一 fetch 超时封装（与 fetch_timeout.js 真实导出对齐）。
 */

export const DEFAULT_FETCH_TIMEOUT_MS: number

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number
): Promise<Response>

export function isTimeoutError(error: unknown): boolean

export function isAbortError(error: unknown): boolean

export function withTimeout<T extends (...args: any[]) => any>(
  task: T,
  timeoutMs?: number,
  label?: string
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>
