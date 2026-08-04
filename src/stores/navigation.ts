import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { MAIN_TABS, ME_SUB_VIEWS, normalizeViewName } from '../navigation/app_navigation'

const MAIN_TAB_SET = new Set<string>(MAIN_TABS)
const ME_SUB_VIEW_SET = new Set<string>(ME_SUB_VIEWS)

export type NavigationDirection = 'forward' | 'back' | 'replace'
export interface NavigationSnapshot {
  view?: string | null
  tab?: string | null
  module?: string | null
  direction?: NavigationDirection
}

export const resolveTab = (view: string, requestedTab?: string | null): string => {
  const requestedRaw = String(requestedTab ?? '').trim()
  if (requestedRaw) {
    const requested = normalizeViewName(requestedRaw)
    if (MAIN_TAB_SET.has(requested)) return requested
  }
  if (MAIN_TAB_SET.has(view)) return view
  if (ME_SUB_VIEW_SET.has(view)) return 'me'
  return 'home'
}

export const resolveModule = (view: string, requestedModule?: string | null): string => {
  const explicit = String(requestedModule ?? '').trim()
  if (explicit) return explicit
  return MAIN_TAB_SET.has(view) || view === 'home' ? '' : view
}

export const useNavigationStore = defineStore('navigation', () => {
  const currentView = ref('home')
  const activeTab = ref('home')
  const currentModule = ref('')
  const navDirection = ref<NavigationDirection>('replace')
  const initialized = ref(false)
  const isRootView = computed(() => MAIN_TAB_SET.has(currentView.value))

  const applySnapshot = (snapshot: NavigationSnapshot = {}) => {
    const view = normalizeViewName(snapshot.view || 'home')
    currentView.value = view
    activeTab.value = resolveTab(view, snapshot.tab)
    currentModule.value = resolveModule(view, snapshot.module)
    navDirection.value = snapshot.direction || 'replace'
    initialized.value = true
  }

  const navigate = (view: string, options: Omit<NavigationSnapshot, 'view'> = {}) => {
    applySnapshot({ view, ...options, direction: options.direction || 'forward' })
  }
  const replace = (snapshot: NavigationSnapshot) => applySnapshot({ ...snapshot, direction: 'replace' })
  const backTo = (view: string, tab?: string) => applySnapshot({ view, tab, direction: 'back' })

  return {
    currentView,
    activeTab,
    currentModule,
    navDirection,
    initialized,
    isRootView,
    applySnapshot,
    navigate,
    replace,
    backTo
  }
})
