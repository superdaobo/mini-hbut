/**
 * Canonical issuer / IDN 约束测试。
 * 目标：Unicode 与 Punycode 永不混用，协议字段只允许 ASCII canonical issuer。
 */
import { describe, expect, it } from 'vitest'
import {
  PRODUCTION_CANONICAL_ISSUER,
  PRODUCTION_DISPLAY_ISSUER,
  PRODUCTION_CANONICAL_HOST,
  normalizeIssuer,
  resolveIssuer,
  isAscii,
} from '../src/config/issuer.js'

describe('Production canonical issuer（#618 验收：Punycode ASCII 字符串断言）', () => {
  it('常量精确等于 Punycode 形式', () => {
    expect(PRODUCTION_CANONICAL_ISSUER).toBe('https://id.xn--vhq74jc2fzpchter27a.com')
    expect(PRODUCTION_CANONICAL_HOST).toBe('id.xn--vhq74jc2fzpchter27a.com')
  })

  it('canonical 常量必须是纯 ASCII', () => {
    expect(isAscii(PRODUCTION_CANONICAL_ISSUER)).toBe(true)
    // 展示层中文形式必须与协议层区分开
    expect(PRODUCTION_DISPLAY_ISSUER).toBe('https://id.湖北工业大学.com')
    expect(isAscii(PRODUCTION_DISPLAY_ISSUER)).toBe(false)
  })

  it('Unicode issuer 会被规范化成 Punycode ASCII（不混用）', () => {
    expect(normalizeIssuer('https://id.湖北工业大学.com')).toBe(
      'https://id.xn--vhq74jc2fzpchter27a.com',
    )
    expect(normalizeIssuer('https://id.xn--vhq74jc2fzpchter27a.com')).toBe(
      'https://id.xn--vhq74jc2fzpchter27a.com',
    )
  })

  it('非 https issuer 直接抛错（fail closed）', () => {
    expect(() => normalizeIssuer('id.湖北工业大学.com')).toThrow()
    expect(() => normalizeIssuer('http://id.xn--vhq74jc2fzpchter27a.com')).toThrow()
  })
})

describe('resolveIssuer 环境分层（#618 验收：Preview issuer 与 Production issuer 不相等）', () => {
  it('默认（Production）返回 canonical issuer', () => {
    expect(resolveIssuer({})).toBe('https://id.xn--vhq74jc2fzpchter27a.com')
  })

  it('Preview 未显式配置 issuer 时抛错，禁止回落 Production', () => {
    expect(() => resolveIssuer({ IDENTITY_ENVIRONMENT: 'preview' })).toThrow()
    expect(() => resolveIssuer({ IDENTITY_ENVIRONMENT: 'development' })).toThrow()
  })

  it('Preview 显式配置独立 issuer，且与 Production 不相等', () => {
    const previewIssuer = resolveIssuer({
      IDENTITY_ENVIRONMENT: 'preview',
      IDENTITY_ISSUER: 'https://identity-core-preview.vercel.app',
    })
    expect(previewIssuer).toBe('https://identity-core-preview.vercel.app')
    expect(previewIssuer).not.toBe(PRODUCTION_CANONICAL_ISSUER)
  })

  it('Preview 误配生产域名 issuer 时抛错（fail closed）', () => {
    expect(() =>
      resolveIssuer({
        IDENTITY_ENVIRONMENT: 'preview',
        IDENTITY_ISSUER: 'https://id.xn--vhq74jc2fzpchter27a.com',
      }),
    ).toThrow()
  })

  it('Preview 配 Unicode 形式的生产域名时，规范化后等于 canonical 并被拒绝（防混用）', () => {
    // Unicode 形式会被规范化成 canonical（Punycode）
    expect(normalizeIssuer('https://id.湖北工业大学.com')).toBe(PRODUCTION_CANONICAL_ISSUER)
    // 但 Preview 环境一旦解析出生产 issuer 必须拒绝
    expect(() =>
      resolveIssuer({
        IDENTITY_ENVIRONMENT: 'preview',
        IDENTITY_ISSUER: 'https://id.湖北工业大学.com',
      }),
    ).toThrow()
  })
})
