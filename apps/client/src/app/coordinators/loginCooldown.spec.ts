// src/app/coordinators/loginCooldown.spec.ts
//
// GitHub #931 登录冷却登记测试：
//   - 门户密码登录成功后登记 60 秒窗口（与 Rust LOGIN_COOLDOWN 一致）
//   - 从 Rust 透传文案解析剩余秒数并登记
//   - 非冷却错误不登记，避免误伤正常恢复链

import { beforeEach, describe, expect, it } from 'vitest'
import {
  LOGIN_COOLDOWN_MS,
  isLoginCooldownActive,
  loginCooldownRemainingMs,
  noteLoginCooldownFromError,
  noteLoginSuccess,
  resetLoginCooldown
} from './loginCooldown'

describe('登录冷却登记（#931）', () => {
  beforeEach(() => {
    resetLoginCooldown()
  })

  it('登录成功后登记 60 秒窗口，边界后到期', () => {
    const now = 1_700_000_000_000
    noteLoginSuccess(now)

    expect(LOGIN_COOLDOWN_MS).toBe(60 * 1000)
    expect(isLoginCooldownActive(now)).toBe(true)
    expect(isLoginCooldownActive(now + LOGIN_COOLDOWN_MS - 1)).toBe(true)
    expect(isLoginCooldownActive(now + LOGIN_COOLDOWN_MS)).toBe(false)
    expect(loginCooldownRemainingMs(now + 10_000)).toBe(LOGIN_COOLDOWN_MS - 10_000)
  })

  it('从服务端文案解析剩余秒数并登记（服务端剩余更权威）', () => {
    const seconds = noteLoginCooldownFromError(new Error('登录频率过高，请43秒后再试'))

    expect(seconds).toBe(43)
    expect(isLoginCooldownActive()).toBe(true)
    // 放宽断言：仅校验落在 (42s, 43s] 区间，避免依赖执行耗时
    expect(loginCooldownRemainingMs()).toBeGreaterThan(42_000)
    expect(loginCooldownRemainingMs()).toBeLessThanOrEqual(43_000)
  })

  it('字符串形态与对象形态的冷却文案同样可识别', () => {
    expect(noteLoginCooldownFromError('登录频率过高，请12秒后再试')).toBe(12)
    resetLoginCooldown()
    expect(noteLoginCooldownFromError({ message: '登录频率过高,请7秒后再试' })).toBe(7)
  })

  it('非冷却错误不登记，不影响正常恢复链', () => {
    expect(noteLoginCooldownFromError(new Error('网络错误'))).toBe(0)
    expect(noteLoginCooldownFromError(new Error('会话已过期，请重新登录'))).toBe(0)
    expect(isLoginCooldownActive()).toBe(false)
    expect(loginCooldownRemainingMs()).toBe(0)
  })
})
