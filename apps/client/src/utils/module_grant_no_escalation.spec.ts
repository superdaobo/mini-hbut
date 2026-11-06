/**
 * ⛳ G-F：模块更新不得悄悄扩权（#1168 T07 收口后补）。
 *
 * 场景：v1 声明 `school.portal_client_ip`，v2 更新时多声明 `school.portal_page_view`。
 * 若直接把清单权限当授予集，用户「只是更新页面」就等于同意了新权限。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  computeGrantedCapabilities,
  moduleGrantStorageKey,
  readModuleGrant,
  writeModuleGrant
} from './more_modules/grants'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const fakeStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key)
  }
}

describe('⛳ G-F 模块能力不扩权', () => {
  it('首次安装：授予清单声明的全部能力', () => {
    const result = computeGrantedCapabilities(null, ['b', 'a', 'a'], { firstInstall: true })
    expect(result.granted).toEqual(['a', 'b'])
    expect(result.needsConsent).toEqual([])
  })

  it('更新后新增能力不自动授予，只授予交集', () => {
    const result = computeGrantedCapabilities(
      ['school.portal_client_ip'],
      ['school.portal_client_ip', 'school.portal_page_view']
    )
    expect(result.granted).toEqual(['school.portal_client_ip'])
    expect(result.needsConsent).toEqual(['school.portal_page_view'])
  })

  it('更新后移除能力 → 授予集也随之收缩（不保留已删除的权限）', () => {
    const result = computeGrantedCapabilities(
      ['school.portal_client_ip', 'school.portal_page_view'],
      ['school.portal_page_view']
    )
    expect(result.granted).toEqual(['school.portal_page_view'])
    expect(result.needsConsent).toEqual([])
  })

  it('历史记录为空数组 = 已记录但没给过任何能力（不等于首次安装）', () => {
    const result = computeGrantedCapabilities([], ['school.portal_client_ip'], { firstInstall: false })
    expect(result.granted).toEqual([])
    expect(result.needsConsent).toEqual(['school.portal_client_ip'])
  })

  it('授予记录读写：非法内容按无记录处理，不放大权限', () => {
    const storage = fakeStorage()
    expect(readModuleGrant('demo', storage)).toBeNull()

    writeModuleGrant('demo', ['a'], storage)
    expect(readModuleGrant('demo', storage)).toEqual(['a'])
    expect(moduleGrantStorageKey('demo')).toContain('demo')

    storage.setItem(moduleGrantStorageKey('demo'), '{"not":"array"}')
    expect(readModuleGrant('demo', storage)).toBeNull()

    storage.setItem(moduleGrantStorageKey('demo'), 'not-json')
    expect(readModuleGrant('demo', storage)).toBeNull()
  })

  it('宿主登记实例时使用交集结果，并把首次授予落盘', () => {
    const view = read('src/components/MoreModuleHostView.vue')
    expect(view).toContain('computeGrantedCapabilities(')
    expect(view).toContain('needsConsent')
    expect(view).toContain('writeModuleGrant(')
    // 不得再把清单 permissions 直接当 capabilities 传下去
    expect(view).not.toContain('capabilities: permissions.filter')
  })
})
