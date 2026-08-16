/**
 * Client 模型加载器（#619）。
 *
 * oidc-provider 的 Client 数据权威来源是 oauth_applications：
 * - find(id)：只返回 status='active' 的应用；suspended/revoked/draft 一律
 *   undefined（provider 视为 invalid_client / 不存在的 client）；
 * - 返回的 metadata 中 client_secret 是【解密后的明文】（AES-256-GCM(KEK)），
 *   供 provider 在 token endpoint 做 client_secret_basic/post 认证
 *   （compareClientSecret 常量时间比对，见 oidc-provider lib/models/client.js）；
 * - upsert：写入 oauth_applications（DCR 场景；V1 由 domain/clients.ts 注册）；
 * - destroy：软删除（status=revoked），保持审计链。
 */
import type { SqlExecutor } from '../../db/types.js'
import {
  insertApplication,
  updateApplication,
  findApplicationByClientId,
  replaceRedirectUris,
  upsertApplicationScope,
  listApprovedScopes,
  type OAuthApplicationRow,
} from '../../db/repos/clients.repo.js'
import { decryptClientSecret, encryptClientSecret, isKekConfigured } from '../../security/client-secret.js'
import { newPrefixedRandomId, newRandomSecret } from '../../security/random.js'
import { newUuidV7 } from '../../domain/ids.js'

export interface ClientLoaderDeps {
  sql: SqlExecutor
  /** IDENTITY_CLIENT_SECRET_KEK */
  clientSecretKek: string | undefined
}

export interface ClientLoader {
  find(clientId: string): Promise<Record<string, unknown> | undefined>
  upsert(metadata: Record<string, unknown>, opts: { expiresIn?: number }): Promise<void>
  destroy(clientId: string): Promise<void>
}

export function createClientLoader(deps: ClientLoaderDeps): ClientLoader {
  return {
    async find(clientId) {
      // 只允许 active 客户端被 provider 加载
      const app = await findApplicationByClientId(deps.sql, clientId)
      if (!app || app.status !== 'active') {
        return undefined
      }
      return assembleMetadata(deps, app)
    },

    async upsert(metadata, _opts) {
      await storeMetadata(deps, metadata)
    },

    async destroy(clientId) {
      await updateApplication(deps.sql, clientId, { status: 'revoked' })
    },
  }
}

function epochSecondsOrZero(date: Date | null | undefined): number {
  if (!date) {
    return 0 // 0 = 永不过期（oidc-provider 语义）
  }
  return Math.max(0, Math.floor(date.getTime() / 1000))
}

/** 组装 oidc-provider Client metadata（含解密后的 client_secret） */
async function assembleMetadata(
  deps: ClientLoaderDeps,
  app: OAuthApplicationRow,
): Promise<Record<string, unknown>> {
  const [redirectUris, approvedScopes] = await Promise.all([
    (async () => {
      const result = await deps.sql.query<{ redirect_uri: string }>(
        'SELECT redirect_uri FROM oauth_redirect_uris WHERE application_id = $1 ORDER BY created_at',
        [app.id],
      )
      return result.rows.map((r) => r.redirect_uri)
    })(),
    listApprovedScopes(deps.sql, app.id),
  ])

  const metadata: Record<string, unknown> = {
    client_id: app.client_id,
    client_name: app.name,
    client_uri: app.homepage_url ?? undefined,
    policy_uri: app.privacy_policy_url ?? undefined,
    redirect_uris: redirectUris,
    // refresh_token 是授权码流的合法延伸 grant：#620 V1 需要 Refresh rotation/
    // revoke 能力，且 v9 默认 issueRefreshToken 要求 client.grantTypeAllowed
    // ('refresh_token')；实际发放仍受 offline_access scope 批准约束。
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: app.token_endpoint_auth_method,
    subject_type: app.subject_type,
    scope: approvedScopes.join(' '),
    application_type: app.client_type === 'web_confidential' ? 'web' : 'native',
  }

  // confidential client：解密 secret；KEK 缺失/损坏 → fail closed（抛错，不静默降级）
  if (app.client_type === 'web_confidential' && app.client_secret_encrypted) {
    if (!isKekConfigured(deps.clientSecretKek)) {
      throw new Error('[oidc.adapter] IDENTITY_CLIENT_SECRET_KEK 未配置，无法加载 confidential client')
    }
    const plaintext = decryptClientSecret(deps.clientSecretKek, app.client_secret_encrypted)
    metadata.client_secret = plaintext
    metadata.client_secret_expires_at = epochSecondsOrZero(app.client_secret_expires_at)
  }
  return metadata
}

