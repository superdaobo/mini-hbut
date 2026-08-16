/**
 * Admin 风险提示纯函数测试（issue #625）：
 * - redirect URI 风险分级（non_https/localhost/custom_scheme/domain_mismatch/changed）；
 * - scope 风险分级 + 标签；
 * - 高亮只是提示，不替代 Core 校验（纯展示层）。
 */
import { describe, expect, it } from 'vitest'
import {
  classifyRedirectRisk,
  scopeRisk,
  scopeLabel,
  SENSITIVE_SCOPES,
  hostnameOf,
  isLoopback,
} from '../lib/admin/risk'

describe('#625 redirect URI 风险高亮', () => {
  it('non_https_web：web_https 类型且 http:// 且非 loopback', () => {
    const r = classifyRedirectRisk({ uri: 'http://course.example.com/cb', kind: 'web_https', homepage_url: null })
    expect(r.flags).toContain('non_https_web')
  })

  it('https web_https 不标记 non_https', () => {
    const r = classifyRedirectRisk({ uri: 'https://course.example.com/oauth/callback', kind: 'web_https', homepage_url: null })
    expect(r.flags).not.toContain('non_https_web')
  })

  it('localhost：http://localhost 与 127.0.0.1 与 ::1', () => {
    expect(classifyRedirectRisk({ uri: 'http://localhost:3000/cb', kind: 'web_https', homepage_url: null }).flags).toContain('localhost')
    expect(classifyRedirectRisk({ uri: 'http://127.0.0.1:8080/cb', kind: 'web_https', homepage_url: null }).flags).toContain('localhost')
    expect(classifyRedirectRisk({ uri: 'http://[::1]:3000/cb', kind: 'native_loopback', homepage_url: null }).flags).toContain('localhost')
    // localhost 不属于 non_https 高风险（开发用途）
    expect(classifyRedirectRisk({ uri: 'http://localhost:3000/cb', kind: 'web_https', homepage_url: null }).flags).not.toContain('non_https_web')
  })

  it('custom_scheme：非 http(s) 且非 loopback 的 scheme', () => {
    const r = classifyRedirectRisk({ uri: 'com.example.app://oauth/callback', kind: 'native_custom', homepage_url: null })
    expect(r.flags).toContain('custom_scheme')
    // native_loopback 是标准 http loopback，不算 custom
    expect(classifyRedirectRisk({ uri: 'http://127.0.0.1:9999/cb', kind: 'native_loopback', homepage_url: null }).flags).not.toContain('custom_scheme')
  })

  it('domain_mismatch：redirect 与主页域名不一致', () => {
    const r = classifyRedirectRisk({ uri: 'https://callback.evil.example.com/cb', kind: 'web_https', homepage_url: 'https://course.example.com' })
    expect(r.flags).toContain('domain_mismatch')
    const same = classifyRedirectRisk({ uri: 'https://course.example.com/cb', kind: 'web_https', homepage_url: 'https://course.example.com' })
    expect(same.flags).not.toContain('domain_mismatch')
  })

  it('changed：相对上一份审核新增/变更的项', () => {
    const previous = ['https://course.example.com/oauth/callback']
    const added = classifyRedirectRisk({ uri: 'https://new.example.com/cb', kind: 'web_https', homepage_url: null, previousUris: previous })
    expect(added.flags).toContain('changed')
    const kept = classifyRedirectRisk({ uri: 'https://course.example.com/oauth/callback', kind: 'web_https', homepage_url: null, previousUris: previous })
    expect(kept.flags).not.toContain('changed')
  })

  it('hostnameOf/isLoopback 工具', () => {
    expect(hostnameOf('https://Example.COM:8443/x')).toBe('example.com')
    expect(hostnameOf('not a url')).toBeNull()
    expect(isLoopback('localhost')).toBe(true)
    expect(isLoopback('127.0.0.1')).toBe(true)
    expect(isLoopback('192.168.1.1')).toBe(false)
  })
})

describe('#625 scope 风险分级', () => {
  it('敏感集合与 Core 一致（student.identity / offline_access）', () => {
    expect(SENSITIVE_SCOPES).toEqual(['student.identity', 'offline_access'])
  })

  it('openid/profile 基础；student.identity/offline_access 敏感', () => {
    expect(scopeRisk('openid')).toBe('basic')
    expect(scopeRisk('profile')).toBe('basic')
    expect(scopeRisk('student.identity')).toBe('sensitive')
    expect(scopeRisk('offline_access')).toBe('sensitive')
  })

  it('scope 中文标签', () => {
    expect(scopeLabel('student.identity')).toContain('学校身份')
    expect(scopeLabel('unknown.scope')).toBe('unknown.scope')
  })
})
