/**
 * 将任意 view / 深链目标收敛为策略允许的页面。
 * App.vue 的 hash、history、resume 必须经此函数，禁止直接 applyViewState 绕过合规门闩。
 */
import { normalizeViewName } from '../navigation/app_navigation'
import { isViewAllowed } from './app_store_policy'

/**
 * 若 view 在当前编译策略下不允许，返回 fallback（默认 home）。
 */
export function resolvePolicySafeView(view: unknown, fallback: string = 'home'): string {
  const normalized = normalizeViewName(view)
  if (isViewAllowed(normalized)) return normalized
  const safeFallback = normalizeViewName(fallback)
  return isViewAllowed(safeFallback) ? safeFallback : 'home'
}

/**
 * 解析 `#/{10位学号}/{view}` 类 hash 路由（与 App.vue readWindowRouteSnapshot 对齐）。
 * 返回的 view 已经过策略收敛。
 */
export function resolvePolicySafeHashRoute(
  hash: unknown,
  fallback: string = 'home'
): { sid: string; view: string } | null {
  const text = String(hash || '')
  const match = text.match(/^#\/(\d{10})(?:\/(\w+))?$/)
  if (!match) return null
  return {
    sid: match[1],
    view: resolvePolicySafeView(match[2] || 'home', fallback)
  }
}

/**
 * 从 history/resume 快照解析可访问 view（与 restoreViewFromSnapshot 语义对齐）。
 */
export function resolvePolicySafeSnapshotView(
  snapshot: { view?: unknown; module?: unknown; tab?: unknown } | null | undefined,
  currentView: unknown = 'home',
  fallback: string = 'home'
): string {
  const raw = snapshot?.view || snapshot?.module || snapshot?.tab || currentView
  return resolvePolicySafeView(raw, fallback)
}
