/**
 * Client 注册领域服务（#619 / #617 信任边界 3-5）。
 *
 * - 仅 Authorization Code + PKCE（V1 grant_types 固定 authorization_code）；
 * - redirect_uri 精确注册，禁止通配/后缀匹配（oidc-provider 侧精确匹配）；
 * - Confidential Client 才有 secret：生成一次、立即以 AES-256-GCM(KEK) 加密入库、
 *   明文只返回给创建者这一次；
 * - 只有 status='active' 的 Client 才能被 oidc-provider 动态加载。
 */
import type { SqlExecutor } from '../db/types.js'
import {
  insertApplication,
  updateApplication,
  findApplicationByClientId,
  findActiveApplicationByClientId,
  replaceRedirectUris,
  upsertApplicationScope,
  listApprovedScopes,
  listRedirectUris,
  type ApplicationStatus,
  type ClientType,
  type RedirectUriKind,
  type TokenEndpointAuthMethod,
  type OAuthApplicationRow,
} from '../db/repos/clients.repo.js'
import { ClientInvalidTransitionError, ClientNotFoundError, InvalidScopeError } from './errors.js'
import { newUuidV7 } from './ids.js'
import { newPrefixedRandomId, newRandomSecret } from '../security/random.js'
import { encryptClientSecret } from '../security/client-secret.js'

/** V1 scope 白名单（#617：openid/profile/student.identity/offline_access） */
export const SCOPE_WHITELIST = ['openid', 'profile', 'student.identity', 'offline_access'] as const

export type { ApplicationStatus as ClientStatus } from '../db/repos/clients.repo.js'

/** Client 状态机合法迁移（rejected/revoked 为终态，不可恢复） */
export const CLIENT_ALLOWED_TRANSITIONS: Readonly<Record<ApplicationStatus, readonly ApplicationStatus[]>> = {
  draft: ['pending_review', 'rejected', 'revoked'],
  pending_review: ['approved', 'rejected', 'revoked'],
  approved: ['active', 'revoked'],
  active: ['suspended', 'revoked'],
  suspended: ['active', 'revoked'],
  rejected: [],
  revoked: [],
}

export interface RedirectUriInput {
  uri: string
  kind: RedirectUriKind
}

export interface CreateClientInput {
  developerId: string
  name: string
  description?: string
  homepageUrl?: string
  privacyPolicyUrl?: string
  clientType: ClientType
  redirectUris: RedirectUriInput[]
  requestedScopes: string[]
  sectorIdentifier?: string
  /** 静态 Client 预置专用：固定 client_id（缺省随机生成；web 侧按此值配置） */
  clientId?: string
}

export interface CreateClientResult {
  applicationId: string
  clientId: string
  /** 仅 confidential client 返回；明文只出现这一次 */
  clientSecret: string | null
}

/** redirect_uri 注册值校验（Core 为最终信任边界；不得依赖 BFF 先行校验）。 */
export function assertValidRedirectUris(
  uris: RedirectUriInput[],
  clientType: ClientType,
  opts: { allowLocalhostDev?: boolean } = {},
): void {
  if (uris.length === 0) {
    throw new Error('[clients] 至少需要一个 redirect_uri')
  }
  const allowedKinds: Readonly<Record<ClientType, readonly RedirectUriKind[]>> = {
    web_confidential: ['web_https'],
    native_public: ['native_custom', 'native_loopback'],
    browser_public: ['web_https'],
  }
  for (const u of uris) {
    if (!u.uri || u.uri.length > 2048 || /[\u0000-\u001f\u007f]/.test(u.uri)) {
      throw new Error('[clients] redirect_uri 格式非法')
    }
    if (!allowedKinds[clientType].includes(u.kind)) {
      throw new Error('[clients] redirect_uri 类型与 client_type 不匹配')
    }
    if (u.uri.includes('*') || u.uri.includes('#') || u.uri.includes('@')) {
      throw new Error('[clients] redirect_uri 禁止通配符、fragment 或 userinfo')
    }
    if (u.kind === 'web_https') {
      let parsed: URL
      try {
        parsed = new URL(u.uri)
      } catch {
        throw new Error('[clients] web_https redirect_uri 不是合法 URL')
      }
      const localhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]' || parsed.hostname === '::1'
      const localDevAllowed = opts.allowLocalhostDev === true && parsed.protocol === 'http:' && localhost
      if (parsed.protocol !== 'https:' && !localDevAllowed) {
        throw new Error('[clients] web_https redirect_uri 必须使用 https://')
      }
    }
    if (u.kind === 'native_loopback') {
      const match = /^http:\/\/(127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/.*)?$/.exec(u.uri)
      if (!match) {
        throw new Error('[clients] native_loopback 只允许 http://127.0.0.1 / http://[::1]')
      }
      if (match[2]) {
        const port = Number(match[2].slice(1))
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error('[clients] native_loopback 端口非法')
        }
      }
    }
    if (u.kind === 'native_custom') {
      const colon = u.uri.indexOf(':')
      const scheme = colon > 0 ? u.uri.slice(0, colon) : ''
      if (
        colon <= 0
        || colon === u.uri.length - 1
        || !/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(scheme)
        || scheme.toLowerCase() === 'http'
        || scheme.toLowerCase() === 'https'
      ) {
        throw new Error('[clients] native_custom redirect_uri 格式非法')
      }
    }
  }
}

