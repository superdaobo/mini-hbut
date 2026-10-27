/**
 * #1114 校园码刷新链/订单轮询模块的类型声明。
 *
 * 实现为纯 JS（便于 node 环境直接测试），组件与 spec 通过本声明获得类型约束。
 */

export type CampusCodeFailureKind =
  | 'auth_required'
  | 'empty_response'
  | 'non_json'
  | 'upstream_unavailable'
  | 'transport'
  | 'business_rejected'
  | 'unknown'

export interface CampusCodeFailure {
  kind: CampusCodeFailureKind
  rawKind: string | null
  message: string
  retryable: boolean
}

export interface RefreshChainState {
  status: string
  kind: CampusCodeFailureKind | null
  message: string | null
  failureCount: number
  retryDelayMs: number | null
  lastSuccessAt: number | null
}

export interface RefreshChainOptions {
  request: (origin: string) => Promise<unknown>
  getIntervalMs?: () => number | null | undefined
  setTimeoutFn?: (handler: () => void, timeout: number) => ReturnType<typeof setTimeout>
  clearTimeoutFn?: (timer: ReturnType<typeof setTimeout>) => void
  now?: () => number
  classify?: (error: unknown) => CampusCodeFailure
  nextDelay?: (failures: number) => number
  onState?: (state: RefreshChainState) => void
  onSuccess?: (payload: unknown) => void
  onFailure?: (failure: CampusCodeFailure) => void
}

export interface RefreshChain {
  start: () => void
  triggerNow: () => void
  stop: () => void
  dispose: () => void
}

export interface OrderStatusPollerOptions {
  request: () => Promise<unknown>
  getIntervalMs?: () => number | null | undefined
  setTimeoutFn?: (handler: () => void, timeout: number) => ReturnType<typeof setTimeout>
  clearTimeoutFn?: (timer: ReturnType<typeof setTimeout>) => void
  classify?: (error: unknown) => CampusCodeFailure
  nextDelay?: (failures: number) => number
  shouldContinue?: () => boolean
  onState?: (state: { status: string; failureCount: number }) => void
  onResult?: (payload: unknown) => void
}

export interface OrderStatusPoller {
  start: () => void
  stop: () => void
  dispose: () => void
}

export const RETRY_DELAYS_MS: number[]

export function classifyCampusCodeFailure(error: unknown): CampusCodeFailure
export function nextRetryDelayMs(failures: number): number
export function createCampusCodeRefreshChain(options: RefreshChainOptions): RefreshChain
export function createOrderStatusPoller(options: OrderStatusPollerOptions): OrderStatusPoller
