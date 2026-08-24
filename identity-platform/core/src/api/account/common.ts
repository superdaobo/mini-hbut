/**
 * Account API 公共层（#688 账户级 API Key）。
 *
 * 与 developer API（#624）的行为镜像约定：
 * - ensureDeveloper / findOwnedApp / toSummary / toDetail 与
 *   src/api/developer/index.ts 保持同款业务语义（那边未导出，此处镜像实现，
 *   修改时两边必须同步）；差异仅在身份来源：developer API 来自
 *   x-developer-subject（BFF 会话），account API 来自 Bearer Key 解析的 user_id。
 * - 错误体统一平铺 `{ error: <code>, message? }`（与 developer API 一致，
 *   便于 BFF 复用既有错误码映射）；认证失败 code 为契约大写码（API_KEY_*）。
 */
import type { RouterContext as KoaRouterContext } from '@koa/router'
import type { SqlExecutor, QueryResultRow } from '../../db/types.js'
import { DomainError } from '../../domain/errors.js'
import { newUuidV7 } from '../../domain/ids.js'
import {
  listRedirectUris,
  type OAuthApplicationRow,
} from '../../db/repos/clients.repo.js'

export const ACCOUNT_API_PREFIX = '/api/v1/account'

/** ctx.state 上由 Bearer 认证中间件写入的凭据信息（绝不含 secret/hash） */
export interface AccountKeyState {
  id: string
  name: string
  prefix: string
  scopes: string[]
  createdAt: Date
}

/** 从 ctx.state 读取认证结果（中间件先行保证存在；防御式兜底抛 401） */
export function requireAccountAuth(ctx: KoaRouterContext): { userId: string; key: AccountKeyState } {
  const userId = ctx.state.accountUserId as string | undefined
  const key = ctx.state.accountKey as AccountKeyState | undefined
  if (!userId || !key) {
    throw new DomainError('API_KEY_INVALID', 'API Key 无效', 401)
  }
  return { userId, key }
}

/** 业务错误（沿用 developer API 错误码风格；DomainError 子类，中文 message） */
export class AccountApiError extends DomainError {
  constructor(code: 'invalid_request' | 'invalid_state' | 'not_found' | 'forbidden', message?: string) {
    super(
      code,
      message ??
        ({
          invalid_request: '请求参数不合法',
          invalid_state: '当前状态不允许该操作',
          not_found: '资源不存在',
          forbidden: '没有权限执行该操作',
        })[code],
      code === 'invalid_request' ? 400 : code === 'not_found' ? 404 : code === 'forbidden' ? 403 : 409,
    )
    this.name = 'AccountApiError'
  }
}

/**
 * 统一错误响应：平铺 `{ error, message }`；未知错误 500 且不回显细节。
 * ctx 用最小结构类型：同时兼容路由 handler（RouterContext）与
 * 认证中间件自答场景（koa Middleware 的 ParameterizedContext）。
 */
export function respondAccountError(
  ctx: { status: number; set(name: string, value: string): void; body?: unknown },
  err: unknown,
): void {
  if (err instanceof DomainError) {
    ctx.status = err.status
    ctx.set('Cache-Control', 'no-store')
    ctx.body = { error: err.code, message: err.message }
    return
  }
  ctx.status = 500
  ctx.set('Cache-Control', 'no-store')
  ctx.body = { error: 'internal' }
}

// ---------------------------------------------------------------------------
// developer 身份解析（与 src/api/developer/index.ts 镜像）
// ---------------------------------------------------------------------------

interface DeveloperRow extends QueryResultRow {
  id: string
  display_name: string
  status: string
  created_at: string
}

/** 按 user_id 查 developer（不存在返回 null） */
export async function findDeveloperByUserId(
  sql: SqlExecutor,
  userId: string,
): Promise<DeveloperRow | null> {
  const result = await sql.query<DeveloperRow>(
    'SELECT id, display_name, status, created_at FROM developers WHERE user_id = $1',
    [userId],
  )
  return result.rows[0] ?? null
}

/**
 * 按 user_id 幂等建档（ensureDeveloper 同款语义：首次访问自动创建 dev_ 前缀记录）。
 * 应用归属依赖 developers.id（oauth_applications.owner_developer_id），
 * 因此即使只走 API Key 的 Agent 也需要一条 developer 记录。
 */