export function assertValidScopes(scopes: string[]): void {
  for (const s of scopes) {
    if (!(SCOPE_WHITELIST as readonly string[]).includes(s)) {
      throw new InvalidScopeError(s)
    }
  }
}

function tokenEndpointAuthMethodFor(clientType: ClientType): TokenEndpointAuthMethod {
  switch (clientType) {
    case 'web_confidential':
      return 'client_secret_basic'
    case 'native_public':
    case 'browser_public':
      return 'none'
  }
}

/**
 * 创建 Client：
 * - confidential 生成 32 字节随机 secret，立即加密入库，明文只返回一次；
 * - 状态落 draft（需审核后 active，#625 负责审核流）。
 */
export async function createClient(
  sql: SqlExecutor,
  input: CreateClientInput,
  opts: { clientSecretKek: string | undefined; allowLocalhostDev?: boolean },
): Promise<CreateClientResult> {
  assertValidRedirectUris(input.redirectUris, input.clientType, {
    allowLocalhostDev: opts.allowLocalhostDev,
  })
  assertValidScopes(input.requestedScopes)

  const clientId = input.clientId ?? newPrefixedRandomId('cli', 16)
  const applicationId = newUuidV7()
  const isConfidential = input.clientType === 'web_confidential'
  const clientSecret = isConfidential ? newRandomSecret(32) : null

  await sql.withTransaction(async (tx) => {
    await insertApplication(tx, {
      id: applicationId,
      client_id: clientId,
      owner_developer_id: input.developerId,
      name: input.name,
      description: input.description ?? null,
      homepage_url: input.homepageUrl ?? null,
      privacy_policy_url: input.privacyPolicyUrl ?? null,
      client_type: input.clientType,
      status: 'draft',
      token_endpoint_auth_method: tokenEndpointAuthMethodFor(input.clientType),
      client_secret_encrypted: clientSecret
        ? encryptClientSecret(opts.clientSecretKek, clientSecret)
        : null,
      client_secret_expires_at: null,
      sector_identifier: input.sectorIdentifier ?? null,
    })
    await replaceRedirectUris(tx, applicationId, input.redirectUris)
    for (const scope of input.requestedScopes) {
      await upsertApplicationScope(tx, applicationId, scope, 'requested')
    }
  })

  return { applicationId, clientId, clientSecret }
}

/**
 * Client 状态迁移（条件更新 + 状态机校验）。
 * revoked 为终态；suspended 可恢复为 active。
 */
export async function setClientStatus(
  sql: SqlExecutor,
  clientId: string,
  to: ApplicationStatus,
): Promise<OAuthApplicationRow> {
  const current = await findApplicationByClientId(sql, clientId)
  if (!current) {
    throw new ClientNotFoundError()
  }
  if (!CLIENT_ALLOWED_TRANSITIONS[current.status].includes(to)) {
    throw new ClientInvalidTransitionError(current.status, to)
  }
  const patch: Record<string, Date | string> = { status: to }
  if (to === 'active') {
    patch.activated_at = new Date()
  } else if (to === 'approved' || to === 'rejected') {
    patch.reviewed_at = new Date()
  }
  const ok = await updateApplication(sql, clientId, patch)
  if (!ok) {
    throw new ClientNotFoundError()
  }
  const updated = await findApplicationByClientId(sql, clientId)
  return updated as OAuthApplicationRow
}

/**
 * 轮换 client_secret：
 * - 生成新 secret 立即生效（覆盖密文）；
 * - 旧 secret 立即失效（DB 不再保留旧密文），行为在测试中明确固化。
 * 明文只返回一次。
 */
export async function rotateClientSecret(
  sql: SqlExecutor,
  clientId: string,
  opts: { clientSecretKek: string | undefined },
): Promise<{ clientSecret: string }> {
  const current = await findApplicationByClientId(sql, clientId)
  if (!current) {
    throw new ClientNotFoundError()
  }
  if (current.client_type !== 'web_confidential') {
    throw new Error('[clients] 只有 web_confidential Client 允许 client_secret')
  }
  const clientSecret = newRandomSecret(32)
  const ok = await updateApplication(sql, clientId, {
    client_secret_encrypted: encryptClientSecret(opts.clientSecretKek, clientSecret),
    client_secret_expires_at: null,
  })
  if (!ok) {
    throw new ClientNotFoundError()
  }
  return { clientSecret }
}

/** 查询 active Client（oidc-provider 动态加载的权威判定） */
export async function getActiveClient(
  sql: SqlExecutor,
  clientId: string,
): Promise<OAuthApplicationRow | null> {
  return findActiveApplicationByClientId(sql, clientId)
}

export interface ClientMetadataView {
  app: OAuthApplicationRow
  redirectUris: string[]
  approvedScopes: string[]
}

export async function getClientMetadataView(
  sql: SqlExecutor,
  clientId: string,
): Promise<ClientMetadataView | null> {
  const app = await findApplicationByClientId(sql, clientId)
  if (!app) {
    return null
  }
  const [redirectUris, approvedScopes] = await Promise.all([
    listRedirectUris(sql, app.id).then((rows) => rows.map((r) => r.redirect_uri)),
    listApprovedScopes(sql, app.id),
  ])
  return { app, redirectUris, approvedScopes }
}
