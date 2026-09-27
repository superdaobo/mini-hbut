/**
 * 第一方设备换票 API（#902）。
 *
 * 链路：Device Key → Identity Access Token → Game Launch Ticket → Game Session
 * 端点（方法/路径固定；canonical 绑定 method+path，客户端必须逐字一致）：
 *   POST /api/v1/app/device-token/challenge   Device 签名认证 → 高熵一次性 challenge
 *   POST /api/v1/app/device-token/exchange    设备签名（canonical 绑定 challenge）→ JWT AT
 *
 * 为什么需要两个端点（而不是「设备直接签名换 AT」）：
 * - 一次性 challenge 提供**新鲜性**：AT 只能通过「服务端刚签发的、未被用过的 challenge」
 *   换取，截获的历史签名无法重放；challenge 落库（Vercel serverless 无状态，内存不可靠）；
 * - challenge TTL 很短（默认 120s），且必须由签发它的设备兑换（绑定 device_id）。
 *
 * 信任边界（逐条对应任务书硬约束）：
 * 1. 只有设备签名路径能换 AT：本文件不接受任何 OAuth client 凭据，也不存在面向
 *    web / 第三方 client 的发行路径；HTML 游戏只能拿 Launch Ticket（#902c）；
 * 2. audience / scope / client_id 全部来自 resolveGameResourceConfig 白名单配置，
 *    请求体里出现这些字段一律 400/403，绝不接受调用方指定（防 token 提权/误签）；
 * 3. challenge 一次性消费走单条条件 UPDATE（禁止 SELECT-then-UPDATE 的 TOCTOU）；
 * 4. V1 不签发 Refresh Token（响应里没有该字段，代码里不构造 Grant/RefreshToken）；
 * 5. AT 明文只在响应体出现一次：`Cache-Control: no-store` + `X-Content-Type-Options: nosniff`；
 *    任何日志只记 code/request_id，绝不记 Authorization / challenge / token（协议 §10）。
 */
import type Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import {
  findActiveDeviceById,
  touchDeviceLastSeen,
} from '../../db/repos/devices.repo.js'
import { consumeDeviceTokenChallenge } from '../../db/repos/device-token-challenges.repo.js'
import { touchUserLastActive } from '../../db/repos/users.repo.js'
import { createDeviceTokenChallenge, assertEd25519PublicJwk } from '../../domain/devices.js'
import {
  isDeviceTokenExchangeEnabled,
  resolveGameResourceConfig,
  type ResolvedGameResourceConfig,
} from '../../oidc/resource-indicators.js'
import {
  createDeviceAccessTokenIssuer,
  DeviceTokenDisabledError,
  DeviceTokenIssuanceError,
} from '../../oidc/device-access-token.js'
import { sha256Base64url } from '../../security/hash.js'
import { DomainError } from '../../domain/errors.js'
import { buildDeviceTokenCanonical, type DeviceTokenCanonicalInput } from './canonical.js'
import { verifyEd25519 } from './verify.js'
import { readJsonBody } from './body.js'
import { assertFreshIssuedAt, authenticateDeviceRequest, type AppAuthDeps, type ClockSkewConfig } from './auth.js'
import {
  AppInternalError,
  DeviceAuthError,
  DeviceChallengeInvalidError,
  DeviceTokenFeatureDisabledError,
  ForbiddenActorError,
  respondError,
  SchemaInvalidError,
} from './errors.js'

export const DEVICE_TOKEN_CHALLENGE_PATH = '/api/v1/app/device-token/challenge'
export const DEVICE_TOKEN_EXCHANGE_PATH = '/api/v1/app/device-token/exchange'

/** actor 字段（协议 §5 #17）：出现即 403 FORBIDDEN_ACTOR —— 身份只来自设备签名 */
const FORBIDDEN_ACTOR_FIELDS = new Set(['student_id', 'player_id', 'user_id', 'actor', 'sub'])

/**
 * 服务端权威字段（协议 §5 #15 的"非 actor 类服务端权威字段"）：出现即 400 SCHEMA_INVALID。
 * audience / scope / client_id 若可被调用方指定，就等于允许把 AT 签给未获准的
 * resource server 或注入额外 scope（提权），因此必须在字段白名单层面直接拒绝。
 */
const SERVER_AUTHORITATIVE_FIELDS = new Set([
  'client_id',
  'audience',
  'aud',
  'scope',
  'resource',
  'expires_in',
  'ttl',
])

/** challenge 请求体允许的字段（V1 无字段：challenge 由服务端生成并绑定设备签名） */
const CHALLENGE_ALLOWED_FIELDS = new Set<string>([])

