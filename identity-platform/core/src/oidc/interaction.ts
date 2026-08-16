/**
 * Custom Interaction 桥（#620 核心 / #617 自定义 interaction 章节）。
 *
 * 流程：
 *   /oauth/authorize → provider 校验 client/redirect/scope/PKCE
 *     → interactionPolicy 命中（V1 每次交互都必须 App Approval，无静默同意）
 *     → provider 创建 Interaction 记录并调用 interactions.url
 *     → 本模块创建业务 AuthRequest（#619 领域），302 到 auth.* 的 r/<request_id> 页面
 *     → App 完成 approve（#622 设备端点）
 *     → auth.* 页面调 Core POST /api/v1/requests/:id/resume（#630 合同）
 *     → resumeAuthRequest() 校验状态后把 login/consent result 写入
 *       provider Interaction 记录（等价 interactionFinished 的 result 语义）
 *     → 返回 redirect_to（provider 生成的 /oauth/authorize/:uid resume 链接）
 *     → 浏览器带 resume cookie 访问 redirect_to → provider 发 Authorization Code
 *
 * 安全要点：
 * - 禁止在 approve API 伪造 authorization code：code 完全由 oidc-provider 生成；
 * - resume 信任链 = handoff secret（#617 边界 12）+ AuthRequest 状态机
 *   （APPROVED + client active + scope 快照一致）+ interaction uid 匹配；
 * - 幂等：重复 resume 返回 already_resumed 与同一 redirect_to；
 * - 未 APPROVED 直接 hit resume → 409 not_approved（不可绕过）。
 */
import type Provider from 'oidc-provider'
import type { InteractionDetails } from 'oidc-provider'
import type { SqlExecutor } from '../db/types.js'
import { parseJsonb } from '../db/types.js'
import {
  findAuthRequestById,
  type AuthRequestRow,
} from '../db/repos/auth-requests.repo.js'
import {
  advanceAuthRequestProtocol,
  createAuthRequest,
  expireAuthRequest,
  verifyHandoffSecret,
  verifyScopeHash,
  type CreateAuthRequestResult,
} from '../domain/auth-requests/service.js'
import { getActiveClient } from '../domain/clients.js'
import { upsertConsent } from '../db/repos/clients.repo.js'
import {
  AuthRequestExpiredError,
  AuthRequestInvalidTransitionError,
  AuthRequestNotFoundError,
} from '../domain/errors.js'
import type { IdentityProviderDeps } from './provider.js'
import { redactSensitiveText } from '../security/redact.js'

/** amr：App Approval 链（#620 推荐：设备密钥签名的 App 确认） */
export const APPROVAL_AMR = ['mini_hbut_app', 'device_key']

export interface InteractionDeps {
  sql: SqlExecutor
  /** IDENTITY_HANDOFF_HMAC_KEY（AuthRequest 创建/校验） */
  handoffHmacKey: string | undefined
  /** auth.* 站点 base URL（interactions.url 重定向目标） */
  authWebBaseUrl: string
  /** AuthRequest TTL（秒）；与 Interaction TTL 保持一致 */
  authRequestTtlSeconds?: number
}

/** 按 interaction_uid 查询 AuthRequest（interaction_uid UNIQUE） */
async function findAuthRequestByInteractionUid(
  sql: SqlExecutor,
  interactionUid: string,
): Promise<AuthRequestRow | null> {
  const result = await sql.query<AuthRequestRow>(
    'SELECT * FROM auth_requests WHERE interaction_uid = $1',
    [interactionUid],
  )
  const row = result.rows[0]
  if (!row) {
    return null
  }
  // 双后端统一：pg-mem 返回数组对象，真 PG 返回 JSON 字符串（#619 parseJsonb）
  row.requested_scopes = parseJsonb<string[]>(row.requested_scopes)
  return row
}

