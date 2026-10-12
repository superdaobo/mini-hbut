import { afterEach, describe, expect, it } from 'vitest'
import { filterAllowedModules, isModuleAllowed, isViewAllowed, setAppStoreBuildOverrideForTests } from '../config/app_store_policy'
import { homeModuleAccessSession, homeModuleDisplaySession } from './home_module_sessions'

const MODULES = ['grades', 'campus_code', 'electricity', 'chaoxing_hub', 'ai'].map((id) => ({ id }))

afterEach(() => {
  setAppStoreBuildOverrideForTests(null)
})

describe('#1043 首页展示权限与在线执行权限分离', () => {
  it('iOS 离线冷启：已缓存真实身份仍看到原模块，敏感导航仍拒绝', () => {
    setAppStoreBuildOverrideForTests(true)
    const display = homeModuleDisplaySession(true, false)
    const access = homeModuleAccessSession(true, false, false)

    expect(filterAllowedModules(MODULES, display).map((mod) => mod.id))
      .toEqual(MODULES.map((mod) => mod.id))
    expect(isModuleAllowed('campus_code', access)).toBe(false)
    expect(isModuleAllowed('ai', access)).toBe(false)
    expect(isViewAllowed('chaoxing_hub', access)).toBe(false)
    expect(isModuleAllowed('grades', access)).toBe(true)
  })

  it('iOS 在线确认后执行能力恢复', () => {
    setAppStoreBuildOverrideForTests(true)
    const access = homeModuleAccessSession(true, true, false)
    expect(isModuleAllowed('campus_code', access)).toBe(true)
    expect(isViewAllowed('chaoxing_hub', access)).toBe(true)
  })

  it('首次安装游客与审核演示会话不显示被禁模块', () => {
    setAppStoreBuildOverrideForTests(true)
    for (const session of [
      homeModuleDisplaySession(false, false),
      homeModuleDisplaySession(true, true)
    ]) {
      expect(filterAllowedModules(MODULES, session).map((mod) => mod.id))
        .toEqual(['grades'])
    }
    expect(isModuleAllowed('campus_code', homeModuleAccessSession(true, true, true))).toBe(false)
  })

  it('非 App Store 构建维持原模块全集', () => {
    setAppStoreBuildOverrideForTests(false)
    expect(filterAllowedModules(MODULES, homeModuleDisplaySession(false, false))).toEqual(MODULES)
  })
})
