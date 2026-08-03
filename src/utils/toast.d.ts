import type { UnwrapNestedRefs } from 'vue'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastStateShape {
  show: boolean
  message: string
  type: ToastType
  timer: ReturnType<typeof setTimeout> | null
}

export const toastState: UnwrapNestedRefs<ToastStateShape>

export function showToast(
  message: string,
  type?: ToastType,
  duration?: number
): void