/**
 * interactions.url：interaction 创建后调用。
 * - 创建业务 AuthRequest（幂等：同 uid 已存在则复用）；
 * - 返回 auth.* 页面地址，handoff secret 放 URL fragment
 *   （fragment 不进服务器日志/Referer，#617 边界 12 的传递方式）。
 */
export function createInteractionUrl(deps: InteractionDeps): (ctx: unknown, interaction: InteractionDetails) => Promise<string> {
  return async (_ctx, interaction) => {
    const clientId = interaction.params.client_id
    const scope = interaction.params.scope
    if (!clientId || !scope) {
      // provider 校验后不可能走到这里；防御性 fail closed
      throw new Error('[oidc.interaction] interaction 缺少 client_id/scope')
    }
    const existing = await findAuthRequestByInteractionUid(deps.sql, interaction.uid)
    if (existing) {
      // 同 uid 重入（异常路径）：无法恢复 handoff secret，返回无 fragment 页面
      return `${deps.authWebBaseUrl}/r/${existing.id}`
    }
    const created: CreateAuthRequestResult = await createAuthRequest(deps.sql, {
      interactionUid: interaction.uid,
      clientId,
      requestedScopes: scope.split(/\s+/).filter(Boolean),
      handoffHmacKey: deps.handoffHmacKey,
      ttlSeconds: deps.authRequestTtlSeconds,
    })
    return `${deps.authWebBaseUrl}/r/${created.requestId}#h=${created.handoffSecret}`
  }
}

/**
 * custom interaction policy：V1 安全优先（#617 信任边界 16）——
 * 每次授权都必须经过 App 的显式批准，禁止浏览器静默自动同意。
 *
 * 实现：清空默认 login/consent prompts，替换为单一 consent prompt
 * （App Approval 即 OIDC 语义的 consent），其 check 在【没有 interaction
 * result】时恒要求交互：
 * - 首次访问 authorize：无 result → 302 auth.*；
 * - resume 后（result 已写入 Interaction 记录）：check 放行 → 发 code；
 * - prompt=none：无法静默完成 → 标准 interaction_required（#617 预期行为）。
 *
 * 命名说明：prompt 名为 'consent' 而不是 'approval'，因为：
 * 1) v9 的 configuration.prompts 集合 = {'none'} + requestable prompt 名，
 *    client 发 prompt=consent 必须在该集合内才合法（check_prompt.js）；
 * 2) v9 按 OIDC Core 要求：offline_access 只在请求含 prompt=consent 时
 *    保留（check_scope.js 静默移除），而 #620 的 refresh token 依赖
 *    offline_access。我们的 App Approval 本身就是 consent 语义。
 */
export function buildApprovalPolicy(
  interactionPolicyModule: typeof import('oidc-provider').interactionPolicy,
): unknown {
  const base = interactionPolicyModule.base()
  base.clear()
  const { Prompt } = interactionPolicyModule
  const check = new interactionPolicyModule.Check(
    'app_approval_required',
    'Mini-HBUT App 显式批准是必须的（V1 无静默同意）',
    'interaction_required',
    (ctx: Record<string, unknown>) => {
      const oidc = ctx.oidc as { result?: { login?: unknown } }
      // result 已由 resume 写入（含 login）→ 本次授权请求放行。
      // 注意：REQUEST_PROMPT / NO_NEED_TO_PROMPT 是 Check 的【静态属性】
      //（interaction_policy/check.js：`Check.REQUEST_PROMPT = true`），
      // 不能在实例上访问（实例上是 undefined，会导致恒为 falsy 的 bug）。
      return oidc.result?.login
        ? interactionPolicyModule.Check.NO_NEED_TO_PROMPT
        : interactionPolicyModule.Check.REQUEST_PROMPT
    },
    () => ({ interaction: 'app_approval' }),
  )
  base.add(new Prompt({ name: 'consent', requestable: true }, check))
  return base
}

