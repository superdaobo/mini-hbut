/**
 * OIDC E2E 测试基建（#620）。
 *
 * 提供：
 * - startE2E：用 createApp（真实组装：provider + requests API）拉起 http server，
 *   返回 baseUrl / db / provider 句柄；
 * - CookieJar：模拟浏览器 cookie 语义（按 path 匹配，签名 cookie 原样回传）；
 * - pkcePair / jwtDecode / jwtVerifyRsa（RS256 签名验证，node:crypto 手写）；
 * - 完整授权流程 helper：beginAuthorize → approveAndResume → completeAuthorize → exchange。
 *
 * 环境：pg-mem 或 TEST_DATABASE_URL（双后端，同 #619 模式）。
 */
import http from 'node:http'
import { createHash, createVerify, generateKeyPairSync, randomBytes } from 'node:crypto'
import { createApp, type App, type AppWithProvider } from '../../../src/app.js'
import type { TestDatabase } from '../../helpers/pg.js'
import { TEST_KEK, TEST_HANDOFF_HMAC_KEY, TEST_PAIRWISE_KEY, TEST_SERVICE_TOKEN } from '../../helpers/keys.js'
import type Provider from 'oidc-provider'

/** 测试 canonical issuer（Discovery 断言用真实 Production canonical 另测） */
export const TEST_ISSUER = 'https://id.example.test'
/** auth.* 站点（interactions.url 重定向目标） */
export const TEST_AUTH_ORIGIN = 'https://auth.example.test'

export interface E2EContext {
  db: TestDatabase
  app: App
  baseUrl: string
  provider: Provider
  close(): Promise<void>
}

export interface StartAppOptions {
  /** Discovery 断言用 Production canonical issuer 时传 */
  issuer?: string
  /** production 模拟（proxy=true + 显式 JWKS；Discovery 生产断言用） */
  environment?: 'test' | 'production'
  /** 覆盖 AuthRequest/Interaction TTL（秒）；expired 场景用 */
  authRequestTtlSeconds?: number
  /** 覆盖 authorization code TTL（秒） */
  codeTtlSeconds?: number
  /** 覆盖 refresh token TTL（秒） */
  refreshTtlSeconds?: number
}

async function startApp(db: TestDatabase, opts: StartAppOptions = {}) {
  const isProduction = opts.environment === 'production'
  const app = createApp({
    executor: db.sql,
    serviceToken: TEST_SERVICE_TOKEN,
    providerDeps: {
      issuer: opts.issuer ?? TEST_ISSUER,
      environment: isProduction ? 'production' : 'test',
      // production 模拟需要显式 JWKS（fail closed 要求）；测试用一次性 RSA 密钥
      jwksJson: isProduction ? generateTestJwksJson() : undefined,
      pairwiseKey: TEST_PAIRWISE_KEY,
      handoffHmacKey: TEST_HANDOFF_HMAC_KEY,
      clientSecretKek: TEST_KEK,
      cookieKeys: ['test-cookie-signing-key-0123456789abcdef'],
      authWebBaseUrl: TEST_AUTH_ORIGIN,
      authRequestTtlSeconds: opts.authRequestTtlSeconds,
      ttlOverrides: {
        authorizationCode: opts.codeTtlSeconds,
        accessToken: 3600,
        refreshToken: opts.refreshTtlSeconds ?? 3600,
      },
    },
  })
  const server = http.createServer(app.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('无法获取测试端口')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    app,
    baseUrl,
    provider: (app as AppWithProvider).oidcProvider,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
  }
}

export async function startE2E(db: TestDatabase, opts: StartAppOptions = {}): Promise<E2EContext> {
  const running = await startApp(db, opts)
  return {
    db,
    app: running.app,
    baseUrl: running.baseUrl,
    provider: running.provider,
    close: running.close,
  }
}

