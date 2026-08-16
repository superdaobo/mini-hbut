/**
 * Discovery 测试矩阵（#620 测试矩阵 Discovery 4 条）。
 *
 * 1. issuer 精确为 canonical Punycode（真实 Production canonical）；
 * 2. endpoints 都是 HTTPS Production URL；
 * 3. response_types_supported 不包含不打算支持的 implicit/hybrid；
 * 4. code_challenge_methods_supported 包含 S256。
 *
 * 使用真实 Production canonical issuer（id.xn--vhq74jc2fzpchter27a.com）
 * 启动 provider，验证 Discovery 文档对外契约与 #617/#620 一致。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientFixture } from '../helpers/fixtures.js'
import {
  startE2E,
  fetchDiscovery,
  type E2EContext,
} from './helpers/e2e.js'
import { PRODUCTION_CANONICAL_ISSUER } from '../../src/config/issuer.js'

describe('OIDC Discovery（#620 矩阵：4 条）', () => {
  let db: TestDatabase
  let e2e: E2EContext | null = null

  beforeEach(async () => {
    db = await createTestDatabase()
    // 用 Production canonical issuer 启动：Discovery 必须精确输出 Punycode
    e2e = await startE2E(db, { issuer: PRODUCTION_CANONICAL_ISSUER })
    // fixture client 触发 provider Client 加载路径（Discovery 不依赖，仅预热）
    await createClientFixture(db.sql, { status: 'active' })
  })
  afterEach(async () => {
    if (e2e) await e2e.close()
    await db.cleanup()
  })

  it('1. issuer 精确为 canonical Punycode', async () => {
    const doc = await fetchDiscovery(e2e!.baseUrl)
    expect(doc.issuer).toBe(PRODUCTION_CANONICAL_ISSUER)
    // 不允许出现 Unicode 展示形式（#617：协议字段禁止混用）
    expect(doc.issuer).not.toContain('湖北工业大学')
    expect(String(doc.issuer)).toMatch(/^https:\/\/id\.xn--vhq74jc2fzpchter27a\.com$/)
  })

  it('2. endpoints 都是 HTTPS Production URL（生产代理下与 issuer 同源）', async () => {
    // 生产场景：Vercel 反代带 X-Forwarded-Proto/Host。app.proxy=true 时必须
    // 基于 canonical origin 生成 endpoint（否则外部 OIDC client 会拿到
    // http:// 内部 URL，连接失败）。断言用 production 环境 + canonical issuer。
    const prod = await startE2E(db, { issuer: PRODUCTION_CANONICAL_ISSUER, environment: 'production' })
    try {
      const res = await fetch(`${prod.baseUrl}/.well-known/openid-configuration`, {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'id.xn--vhq74jc2fzpchter27a.com',
        },
      })
      const doc = (await res.json()) as Record<string, unknown>
      expect(doc.issuer).toBe(PRODUCTION_CANONICAL_ISSUER)
      const endpoints = [
        'authorization_endpoint',
        'token_endpoint',
        'userinfo_endpoint',
        'jwks_uri',
        'revocation_endpoint',
        'end_session_endpoint',
      ] as const
      for (const name of endpoints) {
        const value = doc[name]
        expect(typeof value, name).toBe('string')
        const url = new URL(String(value))
        expect(url.protocol, name).toBe('https:')
        expect(url.origin + '/', name).toBe(PRODUCTION_CANONICAL_ISSUER + '/')
      }
      // 路由映射与 #620 推荐一致
      expect(doc.authorization_endpoint).toBe(`${PRODUCTION_CANONICAL_ISSUER}/oauth/authorize`)
      expect(doc.token_endpoint).toBe(`${PRODUCTION_CANONICAL_ISSUER}/oauth/token`)
      expect(doc.userinfo_endpoint).toBe(`${PRODUCTION_CANONICAL_ISSUER}/oauth/userinfo`)
      expect(doc.jwks_uri).toBe(`${PRODUCTION_CANONICAL_ISSUER}/oauth/jwks`)
      expect(doc.revocation_endpoint).toBe(`${PRODUCTION_CANONICAL_ISSUER}/oauth/revoke`)
      expect(doc.end_session_endpoint).toBe(`${PRODUCTION_CANONICAL_ISSUER}/oauth/logout`)
      // V1 未暴露 PAR /request；Discovery 不得宣告不可达能力。
      expect(doc.pushed_authorization_request_endpoint).toBeUndefined()
    } finally {
      await prod.close()
    }
  })

  it('3. response_types_supported 只含 code（不含 implicit/hybrid）', async () => {
    const doc = await fetchDiscovery(e2e!.baseUrl)
    expect(doc.response_types_supported).toEqual(['code'])
    expect(String(doc.response_types_supported)).not.toContain('id_token')
    expect(String(doc.response_types_supported)).not.toContain('token')
  })

  it('4. code_challenge_methods_supported 包含 S256（且不含 plain）', async () => {
    const doc = await fetchDiscovery(e2e!.baseUrl)
    expect(doc.code_challenge_methods_supported).toContain('S256')
    expect(String(doc.code_challenge_methods_supported)).not.toContain('plain')
    // V1 协议能力声明：只支持授权码流
    expect(doc.grant_types_supported).toContain('authorization_code')
    expect(doc.grant_types_supported).not.toContain('implicit')
    expect(doc.grant_types_supported).not.toContain('client_credentials')
    expect(doc.subject_types_supported).toContain('pairwise')
    expect(doc.id_token_signing_alg_values_supported).toEqual(['RS256'])
    // Refresh Token（offline_access 条件发放）
    expect(doc.grant_types_supported).toContain('refresh_token')
  })
})