/** resume 结果（POST /api/v1/requests/:id/resume 响应体，对齐 #630） */
export interface ResumeResult {
  status: 'approved' | 'already_resumed'
  redirect_to?: string
}

export type ResumeErrorCode =
  | 'invalid_handoff' | 'not_found' | 'expired'
  | 'client_unavailable' | 'not_approved' | 'invalid_request'

export class ResumeError extends Error {
  readonly status: number
  readonly code: ResumeErrorCode

  constructor(status: number, code: ResumeErrorCode, message: string) {
    super(message)
    this.name = 'ResumeError'
    this.status = status
    this.code = code
  }
}

/** 幂等成功（interaction 记录仍可查）时返回既有 redirect_to */
async function alreadyResumedRedirect(
  provider: Provider,
  interactionUid: string,
): Promise<string | undefined> {
  const interaction = await provider.Interaction.find(interactionUid)
  if (!interaction?.returnTo) {
    // interaction 已被浏览器 resume 消费（destroy）→ 无第二份回调地址
    return undefined
  }
  return interaction.returnTo
}

/**
 * 核心：POST /api/v1/requests/:id/resume 的业务实现。
 *
 * 校验链（顺序即错误码优先级，#630 合同）：
 *   requestId 不存在            → 404 not_found
 *   handoff secret 不匹配       → 401 invalid_handoff
 *   AuthRequest 已过期          → 410 expired（懒迁移 EXPIRED）
 *   状态非 APPROVED（含 DENIED 等）→ 409 not_approved
 *   client 非 active            → 422 client_unavailable
 *   scope 快照 hash 不一致      → 400 invalid_request（防篡改防御）
 *
 * 成功后：
 *   1) APPROVED → INTERACTION_FINISHED（原子条件更新，并发只有一次成功）；
 *   2) 创建 provider Grant（账号 = approved_user_id，scope = 请求快照）；
 *   3) 把 { login: { accountId, ts, amr }, consent: { grantId } } 写入
 *      Interaction 记录（等价 interactionFinished result 语义）；
 *   4) 记录 oauth_consents（管理/审计信息，#617 允许）；
 *   5) 返回 provider 生成的 redirect_to（/oauth/authorize/:uid）。
 *
 * 幂等：状态已推进（INTERACTION_FINISHED/CODE_ISSUED/CONSUMED）→
 * 返回 already_resumed + 同一 redirect_to，不产生第二份授权结果。
 */
