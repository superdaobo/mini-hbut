import { afterEach, describe, expect, it } from 'vitest'
import {
  allowsInAppGithubUpdater,
  filterAllowedModules,
  getFeaturePolicy,
  getUpdateCheckMode,
  isAppStoreBuild,
  isCustomJavaScriptAllowed,
  isDeepLinkAllowed,
  isHotUpdateAllowed,
  isModuleAllowed,
  isRemoteModulesAllowed,
  isSponsorEntryAllowed,
  isViewAllowed,
  setAppStoreBuildOverrideForTests,
  setAppStoreSessionOverrideForTests,
  shouldApplyAppStoreRestrictions
} from './app_store_policy'

describe('app_store_policy', () => {
  afterEach(() => {
    setAppStoreBuildOverrideForTests(null)
    setAppStoreSessionOverrideForTests(null)
  })

  it('update path: github allowed only when not app-store build (even if logged in)', () => {
    setAppStoreBuildOverrideForTests(false)
    expect(allowsInAppGithubUpdater()).toBe(true)
    expect(getUpdateCheckMode()).toBe('github_cdn')

    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: true, isDemoSession: false })
    // 真实登录后 session 收紧关闭，但更新仍走苹果路径
    expect(shouldApplyAppStoreRestrictions()).toBe(false)
    expect(allowsInAppGithubUpdater()).toBe(false)
    expect(getUpdateCheckMode()).toBe('apple_storefront')
  })

  it('flag off: allows representative high-risk modules and views', () => {
    setAppStoreBuildOverrideForTests(false)
    expect(isAppStoreBuild()).toBe(false)
    expect(shouldApplyAppStoreRestrictions()).toBe(false)
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

  it('flag on + guest: blocks high-risk modules', () => {
    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: false, isDemoSession: false })
    expect(isAppStoreBuild()).toBe(true)
    expect(shouldApplyAppStoreRestrictions()).toBe(true)
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
      // 学习通 / 一码通扩展入口（#493 显式黑名单）
      'chaoxing_hub',
      'chaoxing_inbox',
      'broadband',
      'sports_venue',
      'teaching_eval',
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

  it('flag on + demo session: still blocks high-risk modules', () => {
    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: true, isDemoSession: true })
    expect(shouldApplyAppStoreRestrictions()).toBe(true)
    expect(isModuleAllowed('campus_code')).toBe(false)
    expect(isModuleAllowed('course_selection')).toBe(false)
    expect(isViewAllowed('more_module_host')).toBe(false)
    expect(getFeaturePolicy().remoteCode).toBe(false)
    // 演示账号 reviewer：学习通 / 一码通扩展模块同样不可用
    for (const id of [
      'chaoxing_hub',
      'chaoxing_inbox',
      'chaoxing_class',
      'broadband',
      'sports_venue',
      'teaching_eval',
      'electricity',
      'transactions'
    ]) {
      expect(isModuleAllowed(id), id).toBe(false)
      expect(isDeepLinkAllowed(id), id).toBe(false)
    }
  })

  it('flag on + guest: explicit blacklist covers 学习通/一码通 extension ids', () => {
    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: false, isDemoSession: false })
    // 即便未走默认拒绝路径，黑名单也必须显式命中（审核清单可核对）
    for (const id of [
      'chaoxing_hub',
      'chaoxing_inbox',
      'broadband',
      'sports_venue',
      'teaching_eval'
    ]) {
      expect(isModuleAllowed(id), `module ${id}`).toBe(false)
      expect(isViewAllowed(id), `view ${id}`).toBe(false)
      expect(isDeepLinkAllowed(id), `deeplink ${id}`).toBe(false)
    }
    // 默认拒绝边界：完全未知 id 同样 false
    expect(isModuleAllowed('future_sensitive_module_xyz')).toBe(false)
    expect(isViewAllowed('future_sensitive_module_xyz')).toBe(false)
  })

  it('flag on + real logged-in: unlocks full feature tree', () => {
    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: true, isDemoSession: false })
    expect(shouldApplyAppStoreRestrictions()).toBe(false)
    expect(isModuleAllowed('campus_code')).toBe(true)
    expect(isModuleAllowed('course_selection')).toBe(true)
    expect(isModuleAllowed('towergo')).toBe(true)
    expect(isModuleAllowed('ranking')).toBe(true)
    expect(isModuleAllowed('secret_remote_game')).toBe(true)
    expect(isViewAllowed('more_module_host')).toBe(true)
    expect(isViewAllowed('school_website')).toBe(true)
    expect(isHotUpdateAllowed()).toBe(true)
    expect(isRemoteModulesAllowed()).toBe(true)
    expect(isCustomJavaScriptAllowed()).toBe(true)
    expect(getFeaturePolicy().campusWriteOperations).toBe(true)
    expect(getFeaturePolicy().liveMobilityLocation).toBe(true)
  })

  it('flag on + guest: keeps core readonly tools', () => {
    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: false, isDemoSession: false })
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

  it('flag on + guest: remote policy bits stay locked even if remote would enable modules', () => {
    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: false, isDemoSession: false })
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

  it('flag on + guest: unknown module ids are denied', () => {
    setAppStoreBuildOverrideForTests(true)
    setAppStoreSessionOverrideForTests({ isLoggedIn: false, isDemoSession: false })
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
