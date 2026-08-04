import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface ForceUpdateInfo {
  min_version?: string
  message?: string
  url?: string
  [key: string]: unknown
}

export const useUpdateStore = defineStore('update', () => {
  const dialogVisible = ref(false)
  const checking = ref(false)
  const currentVersion = ref('')
  const availableVersion = ref('')
  const forceUpdateInfo = ref<ForceUpdateInfo | null>(null)
  const lastError = ref('')
  const forceRequired = computed(() => forceUpdateInfo.value !== null)

  const beginCheck = () => { checking.value = true; lastError.value = '' }
  const finishCheck = (version?: string | null) => {
    checking.value = false
    availableVersion.value = String(version ?? '').trim()
  }
  const failCheck = (error: unknown) => {
    checking.value = false
    lastError.value = error instanceof Error ? error.message : String(error ?? 'unknown update error')
  }
  const requireForceUpdate = (info: ForceUpdateInfo) => { forceUpdateInfo.value = { ...info } }
  const clearForceUpdate = () => { forceUpdateInfo.value = null }

  return {
    dialogVisible,
    checking,
    currentVersion,
    availableVersion,
    forceUpdateInfo,
    lastError,
    forceRequired,
    beginCheck,
    finishCheck,
    failCheck,
    requireForceUpdate,
    clearForceUpdate
  }
})
