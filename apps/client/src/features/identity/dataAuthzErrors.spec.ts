// src/features/identity/dataAuthzErrors.spec.ts —— 【检查 6】R8：数据授权拒绝 kind → 文案
// 断言：
// 1. 4 个新 kind 逐字命中冻结文案（app_not_whitelisted / domain_not_allowed /
//    op_not_allowed / audience_missing）；
// 2. 未知 kind / 非字符串一律回落通用 `unknown` 文案（fail-safe 不变，不透传原文）；
// 3. 旧 kind（no_consent / consent_revoked / consent_expired）已退役：不再被映射，
//    一律回落通用文案。
import { describe, expect, it } from 'vitest'
import {
  DATA_AUTHZ_KINDS,
  DATA_AUTHZ_MESSAGES,
  isDataAuthzKind,
  messageForDataAuthz
} from './dataAuthzErrors'

describe('检查 6 R8：数据授权拒绝 kind → 可读中文文案', () => {
  it.each([
    ['app_not_whitelisted', '该应用尚未获得数据访问授权，请联系管理员配置数据授权白名单'],
    ['domain_not_allowed', '该应用没有此项数据的访问权限，请联系管理员授予对应数据授权'],
    ['op_not_allowed', '该应用没有此操作权限，请联系管理员调整数据授权范围'],
    ['audience_missing', '当前登录凭证缺少数据授权信息，请重新登录后再试']
  ])('kind=%s → 固定文案（逐字）', (kind, message) => {
    expect(messageForDataAuthz(kind)).toBe(message)
    expect(DATA_AUTHZ_MESSAGES[kind as keyof typeof DATA_AUTHZ_MESSAGES]).toBe(message)
  })

  it('未知 kind / 非字符串 → 通用 unknown 文案（绝不原样透传输入）', () => {
    expect(messageForDataAuthz('some_new_kind')).toBe(DATA_AUTHZ_MESSAGES.unknown)
    expect(messageForDataAuthz('')).toBe(DATA_AUTHZ_MESSAGES.unknown)
    expect(messageForDataAuthz(undefined)).toBe(DATA_AUTHZ_MESSAGES.unknown)
    expect(messageForDataAuthz(42)).toBe(DATA_AUTHZ_MESSAGES.unknown)
    expect(messageForDataAuthz(['app_not_whitelisted'])).toBe(DATA_AUTHZ_MESSAGES.unknown)
  })

  it('旧 kind 已退役：不再被映射，一律回落通用文案', () => {
    for (const oldKind of ['no_consent', 'consent_revoked', 'consent_expired']) {
      expect(isDataAuthzKind(oldKind)).toBe(false)
      expect(messageForDataAuthz(oldKind)).toBe(DATA_AUTHZ_MESSAGES.unknown)
    }
  })

  it('kind 集合无增无减（4 个新 kind + unknown）', () => {
    expect([...DATA_AUTHZ_KINDS].sort()).toEqual(
      ['app_not_whitelisted', 'audience_missing', 'domain_not_allowed', 'op_not_allowed', 'unknown'].sort()
    )
  })
})
