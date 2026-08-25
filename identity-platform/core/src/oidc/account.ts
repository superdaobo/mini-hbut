/**
 * findAccount 与 Claims 映射（#620 / #617 信任边界 8-10；#700 数据域扩展）。
 *
 * - accountId = 内部 user id（UUIDv7），绝不用学号；
 * - 学号只作为 linked_identity.subject 存储，(provider, subject) UNIQUE；
 * - 对外 sub 由 pairwiseIdentifier 派生（src/domain/subjects.ts），本文件不派生；
 * - scope → claims 映射：
 *     openid                → sub（provider 自动附加，pairwise 派生）
 *     profile               → name / preferred_username
 *     student.identity      → hbut_student_id / hbut_student_name /
 *                             hbut_verification_method / hbut_verified_at
 *     student.grades.read   → hbut_grades（#700，仅 userinfo）
 *     student.timetable.read→ hbut_timetable（#700，仅 userinfo）
 * - ID Token 只保留登录所需最小 claim：student.identity 类 claim 与数据域
 *   快照 claim 都只在 use === 'userinfo' 时返回，避免第三方日志/前端无意
 *   长期保存敏感学生资料（#617 信任边界 10）；快照数据绝不能进 id_token。
 *
 * #700 快照注入机制：
 * - userinfo 请求中 oidc-provider 以 findAccount(ctx, sub) 加载账户，
 *   此处闭包捕获 ctx；claims 回调执行时从 ctx.oidc.client.clientId 取得
 *   发起请求的 client（loadAccessTokenClient 先于账户加载完成）；
 * - 按 (user_id, client_id) 强绑定查询最新未过期快照 → 解密 → 注入，
 *   防止 A 应用读到 B 应用上传的数据（串读）；
 * - 无有效快照/解密失败 → 对应 claim 缺席，userinfo 绝不因可选数据失败；
 * - 读取路径顺带惰性删除该用户已过期快照行（免定时任务）。
 *
 * - 用户 suspended/不存在 → 返回 undefined（provider 视为不可用账户，
 *   授权/刷新均失败）。
 */
import type { SqlExecutor } from '../db/types.js'
import {
  findUserById,
  findIdentityByUserId,
  type LinkedIdentityRow,
} from '../db/repos/users.repo.js'
import {
  deleteExpiredForUser,
  findActiveByUserAndClient,
} from '../db/repos/data-snapshots.repo.js'
import { writeAuditEvent } from '../observability/audit/index.js'
import { decryptSnapshot } from '../security/snapshot-crypto.js'
import {
  DATA_SCOPES,
  DATA_SCOPE_TO_CLAIM,
  buildClaimValue,
  type DataScope,
  type SnapshotPayload,
} from '../domain/data-scopes.js'

export type ClaimsUse = 'userinfo' | 'id_token'

export interface AccountObject {
  accountId: string
  claims(use: ClaimsUse, scope: Set<string>, claims: Record<string, unknown>, rejected: string[]): Promise<Record<string, unknown>>
}

/**
 * 构造 findAccount 回调（provider 配置 findAccount: accountFinder({ sql })）。
 * sub 参数是内部 user id（accountId），不能当作学号查询。
 * ctx 由闭包捕获：userinfo/token 各请求独立调用本回调，ctx 即当次请求上下文。
 */
export function accountFinder(deps: { sql: SqlExecutor }): (ctx: unknown, sub: string) => Promise<AccountObject | undefined> {
  return async (ctx: unknown, sub: string): Promise<AccountObject | undefined> => {
    const user = await findUserById(deps.sql, sub)
    if (!user || user.status !== 'active') {
      // 不存在或 suspended/disabled：provider 视为找不到账户（安全失败）
      return undefined
    }
    const identity = await findIdentityByUserId(deps.sql, sub)
    return {
      accountId: sub,
      claims: async (use, scope, _claims, _rejected) => {
        const out = buildClaims(identity, use)
        if (use === 'userinfo') {
          // #700：数据域快照 claim 只在 UserInfo 注入（绝不经 ID Token 泄露）
          await injectSnapshotClaims(deps.sql, sub, ctx, scope, out)
        }
        return out
      },
    }
  }
}