/** exchange 请求体允许的字段（严格白名单） */
const EXCHANGE_ALLOWED_FIELDS = new Set([
  'device_id',
  'challenge',
  'issued_at',
  'nonce',
  'signature',
])

export interface DeviceTokenApiDeps extends AppAuthDeps, ClockSkewConfig {
  sql: SqlExecutor
  /** oidc-provider 实例（JWT AT 由它的 AccessToken 模型签发，保证与 /oauth/token 同构） */
  provider: unknown
  /** #902a 已解析的游戏 resource 配置（唯一 audience/scope/client 来源） */
  gameResource?: ResolvedGameResourceConfig
  /** 一次性 challenge TTL（秒），默认 120 */
  challengeTtlSeconds?: number
  /** 换票 AT TTL（秒），默认 DEVICE_TOKEN_ACCESS_TTL_SECONDS（900） */
  accessTokenTtlSeconds?: number
}

/** 读取请求体对象并按白名单校验字段（非法 → SCHEMA_INVALID / FORBIDDEN_ACTOR） */
function parseStrictBody(
  body: unknown,
  allowed: ReadonlySet<string>,
): Record<string, unknown> {
  if (body === undefined || body === null) {
    return {}
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new SchemaInvalidError('请求体必须是 JSON 对象')
  }
  const record = body as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_ACTOR_FIELDS.has(key)) {
      throw new ForbiddenActorError(key)
    }
    if (SERVER_AUTHORITATIVE_FIELDS.has(key)) {
      throw new SchemaInvalidError(`${key} 是服务端权威字段，不接受调用方指定`)
    }
    if (!allowed.has(key)) {
      throw new SchemaInvalidError(`未知字段 ${key}`)
    }
  }
  return record
}

/** 协议 token 字段（RFC 3986 unreserved，与 canonical 的 assertTokenField 一致） */
const TOKEN_FIELD_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/

function readTokenField(record: Record<string, unknown>, field: string): string {
  const raw = record[field]
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new SchemaInvalidError(`缺少字段 ${field}`)
  }
  if (!TOKEN_FIELD_PATTERN.test(raw)) {
    throw new SchemaInvalidError(`${field} 含协议外字符或长度非法`)
  }
  return raw
}

/** 读取 exchange 请求体并做字段级校验（不校验签名材料以外的语义） */
function parseExchangeBody(body: unknown): {
  deviceId: string
  challenge: string
  issuedAt: number
  nonce: string
  signature: string
} {
  const record = parseStrictBody(body, EXCHANGE_ALLOWED_FIELDS)
  const issuedAt = record.issued_at
  if (typeof issuedAt !== 'number' || !Number.isInteger(issuedAt)) {
    throw new SchemaInvalidError('issued_at 必须是整数 UNIX 秒')
  }
  const signature = record.signature
  if (typeof signature !== 'string' || signature.length === 0 || signature.length > 128) {
    throw new SchemaInvalidError('signature 长度非法')
  }
  return {
    deviceId: readTokenField(record, 'device_id'),
    challenge: readTokenField(record, 'challenge'),
    issuedAt,
    nonce: readTokenField(record, 'nonce'),
    signature,
  }
}

/** 解析当前生效的游戏 resource 配置：未注入时按默认（空白名单）解析 = 能力关闭 */
function resolveConfig(deps: DeviceTokenApiDeps): ResolvedGameResourceConfig {
  return deps.gameResource ?? resolveGameResourceConfig()
}

/** 能力开关：未配置第一方换票 client → fail closed（不签发 challenge，更不签发 AT） */
function assertEnabled(deps: DeviceTokenApiDeps): ResolvedGameResourceConfig {
  const config = resolveConfig(deps)
  if (!isDeviceTokenExchangeEnabled(config)) {
    throw new DeviceTokenFeatureDisabledError()
  }
  return config
}

/** token 响应头（协议 §6.2.4：禁止中间层缓存 token） */
function setTokenResponseHeaders(ctx: RouterContext): void {
  ctx.set('Cache-Control', 'no-store')
  ctx.set('Pragma', 'no-cache')
  ctx.set('X-Content-Type-Options', 'nosniff')
}

