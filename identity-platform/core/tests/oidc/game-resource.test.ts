/**
 * #902a 游戏平台 resource indicator / JWT AT / 受控 claim 注入范围测试。
 *
 * 覆盖（协议 `docs/game-platform/protocol-v1.md` §6.4 硬性前提 + 任务书 4 项）：
 *   1. 新 scope（game.read / game.play）在 authorize 阶段可用；
 *   2. 未注册 / 未获批 scope → invalid_scope；
 *   3. resource-scoped 授权（第一方）→ JWT AT 且含正确 aud；
 *   4. 未请求 resource 的授权 → 仍为 opaque（Forum / Cloud Sync 行为零变化）；
 *   5. token 端点重复携带同一 resource → 仍为 JWT（RFC 8707 双段路径）；
 *   6. 白名单为空（灰度默认）→ 任何带 resource 的请求 fail closed（invalid_target）；
 *   7. 第三方 client 请求 resource → invalid_target（永远拿不到 JWT AT）；
 *   8. **负向**：第三方 client 的 AT 不含 hbut_student_id（opaque，无 JWT 结构）；
 *   9. refresh 后仍是 JWT AT（resource 绑定在 grant 上，refresh 不丢 aud）。
 *
 * 断言口径与协议 §6.4 一致：JWT 是 base64url 明文，学号只允许进
 * 「第一方 client + 游戏 audience」的 AT。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientFixture, type ClientFixture } from '../helpers/fixtures.js'
import {
  startE2E,
  fullAuthorizationFlow,
  tokenRequest,
  fetchJwks,
  fetchDiscovery,
  verifyJwtSignature,
  jwtDecode,
  pkcePair,
  type E2EContext,
} from './helpers/e2e.js'
import {
  resolveGameResourceConfig,
  DEFAULT_GAME_AUDIENCE,
  GAME_RESOURCE_SCOPES,
  GAME_AT_CLAIMS,
} from '../../src/oidc/resource-indicators.js'

const REDIRECT_URI = 'https://app.example.com/cb'
const AUDIENCE = 'mini-hbut-hf-api'
const INDICATOR = `https://${AUDIENCE}`
/** 第一方宿主 client（进 IDENTITY_GAME_RESOURCE_CLIENTS 白名单） */
const GAME_CLIENT_ID = 'cli_gamehost0000000001'
/** 第三方 client（永不进白名单） */
const THIRD_PARTY_CLIENT_ID = 'cli_thirdparty00000001'
const GAME_SCOPE = 'openid game.read game.play'

/** 授权请求（可带 resource）；返回可读的 error（303 的 location query 或 400 body） */
async function authorizeRaw(opts: {
  baseUrl: string
  clientId: string
  scope: string
  resource?: string
}): Promise<{ status: number; error?: string; location: string | null }> {
  const { codeChallenge } = pkcePair()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: REDIRECT_URI,
    scope: opts.scope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  if (opts.resource) {
    params.set('resource', opts.resource)
  }
  const res = await fetch(`${opts.baseUrl}/oauth/authorize?${params.toString()}`, {
    redirect: 'manual',
  })
  let error: string | undefined
  const location = res.headers.get('location')
  if (res.status >= 400) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    error = typeof body.error === 'string' ? body.error : undefined
  } else if (location) {
    error = new URL(location).searchParams.get('error') ?? undefined
  }
  return { status: res.status, error, location }
}

/** AT 是否为 JWT（三段式）；opaque 一律 false */
function isJwtShape(token: string): boolean {
  return token.split('.').length === 3
}

