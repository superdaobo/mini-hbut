/**
 * #902 第一方设备换票（device-signed token exchange）测试。
 *
 * 链路：Device Key → Identity Access Token →（#902c 的 Game Launch Ticket → Game Session）
 *
 * 覆盖（任务书阶段 1 第 5 条逐项）：
 *   1. challenge 签发：高熵 + 短时 + 只存摘要；
 *   2. 一次性：同一 challenge 重放必须失败（AUTH_REQUIRED）；
 *   3. 过期：手动置 expires_at 过去 → 失败；
 *   4. 并发 exchange 同一 challenge → 恰好一次成功（单条条件 UPDATE，无 TOCTOU）；
 *   5. 签名错误 / 设备不存在 / 设备被撤销 → 401 DEVICE_AUTH_FAILED；
 *   6. challenge 与设备绑定：A 的 challenge 用 B 的签名兑换 → 失败；
 *   7. 产出的 AT 必须是 JWT：aud=mini-hbut-hf-api、scope={game.read,game.play}、
 *      含 hbut_student_id/hbut_student_name/hbut_verification_method/hbut_verified_at、
 *      可用 JWKS 验签、client_id = 第一方换票 client（与 /oauth/token 路径同构）；
 *   8. 负向：V1 不签发 refresh token；第三方 client 无法走此路径（能力关闭 fail closed；
 *      请求体指定 client_id/audience/scope 一律拒绝）；actor 字段 → 403 FORBIDDEN_ACTOR；
 *   9. 响应头：no-store + nosniff（禁止中间层缓存 token）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientFixture, type ClientFixture } from '../helpers/fixtures.js'
import { newUuidV7 } from '../../src/domain/ids.js'
import { insertDevice, setDeviceStatus, findDeviceById } from '../../src/db/repos/devices.repo.js'
import { insertDeviceTokenChallenge } from '../../src/db/repos/device-token-challenges.repo.js'
import { sha256Base64url } from '../../src/security/hash.js'
import { DEFAULT_GAME_AUDIENCE, GAME_RESOURCE_SCOPES } from '../../src/oidc/resource-indicators.js'
import { DEVICE_TOKEN_ACCESS_TTL_SECONDS } from '../../src/oidc/device-access-token.js'
import {
  startE2E,
  fetchJwks,
  verifyJwtSignature,
  jwtDecode,
  type E2EContext,
} from '../oidc/helpers/e2e.js'
import {
  DEVICE_TOKEN_CHALLENGE_PATH,
  DEVICE_TOKEN_EXCHANGE_PATH,
  buildDeviceAuthHeader,
  buildDeviceTokenExchangeBody,
  newTestDeviceKey,
  postJson,
  requestDeviceTokenChallenge,
  type TestDeviceKey,
} from './helpers.js'

/** 第一方宿主 client（同时进 resource 白名单与换票 client 配置） */
const GAME_CLIENT_ID = 'cli_gamedevice000000001'
const AUDIENCE = 'mini-hbut-hf-api'

/** 断言响应体里绝不出现 refresh token（V1 明确不签发） */
function expectNoRefreshToken(body: Record<string, unknown>): void {
  expect(body.refresh_token).toBeUndefined()
  expect(JSON.stringify(body)).not.toContain('refresh')
}

