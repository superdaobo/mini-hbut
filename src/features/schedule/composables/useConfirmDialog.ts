/**
 * 课表领域 - 确认对话框组合式函数。
 * 原内联于 ScheduleView.vue（openConfirmDialog/closeConfirmDialog/askConfirm）。
 */
import { ref } from 'vue'

export interface ConfirmDialogOptions {
  title?: string
  lines?: any[]
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export const useConfirmDialog = () => {
  const showConfirmDialog = ref(false)
  const confirmDialogTitle = ref('')
  const confirmDialogLines = ref<string[]>([])
  const confirmDialogConfirmText = ref('确认')
  const confirmDialogCancelText = ref('取消')
  const confirmDialogDanger = ref(false)
  let confirmDialogResolver: ((result: boolean) => void) | null = null

  /** 打开确认对话框（非 Promise 版本，直接设置 UI 状态） */
  const openConfirmDialog = (options: ConfirmDialogOptions = {}) => {
    confirmDialogTitle.value = String(options.title || '请确认')
    confirmDialogLines.value = Array.isArray(options.lines)
      ? options.lines.map((line) => String(line || '').trim()).filter(Boolean)
      : []
    confirmDialogConfirmText.value = String(options.confirmText || '确认')
    confirmDialogCancelText.value = String(options.cancelText || '取消')
    confirmDialogDanger.value = !!options.danger
    showConfirmDialog.value = true
  }

  /** 关闭确认对话框并 resolve 挂起的 Promise */
  const closeConfirmDialog = (result = false) => {
    showConfirmDialog.value = false
    const resolver = confirmDialogResolver
    confirmDialogResolver = null
    if (resolver) {
      resolver(!!result)
    }
  }

  /** Promise 化确认：调用方 await 返回值获得用户选择 */
  const askConfirm = (options: ConfirmDialogOptions = {}): Promise<boolean> => {
    if (confirmDialogResolver) {
      confirmDialogResolver(false)
      confirmDialogResolver = null
    }
    openConfirmDialog(options)
    return new Promise((resolve) => {
      confirmDialogResolver = resolve
    })
  }

  return {
    showConfirmDialog,
    confirmDialogTitle,
    confirmDialogLines,
    confirmDialogConfirmText,
    confirmDialogCancelText,
    confirmDialogDanger,
    openConfirmDialog,
    closeConfirmDialog,
    askConfirm
  }
}

export type ScheduleConfirmDialog = ReturnType<typeof useConfirmDialog>