export async function ensureDeveloperForUser(
  sql: SqlExecutor,
  userId: string,
  displayName: string,
): Promise<DeveloperRow> {
  const existing = await findDeveloperByUserId(sql, userId)
  if (existing) {
    return existing
  }
  const id = `dev_${newUuidV7()}`
  await sql.query(
    `INSERT INTO developers (id, user_id, display_name, status)
     VALUES ($1, $2, $3, 'active')`,
    [id, userId, displayName],
  )
  return { id, display_name: displayName, status: 'active', created_at: new Date().toISOString() }
}

/** 解析 Bearer 身份 → developer 记录（account 端点公共前置） */
export async function resolveAccountDeveloper(
  sql: SqlExecutor,
  userId: string,
): Promise<DeveloperRow> {
  const dev = await ensureDeveloperForUser(sql, userId, '开发者')
  if (dev.status !== 'active') {
    throw new AccountApiError('forbidden')
  }
  return dev
}

// ---------------------------------------------------------------------------
// 应用 DTO（toSummary / toDetail / findOwnedApp，与 developer API 镜像）
// ---------------------------------------------------------------------------

/** 查本人应用（owner 过滤；非本人 → null，不泄露存在性） */
export async function findOwnedApp(
  sql: SqlExecutor,
  developerId: string,
  appId: string,
): Promise<OAuthApplicationRow | null> {
  const result = await sql.query<OAuthApplicationRow>(
    'SELECT * FROM oauth_applications WHERE id = $1 AND owner_developer_id = $2',
    [appId, developerId],
  )
  return result.rows[0] ?? null
}

/** 应用行 → 摘要 DTO（scopes 由调用方补充） */
export async function toAppSummary(
  sql: SqlExecutor,
  app: OAuthApplicationRow,
): Promise<Record<string, unknown>> {
  await listRedirectUris(sql, app.id)
  return {
    id: app.id,
    client_id: app.client_id,
    name: app.name,
    client_type: app.client_type,
    status: app.status,
    scopes: [],
    updated_at: app.updated_at.toISOString(),
  }
}

/** 应用行 → 详情 DTO（与 developer API toDetail 同款字段） */
export async function toAppDetail(
  sql: SqlExecutor,
  app: OAuthApplicationRow,
): Promise<Record<string, unknown>> {
  const uris = await listRedirectUris(sql, app.id)
  const scopes = await sql.query<{ scope: string; status: string; review_note: string | null }>(
    `SELECT scope, status, review_note FROM oauth_application_scopes WHERE application_id = $1 ORDER BY scope`,
    [app.id],
  )
  return {
    id: app.id,
    client_id: app.client_id,
    name: app.name,
    client_type: app.client_type,
    status: app.status,
    description: app.description ?? null,
    homepage_url: app.homepage_url ?? null,
    privacy_policy_url: app.privacy_policy_url ?? null,
    contact: (app as unknown as { contact?: string | null }).contact ?? null,
    created_at: app.created_at.toISOString(),
    updated_at: app.updated_at.toISOString(),
    submitted_at: app.submitted_at ? app.submitted_at.toISOString() : null,
    activated_at: app.activated_at ? app.activated_at.toISOString() : null,
    scopes: scopes.rows.map((r) => ({
      scope: r.scope,
      status: r.status,
      justification: r.review_note,
    })),
    redirect_uris: uris.map((u) => ({
      id: u.id,
      uri: u.redirect_uri,
      kind: u.kind,
      validation_status: u.kind === 'web_https' ? 'approved' : 'pending',
      created_at: u.created_at.toISOString(),
    })),
    review: {
      status: app.status,
      submitted_at: app.submitted_at ? app.submitted_at.toISOString() : null,
      reviewed_at: app.reviewed_at ? app.reviewed_at.toISOString() : null,
      decision:
        app.status === 'active' || app.status === 'approved'
          ? 'approved'
          : app.status === 'rejected'
            ? 'rejected'
            : null,
      rejection_reason: app.status === 'rejected' ? '应用未通过审核，请根据审核意见修改后重新提交' : null,
      review_notes: null,
      needs_changes: app.status === 'rejected' ? ['请修改后重新提交审核'] : null,
    },
    secret: {
      created_at: app.client_secret_encrypted ? app.created_at.toISOString() : null,
      last_rotated_at: null,
      fingerprint: null,
      last4: null,
    },
    audit: [],
  }
}
