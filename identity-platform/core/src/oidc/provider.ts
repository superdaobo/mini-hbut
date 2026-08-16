/**
 * oidc-provider v9 Provider 组装（#620 核心出口）。
 *
 * Route mapping（#620 推荐，与外部 Discovery 完全一致）：
 *   GET  /.well-known/openid-configuration（provider 内置）
 *   GET  /oauth/authorize
 *   POST /oauth/token
 *   GET  /oauth/userinfo
 *   GET  /oauth/jwks
 *   POST /oauth/revoke
 *   GET/POST /oauth/logout
 *
 * Provider feature V1（#620）：
 *   - 仅 Authorization Code；responseTypes=['code']（无 implicit/hybrid）；
 *   - PKCE 强制（全部 client，S256）；public client 无 secret；
 *   - Refresh Token：无条件 rotation + replay 检测（v9 内建）+ 显式 revoke；
 *   - pairwise subject（subjectTypes=['pairwise']）；
 *   - custom interactions（V1 每次授权都需 App 显式批准，无静默同意）；
 *   - Postgres Adapter（oidc_provider_records，动态 Client 加载）。
 *
 * 明确不开放：Implicit / ROPC / Client Credentials / DCR / device flow / CIBA。
 */
import Provider, { interactionPolicy } from 'oidc-provider'
import type { SqlExecutor } from '../db/types.js'
import { createPostgresAdapterFactory, createClientLoader } from './adapter/index.js'
import { accountFinder } from './account.js'
import { derivePairwiseSubject } from '../domain/subjects.js'
import {
  createInteractionUrl,
  buildApprovalPolicy,
  registerStateObserver,
} from './interaction.js'
import {
  loadJwksFromJson,
  generateEphemeralKeySet,
  toProviderJwks,
} from './keys.js'

/** V1 scope 白名单（#617 初始 Scope，与 domain/clients.ts SCOPE_WHITELIST 一致） */
export const OIDC_SCOPES = ['openid', 'profile', 'student.identity', 'offline_access'] as const

/**
 * scope → claims 映射（#620 Claims 章节；collectClaims 会把新 scope 注册进 provider）。
 * 注意：顶层 `xxx: null` 形式的 claim 表示“不依赖 scope 也能返回”的内置 claim，
 * 必须显式保留（acr/amr/auth_time/sid/iss 在 v9 默认配置中以此形式存在，
 * 覆盖 claims 时必须带上，否则 claimsSupported 不含它们、ID Token 会被过滤掉）。
 */
export const OIDC_CLAIMS = {
  acr: null,
  amr: null,
  auth_time: null,
  sid: null,
  iss: null,
  // amr/auth_time 显式挂到 openid scope：v9 中可选 claim（acr/amr/auth_time）
  // 必须被 scope 映射或 claims 参数请求才会出现在 ID Token（官方行为，
  // 实测确认顶层 null 只影响 claims_supported，不进 filter）。
  openid: ['sub', 'amr', 'auth_time'],
  profile: ['name', 'preferred_username'],
  'student.identity': [
    'hbut_student_id',
    'hbut_student_name',
    'hbut_verification_method',
    'hbut_verified_at',
  ],
}

export interface IdentityProviderDeps {
  sql: SqlExecutor
  /** canonical issuer（resolveIssuer 输出；测试用固定 https issuer） */
  issuer: string
  /** development | preview | production（Production 无 JWKS 时 fail closed） */
  environment: string
  /** IDENTITY_PAIRWISE_SUBJECT_KEY */
  pairwiseKey: string | undefined
  /** IDENTITY_HANDOFF_HMAC_KEY */
  handoffHmacKey: string | undefined
  /** IDENTITY_CLIENT_SECRET_KEK */
  clientSecretKek: string | undefined
  /** IDENTITY_COOKIE_KEYS（逗号分隔；至少一个，fail closed） */
  cookieKeys: string[]
  /** IDENTITY_AUTH_ORIGIN（auth.* 站点，interaction 重定向目标） */
  authWebBaseUrl: string
  /** IDENTITY_JWKS_JSON（JWK Set）；未配置时 development/test 生成临时密钥 */
  jwksJson: string | undefined
  /** AuthRequest TTL（秒，默认 120；Interaction TTL 与其一致） */
  authRequestTtlSeconds?: number
  /** 测试用 TTL 覆盖（秒） */
  ttlOverrides?: {
    authorizationCode?: number
    accessToken?: number
    refreshToken?: number
    interaction?: number
  }
}

/** 默认 TTL（秒） */
const DEFAULT_TTL = {
  authorizationCode: 60,
  accessToken: 60 * 60,
  idToken: 60 * 60,
  refreshToken: 30 * 24 * 60 * 60,
  grant: 30 * 24 * 60 * 60,
}

/** 校验 cookie keys：空配置 fail closed（cookie 签名是安全基础） */
function assertCookieKeys(keys: string[]): void {
  if (!Array.isArray(keys) || keys.length === 0 || keys.some((k) => !k || k.length < 16)) {
    throw new Error('[oidc.provider] IDENTITY_COOKIE_KEYS 未配置或过短（fail closed）')
  }
}

/**
 * 创建 Provider 实例。
 * 注意：本函数同步执行；静态 Client 预置（ensureStaticClients）由调用方异步执行。
 */
