/**
 * Web 侧 issuer 约束测试（#618 验收）：
 * - Production canonical issuer 为 Punycode ASCII；
 * - Preview issuer 与 Production issuer 自动断言不相等。
 */
import { describe, expect, it } from 'vitest'
import {
  PRODUCTION_ISSUER,
  PRODUCTION_ISSUER_DISPLAY,
  isAscii,
  getPublicIssuer,
  getPreviewIssuer,
} from '../lib/issuer'

describe('Production canonical issuer 字符串断言', () => {
  it('精确等于 Punycode ASCII 形式', () => {
    expect(PRODUCTION_ISSUER).toBe('https://id.xn--vhq74jc2fzpchter27a.com')
    expect(isAscii(PRODUCTION_ISSUER)).toBe(true)
    // 不包含任何 Unicode 字符
    expect(PRODUCTION_ISSUER).not.toMatch(/[^\x00-\x7F]/)
    // 展示层中文形式存在且与协议层不同
    expect(PRODUCTION_ISSUER_DISPLAY).toBe('https://id.湖北工业大学.com')
  })
})

describe('Preview issuer 与 Production issuer 不相等（自动断言）', () => {
  it('默认（Production）返回 canonical issuer', () => {
    expect(getPublicIssuer({})).toBe(PRODUCTION_ISSUER)
  })

  it('Preview 未配置时抛错，禁止回落 Production', () => {
    expect(() => getPublicIssuer({ IDENTITY_ENVIRONMENT: 'preview' })).toThrow()
    expect(() => getPreviewIssuer({ IDENTITY_ENVIRONMENT: 'preview' })).toThrow()
  })

  it('Preview 显式配置后与 Production 不相等', () => {
    const env = {
      IDENTITY_ENVIRONMENT: 'preview',
      IDENTITY_PUBLIC_ISSUER: 'https://identity-web-preview.vercel.app',
      IDENTITY_PREVIEW_ISSUER: 'https://identity-web-preview.vercel.app',
    }
    const previewIssuer = getPreviewIssuer(env)
    expect(previewIssuer).toBe('https://identity-web-preview.vercel.app')
    expect(previewIssuer).not.toBe(PRODUCTION_ISSUER)
    expect(getPublicIssuer(env)).not.toBe(PRODUCTION_ISSUER)
  })

  it('Preview 误配 Production issuer 时抛错（fail closed）', () => {
    expect(() =>
      getPreviewIssuer({ IDENTITY_PREVIEW_ISSUER: 'https://id.xn--vhq74jc2fzpchter27a.com' }),
    ).toThrow()
    expect(() =>
      getPublicIssuer({
        IDENTITY_ENVIRONMENT: 'preview',
        IDENTITY_PUBLIC_ISSUER: 'https://id.xn--vhq74jc2fzpchter27a.com',
      }),
    ).toThrow()
  })
})
