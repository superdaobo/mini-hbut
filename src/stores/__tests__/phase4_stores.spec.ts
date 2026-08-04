import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../auth'
import { useGradeStore } from '../grade'
import { useLifecycleStore } from '../lifecycle'
import { useNavigationStore } from '../navigation'
import { useUpdateStore } from '../update'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('phase 4 stores', () => {
  it('normalizes and clears the authenticated session', () => {
    const store = useAuthStore()
    store.establishSession({ studentId: ' 2510231106 ', userUuid: ' user-1 ' })
    expect(store.studentId).toBe('2510231106')
    expect(store.userUuid).toBe('user-1')
    expect(store.isLoggedIn).toBe(true)
    store.clearSession()
    expect(store.studentId).toBe('')
    expect(store.userUuid).toBe('')
    expect(store.isLoggedIn).toBe(false)
  })

  it('keeps navigation view, tab and module coherent', () => {
    const store = useNavigationStore()
    store.applySnapshot({ view: 'settings' })
    expect(store.currentView).toBe('settings')
    expect(store.activeTab).toBe('me')
    expect(store.currentModule).toBe('settings')
    store.backTo('home')
    expect(store.currentView).toBe('home')
    expect(store.activeTab).toBe('home')
    expect(store.currentModule).toBe('')
    expect(store.navDirection).toBe('back')
  })

  it('consumes hidden duration once and applies the resume budget', () => {
    const store = useLifecycleStore()
    store.markHidden(1_000)
    expect(store.consumeHiddenDuration(11_000)).toBe(10_000)
    expect(store.consumeHiddenDuration(12_000)).toBe(0)
    expect(store.evaluateResume(16 * 60 * 1000)).toBe('hard-reload')
    store.recordHardReload()
    expect(store.evaluateResume(16 * 60 * 1000)).toBe('soft-remount')
    store.markActive()
    expect(store.phase).toBe('active')
  })

  it('preserves grade snapshots on refresh failure', () => {
    const store = useGradeStore()
    store.hydrate({ grades: [{ course: '通信原理' }], syncTime: 'now' })
    store.beginRefresh()
    store.failRefresh(new Error('offline'))
    expect(store.grades).toHaveLength(1)
    expect(store.offline).toBe(true)
    expect(store.lastError).toBe('offline')
  })

  it('tracks update failures without forcing an update', () => {
    const store = useUpdateStore()
    store.beginCheck()
    store.failCheck(new Error('network'))
    expect(store.checking).toBe(false)
    expect(store.lastError).toBe('network')
    expect(store.forceRequired).toBe(false)
  })
})