describe('#902a 游戏 resource indicator / JWT AT', () => {
  let db: TestDatabase
  let e2e: E2EContext | null = null
  let firstParty: ClientFixture

  beforeEach(async () => {
    db = await createTestDatabase()
    e2e = await startE2E(db, {
      gameResource: { allowedClientIds: [GAME_CLIENT_ID] },
    })
    firstParty = await createClientFixture(db.sql, {
      clientId: GAME_CLIENT_ID,
      scopes: ['openid', 'game.read', 'game.play', 'offline_access'],
      status: 'active',
    })
  })
  afterEach(async () => {
    if (e2e) await e2e.close()
    await db.cleanup()
  })

  it('1. 第一方 resource-scoped 授权 → JWT AT：aud / 资源绑定 scope / 学号 claim / RS256 验签', async () => {
    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId: firstParty.clientId,
      clientSecret: firstParty.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI,
      scope: GAME_SCOPE,
      userId: firstParty.userId,
      resource: INDICATOR,
    })

    const at = flow.accessToken
    expect(isJwtShape(at)).toBe(true)

    const { header, payload } = jwtDecode(at)
    expect(header.typ).toBe('at+jwt')
    expect(header.alg).toBe('RS256')
    expect(payload.aud).toBe(AUDIENCE)
    expect(typeof payload.iss).toBe('string')
    expect(payload.sub).not.toBe(firstParty.studentId)
    // resource 绑定 scope：JWT AT 只携带 game.* （openid 不进 resource-bound AT）
    const atScopes = new Set(String(payload.scope).split(' ').filter(Boolean))
    expect(atScopes).toEqual(new Set([...GAME_RESOURCE_SCOPES]))
    // 受控 claim：第一方 + 游戏 audience；注入集合与契约 GAME_AT_CLAIMS 完全一致
    expect(Object.keys(payload)).toEqual(expect.arrayContaining([...GAME_AT_CLAIMS]))
    expect(payload.hbut_student_id).toBe(firstParty.studentId)
    expect(payload.hbut_student_name).toBe('测试学生')
    expect(payload.hbut_verification_method).toBe('mini_hbut_app')

    // 签名可用公开 JWKS 验证（ocr-service 的验签路径等价断言）
    const jwks = await fetchJwks(e2e!.baseUrl)
    const verified = await verifyJwtSignature(at, jwks as never)
    expect(verified.ok).toBe(true)
  })

  it('2. token 端点重复携带同一 resource → 仍为 JWT AT（RFC 8707 双段一致路径）', async () => {
    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId: firstParty.clientId,
      clientSecret: firstParty.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI,
      scope: GAME_SCOPE,
      userId: firstParty.userId,
      resource: INDICATOR,
      resourceAtToken: true,
    })
    expect(isJwtShape(flow.accessToken)).toBe(true)
    expect(jwtDecode(flow.accessToken).payload.aud).toBe(AUDIENCE)
  })

  it('2b. token 端点携带**不同** resource → invalid_target（防 resource 替换）', async () => {
    await expect(
      fullAuthorizationFlow({
        db,
        baseUrl: e2e!.baseUrl,
        clientId: firstParty.clientId,
        clientSecret: firstParty.clientSecret ?? undefined,
        redirectUri: REDIRECT_URI,
        scope: GAME_SCOPE,
        userId: firstParty.userId,
        resource: INDICATOR,
        resourceAtToken: 'https://attacker.example.test',
      }),
    ).rejects.toThrow(/token 兑换失败/)
  })

  it('3. 未请求 resource → 既有授权仍是 opaque AT（Forum / Cloud Sync 行为零变化）', async () => {
    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId: firstParty.clientId,
      clientSecret: firstParty.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI,
      scope: GAME_SCOPE,
      userId: firstParty.userId,
      // 不传 resource
    })
    const at = flow.accessToken
    expect(isJwtShape(at)).toBe(false)
    expect(at.length).toBeGreaterThan(16)
  })

  it('4. 第三方 client 请求 resource → invalid_target（授权阶段即拒绝，不签发任何 code/token）', async () => {
    const thirdParty = await createClientFixture(db.sql, {
      clientId: THIRD_PARTY_CLIENT_ID,
      scopes: ['openid', 'game.read', 'game.play'],
      status: 'active',
    })
    const res = await authorizeRaw({
      baseUrl: e2e!.baseUrl,
      clientId: thirdParty.clientId,
      scope: GAME_SCOPE,
      resource: INDICATOR,
    })
    expect(res.error).toBe('invalid_target')
    // 没有进入交互（不是 303 到 auth.*）
    expect(res.location ?? '').not.toContain('auth.example.test')
  })

  it('5. 白名单为空（灰度默认部署形态）→ 第一方 client 也被 fail closed', async () => {
    const fresh = await startE2E(db)
    try {
      const res = await authorizeRaw({
        baseUrl: fresh.baseUrl,
        clientId: firstParty.clientId,
        scope: GAME_SCOPE,
        resource: INDICATOR,
      })
      expect(res.error).toBe('invalid_target')
    } finally {
      await fresh.close()
    }
  })

  it('6. 未获批 game.play → invalid_scope（新 scope 同样受 client 注册约束）', async () => {
    const basic = await createClientFixture(db.sql, {
      clientId: 'cli_onlyopenid0000001',
      scopes: ['openid'],
      status: 'active',
    })
    const res = await authorizeRaw({
      baseUrl: e2e!.baseUrl,
      clientId: basic.clientId,
      scope: 'openid game.play',
    })
    expect(res.error).toBe('invalid_scope')
  })

  it('6b. Discovery：scopes_supported 已包含 game.read / game.play（provider 级注册生效）', async () => {
    const discovery = await fetchDiscovery(e2e!.baseUrl)
    const scopes = discovery.scopes_supported as string[]
    expect(scopes).toContain('game.read')
    expect(scopes).toContain('game.play')
    expect(scopes).toContain('student.identity')
  })

  it('7. 负向：第三方 client 的 AT 不含 hbut_student_id（opaque，无 JWT 结构）', async () => {
    const thirdParty = await createClientFixture(db.sql, {
      clientId: THIRD_PARTY_CLIENT_ID,
      scopes: ['openid', 'student.identity', 'game.play'],
      status: 'active',
    })
    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId: thirdParty.clientId,
      clientSecret: thirdParty.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI,
      scope: 'openid student.identity game.play',
      userId: thirdParty.userId,
    })
    const at = flow.accessToken
    // 第三方：任何情况下都不是 JWT → 不存在"可被任何持有者解码出学号"的 AT
    expect(isJwtShape(at)).toBe(false)
    expect(at).not.toContain(firstParty.studentId)
    expect(at).not.toContain(thirdParty.studentId)
    // 即便 scope 含 game.play：没有 resource indicator 就永远拿不到 aud（游戏侧必然拒绝）
    expect(at).not.toContain(AUDIENCE)
  })

  it('8. refresh 后仍是 JWT AT：aud 与资源绑定 scope 保持（grants 上的 resource 不丢）', async () => {    const flow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e!.baseUrl,
      clientId: firstParty.clientId,
      clientSecret: firstParty.clientSecret ?? undefined,
      redirectUri: REDIRECT_URI,
      scope: `${GAME_SCOPE} offline_access`,
      userId: firstParty.userId,
      resource: INDICATOR,
      prompt: 'consent',
    })
    expect(flow.refreshToken).toBeTruthy()

    const refreshed = await tokenRequest({
      baseUrl: e2e!.baseUrl,
      grantType: 'refresh_token',
      clientId: firstParty.clientId,
      clientSecret: firstParty.clientSecret ?? undefined,
      refreshToken: flow.refreshToken!,
    })
    expect(refreshed.status).toBe(200)
    const newAt = String(refreshed.body.access_token)
    expect(isJwtShape(newAt)).toBe(true)
    const { payload } = jwtDecode(newAt)
    expect(payload.aud).toBe(AUDIENCE)
    expect(String(payload.scope)).toContain('game.play')
    expect(payload.hbut_student_id).toBe(firstParty.studentId)
  })
})

describe('#902a 游戏 resource 配置解析（纯函数）', () => {
  it('默认值：audience=mini-hbut-hf-api、indicator=https://<audience>、白名单空（fail closed）', () => {
    const config = resolveGameResourceConfig()
    expect(config.audience).toBe(DEFAULT_GAME_AUDIENCE)
    expect(config.audience).toBe(AUDIENCE)
    expect(config.indicator).toBe(INDICATOR)
    expect(config.allowedClientIds).toEqual([])
    expect(config.scope).toBe('game.read game.play')
  })

  it('白名单去重去空白；indicator 非绝对 https URI → 启动期 fail fast', () => {
    const config = resolveGameResourceConfig({
      allowedClientIds: [' cli_a ', 'cli_a', '', 'cli_b'],
    })
    expect(config.allowedClientIds).toEqual(['cli_a', 'cli_b'])

    expect(() => resolveGameResourceConfig({ indicator: 'mini-hbut-hf-api' })).toThrow()
    expect(() => resolveGameResourceConfig({ indicator: 'http://mini-hbut-hf-api' })).toThrow()
    expect(() => resolveGameResourceConfig({ audience: '   ' })).toThrow()
  })
})