describe('#902 设备换票（Device 签名 → resource-scoped JWT AT）', () => {
  let db: TestDatabase
  let e2e: E2EContext
  let client: ClientFixture
  let key: TestDeviceKey
  let deviceId: string

  /** 注册一台 active 设备（服务端只存公钥 JWK） */
  async function registerActiveDevice(userId: string, deviceKey: TestDeviceKey): Promise<string> {
    const id = newUuidV7()
    await insertDevice(db.sql, {
      id,
      user_id: userId,
      publicKeyJwk: deviceKey.jwk,
      publicKeyFingerprint: deviceKey.fingerprint(),
      platform: 'windows',
      deviceName: '测试设备',
      status: 'pending',
    })
    const activated = await setDeviceStatus(db.sql, id, 'active')
    expect(activated).toBe(true)
    return id
  }

  beforeEach(async () => {
    db = await createTestDatabase()
    e2e = await startE2E(db, {
      gameResource: {
        allowedClientIds: [GAME_CLIENT_ID],
        deviceTokenClientId: GAME_CLIENT_ID,
      },
    })
    client = await createClientFixture(db.sql, {
      clientId: GAME_CLIENT_ID,
      scopes: ['openid', 'game.read', 'game.play'],
      status: 'active',
    })
    key = newTestDeviceKey()
    deviceId = await registerActiveDevice(client.userId, key)
  })
  afterEach(async () => {
    await e2e.close()
    await db.cleanup()
  })

  it('1. challenge：设备签名认证通过后签发高熵一次性 challenge（只存摘要）', async () => {
    const res = await requestDeviceTokenChallenge(e2e.baseUrl, { key, deviceId })
    expect(res.status).toBe(200)
    const challenge = String(res.body.challenge)
    // 32 字节 CSPRNG → base64url 43 字符（256 bit 熵，远超 128bit 下限）
    expect(challenge).toMatch(/^[A-Za-z0-9._~-]{43}$/)
    expect(res.body.expires_in).toBe(120)
    expect(Number.isNaN(Date.parse(String(res.body.expires_at)))).toBe(false)

    // DB 只存 sha256 摘要：明文不落库
    const rows = await db.sql.query<{ challenge_hash: string; device_id: string; consumed_at: Date | null }>(
      'SELECT challenge_hash, device_id, consumed_at FROM device_token_challenges ORDER BY created_at DESC LIMIT 1',
    )
    const row = rows.rows[0]!
    expect(row.challenge_hash).toBe(sha256Base64url(challenge))
    expect(row.challenge_hash).not.toBe(challenge)
    expect(row.device_id).toBe(deviceId)
    expect(row.consumed_at).toBeNull()
  })

  it('2. 正常换票：JWT AT（aud/scope/受控 claim/RS256 验签/第一方 client，与 /oauth/token 同构）', async () => {
    const challengeRes = await requestDeviceTokenChallenge(e2e.baseUrl, { key, deviceId })
    const challenge = String(challengeRes.body.challenge)
    const res = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({ key, deviceId, challenge }),
    )
    expect(res.status).toBe(200)
    const at = String(res.body.access_token)
    expect(at.split('.')).toHaveLength(3)

    const { header, payload } = jwtDecode(at)
    expect(header.typ).toBe('at+jwt')
    expect(header.alg).toBe('RS256')
    expect(typeof header.kid).toBe('string')
    expect(payload.iss).toBe('https://id.example.test')
    expect(payload.aud).toBe(AUDIENCE)
    expect(payload.aud).toBe(DEFAULT_GAME_AUDIENCE)
    // resource 绑定 scope：只含 game.*（openid 不进 resource-bound AT）
    expect(new Set(String(payload.scope).split(' ').filter(Boolean))).toEqual(
      new Set([...GAME_RESOURCE_SCOPES]),
    )
    // 第一方 client：与 902a 的 extraTokenClaims 注入前提一致
    expect(payload.client_id).toBe(GAME_CLIENT_ID)
    // 受控 claim：hbut_student_id 只对第一方 + 游戏 audience 注入
    expect(payload.hbut_student_id).toBe(client.studentId)
    expect(payload.hbut_student_name).toBe('测试学生')
    expect(payload.hbut_verification_method).toBe('mini_hbut_app')
    expect(typeof payload.hbut_verified_at).toBe('string')
    // pairwise sub：绝不等于学号
    expect(payload.sub).not.toBe(client.studentId)
    expect(String(payload.sub)).not.toContain(client.studentId)

    // 响应元数据：TTL 用本路径的 900s（V1 无 refresh token，须靠重新换票续期）
    expect(res.body.token_type).toBe('Bearer')
    expect(res.body.expires_in).toBe(DEVICE_TOKEN_ACCESS_TTL_SECONDS)
    expect(Number(payload.exp) - Number(payload.iat)).toBe(DEVICE_TOKEN_ACCESS_TTL_SECONDS)
    expect(res.body.scope).toBe(GAME_RESOURCE_SCOPES.join(' '))
    expect(res.body.audience).toBe(AUDIENCE)
    expectNoRefreshToken(res.body)

    // 资源服务器（ocr-service identity_auth）等价断言：JWKS 公钥验签通过
    const jwks = await fetchJwks(e2e.baseUrl)
    expect((await verifyJwtSignature(at, jwks as never)).ok).toBe(true)

    // 一次性：challenge 已被消费
    const rows = await db.sql.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM device_token_challenges ORDER BY created_at DESC LIMIT 1',
    )
    expect(rows.rows[0]?.consumed_at).not.toBeNull()
  })

  it('3. 重放同一 challenge → 401 AUTH_REQUIRED（一次性，不签发第二个 AT）', async () => {
    const challengeRes = await requestDeviceTokenChallenge(e2e.baseUrl, { key, deviceId })
    const challenge = String(challengeRes.body.challenge)
    const first = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({ key, deviceId, challenge }),
    )
    expect(first.status).toBe(200)

    const replay = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({ key, deviceId, challenge }),
    )
    expect(replay.status).toBe(401)
    expect((replay.body.error as { code: string }).code).toBe('AUTH_REQUIRED')
    expect(replay.body.access_token).toBeUndefined()
  })

  it('4. 并发兑换同一 challenge → 恰好一次成功（单条条件 UPDATE，无 TOCTOU）', async () => {
    const challengeRes = await requestDeviceTokenChallenge(e2e.baseUrl, { key, deviceId })
    const challenge = String(challengeRes.body.challenge)
    const body = buildDeviceTokenExchangeBody({ key, deviceId, challenge })
    const results = await Promise.all([
      postJson(e2e.baseUrl, DEVICE_TOKEN_EXCHANGE_PATH, body),
      postJson(e2e.baseUrl, DEVICE_TOKEN_EXCHANGE_PATH, body),
      postJson(e2e.baseUrl, DEVICE_TOKEN_EXCHANGE_PATH, body),
    ])
    const ok = results.filter((r) => r.status === 200)
    const denied = results.filter((r) => r.status === 401)
    expect(ok).toHaveLength(1)
    expect(denied).toHaveLength(2)
    for (const r of denied) {
      expect((r.body.error as { code: string }).code).toBe('AUTH_REQUIRED')
    }
    // 只签发了一个 AT（成功那次）
    expect(typeof ok[0]?.body.access_token).toBe('string')
  })

  it('5. 过期 challenge（手动置 expires_at 过去）→ 401 AUTH_REQUIRED', async () => {
    const challenge = `expired_${Math.random().toString(36).slice(2, 20)}`
    await insertDeviceTokenChallenge(db.sql, {
      id: newUuidV7(),
      challengeHash: sha256Base64url(challenge),
      deviceId,
      expiresAt: new Date(Date.now() - 1000),
    })
    const res = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({ key, deviceId, challenge }),
    )
    expect(res.status).toBe(401)
    expect((res.body.error as { code: string }).code).toBe('AUTH_REQUIRED')
  })

  it('6. 签名错误 → 401 DEVICE_AUTH_FAILED（不泄露细节、不消耗 challenge）', async () => {
    const challengeRes = await requestDeviceTokenChallenge(e2e.baseUrl, { key, deviceId })
    const challenge = String(challengeRes.body.challenge)
    const wrongKey = newTestDeviceKey()
    const res = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({
        key,
        deviceId,
        challenge,
        signatureOverride: wrongKey.sign('MINI-HBUT-DEVICE-TOKEN-V1\n'),
      }),
    )
    expect(res.status).toBe(401)
    expect((res.body.error as { code: string }).code).toBe('DEVICE_AUTH_FAILED')
    expect(res.body.access_token).toBeUndefined()
    // 验签在消费之前：失败不消耗 challenge（同一 challenge 仍可被合法设备使用）
    const retry = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({ key, deviceId, challenge }),
    )
    expect(retry.status).toBe(200)
  })

  it('7. 设备不存在 / 已撤销 → 401 DEVICE_AUTH_FAILED（不签发任何 AT）', async () => {
    const challengeRes = await requestDeviceTokenChallenge(e2e.baseUrl, { key, deviceId })
    const challenge = String(challengeRes.body.challenge)

    // 不存在的设备
    const ghost = newTestDeviceKey()
    const ghostRes = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({
        key: ghost,
        deviceId: newUuidV7(),
        challenge,
        // 用真实 challenge 但换设备：仍必须失败（challenge 绑定设备 + 签名不匹配）
      }),
    )
    expect(ghostRes.status).toBe(401)

    // 已撤销的设备（服务端撤销后立刻失效）
    const revokedId = await registerActiveDevice(client.userId, newTestDeviceKey())
    await setDeviceStatus(db.sql, revokedId, 'revoked')
    const revokedKey = newTestDeviceKey()
    const revokedRes = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({ key: revokedKey, deviceId: revokedId, challenge }),
    )
    expect(revokedRes.status).toBe(401)
    expect((revokedRes.body.error as { code: string }).code).toBe('DEVICE_AUTH_FAILED')
    expect((await findDeviceById(db.sql, revokedId))?.status).toBe('revoked')

    // 真实设备的 challenge 未被上述失败请求消耗
    const ok = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({ key, deviceId, challenge }),
    )
    expect(ok.status).toBe(200)
  })

  it('8. challenge 绑设备：A 的 challenge + B 的签名 → 401（跨设备不可用）', async () => {
    const challengeRes = await requestDeviceTokenChallenge(e2e.baseUrl, { key, deviceId })
    const challenge = String(challengeRes.body.challenge)
    const otherKey = newTestDeviceKey()
    const otherDeviceId = await registerActiveDevice(client.userId, otherKey)
    const res = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({ key: otherKey, deviceId: otherDeviceId, challenge }),
    )
    expect(res.status).toBe(401)
    expect((res.body.error as { code: string }).code).toBe('AUTH_REQUIRED')
  })

  it('9. 负向：actor / 服务端权威字段一律拒绝，绝不接受调用方指定身份或 token 属性', async () => {
    const challengeRes = await requestDeviceTokenChallenge(e2e.baseUrl, { key, deviceId })
    const challenge = String(challengeRes.body.challenge)
    const base = buildDeviceTokenExchangeBody({ key, deviceId, challenge })

    for (const field of ['student_id', 'user_id', 'player_id']) {
      const res = await postJson(e2e.baseUrl, DEVICE_TOKEN_EXCHANGE_PATH, { ...base, [field]: '2023010101' })
      expect(res.status, `${field} 应被拒绝`).toBe(403)
      expect((res.body.error as { code: string }).code).toBe('FORBIDDEN_ACTOR')
      expect(res.body.access_token).toBeUndefined()
    }
    for (const field of ['client_id', 'audience', 'scope', 'resource']) {
      const res = await postJson(e2e.baseUrl, DEVICE_TOKEN_EXCHANGE_PATH, { ...base, [field]: 'attacker' })
      expect(res.status, `${field} 应被拒绝`).toBe(400)
      expect((res.body.error as { code: string }).code).toBe('SCHEMA_INVALID')
      expect(res.body.access_token).toBeUndefined()
    }
    // 被拒绝的请求都不消耗 challenge（校验在消费之前）
    const ok = await postJson(e2e.baseUrl, DEVICE_TOKEN_EXCHANGE_PATH, base)
    expect(ok.status).toBe(200)
  })

  it('10. challenge 端点：Device 签名缺失/路径不匹配 → 401（canonical 绑定 method+path）', async () => {
    const missing = await postJson(e2e.baseUrl, DEVICE_TOKEN_CHALLENGE_PATH, {})
    expect(missing.status).toBe(401)
    expect((missing.body.error as { code: string }).code).toBe('DEVICE_AUTH_FAILED')

    // 对 exchange 路径签名却发给 challenge 路径 → canonical 不一致 → 401
    const mismatched = buildDeviceAuthHeader({
      key,
      deviceId,
      method: 'POST',
      path: DEVICE_TOKEN_EXCHANGE_PATH,
    })
    const res = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_CHALLENGE_PATH,
      {},
      { authorization: mismatched.authorization },
    )
    expect(res.status).toBe(401)
  })

  it('11. 负向：未配置换票 client（能力关闭）→ 两个端点都 403 FEATURE_DISABLED，绝不签发 AT', async () => {
    const disabled = await startE2E(db, {
      gameResource: { allowedClientIds: [GAME_CLIENT_ID] }, // 无 deviceTokenClientId
    })
    try {
      const challengeRes = await requestDeviceTokenChallenge(disabled.baseUrl, { key, deviceId })
      expect(challengeRes.status).toBe(403)
      expect((challengeRes.body.error as { code: string }).code).toBe('FEATURE_DISABLED')

      const exchangeRes = await postJson(
        disabled.baseUrl,
        DEVICE_TOKEN_EXCHANGE_PATH,
        buildDeviceTokenExchangeBody({ key, deviceId, challenge: 'x'.repeat(43) }),
      )
      expect(exchangeRes.status).toBe(403)
      expect((exchangeRes.body.error as { code: string }).code).toBe('FEATURE_DISABLED')
      expect(exchangeRes.body.access_token).toBeUndefined()
    } finally {
      await disabled.close()
    }
  })

  it('12. 负向：白名单为空（灰度默认）→ 能力关闭；第三方 client 永远拿不到 JWT AT', async () => {
    expect(await import('../../src/oidc/resource-indicators.js').then((m) => m.resolveGameResourceConfig().deviceTokenClientId)).toBeNull()
    const empty = await startE2E(db)
    try {
      const res = await postJson(
        empty.baseUrl,
        DEVICE_TOKEN_EXCHANGE_PATH,
        buildDeviceTokenExchangeBody({ key, deviceId, challenge: 'x'.repeat(43) }),
      )
      expect(res.status).toBe(403)
      expect((res.body.error as { code: string }).code).toBe('FEATURE_DISABLED')
    } finally {
      await empty.close()
    }
  })

  it('13. 响应头：no-store + nosniff；challenge 与 AT 响应都禁止缓存', async () => {
    const challengeRes = await fetch(`${e2e.baseUrl}${DEVICE_TOKEN_CHALLENGE_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: buildDeviceAuthHeader({
          key,
          deviceId,
          method: 'POST',
          path: DEVICE_TOKEN_CHALLENGE_PATH,
        }).authorization,
      },
      body: '{}',
    })
    expect(challengeRes.headers.get('cache-control')).toBe('no-store')
    expect(challengeRes.headers.get('x-content-type-options')).toBe('nosniff')
    const challenge = String(((await challengeRes.json()) as { challenge: string }).challenge)

    const exchangeRes = await fetch(`${e2e.baseUrl}${DEVICE_TOKEN_EXCHANGE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildDeviceTokenExchangeBody({ key, deviceId, challenge })),
    })
    expect(exchangeRes.status).toBe(200)
    expect(exchangeRes.headers.get('cache-control')).toBe('no-store')
    expect(exchangeRes.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('14. 与 /oauth/token 同构：同一 client 的 JWT AT claim 集合一致（除时间与 jti）', async () => {
    const challengeRes = await requestDeviceTokenChallenge(e2e.baseUrl, { key, deviceId })
    const viaDevice = await postJson(
      e2e.baseUrl,
      DEVICE_TOKEN_EXCHANGE_PATH,
      buildDeviceTokenExchangeBody({
        key,
        deviceId,
        challenge: String(challengeRes.body.challenge),
      }),
    )
    expect(viaDevice.status).toBe(200)
    const devicePayload = jwtDecode(String(viaDevice.body.access_token)).payload

    // /oauth/token（resource indicator 路径）产出的 JWT AT：用同一 client + 同一 user 走完整授权码流
    const { fullAuthorizationFlow } = await import('../oidc/helpers/e2e.js')
    const oauthFlow = await fullAuthorizationFlow({
      db,
      baseUrl: e2e.baseUrl,
      clientId: client.clientId,
      clientSecret: client.clientSecret ?? undefined,
      redirectUri: 'https://app.example.com/cb',
      scope: 'openid game.read game.play',
      userId: client.userId,
      resource: `https://${AUDIENCE}`,
    })
    const oauthPayload = jwtDecode(oauthFlow.accessToken).payload

    // claim 键集合一致（同构的强断言）：jti/iat/exp 的值不同但键必须同名同集合
    const keysOf = (payload: Record<string, unknown>) => Object.keys(payload).sort()
    expect(keysOf(devicePayload)).toEqual(keysOf(oauthPayload))
    // 关键语义字段逐项相等（aud / client_id / sub / 受控 claim）
    for (const field of ['aud', 'client_id', 'sub', 'hbut_student_id', 'hbut_student_name', 'hbut_verification_method', 'iss']) {
      expect(devicePayload[field], `${field} 应与 /oauth/token 产物一致`).toEqual(oauthPayload[field])
    }
    // scope 是集合语义（RFC 6749 §3.3）：两路径集合必须完全相同；
    // 串内顺序由 oidc-provider Grant 内部 Set 顺序决定（/oauth/token 为 game.play game.read），
    // 资源服务器（ocr-service `_parse_scopes`）按集合解析，顺序无语义。
    const scopeSet = (value: unknown) => new Set(String(value).split(' ').filter(Boolean))
    expect(scopeSet(devicePayload.scope)).toEqual(scopeSet(oauthPayload.scope))
    expect(scopeSet(devicePayload.scope)).toEqual(new Set([...GAME_RESOURCE_SCOPES]))
    // 唯一差异：本路径 AT TTL 更短（900s vs 3600s，任务书允许且要求给出理由）
    expect(Number(oauthPayload.exp) - Number(oauthPayload.iat)).toBe(3600)
    expect(Number(devicePayload.exp) - Number(devicePayload.iat)).toBe(DEVICE_TOKEN_ACCESS_TTL_SECONDS)
  })
})
