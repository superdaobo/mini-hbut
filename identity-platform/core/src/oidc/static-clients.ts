/**
 * 首批第一方静态 Client（#620 / #617 Client 类型章节）。
 *
 * 背景：Developer Portal 在登录之前没有自己的 OIDC Client，存在 bootstrap
 * 问题。Core 支持从环境变量预置极少量第一方静态 Client：
 *   - Developer Portal（web_confidential）
 *   - E2E Demo Client（native_public，仅 Preview/Test）
 *
 * 安全约束：
 * - 仅 Preview/Test 启用（IDENTITY_STATIC_CLIENTS_JSON 未配置 → 跳过）；
 *   Production 默认不配置，不引入任何静态凭据；
 * - 数据权威仍是 oauth_applications：静态 Client 通过领域层 createClient
 *   写入 DB（同第三方 Client 完全相同的审核/状态机路径，直接置 active），
 *   之后由 client-loader 动态加载，不绕开 adapter；
 * - 幂等：client_id 已存在 → 跳过（不覆盖线上状态/凭据）；
 * - client_secret 仍走 AES-256-GCM(KEK) 加密入库（绝不落明文）。
 */
import type { SqlExecutor } from '../db/types.js'
import { createClient, setClientStatus, assertValidScopes } from '../domain/clients.js'
import { createUserWithHbutIdentity } from '../domain/users.js'
import { newUuidV7 } from '../domain/ids.js'
import { upsertApplicationScope, findApplicationByClientId } from '../db/repos/clients.repo.js'
import type { RedirectUriKind } from '../db/repos/clients.repo.js'

/** 平台内置 developer 固定 ID（静态 Client 的 owner） */
const PLATFORM_DEVELOPER_ID = 'dev_platform_internal'

export interface StaticClientEntry {
  client_id: string
  client_type: 'web_confidential' | 'native_public'
  /** web_confidential 必填；native_public 忽略 */
  client_secret?: string
  redirect_uris: string[]
  scope: string[]
  name: string
  description?: string
}

