/**
 * oidcErrors.spec.ts —— P2-4（#1208）§4.1 kind → 文案 **逐字** 冻结校验 + 未知 kind 回落。
 *
 * 断言口径：本文件内独立硬编码规格 §4.1 的 17 条原文（与实现文件不同源），
 * 任何一侧改动都会导致失败——保证「逐字」不被静默漂移。
 */
import { describe, expect, it } from 'vitest'
import { isOidcKind, messageForOidc, OIDC_KINDS, OIDC_MESSAGES } from './oidcErrors'

// 规格 §4.1 逐字原文（独立副本；含标点必须一致）
const SPEC_TABLE: Record<string, string> = {
  oidc_begin_ok: '已打开浏览器，请在浏览器中完成登录',
  oidc_login_ok: '登录成功',
  oidc_disabled: '该版本未启用统一登录',
  oidc_misconfigured: '登录配置不完整，请联系管理员',
  oidc_no_pending: '登录请求已失效，请重新发起',
  oidc_state_mismatch: '登录状态校验失败，请重新发起',
  oidc_nonce_mismatch: '登录凭证校验失败，请重新发起',
  oidc_callback_invalid: '回调地址无效，请重新发起',
  oidc_token_exchange_failed: '换取登录凭证失败，请重试',
  oidc_id_token_invalid: '登录凭证无效，请重试',
  oidc_timeout: '登录超时，请重试',
  oidc_network: '网络不可用，请检查网络后重试',
  oidc_session_active: '已登录',
  oidc_session_absent: '未登录',
  oidc_logout_ok: '已退出登录',
  secure_storage_unavailable: '无法安全保存登录状态（系统凭据存储不可用）',
  unknown: '操作失败，请稍后重试'
}

describe('§4.1 文案表逐字（17 条）', () => {
  it('kind 表恰为 17 个且与规格表键逐字一致（含顺序）', () => {
    expect(OIDC_KINDS).toHaveLength(17)
    expect([...OIDC_KINDS]).toEqual(Object.keys(SPEC_TABLE))
    // 无重复
    expect(new Set(OIDC_KINDS).size).toBe(17)
  })

  it('17 条文案与规格 §4.1 逐字一致（含标点）', () => {
    for (const kind of OIDC_KINDS) {
      expect(OIDC_MESSAGES[kind]).toBe(SPEC_TABLE[kind])
    }
  })

  it('文案不含任何敏感占位（code/token/学号/URL 一律不出现）', () => {
    for (const kind of OIDC_KINDS) {
      const text = OIDC_MESSAGES[kind]
      expect(text.includes('http')).toBe(false)
      expect(text.includes('code')).toBe(false)
      expect(text.includes('token')).toBe(false)
      expect(text.includes('2023')).toBe(false)
    }
  })
})

describe('未知 kind 回落 unknown', () => {
  it('任意未知字符串 → unknown 文案（绝不原样透传输入）', () => {
    expect(messageForOidc('bogus_kind')).toBe(SPEC_TABLE.unknown)
    expect(messageForOidc('OIDC_BEGIN_OK')).toBe(SPEC_TABLE.unknown) // 大小写敏感
    expect(messageForOidc('oidc_')).toBe(SPEC_TABLE.unknown)
    expect(messageForOidc(' oidc_timeout')).toBe(SPEC_TABLE.unknown) // 前导空格
    expect(messageForOidc('oidc_timeout ')).toBe(SPEC_TABLE.unknown) // 尾随空格
  })

  it('非字符串输入（undefined/null/数字/对象/数组）→ unknown 文案', () => {
    expect(messageForOidc(undefined)).toBe(SPEC_TABLE.unknown)
    expect(messageForOidc(null)).toBe(SPEC_TABLE.unknown)
    expect(messageForOidc(42)).toBe(SPEC_TABLE.unknown)
    expect(messageForOidc({ kind: 'oidc_timeout' })).toBe(SPEC_TABLE.unknown)
    expect(messageForOidc(['oidc_timeout'])).toBe(SPEC_TABLE.unknown)
  })
})

describe('isOidcKind 防御式判断', () => {
  it('表内 kind → true', () => {
    for (const kind of OIDC_KINDS) expect(isOidcKind(kind)).toBe(true)
  })

  it('表外/畸形 → false', () => {
    expect(isOidcKind('')).toBe(false)
    expect(isOidcKind('oidc_unknown_extra')).toBe(false)
    expect(isOidcKind('secure_storage_unavailable!')).toBe(false)
    expect(isOidcKind(42)).toBe(false)
    expect(isOidcKind(undefined)).toBe(false)
  })
})