/** 生成一次性 RSA JWK Set JSON（production 模拟的显式签名密钥） */
function generateTestJwksJson(): string {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const privateJwk = key.privateKey.export({ format: 'jwk' }) as Record<string, string>
  const publicJwk = key.publicKey.export({ format: 'jwk' }) as Record<string, string>
  const kid = `test-rs256-${createHash('sha256').update(publicJwk.n ?? '').digest('base64url').slice(0, 12)}`
  return JSON.stringify({
    keys: [{ ...privateJwk, kid, alg: 'RS256', use: 'sig' }],
  })
}

/** 简易 cookie jar（path 匹配；oidc-provider 的 cookie 是签名的，原样回传） */
export class CookieJar {
  private readonly store = new Map<string, { value: string; path: string }>()

  absorb(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const parts = raw.split(';')
      const pair = parts[0] ?? ''
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const pathAttr = parts.find((p) => p.trim().startsWith('path='))
      const path = pathAttr?.split('=')[1]?.trim() || '/'
      this.store.set(name, { value, path })
    }
  }

  headerFor(url: string): string {
    const u = new URL(url)
    const cookies = [...this.store.entries()]
      .filter(([, c]) => u.pathname.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
    return cookies.length > 0 ? cookies.join('; ') : ''
  }

  get(name: string): string | undefined {
    return this.store.get(name)?.value
  }
}

export function pkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

/** 解码 JWT（不验签） */
export function jwtDecode(token: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signature: string } {
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) throw new Error('JWT 格式非法')
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>,
    signature: s,
  }
}

/** 用 JWKS 公钥验证 RS256 JWT 签名（node:crypto 手写，不引入额外依赖） */
export async function verifyJwtSignature(
  token: string,
  jwks: { keys: Array<{ kid?: string; n?: string; e?: string; kty?: string }> },
): Promise<{ ok: boolean; kid?: string }> {
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) return { ok: false }
  const { header } = jwtDecode(token)
  const key = jwks.keys.find((k) => k.kid === header.kid)
  if (!key || !key.n || !key.e || key.kty !== 'RSA') return { ok: false }
  const { createPublicKey } = await import('node:crypto')
  const publicKey = createPublicKey({
    key: { kty: 'RSA', n: key.n, e: key.e },
    format: 'jwk',
  })
  const data = Buffer.from(`${h}.${p}`, 'utf8')
  const sig = Buffer.from(s, 'base64url')
  const ok = createVerify('RSA-SHA256').update(data).verify(publicKey, sig)
  return { ok, kid: key.kid }
}

/** GET /oauth/authorize 发起授权（返回 303 到 auth.* 的交互页） */
export async function beginAuthorize(opts: {
  baseUrl: string
  clientId: string
  redirectUri: string
  scope: string
  state?: string
  nonce?: string
  codeChallenge?: string
  codeChallengeMethod?: string
  extra?: Record<string, string>
}): Promise<{ status: number; location: string | null; cookies: CookieJar }> {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: opts.scope,
  })
  if (opts.state) params.set('state', opts.state)
  if (opts.nonce) params.set('nonce', opts.nonce)
  if (opts.codeChallenge) params.set('code_challenge', opts.codeChallenge)
  if (opts.codeChallengeMethod) params.set('code_challenge_method', opts.codeChallengeMethod)
  for (const [k, v] of Object.entries(opts.extra ?? {})) params.set(k, v)
  const cookies = new CookieJar()
  const res = await fetch(`${opts.baseUrl}/oauth/authorize?${params.toString()}`, {
    redirect: 'manual',
  })
  cookies.absorb(res)
  return { status: res.status, location: res.headers.get('location'), cookies }
}

/** 从 auth.* 交互页 URL 解析 request_id 与 handoff secret（fragment 传递） */
export function parseInteractionTarget(location: string): { requestId: string; handoffSecret?: string } {
  const url = new URL(location)
  const requestId = url.pathname.split('/').pop() ?? ''
  if (!requestId) throw new Error(`无法从交互页解析 request_id：${location}`)
  // 真实 auth.* 页面收到的是 #h=<secret>，浏览器只把参数值传给 Core；
  // 测试 helper 必须模拟同一行为，不能把整个 "h=..." 当作 secret。
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  return { requestId, handoffSecret: fragment.get('h') ?? undefined }
}

