/**
 * Developer Portal 自身登录（OIDC dogfood，issue #624）。
 *
 * Portal 作为第一方 web_confidential OIDC Client 接入 Mini-HBUT Identity：
 *  - Authorization Code + PKCE（S256）；
 *  - 授权码交换、id_token 校验（iss/aud/exp/nonce）全部由标准库 openid-client
 *    完成——不手写 OIDC 协议（#617 信任边界 2）；
 *  - state / nonce / PKCE verifier 由 BFF 生成并存入 HttpOnly cookie，
 *    浏览器 bundle 不接触任何 client secret / verifier；
 *  - 桩模式（IDENTITY_OIDC_STUB=1 / IDENTITY_CORE_STUB=1）下：
 *    authorize 指向本 origin 的 __stub/authorize 路由（仅桩模式存在），
 *    exchangeCode 返回固定开发者身份，用于本地开发/测试（Core #620 未就绪）。
 *
 * 环境变量（fail closed）：DEVELOPER_OIDC_CLIENT_ID / DEVELOPER_OIDC_CLIENT_SECRET /
 * DEVELOPER_REDIRECT_URI 缺失即抛错，绝不静默降级。
 */

import { randomBytes } from 'node:crypto'
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  discovery,
  type Configuration,
} from 'openid-client'
import { getPublicIssuer } from '@/lib/issuer'

export type EnvLike = Record<string, string | undefined>

/** 登录成功后开发者身份（会话载荷的数据来源） */
export interface OidcUserSession {
  sub: string
  display_name: string
  claims: Record<string, unknown>
}

export interface OidcAuthUrlOptions {
  state: string
  nonce: string
  codeChallenge: string
}

export interface OidcExchangeOptions {
  /** 回调的完整 URL（含 code/state 等 query），真实实现由 openid-client 从中提取并校验 */
  currentUrl: string
  codeVerifier: string
  expectedState: string
  expectedNonce: string
}

export interface OidcClient {
  buildAuthUrl(opts: OidcAuthUrlOptions): Promise<string>
  exchangeCode(opts: OidcExchangeOptions): Promise<OidcUserSession>
}

function requireEnv(env: EnvLike, key: string): string {
  const value = env[key]?.trim()
  if (!value) {
    throw new Error(`必须配置 ${key}（Developer Portal 自身登录的 OIDC Client 配置）`)
  }
  return value
}

/**
 * 真实 OIDC Client（openid-client v6，OpenID Certified 库）。
 * discovery 每次调用缓存于模块级（进程内）。
 */
let cachedConfig: Configuration | null = null

export function createOidcRealClient(env: EnvLike = process.env): OidcClient {
  const issuerUrl = getPublicIssuer(env)
  const clientId = requireEnv(env, 'DEVELOPER_OIDC_CLIENT_ID')
  const clientSecret = requireEnv(env, 'DEVELOPER_OIDC_CLIENT_SECRET')
  const redirectUri = requireEnv(env, 'DEVELOPER_REDIRECT_URI')

  async function config(): Promise<Configuration> {
    if (!cachedConfig) {
      cachedConfig = await discovery(new URL(issuerUrl), clientId, {
        client_secret: clientSecret,
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'client_secret_basic',
      })
    }
    return cachedConfig
  }

  return {
    async buildAuthUrl({ state, nonce, codeChallenge }) {
      const c = await config()
      // v6：buildAuthorizationUrl 生成含 client_id/response_type 的授权 URL，
      // 并附带 PKCE/state/nonce 参数；redirect_uri 取自 Client Metadata。
      return buildAuthorizationUrl(c, {
        scope: 'openid profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString()
    },
    async exchangeCode({ currentUrl, codeVerifier, expectedState, expectedNonce }) {
      const c = await config()
      // authorizationCodeGrant：校验 state（防登录 CSRF）、用 PKCE verifier 换码、
      // 校验 id_token 的 iss/aud/exp/nonce（expectedNonce 必须精确匹配）。
      const tokenSet = await authorizationCodeGrant(c, new URL(currentUrl), {
        pkceCodeVerifier: codeVerifier,
        expectedState,
        expectedNonce,
      })
      const claims = tokenSet.claims()
      if (!claims || !claims.sub) {
        throw new Error('id_token 缺少 sub')
      }
      const sub = String(claims.sub)
      return {
        sub,
        display_name: String(claims.preferred_username ?? claims.name ?? claims.sub ?? sub),
        claims: claims as Record<string, unknown>,
      }
    },
  }
}

/** 桩 OIDC Client（本地开发/测试；Core #620 就绪后由真实实现替换） */
export function createOidcStubClient(env: EnvLike = process.env): OidcClient {
  const redirectUri = env.DEVELOPER_REDIRECT_URI?.trim() || 'http://localhost:3000/callback'
  const stubSub = env.DEVELOPER_OIDC_STUB_SUB?.trim() || 'dev_sub_stub_0001'
  const stubName = env.DEVELOPER_OIDC_STUB_NAME?.trim() || '本地开发者（桩）'

  return {
    async buildAuthUrl({ state, nonce, codeChallenge }) {
      // 桩 issuer：指向本 origin 的桩授权端点（仅桩模式注册该路由）
      const base = new URL(redirectUri).origin
      const url = new URL(`${base}/api/v1/developer/__stub/authorize`)
      url.searchParams.set('state', state)
      url.searchParams.set('nonce', nonce)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return url.toString()
    },
    async exchangeCode({ currentUrl }) {
      // 桩不签发/校验真实 id_token：state/nonce 的一致性由 callback 路由
      // 对照 HttpOnly cookie 完成；code 内容无关紧要（真实 Core 负责签发）。
      const code = new URL(currentUrl).searchParams.get('code')
      if (!code) {
        throw new Error('缺少授权码')
      }
      return {
        sub: stubSub,
        display_name: stubName,
        claims: { sub: stubSub, name: stubName },
      }
    },
  }
}

/** 按环境选择 OIDC Client（fail closed：桩未开启且配置缺失 → 抛错） */
export function getOidcClient(env: EnvLike = process.env): OidcClient {
  if (env.IDENTITY_OIDC_STUB === '1' || env.IDENTITY_CORE_STUB === '1') {
    return createOidcStubClient(env)
  }
  return createOidcRealClient(env)
}

/** 桩授权码（仅桩模式由 __stub/authorize 颁发；真实模式由 Core 颁发） */
export function newStubAuthCode(): string {
  return `stub_code_${randomBytes(9).toString('base64url')}`
}
