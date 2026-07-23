import { describe, expect, it } from 'vitest'
import {
  canOpenModule,
  decideHomeNavigate,
  DISABLED_HOME_MODULE_REASONS,
  isHomeModuleHardDisabled
} from './moduleAccess'

/** 与 Dashboard baseModules 中 sports_venue 行同形的生产数据 */
const DASHBOARD_SPORTS_ROW = {
  id: 'sports_venue',
  name: '运动场馆',
  available: false as const,
  requiresLogin: true,
  desc: '场馆预约需校园网（暂不可用）'
}

describe('canOpenModule (shipped access policy)', () => {
  it('blocks sports_venue even if available:true is passed', () => {
    expect(isHomeModuleHardDisabled('sports_venue')).toBe(true)
    const r = canOpenModule(
      { id: 'sports_venue', available: true, requiresLogin: true },
      { isLoggedIn: true }
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toBe(DISABLED_HOME_MODULE_REASONS.sports_venue)
  })

  it('blocks sports_venue by id alone', () => {
    const r = canOpenModule('sports_venue', { isLoggedIn: true })
    expect(r.ok).toBe(false)
  })

  it('allows electricity when logged in', () => {
    const r = canOpenModule(
      { id: 'electricity', available: true, requiresLogin: true },
      { isLoggedIn: true }
    )
    expect(r.ok).toBe(true)
  })

  it('requires login for login-gated modules', () => {
    const r = canOpenModule(
      { id: 'electricity', available: true, requiresLogin: true },
      { isLoggedIn: false }
    )
    expect(r.ok).toBe(false)
    expect(r.needLogin).toBe(true)
  })

  it('honors available:false for non-hard-disabled modules', () => {
    const r = canOpenModule(
      { id: 'ai', available: false, desc: '维护中' },
      { isLoggedIn: true }
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('维护')
  })
})

describe('decideHomeNavigate (Dashboard.navigateTo production gate)', () => {
  it('blocks sports_venue when modules list has available:false (real Dashboard shape)', () => {
    const modules = [
      { id: 'electricity', available: true, requiresLogin: true },
      DASHBOARD_SPORTS_ROW,
      { id: 'broadband', available: true, requiresLogin: true }
    ]
    const r = decideHomeNavigate('sports_venue', modules, { isLoggedIn: true })
    expect(r.ok).toBe(false)
    // 硬表优先：不依赖 available 字段也能拦
    expect(r.reason).toBe(DISABLED_HOME_MODULE_REASONS.sports_venue)
  })

  it('blocks sports_venue even if list entry is missing (deep-link / stale id)', () => {
    const r = decideHomeNavigate('sports_venue', [{ id: 'electricity', available: true }], {
      isLoggedIn: true
    })
    expect(r.ok).toBe(false)
  })

  it('allows electricity click when listed available', () => {
    const r = decideHomeNavigate(
      'electricity',
      [{ id: 'electricity', available: true, requiresLogin: true }],
      { isLoggedIn: true }
    )
    expect(r.ok).toBe(true)
  })

  it('blocks available:false non-hard module without opening', () => {
    const r = decideHomeNavigate(
      'ai',
      [{ id: 'ai', available: false, desc: '维护中', requiresLogin: true }],
      { isLoggedIn: true }
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('维护')
  })
})
