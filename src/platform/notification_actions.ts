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
  return ALLOWED_NOTIFICATION_TARGETS.has(candidate) ? candidate : DEFAULT_TARGET_VIEW
}

export const resolveNotificationActionTarget = (
  payload: unknown
): { view: string } => ({
  view: normalizeNotificationTargetView(pickViewCandidate(payload))
})
