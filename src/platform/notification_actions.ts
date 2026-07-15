import { isViewAllowed } from '../config/app_store_policy'

const DEFAULT_TARGET_VIEW = 'notifications'

const ALLOWED_NOTIFICATION_TARGETS = new Set([
  'notifications',
  'schedule',
  'grades',
  'exams',
  'electricity',
  'classroom',
  'home'
])

const toSafeText = (value: unknown) => String(value ?? '').trim()

const readPayloadObject = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object') return {}
  return payload as Record<string, unknown>
}

const pickViewCandidate = (payload: unknown): string => {
  const root = readPayloadObject(payload)
  const notification = readPayloadObject(root.notification)
  const extra = readPayloadObject(notification.extra ?? root.extra)
  return toSafeText(
    extra.view ??
      extra.targetView ??
      extra.target_view ??
      notification.view ??
      root.view ??
      root.targetView ??
      root.target_view
  )
}

export const normalizeNotificationTargetView = (value: unknown): string => {
  const candidate = toSafeText(value)
    .replace(/^#\/?/, '')
    .replace(/^\/+/, '')
    .split(/[/?#]/)[0]

  if (!candidate) return DEFAULT_TARGET_VIEW
  if (!ALLOWED_NOTIFICATION_TARGETS.has(candidate)) return DEFAULT_TARGET_VIEW
  // 合规构建下拒绝跳到已禁用模块（如电费）
  if (!isViewAllowed(candidate)) return DEFAULT_TARGET_VIEW
  return candidate
}

export const resolveNotificationActionTarget = (
  payload: unknown
): { view: string } => ({
  view: normalizeNotificationTargetView(pickViewCandidate(payload))
})
