import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type GradeRecord = Record<string, unknown>
export interface GradeSnapshot {
  grades?: GradeRecord[]
  offline?: boolean
  syncTime?: string | null
}

export const useGradeStore = defineStore('grade', () => {
  const grades = ref<GradeRecord[]>([])
  const refreshing = ref(false)
  const offline = ref(false)
  const syncTime = ref('')
  const lastError = ref('')
  const hasGrades = computed(() => grades.value.length > 0)

  const hydrate = (snapshot: GradeSnapshot = {}) => {
    grades.value = Array.isArray(snapshot.grades) ? [...snapshot.grades] : []
    offline.value = Boolean(snapshot.offline)
    syncTime.value = String(snapshot.syncTime ?? '').trim()
    lastError.value = ''
  }
  const beginRefresh = () => { refreshing.value = true; lastError.value = '' }
  const finishRefresh = (snapshot: GradeSnapshot) => { hydrate(snapshot); refreshing.value = false }
  const failRefresh = (error: unknown, preserveExisting = true) => {
    refreshing.value = false
    offline.value = preserveExisting && grades.value.length > 0
    lastError.value = error instanceof Error ? error.message : String(error ?? 'unknown grade error')
  }
  const clear = () => {
    grades.value = []
    refreshing.value = false
    offline.value = false
    syncTime.value = ''
    lastError.value = ''
  }

  return {
    grades,
    refreshing,
    offline,
    syncTime,
    lastError,
    hasGrades,
    hydrate,
    beginRefresh,
    finishRefresh,
    failRefresh,
    clear
  }
})