export async function resumeAuthRequest(
  deps: { sql: SqlExecutor; provider: Provider; handoffHmacKey: string | undefined },
  input: { requestId: string; handoffSecret: string },
): Promise<ResumeResult> {
  const { sql, provider } = deps

  const request = await findAuthRequestById(sql, input.requestId)
  if (!request) {
    throw new ResumeError(404, 'not_found', '认证请求不存在')
  }

  // handoff secret 校验（HMAC 比对，DB 只存 hash）
  if (!verifyHandoffSecret({
    handoffHmacKey: deps.handoffHmacKey,
    handoffSecret: input.handoffSecret,
    request,
  })) {
    throw new ResumeError(401, 'invalid_handoff', 'handoff secret 无效')
  }

  // 过期（懒迁移 EXPIRED，#619 contract §1.2）
  if (request.expires_at.getTime() <= Date.now()) {
    await markExpired(sql, input.requestId)
    throw new ResumeError(410, 'expired', '认证请求已过期')
  }

  // 幂等分支：协议已推进过（resume 已完成/浏览器已拿 code）
  if (['INTERACTION_FINISHED', 'CODE_ISSUED', 'CONSUMED'].includes(request.status)) {
    return {
      status: 'already_resumed',
      redirect_to: await alreadyResumedRedirect(provider, request.interaction_uid),
    }
  }

  if (request.status !== 'APPROVED') {
    throw new ResumeError(409, 'not_approved', '认证请求尚未被批准或已被拒绝')
  }

  // client 必须仍然 active（suspended/revoked 后不得继续 authorize）
  const client = await getActiveClient(sql, request.client_id)
  if (!client) {
    throw new ResumeError(422, 'client_unavailable', '应用当前不可用')
  }

  // scope 快照一致性（防御性校验；hash 不符视为请求被篡改）
  if (!verifyScopeHash(request)) {
    throw new ResumeError(400, 'invalid_request', 'scope 快照校验失败')
  }

  const approvedUserId = request.approved_user_id
  if (!approvedUserId) {
    // APPROVED 但无 approved_user_id：状态机不变量被破坏，fail closed
    throw new ResumeError(500, 'invalid_request', '批准记录不完整')
  }

  // interaction 必须仍然有效（TTL 与 AuthRequest 一致；过期 = 无法 resume）
  const interaction = await provider.Interaction.find(request.interaction_uid)
  if (!interaction) {
    throw new ResumeError(410, 'expired', '交互会话已过期')
  }

  // 防混淆（#620 Interaction 矩阵）：AuthRequest.interaction_uid 指向的
  // Interaction 必须属于同一个 client。若 attacker 把 AuthRequest 指向
  // 另一个 client 的 Interaction（例如浏览器同时发起两次 authorize），
  // 该 Interaction 的 returnTo/params 属于其他 client → 必须拒绝，
  // 否则 resume 会把 login/consent 写入错误交互，导致 code 归属错乱。
  if (interaction.params.client_id !== request.client_id) {
    throw new ResumeError(400, 'invalid_request', '交互会话与认证请求的 client 不匹配')
  }

  // 1) 状态推进（原子条件更新）：并发 resume 只有一个能成功
  try {
    await advanceAuthRequestProtocol(sql, input.requestId, 'INTERACTION_FINISHED')
  } catch (err) {
    if (err instanceof AuthRequestInvalidTransitionError) {
      // 并发竞态：其他调用已推进 → 幂等返回
      const current = await findAuthRequestById(sql, input.requestId)
      if (current && ['INTERACTION_FINISHED', 'CODE_ISSUED', 'CONSUMED'].includes(current.status)) {
        return {
          status: 'already_resumed',
          redirect_to: await alreadyResumedRedirect(provider, current.interaction_uid),
        }
      }
    }
    throw err
  }

  // 2) 创建/持久化 Grant（oidc-provider 管理；授权码绑定 grantId）
  const scopes = (request.requested_scopes as string[]).join(' ')
  const grant = new provider.Grant({ accountId: approvedUserId, clientId: request.client_id })
  grant.addOIDCScope(scopes)
  const grantId = await grant.save()

  // 3) 写入 interaction result（等价 interactionFinished result 语义：
  //    { ...lastSubmission, login, consent }；ts = App Approval 完成时间）
  const approvedAt = request.approved_at ?? new Date()
  interaction.result = {
    ...(interaction.lastSubmission ?? {}),
    login: {
      accountId: approvedUserId,
      ts: Math.floor(approvedAt.getTime() / 1000),
      amr: APPROVAL_AMR,
    },
    consent: { grantId },
  }
  await interaction.persist()

  // 4) 审计/管理信息：历史 consent 记录（不参与授权决策）
  await upsertConsent(sql, {
    userId: approvedUserId,
    applicationId: client.id,
    grantedScopes: request.requested_scopes as string[],
  })

  return { status: 'approved', redirect_to: interaction.returnTo }
}

/** 懒迁移到 EXPIRED（领域层 expireAuthRequest：非终态 → EXPIRED） */
async function markExpired(sql: SqlExecutor, requestId: string): Promise<void> {
  try {
    await expireAuthRequest(sql, requestId)
  } catch {
    // 终态或并发竞态下迁移失败可忽略：调用方已抛 ResumeError(410)
  }
}