export function createIdentityProvider(deps: IdentityProviderDeps): Provider {
  assertCookieKeys(deps.cookieKeys)

  // 签名密钥：Production 必须显式配置 IDENTITY_JWKS_JSON（fail closed）；
  // development/test 允许临时密钥（每次启动变化，仅供本地调试）。
  let keySet: ReturnType<typeof loadJwksFromJson>
  if (deps.jwksJson && deps.jwksJson.trim() !== '') {
    keySet = loadJwksFromJson(deps.jwksJson)
  } else if (deps.environment === 'production') {
    throw new Error('[oidc.provider] Production 必须配置 IDENTITY_JWKS_JSON（fail closed）')
  } else {
    keySet = generateEphemeralKeySet()
  }

  const authRequestTtl = deps.authRequestTtlSeconds ?? 120
  const ttlOverride = deps.ttlOverrides ?? {}

  const provider = new Provider(deps.issuer, {
    adapter: createPostgresAdapterFactory({
      sql: deps.sql,
      clientLoader: createClientLoader({
        sql: deps.sql,
        clientSecretKek: deps.clientSecretKek,
      }),
    }),

    // scope 白名单必须显式配置（v9 默认只有 openid/offline_access，#619 陷阱）
    scopes: [...OIDC_SCOPES],
    claims: OIDC_CLAIMS,
    // pairwise 必须显式声明（v9 默认只有 public，#619 陷阱）
    subjectTypes: ['pairwise'],
    // 仅 Authorization Code；implicit/hybrid 全部不出现
    responseTypes: ['code'],
    // PKCE 强制（S256）：public client 无 secret，confidential 也推荐强制（#620）
    pkce: {
      enabled: true,
      required: () => true,
    },

    routes: {
      authorization: '/oauth/authorize',
      token: '/oauth/token',
      userinfo: '/oauth/userinfo',
      jwks: '/oauth/jwks',
      revocation: '/oauth/revoke',
      end_session: '/oauth/logout',
    },

    features: {
      // 关闭 devInteractions（custom interaction 接管，避免默认页面/日志污染）
      devInteractions: { enabled: false },
      // 显式启用 Revocation（v9 默认关闭！）
      revocation: { enabled: true },
      // UserInfo 默认开启，显式声明
      userinfo: { enabled: true },
      // RP-Initiated Logout（/oauth/logout），默认开启，显式声明
      rpInitiatedLogout: { enabled: true },
      // oidc-provider 9.11.x 默认开启 PAR，但 V1 没有暴露 /request 路由；
      // 必须显式关闭，避免 Discovery 宣告一个实际上不可达的 pushed_authorization_request_endpoint。
      pushedAuthorizationRequests: { enabled: false },
      // 以下 V1 不开放：clientCredentials / deviceFlow / ciba /
      // introspection / registration / requestObjects / encryption /
      // claimsParameter / jwtResponseModes / resourceIndicators / dPoP
    },

    // Refresh Token：无条件 rotation（#617：public client 必须 rotation；
    // replay 检测与 revoke chain 是 v9 内建行为，见 refresh_token.js）
    rotateRefreshToken: true,

    ttl: {
      AuthorizationCode: (_ctx, _code, _client) => ttlOverride.authorizationCode ?? DEFAULT_TTL.authorizationCode,
      AccessToken: (_ctx, _token, _client) => ttlOverride.accessToken ?? DEFAULT_TTL.accessToken,
      IdToken: () => DEFAULT_TTL.idToken,
      RefreshToken: (_ctx, _token, _client) => ttlOverride.refreshToken ?? DEFAULT_TTL.refreshToken,
      Interaction: () => ttlOverride.interaction ?? authRequestTtl,
      Grant: () => DEFAULT_TTL.grant,
    },

    // 账户：accountId = 内部 user id；学号只经 claims（userinfo）授权后返回
    findAccount: accountFinder({ sql: deps.sql }),

    // pairwise sub：HMAC(PAIRWISE_KEY, sector|client_id || 0x00 || user_id)
    //（sub 绝不等于学号；密钥未配置 fail closed，见 domain/subjects.ts）
    pairwiseIdentifier: async (_ctx, accountId, client) => {
      const c = client as { sectorIdentifier?: string; clientId: string }
      return derivePairwiseSubject({
        pairwiseKey: deps.pairwiseKey,
        sectorOrClientId: c.sectorIdentifier ?? c.clientId,
        userId: accountId,
      })
    },

    // custom interaction：创建 AuthRequest → 302 auth.* → resume（见 interaction.ts）
    interactions: {
      url: createInteractionUrl({
        sql: deps.sql,
        handoffHmacKey: deps.handoffHmacKey,
        authWebBaseUrl: deps.authWebBaseUrl,
        authRequestTtlSeconds: deps.authRequestTtlSeconds,
      }),
      policy: buildApprovalPolicy(interactionPolicy) as never,
    },

    jwks: toProviderJwks(keySet),
    cookies: { keys: deps.cookieKeys },

    // CORS：保留 v9 默认 clientBasedCORS（userinfo 与 public client 仅对
    // 注册 redirect_uri 的 origin 放行；token 端点不开放任意来源，#620）
    extraParams: [],
    // claims 参数 V1 不开放（减少攻击面）
    claimsParameter: { enabled: false },
  })

  // 协议状态观测（CODE_ISSUED/CONSUMED 推进，观测性质）
  registerStateObserver(provider, { sql: deps.sql })

  // 反向代理信任（Vercel serverless）：production/preview 下 Discovery/回调
  // URL 基于 X-Forwarded-Proto/Host 生成（v9 用 ctx.href 拼 endpoint 绝对 URL，
  // 不信任时输出 http:// 内部 origin）。development/test 不信任，防 host 头伪造。
  provider.proxy = deps.environment === 'production' || deps.environment === 'preview'

  return provider
}