/** 注册设备换票路由（由 registerAppRoutes 调用） */
export function registerDeviceTokenRoutes(router: Router, deps: DeviceTokenApiDeps): void {
  // 设备换票 issuer：签发逻辑（与 /oauth/token 同构）在 oidc/device-access-token.ts
  const issueAccessToken = createDeviceAccessTokenIssuer({
    provider: deps.provider,
    gameResource: resolveConfig(deps),
    ttlSeconds: deps.accessTokenTtlSeconds,
  })

  // POST /api/v1/app/device-token/challenge —— 一次性 challenge（Device 签名认证）
  router.post(DEVICE_TOKEN_CHALLENGE_PATH, async (ctx) => {
    try {
      assertEnabled(deps)
      parseStrictBody(await readJsonBody(ctx), CHALLENGE_ALLOWED_FIELDS)
      // 复用 #622 设备签名认证（method/path 由服务端取请求自身值，防中间人改写）
      const device = await authenticateDeviceRequest(ctx, deps)
      const ttlSeconds = deps.challengeTtlSeconds ?? 120
      const { challenge, expiresAt } = await createDeviceTokenChallenge(deps.sql, {
        deviceId: device.id,
        ttlSeconds,
      })
      setTokenResponseHeaders(ctx)
      ctx.status = 200
      ctx.body = {
        challenge,
        expires_at: expiresAt.toISOString(),
        expires_in: ttlSeconds,
      }
    } catch (err) {
      handleError(ctx, err)
    }
  })

  // POST /api/v1/app/device-token/exchange —— 设备签名 + 一次性 challenge → JWT AT
  router.post(DEVICE_TOKEN_EXCHANGE_PATH, async (ctx) => {
    try {
      const config = assertEnabled(deps)
      const input = parseExchangeBody(await readJsonBody(ctx))

      // 1) 签名时间窗（与 /devices/me 同口径：超窗一律 401，不给时钟探测信息）
      if (!assertFreshIssuedAt(input.issuedAt, deps.skewSeconds)) {
        throw new DeviceAuthError('签名时间超出允许偏差')
      }
      // 2) 设备必须存在且 active（revoked/pending 一律 401，不泄露设备状态）
      const device = await findActiveDeviceById(deps.sql, input.deviceId)
      if (!device) {
        throw new DeviceAuthError('设备不存在或不可用')
      }
      // 3) 用设备公钥验签 canonical（challenge 在签名内，防签名与 challenge 拼接错配）
      const jwk = device.public_key_jwk as { kty: 'OKP'; crv: 'Ed25519'; x: string }
      try {
        assertEd25519PublicJwk(jwk)
      } catch {
        throw new DeviceAuthError('设备公钥数据异常')
      }
      const canonical = buildDeviceTokenCanonical({
        challenge: input.challenge,
        deviceId: device.id,
        issuedAt: input.issuedAt,
        nonce: input.nonce,
      } satisfies DeviceTokenCanonicalInput)
      if (!verifyEd25519(jwk, canonical, input.signature)) {
        throw new DeviceAuthError('签名验证失败')
      }
      // 4) 一次性消费（**单条条件 UPDATE**，禁止 TOCTOU）：rowCount=1 才继续签发。
      //    放在验签之后：未通过设备认证的调用方无法消耗他人的 challenge（防定向 DoS）。
      //    四个条件（hash 命中 / 属于本设备 / 未消费 / 未过期）任一不满足都返回同一错误。
      const consumed = await consumeDeviceTokenChallenge(deps.sql, {
        challengeHash: sha256Base64url(input.challenge),
        deviceId: device.id,
      })
      if (!consumed) {
        throw new DeviceChallengeInvalidError()
      }
      // 5) 验签成功后更新活跃时间（#619 契约：只在签名验证成功后更新）
      await touchDeviceLastSeen(deps.sql, device.id)
      if (device.user_id) {
        await touchUserLastActive(deps.sql, device.user_id)
      }
      // 6) 签发 resource/audience scoped JWT AT（user_id 只来自设备记录）
      const issued = await issueAccessToken(device.user_id)
      const expiresAt = new Date(Date.now() + issued.expiresIn * 1000)

      setTokenResponseHeaders(ctx)
      ctx.status = 200
      // 注意：V1 **不签发 refresh_token**（用户明确范围），响应体也不含该字段
      ctx.body = {
        access_token: issued.accessToken,
        token_type: 'Bearer',
        expires_in: issued.expiresIn,
        expires_at: expiresAt.toISOString(),
        scope: issued.scope,
        audience: config.audience,
      }
    } catch (err) {
      handleError(ctx, err)
    }
  })
}

/** DomainError → HTTP；能力关闭/签发链异常 → 对应协议码；未知错误 → 500（不泄露细节） */
function handleError(ctx: RouterContext, err: unknown): void {
  if (err instanceof DomainError) {
    respondError(ctx, err)
    return
  }
  if (err instanceof DeviceTokenDisabledError) {
    respondError(ctx, new DeviceTokenFeatureDisabledError())
    return
  }
  if (err instanceof DeviceTokenIssuanceError) {
    ctx.app.emit('error', err, ctx)
    respondError(ctx, new AppInternalError())
    return
  }
  ctx.app.emit('error', err as Error, ctx)
  respondError(ctx, new AppInternalError())
}
