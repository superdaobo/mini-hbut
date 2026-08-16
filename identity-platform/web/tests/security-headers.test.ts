/**
 * 安全响应头与日志脱敏测试（#630 Security Headers 验收项）。
 */
import { describe, expect, it } from 'vitest'
import {
  authSiteSecurityHeaders,
  baseSecurityHeaders,
  devContentSecurityPolicy,
  strictContentSecurityPolicy,
} from '../lib/security/headers'
import { redactHandoff, REDACTED_PLACEHOLDER } from '../lib/security/redact'
import { VALID_HANDOFF } from './fixtures'

describe('auth 站点安全头（生产）', () => {
  const headers = authSiteSecurityHeaders({ NODE_ENV: 'production' })

  it('基础头齐全：no-store / no-referrer / nosniff', () => {
    expect(headers['Cache-Control']).toContain('no-store')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
  })

  it('生产 CSP 严格：自身 script/style/image，frame-ancestors none，object-src none', () => {
    const csp = headers['Content-Security-Policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self'")
    expect(csp).toContain("img-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    // Next.js RSC 需要 script-src 'unsafe-inline'（#630 接力页 hydration），
    // 但禁止 eval 与任何外部源（与 security-hardening.test.ts 一致）
    expect(csp).not.toContain('unsafe-eval')
  })

  it('不加载广告/第三方 analytics/任意第三方 script', () => {
    const csp = headers['Content-Security-Policy']
    for (const forbidden of ['analytics', 'ads', 'googletag', 'doubleclick', 'https://']) {
      // 严格 CSP 只出现 'self' 与裸关键字；出现 https:// 即表示放行外部源
      expect(csp).not.toContain(forbidden)
    }
  })

  it('strictContentSecurityPolicy 与 devContentSecurityPolicy 差异仅在 inline 放宽', () => {
    // 生产已为 Next.js RSC 放宽 script-src 'unsafe-inline'（#630），但两者均禁 eval
    expect(strictContentSecurityPolicy()).not.toContain('unsafe-eval')
    expect(strictContentSecurityPolicy()).toContain("script-src 'self' 'unsafe-inline'")
    expect(devContentSecurityPolicy()).toContain('unsafe-inline')
    // 硬约束两者一致
    for (const policy of [strictContentSecurityPolicy(), devContentSecurityPolicy()]) {
      expect(policy).toContain("frame-ancestors 'none'")
      expect(policy).toContain("object-src 'none'")
    }
  })

  it('开发模式返回放宽 CSP（HMR 需要 inline script）', () => {
    const dev = authSiteSecurityHeaders({ NODE_ENV: 'development' })
    expect(dev['Content-Security-Policy']).toContain("script-src 'self' 'unsafe-inline'")
    expect(dev['Cache-Control']).toContain('no-store')
  })

  it('baseSecurityHeaders 不包含 CSP（CSP 单独管理）', () => {
    expect(baseSecurityHeaders()['Content-Security-Policy']).toBeUndefined()
  })
})

describe('handoff 日志脱敏', () => {
  it('redactHandoff 替换 handoff 原值', () => {
    const text = `GET /api/v1/requests/req_1 handoff=${VALID_HANDOFF} status=200`
    const redacted = redactHandoff(text, VALID_HANDOFF)
    expect(redacted).not.toContain(VALID_HANDOFF)
    expect(redacted).toContain(REDACTED_PLACEHOLDER)
  })

  it('空 handoff 不改变文本', () => {
    expect(redactHandoff('hello', '')).toBe('hello')
  })
})
