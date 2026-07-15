import { afterEach, describe, expect, it } from 'vitest'
import {
  resolvePolicySafeHashRoute,
  resolvePolicySafeSnapshotView,
  resolvePolicySafeView
} from './accessible_view'
import { setAppStoreBuildOverrideForTests } from './app_store_policy'

describe('accessible_view (hash / history / resume path)', () => {
  afterEach(() => {
    setAppStoreBuildOverrideForTests(null)
  })

  it('flag off: hash campus_code stays campus_code', () => {
    setAppStoreBuildOverrideForTests(false)
    const route = resolvePolicySafeHashRoute('#/2026000001/campus_code')
    expect(route).toEqual({ sid: '2026000001', view: 'campus_code' })
    expect(resolvePolicySafeView('course_selection')).toBe('course_selection')
  })

  it('flag on: hash #/{sid}/campus_code cannot open blocked view', () => {
    setAppStoreBuildOverrideForTests(true)
    const route = resolvePolicySafeHashRoute('#/2026000001/campus_code')
    expect(route).not.toBeNull()
    expect(route!.sid).toBe('2026000001')
    expect(route!.view).toBe('home')
  })

  it('flag on: history/resume snapshot cannot restore more_module_host or electricity', () => {
    setAppStoreBuildOverrideForTests(true)
    expect(
      resolvePolicySafeSnapshotView({ view: 'more_module_host', module: 'jump_out' }, 'me')
    ).toBe('home')
    expect(resolvePolicySafeSnapshotView({ view: 'electricity' }, 'home')).toBe('home')
    expect(resolvePolicySafeSnapshotView({ tab: 'schedule' }, 'home')).toBe('schedule')
  })

  it('flag on: allowed core views still resolve', () => {
    setAppStoreBuildOverrideForTests(true)
    expect(resolvePolicySafeHashRoute('#/2026000001/grades')?.view).toBe('grades')
    expect(resolvePolicySafeHashRoute('#/2026000001/schedule')?.view).toBe('schedule')
    expect(resolvePolicySafeView('privacy_data')).toBe('privacy_data')
  })
})
