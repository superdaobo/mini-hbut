import { describe, expect, it } from 'vitest'
import {
  canOpenModule,
  DISABLED_HOME_MODULE_REASONS,
  isHomeModuleHardDisabled
} from './moduleAccess'

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
