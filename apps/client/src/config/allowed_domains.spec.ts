import { describe, expect, it } from 'vitest'
import { isAllowedHttpsUrl, isDangerousUrlScheme } from './allowed_domains'

describe('allowed_domains', () => {
  it('accepts project https hosts', () => {
    expect(isAllowedHttpsUrl('https://hbut.6661111.xyz/privacy')).toBe(true)
    expect(isAllowedHttpsUrl('https://superdaobo.github.io/mini-hbut/privacy')).toBe(true)
    expect(isAllowedHttpsUrl('https://github.com/superdaobo/mini-hbut')).toBe(true)
    expect(isAllowedHttpsUrl('https://beian.miit.gov.cn/')).toBe(true)
  })

  it('rejects http, javascript, and localhost', () => {
    expect(isAllowedHttpsUrl('http://hbut.6661111.xyz/x')).toBe(false)
    expect(isAllowedHttpsUrl('https://127.0.0.1/x')).toBe(false)
    expect(isDangerousUrlScheme('javascript:alert(1)')).toBe(true)
    expect(isDangerousUrlScheme('data:text/html,hi')).toBe(true)
  })
})
