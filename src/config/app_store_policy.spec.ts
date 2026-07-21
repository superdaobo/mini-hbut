import { afterEach, describe, expect, it } from 'vitest'
import {
  filterAllowedModules,
  getFeaturePolicy,
  isAppStoreBuild,
  isCustomJavaScriptAllowed,
  isDeepLinkAllowed,
  isHotUpdateAllowed,
  isModuleAllowed,
  isRemoteModulesAllowed,
  isSponsorEntryAllowed,
  isViewAllowed,
  setAppStoreBuildOverrideForTests
} from './app_store_policy'

describe('app_store_policy', () => {
  afterEach(() => {
    setAppStoreBuildOverrideForTests(null)
  })

  it('flag off: allows representative high-risk modules and views', () => {
    setAppStoreBuildOverrideForTests(false)
    expect(isAppStoreBuild()).toBe(false)
    expect(isModuleAllowed('campus_code')).toBe(true)
    expect(isModuleAllowed('course_selection')).toBe(true)
    expect(isModuleAllowed('towergo')).toBe(true)
    expect(isModuleAllowed('ranking')).toBe(true)
    expect(isViewAllowed('more_module_host')).toBe(true)
    expect(isViewAllowed('school_website')).toBe(true)
    expect(isHotUpdateAllowed()).toBe(true)
    expect(isRemoteModulesAllowed()).toBe(true)
    expect(isCustomJavaScriptAllowed()).toBe(true)
    expect(getFeaturePolicy().campusWriteOperations).toBe(true)
  })

  it('flag on: blocks high-risk modules for all users (not reviewer-only)', () => {
    setAppStoreBuildOverrideForTests(true)
    expect(isAppStoreBuild()).toBe(true)
    const blocked = [
      'campus_code',
      'course_selection',
      'towergo',
      'ranking',
      'qxzkb',
      'school_inbox',
      'electricity',
      'transactions',
      'resource_share',
      'chaoxing_class',
      'ai',
      'more',
      'more_module_host',
      'more_chaoxing_checkin',
      'service_stats',
      'config',
      'school_website',
      'quick_links',
      'campus_network'
    ]
    for (const id of blocked) {
      expect(isModuleAllowed(id), id).toBe(false)
      expect(isViewAllowed(id), id).toBe(false)
      expect(isDeepLinkAllowed(id), id).toBe(false)
    }
  })

  it('flag on: keeps core readonly tools', () => {
    setAppStoreBuildOverrideForTests(true)
    for (const id of [
      'home',
      'schedule',
      'grades',
      'exams',
      'classroom',
      'academic',
      'training',
      'calendar',
      'library',
      'campus_map',
      'notifications',
      'me',
      'settings',
      'export_center',
      'official',
      'feedback',
      'privacy_data'
    ]) {
      expect(isViewAllowed(id), id).toBe(true)
    }
    expect(isModuleAllowed('grades')).toBe(true)
    expect(isModuleAllowed('library')).toBe(true)
    expect(isModuleAllowed('__more__')).toBe(true)
  })

  it('flag on: remote policy bits stay locked even if remote would enable modules', () => {
    setAppStoreBuildOverrideForTests(true)
    // Simulate remote config trying to enable everything — policy must still deny
    const remoteModules = [
      { id: 'campus_code', enabled: true },
      { id: 'towergo', enabled: true },
      { id: 'more', enabled: true },
      { id: 'grades', enabled: true }
    ]
    const visible = filterAllowedModules(remoteModules)
    expect(visible.map((m) => m.id)).toEqual(['grades'])
    expect(isHotUpdateAllowed()).toBe(false)
    expect(isRemoteModulesAllowed()).toBe(false)
    expect(isCustomJavaScriptAllowed()).toBe(false)
    expect(getFeaturePolicy().remoteCode).toBe(false)
    expect(getFeaturePolicy().liveMobilityLocation).toBe(false)
  })

  it('flag on: unknown module ids are denied', () => {
    setAppStoreBuildOverrideForTests(true)
    expect(isModuleAllowed('secret_remote_game')).toBe(false)
    expect(isViewAllowed('unknown_view_xyz')).toBe(false)
  })

  describe('isSponsorEntryAllowed', () => {
    it('flag off: allows sponsor for guest, demo, and real sessions', () => {
      setAppStoreBuildOverrideForTests(false)
      expect(isSponsorEntryAllowed({ isLoggedIn: false, isDemoSession: false })).toBe(true)
      expect(isSponsorEntryAllowed({ isLoggedIn: true, isDemoSession: true })).toBe(true)
      expect(isSponsorEntryAllowed({ isLoggedIn: true, isDemoSession: false })).toBe(true)
    })

    it('flag on: hides sponsor for guest (not logged in)', () => {
      setAppStoreBuildOverrideForTests(true)
      expect(isSponsorEntryAllowed({ isLoggedIn: false, isDemoSession: false })).toBe(false)
      expect(isSponsorEntryAllowed({ isLoggedIn: false, isDemoSession: true })).toBe(false)
    })

    it('flag on: hides sponsor for demo session even if logged in', () => {
      setAppStoreBuildOverrideForTests(true)
      expect(isSponsorEntryAllowed({ isLoggedIn: true, isDemoSession: true })).toBe(false)
    })

    it('flag on: allows sponsor for real logged-in session', () => {
      setAppStoreBuildOverrideForTests(true)
      expect(isSponsorEntryAllowed({ isLoggedIn: true, isDemoSession: false })).toBe(true)
    })
  })
})