/**
 * 协议观测（状态机 CODE_ISSUED/CONSUMED 推进，#619 注释：观测点）。
 *
 * - authorization.success：浏览器 resume 后 provider 生成 code
 *   （ctx.oidc.entities.Interaction.uid 关联 AuthRequest）→ CODE_ISSUED；
 * - grant.success（grant_type=authorization_code）：code 兑换
 *   → CONSUMED。code 本身不带 interaction uid，这里通过进程内
 *   sessionUid → interactionUid 映射尽力关联（观测性质，非安全边界；
 *   serverless 多实例下可能缺失，缺失时仅跳过推进）。
 */
export function registerStateObserver(
  provider: Provider,
  deps: { sql: SqlExecutor },
): void {
  const observer = new InteractionStateObserver(deps.sql)
  provider.on('authorization.success', (ctx: unknown, _out: unknown) => {
    const oidc = (ctx as { oidc?: { entities?: { Interaction?: { uid?: string } }; session?: { uid?: string } } }).oidc
    const uid = oidc?.entities?.Interaction?.uid
    if (!uid) {
      return
    }
    void observer.onCodeIssued(uid)
    const sessionUid = oidc.session?.uid
    if (sessionUid) {
      observer.rememberSession(sessionUid, uid)
    }
  })
  provider.on('grant.success', (ctx: unknown) => {
    const oidc = (ctx as {
      oidc?: {
        params?: { grant_type?: string }
        session?: { uid?: string }
      }
    }).oidc
    if (oidc?.params?.grant_type !== 'authorization_code') {
      return
    }
    const sessionUid = oidc.session?.uid
    const interactionUid = sessionUid ? observer.lookupSession(sessionUid) : undefined
    if (interactionUid) {
      void observer.onCodeConsumed(interactionUid)
    }
  })
}

class InteractionStateObserver {
  private readonly sql: SqlExecutor
  /** sessionUid → interactionUid（观测映射，非安全边界） */
  private readonly sessionMap = new Map<string, { interactionUid: string; at: number }>()

  constructor(sql: SqlExecutor) {
    this.sql = sql
  }

  rememberSession(sessionUid: string, interactionUid: string): void {
    // 惰性清理过期条目，避免无界增长
    const now = Date.now()
    for (const [k, v] of this.sessionMap) {
      if (now - v.at > 10 * 60 * 1000) {
        this.sessionMap.delete(k)
      }
    }
    this.sessionMap.set(sessionUid, { interactionUid, at: now })
  }

  lookupSession(sessionUid: string): string | undefined {
    return this.sessionMap.get(sessionUid)?.interactionUid
  }

  async onCodeIssued(interactionUid: string): Promise<void> {
    await this.advance(interactionUid, 'CODE_ISSUED')
  }

  async onCodeConsumed(interactionUid: string): Promise<void> {
    await this.advance(interactionUid, 'CONSUMED')
  }

  private async advance(interactionUid: string, to: 'CODE_ISSUED' | 'CONSUMED'): Promise<void> {
    try {
      const request = await findAuthRequestByInteractionUid(this.sql, interactionUid)
      if (!request) {
        return
      }
      // 只允许按状态机推进；失败（状态不符）忽略——观测点不强求
      if (to === 'CODE_ISSUED' && request.status === 'INTERACTION_FINISHED') {
        await advanceAuthRequestProtocol(this.sql, request.id, 'CODE_ISSUED')
      } else if (to === 'CONSUMED' && request.status === 'CODE_ISSUED') {
        await advanceAuthRequestProtocol(this.sql, request.id, 'CONSUMED')
      }
    } catch (err) {
      if (
        !(err instanceof AuthRequestNotFoundError)
        && !(err instanceof AuthRequestExpiredError)
        && !(err instanceof AuthRequestInvalidTransitionError)
      ) {
        // 观测失败只记录，不影响协议主流程；禁止把原始 Error/SQL 上下文直接写日志。
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[oidc.interaction] 状态观测推进失败: ${redactSensitiveText(message)}`)
      }
    }
  }
}