/** 将 oidc metadata 写入 oauth_applications（契约完整性的 upsert 路径） */
async function storeMetadata(deps: ClientLoaderDeps, metadata: Record<string, unknown>): Promise<void> {
  const clientId = typeof metadata.client_id === 'string' ? metadata.client_id : undefined
  const existing = clientId ? await findApplicationByClientId(deps.sql, clientId) : null

  const clientType: 'web_confidential' | 'native_public' = existing
    ? (existing.client_type === 'web_confidential' ? 'web_confidential' : 'native_public')
    : (metadata.token_endpoint_auth_method === 'none' ? 'native_public' : 'web_confidential')

  const rawUris = Array.isArray(metadata.redirect_uris)
    ? metadata.redirect_uris.filter((u): u is string => typeof u === 'string')
    : []
  if (rawUris.length === 0) {
    throw new Error('[oidc.adapter] Client metadata 缺少 redirect_uris')
  }

  const ownerDeveloperId = typeof metadata.owner_developer_id === 'string'
    ? metadata.owner_developer_id
    : existing?.owner_developer_id
  if (!ownerDeveloperId) {
    throw new Error('[oidc.adapter] 新建 Client 必须提供 owner_developer_id（V1 关闭 DCR）')
  }

  const secret = typeof metadata.client_secret === 'string' ? metadata.client_secret : null
  const encrypted = secret ? encryptOrThrow(deps, secret) : null

  if (!existing) {
    const applicationId = newUuidV7()
    await deps.sql.withTransaction(async (tx) => {
      await insertApplication(tx, {
        id: applicationId,
        client_id: clientId ?? newPrefixedRandomId('cli', 16),
        owner_developer_id: ownerDeveloperId,
        name: typeof metadata.client_name === 'string' ? metadata.client_name : 'unnamed client',
        description: typeof metadata.description === 'string' ? metadata.description : null,
        homepage_url: typeof metadata.client_uri === 'string' ? metadata.client_uri : null,
        privacy_policy_url: typeof metadata.policy_uri === 'string' ? metadata.policy_uri : null,
        client_type: clientType,
        status: 'active', // 经 oidc-provider 写入的 client 视为已生效
        token_endpoint_auth_method: metadata.token_endpoint_auth_method === 'none' ? 'none' : 'client_secret_basic',
        client_secret_encrypted: encrypted,
        subject_type: metadata.subject_type === 'public' ? 'public' : 'pairwise',
      })
      await replaceRedirectUris(tx, applicationId, rawUris.map((uri) => ({ uri, kind: 'web_https' })))
      const scopes = typeof metadata.scope === 'string' ? metadata.scope.split(/\s+/) : []
      for (const scope of scopes) {
        if (scope.length > 0) {
          await upsertApplicationScope(tx, applicationId, scope, 'approved')
        }
      }
    })
    return
  }

  // 更新已有应用
  const patch: Record<string, unknown> = {
    name: typeof metadata.client_name === 'string' ? metadata.client_name : existing.name,
    client_secret_encrypted: encrypted !== null ? encrypted : existing.client_secret_encrypted,
  }
  await deps.sql.withTransaction(async (tx) => {
    await updateApplication(tx, existing.client_id, patch)
    await replaceRedirectUris(tx, existing.id, rawUris.map((uri) => ({ uri, kind: 'web_https' })))
  })
}

function encryptOrThrow(deps: ClientLoaderDeps, plaintext: string): string {
  if (!isKekConfigured(deps.clientSecretKek)) {
    throw new Error('[oidc.adapter] IDENTITY_CLIENT_SECRET_KEK 未配置，无法存储 client_secret')
  }
  return encryptClientSecret(deps.clientSecretKek, plaintext)
}