/** 解析并校验 IDENTITY_STATIC_CLIENTS_JSON（非法配置 fail fast） */
export function parseStaticClientsJson(json: string | undefined): StaticClientEntry[] {
  if (!json || json.trim() === '') {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error(`[oidc.static-clients] IDENTITY_STATIC_CLIENTS_JSON 不是合法 JSON：${(err as Error).message}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error('[oidc.static-clients] IDENTITY_STATIC_CLIENTS_JSON 必须是数组')
  }
  const out: StaticClientEntry[] = []
  for (const entry of parsed) {
    const e = entry as Partial<StaticClientEntry>
    if (typeof e.client_id !== 'string' || e.client_id.length === 0) {
      throw new Error('[oidc.static-clients] 每条记录必须带非空 client_id')
    }
    if (e.client_type !== 'web_confidential' && e.client_type !== 'native_public') {
      throw new Error(`[oidc.static-clients] ${e.client_id} client_type 非法`)
    }
    if (!Array.isArray(e.redirect_uris) || e.redirect_uris.length === 0) {
      throw new Error(`[oidc.static-clients] ${e.client_id} 缺少 redirect_uris`)
    }
    if (!Array.isArray(e.scope) || e.scope.length === 0) {
      throw new Error(`[oidc.static-clients] ${e.client_id} 缺少 scope`)
    }
    assertValidScopes(e.scope)
    const entryOut: StaticClientEntry = {
      client_id: e.client_id,
      client_type: e.client_type,
      redirect_uris: e.redirect_uris,
      scope: e.scope,
      name: typeof e.name === 'string' && e.name.length > 0 ? e.name : e.client_id,
    }
    if (e.client_type === 'web_confidential' && typeof e.client_secret === 'string' && e.client_secret.length >= 16) {
      entryOut.client_secret = e.client_secret
    }
    if (typeof e.description === 'string') {
      entryOut.description = e.description
    }
    out.push(entryOut)
  }
  return out
}

/**
 * 幂等预置静态 Client。
 * 返回：本次新建的 client_id 列表（已存在的不重复处理）。
 */
export async function ensureStaticClients(
  sql: SqlExecutor,
  entries: StaticClientEntry[],
  opts: { clientSecretKek: string | undefined },
): Promise<string[]> {
  if (entries.length === 0) {
    return []
  }
  const created: string[] = []

  // 平台内置 owner（首次使用时创建一次；固定 developer id 保证幂等）
  const developerRow = await sql.query<{ id: string }>(
    'SELECT id FROM developers WHERE id = $1',
    [PLATFORM_DEVELOPER_ID],
  )
  if (developerRow.rows.length === 0) {
    // 平台 developer 需要一个绑定的 user；用固定 identity 快照创建
    const { userId } = await createUserWithHbutIdentity(sql, {
      studentId: 'platform-internal',
      studentName: 'Mini-HBUT 平台',
    })
    // 直接插入 developers（developers 表无独立 repo；内联保持单一写入点）
    await sql.query(
      `INSERT INTO developers (id, user_id, display_name, contact_email)
       VALUES ($1, $2, $3, $4)`,
      [PLATFORM_DEVELOPER_ID, userId, 'Mini-HBUT 平台', null],
    )
  }

  for (const entry of entries) {
    const existing = await findApplicationByClientId(sql, entry.client_id)
    if (existing) {
      // 幂等：已注册则不覆盖（保留线上状态/凭据）
      continue
    }
    const result = await createClient(
      sql,
      {
        developerId: PLATFORM_DEVELOPER_ID,
        name: entry.name,
        description: entry.description,
        clientType: entry.client_type,
        redirectUris: entry.redirect_uris.map((uri) => ({ uri, kind: redirectKindFor(uri) })),
        requestedScopes: entry.scope,
        // 静态 Client 用配置的固定 client_id（web 侧 OIDC 配置依赖该值）
        clientId: entry.client_id,
      },
      { clientSecretKek: opts.clientSecretKek },
    )
    // 管理员路径：直接放行为 active + scopes approved（第一方内部 Client）
    for (const scope of entry.scope) {
      await upsertApplicationScope(sql, result.applicationId, scope, 'approved')
    }
    await setClientStatus(sql, entry.client_id, 'active')
    // 静态 client_secret 仅在 web_confidential 且显式提供时轮换为指定值
    if (entry.client_type === 'web_confidential' && entry.client_secret) {
      await rotateToSecret(sql, entry.client_id, entry.client_secret, opts.clientSecretKek)
    }
    created.push(entry.client_id)
  }
  return created
}

/** 把静态 Client 的 secret 固定为配置值（加密入库；依赖 rotateClientSecret 的覆盖语义） */
async function rotateToSecret(
  sql: SqlExecutor,
  clientId: string,
  secret: string,
  kek: string | undefined,
): Promise<void> {
  // 复用领域层的 secret 加密（security/client-secret.ts），不重复实现
  const { encryptClientSecret } = await import('../security/client-secret.js')
  const { updateApplication } = await import('../db/repos/clients.repo.js')
  await updateApplication(sql, clientId, {
    client_secret_encrypted: encryptClientSecret(kek, secret),
  })
}

/** 静态 Client 配置来源（app 组装时读取环境变量） */
export function loadStaticClientsFromEnv(env: Record<string, string | undefined> = process.env): StaticClientEntry[] {
  return parseStaticClientsJson(env.IDENTITY_STATIC_CLIENTS_JSON)
}

/** 按 URI 形态推断注册 kind（native loopback 用 RFC 8252 规则） */
function redirectKindFor(uri: string): RedirectUriKind {
  if (/^http:\/\/(127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/.*)?$/.test(uri)) {
    return 'native_loopback'
  }
  return 'web_https'
}