/** profile 显示名：优先姓名快照；无绑定身份时缺省（不返回字段） */
function buildClaims(identity: LinkedIdentityRow | null, use: ClaimsUse): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!identity) {
    return out
  }
  // profile scope：name / preferred_username（已定义并经 consent 的字段）
  if (identity.student_name_snapshot) {
    out.name = identity.student_name_snapshot
    out.preferred_username = identity.student_name_snapshot
  }
  // student.identity scope：仅 UserInfo 返回（ID Token 最小化）
  if (use === 'userinfo') {
    out.hbut_student_id = identity.subject
    if (identity.student_name_snapshot) {
      out.hbut_student_name = identity.student_name_snapshot
    }
    out.hbut_verification_method = identity.verification_method
    out.hbut_verified_at = identity.verified_at.toISOString()
  }
  return out
}

/**
 * #700：按 (user_id, client_id) 强绑定注入数据域快照 claims。
 * - 只处理本次 access token 已授权 ∧ 属于数据域的 scope；
 * - 快照必须同时覆盖该 scope（snapshot.scope_set）才注入对应字段；
 * - 任何异常（解密失败/格式非法）→ claim 缺席 + error 审计，绝不抛出。
 */
async function injectSnapshotClaims(
  sql: SqlExecutor,
  userId: string,
  ctx: unknown,
  scope: Iterable<unknown>,
  out: Record<string, unknown>,
): Promise<void> {
  const granted = normalizeScope(scope).filter((s): s is DataScope =>
    (DATA_SCOPES as readonly string[]).includes(s),
  )
  if (granted.length === 0) {
    return
  }
  const clientId = extractClientId(ctx)
  if (!clientId) {
    // 无法确定 client（非 userinfo 形态的装配）：安全缺省，绝不注入
    return
  }
  try {
    // 惰性清理：顺手删掉该用户全部已过期快照（读取路径兜底，免定时任务）
    await deleteExpiredForUser(sql, userId)
    const snapshot = await findActiveByUserAndClient(sql, userId, clientId)
    if (!snapshot) {
      // 无有效快照：claim 缺席（契约行为）
      return
    }
    const payload = JSON.parse(decryptSnapshot(snapshot.payload_enc)) as SnapshotPayload
    const snapshotScopes = Array.isArray(snapshot.scope_set)
      ? snapshot.scope_set.filter((s): s is string => typeof s === 'string')
      : []
    const injected: string[] = []
    for (const ds of granted) {
      if (!snapshotScopes.includes(ds)) {
        continue
      }
      if (ds === 'student.grades.read' && payload.grades !== undefined) {
        out[DATA_SCOPE_TO_CLAIM[ds]] = buildClaimValue(payload.grades, payload.fetched_at)
        injected.push(DATA_SCOPE_TO_CLAIM[ds])
      }
      if (ds === 'student.timetable.read' && payload.timetable !== undefined) {
        out[DATA_SCOPE_TO_CLAIM[ds]] = buildClaimValue(payload.timetable, payload.fetched_at)
        injected.push(DATA_SCOPE_TO_CLAIM[ds])
      }
    }
    // 审计快照读取（不含任何业务数据明文）
    await writeAuditEvent(sql, {
      eventType: 'snapshot_read',
      actorType: 'client',
      actorId: clientId,
      targetType: 'data_snapshot',
      targetId: snapshot.id,
      result: 'success',
      metadata: { injected_claims: injected },
    })
  } catch {
    // 密文损坏 / KEK 不符 / 格式非法：fail closed 为「缺席」而非报错，
    // userinfo 响应绝不因可选增强数据而失败；留 error 审计供排查。
    try {
      await writeAuditEvent(sql, {
        eventType: 'snapshot_read',
        actorType: 'client',
        actorId: clientId,
        targetType: 'data_snapshot',
        targetId: null,
        result: 'error',
        metadata: {},
      })
    } catch {
      // 审计失败也不影响主流程
    }
  }
}

/** scope 参数防御性归一化（Set / 数组 / 空白分隔字符串均接受） */
function normalizeScope(scope: Iterable<unknown>): string[] {
  if (typeof scope === 'string') {
    return scope.split(/\s+/).filter(Boolean)
  }
  return [...scope].filter((s): s is string => typeof s === 'string')
}

/** 从请求上下文提取发起 userinfo 请求的 client_id（服务端权威值，非客户端传参） */
function extractClientId(ctx: unknown): string | null {
  if (!ctx || typeof ctx !== 'object') {
    return null
  }
  const clientId = (ctx as { oidc?: { client?: { clientId?: unknown } } }).oidc?.client?.clientId
  return typeof clientId === 'string' && clientId.length > 0 ? clientId : null
}