/** App 完成批准（模拟 #622：active device + 领域层 approve） */
export async function approveAsDevice(
  db: TestDatabase,
  input: { requestId: string; userId: string },
): Promise<void> {
  const { insertDevice, setDeviceStatus } = await import('../../../src/db/repos/devices.repo.js')
  const deviceId = `dev_${randomBytes(8).toString('hex')}`
  await insertDevice(db.sql, {
    id: deviceId,
    user_id: input.userId,
    publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: randomBytes(32).toString('base64url') },
    publicKeyFingerprint: `fp_${randomBytes(16).toString('hex')}`,
    platform: 'android',
    deviceName: '测试设备',
    status: 'pending',
  })
  await setDeviceStatus(db.sql, deviceId, 'active')
  const { transitionAuthRequestStatus, approveAuthRequest } = await import('../../../src/domain/auth-requests/service.js')
  // #619 状态机：CREATED → WAITING_APP → APPROVED（approve 只允许 WAITING_APP/APP_OPENED）
  await transitionAuthRequestStatus(db.sql, input.requestId, 'WAITING_APP').catch(() => undefined)
  const { created } = await approveAuthRequest(db.sql, input.requestId, deviceId)
  if (!created) {
    throw new Error(`approve 未生效（requestId=${input.requestId}）`)
  }
}

/** POST /api/v1/requests/:id/resume（带 x-identity-handoff 头） */
export async function resumeRequest(opts: {
  baseUrl: string
  requestId: string
  handoffSecret: string
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${opts.baseUrl}/api/v1/requests/${opts.requestId}/resume`, {
    method: 'POST',
    headers: {
      'x-identity-handoff': opts.handoffSecret,
      'x-identity-service-token': TEST_SERVICE_TOKEN,
    },
  })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, body }
}

/** 浏览器访问 redirect_to（resume cookie 必须已带）→ 期望 303 到 redirect_uri?code= */
export async function completeAuthorize(opts: {
  baseUrl: string
  redirectTo: string
  cookies: CookieJar
}): Promise<{ status: number; location: string | null; cookies: CookieJar }> {
  // redirect_to 是 provider 生成的绝对 URL（urlFor 基于 ctx.href）；相对路径时兜底拼接
  const target = opts.redirectTo.startsWith('http')
    ? opts.redirectTo
    : `${opts.baseUrl}${opts.redirectTo}`
  const res = await fetch(target, {
    redirect: 'manual',
    headers: { cookie: opts.cookies.headerFor(target) },
  })
  opts.cookies.absorb(res)
  return { status: res.status, location: res.headers.get('location'), cookies: opts.cookies }
}

/** 从回调 URL 解析 code/state/error */
export function parseCallback(location: string): {
  code?: string
  state?: string
  error?: string
  errorDescription?: string
} {
  const url = new URL(location)
  return {
    code: url.searchParams.get('code') ?? undefined,
    state: url.searchParams.get('state') ?? undefined,
    error: url.searchParams.get('error') ?? undefined,
    errorDescription: url.searchParams.get('error_description') ?? undefined,
  }
}

/** POST /oauth/token 兑换 code / 刷新 refresh_token */
export async function tokenRequest(opts: {
  baseUrl: string
  grantType: 'authorization_code' | 'refresh_token'
  clientId: string
  clientSecret?: string
  code?: string
  codeVerifier?: string
  redirectUri?: string
  refreshToken?: string
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const params = new URLSearchParams({ grant_type: opts.grantType })
  if (opts.code) params.set('code', opts.code)
  if (opts.codeVerifier) params.set('code_verifier', opts.codeVerifier)
  if (opts.redirectUri) params.set('redirect_uri', opts.redirectUri)
  if (opts.refreshToken) params.set('refresh_token', opts.refreshToken)
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  if (opts.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')}`
  } else {
    params.set('client_id', opts.clientId)
  }
  const res = await fetch(`${opts.baseUrl}/oauth/token`, { method: 'POST', headers, body: params })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, body }
}

