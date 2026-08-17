import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface ResumePolicy {
  softRemountAfterMs: number
  hardReloadAfterMs: number
  hardReloadBudget: number
}

export const DEFAULT_RESUME_POLICY: ResumePolicy = {
  softRemountAfterMs: 10 * 60 * 1000,
  hardReloadAfterMs: 15 * 60 * 1000,
  hardReloadBudget: 1
}

export const useLifecycleStore = defineStore('lifecycle', () => {
  const hiddenAt = ref(0)
  const lastResumeAt = ref(0)
  const hardReloadCount = ref(0)
  const phase = ref<'active' | 'hidden' | 'resuming'>('active')
  const isHidden = computed(() => phase.value === 'hidden')

  const markHidden = (at = Date.now()) => {
    hiddenAt.value = Math.max(0, at)
    phase.value = 'hidden'
  }
  const consumeHiddenDuration = (at = Date.now()): number => {
    const duration = hiddenAt.value > 0 ? Math.max(0, at - hiddenAt.value) : 0
    hiddenAt.value = 0
    lastResumeAt.value = at
    phase.value = 'resuming'
    return duration
  }
  const markActive = () => { phase.value = 'active' }
  const evaluateResume = (idleMs: number, policy: ResumePolicy = DEFAULT_RESUME_POLICY): 'none' | 'soft-remount' | 'hard-reload' => {
    if (idleMs >= policy.hardReloadAfterMs && hardReloadCount.value < policy.hardReloadBudget) return 'hard-reload'
    if (idleMs >= policy.softRemountAfterMs) return 'soft-remount'
    return 'none'
  }
  const recordHardReload = () => { hardReloadCount.value += 1 }

  return {
    hiddenAt,
    lastResumeAt,
    hardReloadCount,
    phase,
    isHidden,
    markHidden,
    consumeHiddenDuration,
    markActive,
    evaluateResume,
    recordHardReload
  }
})