/** GET /oauth/userinfo（Bearer access token） */
export async function userinfoRequest(opts: {
  baseUrl: string
  accessToken: string
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${opts.baseUrl}/oauth/userinfo`, {
    headers: { authorization: `Bearer ${opts.accessToken}` },
  })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, body }
}

/** GET /oauth/jwks */
export async function fetchJwks(baseUrl: string): Promise<{ keys: Array<Record<string, unknown>> }> {
  const res = await fetch(`${baseUrl}/oauth/jwks`)
  return (await res.json()) as { keys: Array<Record<string, unknown>> }
}

/** GET /.well-known/openid-configuration */
export async function fetchDiscovery(baseUrl: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}/.well-known/openid-configuration`)
  return (await res.json()) as Record<string, unknown>
}

/** POST /oauth/revoke */
export async function revokeToken(opts: {
  baseUrl: string
  token: string
  clientId: string
  clientSecret?: string
  tokenTypeHint?: string
}): Promise<{ status: number }> {
  const params = new URLSearchParams({ token: opts.token })
  if (opts.tokenTypeHint) params.set('token_type_hint', opts.tokenTypeHint)
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  if (opts.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')}`
  } else {
    params.set('client_id', opts.clientId)
  }
  const res = await fetch(`${opts.baseUrl}/oauth/revoke`, { method: 'POST', headers, body: params })
  return { status: res.status }
}

/** 完整授权流程（含 approve + resume + code 兑换），返回全部产物 */
export async function fullAuthorizationFlow(opts: {
  db: TestDatabase
  baseUrl: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  scope: string
  userId: string
  /** prompt 参数（offline_access 需要 prompt=consent，v9 强制） */
  prompt?: string
}): Promise<{
  code: string
  state: string
  codeVerifier: string
  accessToken: string
  refreshToken?: string
  idToken: string
  cookies: CookieJar
}> {
  const { codeVerifier, codeChallenge } = pkcePair()
  const state = `st_${randomBytes(8).toString('hex')}`
  const nonce = `no_${randomBytes(8).toString('hex')}`
  const auth = await beginAuthorize({
    baseUrl: opts.baseUrl,
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    scope: opts.scope,
    state,
    nonce,
    codeChallenge,
    codeChallengeMethod: 'S256',
    extra: opts.prompt ? { prompt: opts.prompt } : undefined,
  })
  if (auth.status !== 303 || !auth.location) {
    throw new Error(`authorize 未进入交互：status=${auth.status}`)
  }
  const { requestId, handoffSecret } = parseInteractionTarget(auth.location)
  if (!handoffSecret) {
    throw new Error('交互页 URL 缺少 handoff secret（fragment）')
  }
  await approveAsDevice(opts.db, { requestId, userId: opts.userId })
  const resume = await resumeRequest({ baseUrl: opts.baseUrl, requestId, handoffSecret })
  if (resume.status !== 200 || resume.body.status !== 'approved' || !resume.body.redirect_to) {
    throw new Error(`resume 失败：${JSON.stringify(resume)}`)
  }
  const done = await completeAuthorize({
    baseUrl: opts.baseUrl,
    redirectTo: String(resume.body.redirect_to),
    cookies: auth.cookies,
  })
  if (done.status !== 303 || !done.location) {
    throw new Error(`authorize resume 未回调：status=${done.status}`)
  }
  const cb = parseCallback(done.location)
  if (!cb.code) {
    throw new Error(`回调缺少 code：${done.location}`)
  }
  const token = await tokenRequest({
    baseUrl: opts.baseUrl,
    grantType: 'authorization_code',
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    code: cb.code,
    codeVerifier,
    redirectUri: opts.redirectUri,
  })
  if (token.status !== 200 || typeof token.body.access_token !== 'string') {
    throw new Error(`token 兑换失败：${JSON.stringify(token)}`)
  }
  return {
    code: cb.code,
    state: cb.state ?? '',
    codeVerifier,
    accessToken: token.body.access_token as string,
    refreshToken: typeof token.body.refresh_token === 'string' ? token.body.refresh_token : undefined,
    idToken: token.body.id_token as string,
    cookies: done.cookies,
  }
}
