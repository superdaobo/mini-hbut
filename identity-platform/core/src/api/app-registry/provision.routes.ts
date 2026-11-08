/**
 * T12（mini-hbut#1170）应用注册审核 —— provision 端点
 * （POST /api/v1/apps/:appId/reviews/:reviewId/provision）。
 *
 * 定位（与 index.ts 的分工）：
 * - index.ts 持有身份解析中间件（x-admin-subject → user_id 回写）与
 *   submit/list/approve/reject；本文件持有 provision 端点，复用同一套
 *   RBAC（requireAdminRole('identity_reviewer')）+ step-up（x-admin-auth-time
 *   窗口）——provision 写外部目标，属敏感操作，与 approve/reject 同等要求
 *   近期再认证（fail closed）；
 * - 编排层是冻结的 provisioner.ts（runProvisioning）：本层只做
 *   「参数校验 + 调编排层 + 状态落库 + 审计 + 错误映射」，不重写状态机、
 *   安全阀、顺序与回执语义；
 * - 四个写入适配器 / 快照读取器 / 展示元数据 / 数据域全集由部署侧注入
 *   （deps.provisioning，照 service-token.ts 的接口 + 依赖注入风格）；
 *   未配置 → 503 provisioner_not_configured，不得用空实现假装成功。
 *
 * 行为（fail closed，不猜默认值）：
 * - 503 provisioner_not_configured：provisioning 依赖未配置（先于任何 DB 读）；
 * - 404 REVIEW_NOT_FOUND：记录不存在，或不属于路径中的应用（IDOR 语义同
 *   approve/reject）；
 * - 409 INVALID_STATE：状态不是 approved/provisioned（路由层前置检查；领域
 *   plan 守卫对同一情形抛同一 code，TOCTOU 下由本层错误映射兜底）；
 * - 409 provision_stopped：安全阀触发（stopped / exitCode === 2）→ 返回可读
 *   stopReason，不落库状态；provisioner 保证该情形零次适配器调用；
 * - 200 allSucceeded=true：approved→provisioned 条件 UPDATE（并发安全）+
 *   APP_PROVISIONED 审计（同一事务）；
 * - 200 allSucceeded=false：部分失败不改状态（provisioner 已写回回执），
 *   返回失败明细，由调用方对账重试；
 * - 响应只含回执/状态/明细，不含任何密钥/凭据。
 */
import type Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { DomainError } from '../../domain/errors.js'
import { AppRegistryError } from '../../domain/app-registry/lifecycle.js'
import type {
  CatalogPresentation,
  ReviewRecord,
  ReviewStatus,
} from '../../domain/app-registry/types.js'
import {
  runProvisioning,
  ProvisionerError,
  type ActualStateReader,
  type ProvisionAdapters,
  type ReviewStore,
} from './provisioner.js'
import {
  ADMIN_AUTH_TIME_HEADER,
  ADMIN_SUBJECT_HEADER,
  requireAdminRole,
} from '../admin/rbac.js'
import { stepUpWindowSeconds, assertRecentAuth } from '../admin/stepup.js'
import {
  findReviewById,
  updateArtifactReceipts,
  updateStatus,
  type AppRegistryReviewRow,
} from '../../db/repos/app_registry.repo.js'
import { writeAuditEvent } from '../../observability/audit/index.js'
import { assertAppId } from './validate.js'

/**
 * provision 编排层依赖（部署侧注入，接口 + 依赖注入，同 service-token.ts 风格）。
 * 未配置时端点返回 503 provisioner_not_configured（fail closed，不用空实现假装成功）。
 */
export interface ProvisioningDeps {
  /** 四个写入适配器（①Casdoor → ②T11 策略 → ③目录条目 → ④模块产物；真实实现由部署侧提供）。 */
  adapters: ProvisionAdapters
  /** 现状快照读取器（从四个目标读取 actual；读取失败由 provisioner 包成 SNAPSHOT_FAILED）。 */
  snapshot: ActualStateReader
  /** 目录展示元数据（name/icon/summary/kind；领域 plan 入参）。 */
  presentation: CatalogPresentation
  /** T11 数据域全集；为空 → 领域安全阀整轮停止（退出码 2）。 */
  allowedDomains: readonly string[]
}

export interface ProvisionRoutesDeps {
  sql: SqlExecutor
  /** 环境变量（测试可注入；缺省 process.env） */
  env?: Record<string, string | undefined>
  /** 编排层依赖；未配置 → 503 provisioner_not_configured。 */
  provisioning?: ProvisioningDeps
}

/** provision 端点的 AppRegistryError.code → HTTP（与 index.ts 同一映射 + INVALID_STATE 409；未知 code 默认 400，fail closed） */
const PROVISION_STATUS_BY_CODE: Record<string, number> = {
  REVIEW_NOT_FOUND: 404,
  INVALID_STATE: 409,
  INVALID_TRANSITION: 409,
  MISSING_FIELD: 400,
}

function respondProvisionError(ctx: RouterContext, err: unknown): void {
  if (err instanceof DomainError) {
    ctx.status = err.status
    ctx.body = { error: err.code, message: err.message }
    return
  }
  if (err instanceof ProvisionerError) {
    // REVIEW_NOT_FOUND（并发删除/回滚）404；SNAPSHOT_FAILED（上游快照读取失败）502
    ctx.status = err.code === 'REVIEW_NOT_FOUND' ? 404 : 502
    ctx.body = { error: err.code, message: err.message }
    return
  }
  if (err instanceof AppRegistryError) {
    ctx.status = PROVISION_STATUS_BY_CODE[err.code] ?? 400
    ctx.body = { error: err.code, message: err.message }
    return
  }
  ctx.app.emit('error', err as Error, ctx)
  ctx.status = 500
  ctx.body = { error: 'internal' }
}

function readAdminSubject(ctx: RouterContext): string | undefined {
  const value = ctx.get(ADMIN_SUBJECT_HEADER)
  return value.length > 0 ? value : undefined
}

/** 读取 x-admin-auth-time（epoch 秒；缺失/非法 → undefined → step-up fail closed） */
function readAuthTime(ctx: RouterContext): number | undefined {
  const value = ctx.get(ADMIN_AUTH_TIME_HEADER)
  if (!value) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** 把存储行还原为领域 ReviewRecord（entry null→''，与 index.ts rowToRevisionInput 同语义） */
function rowToReviewRecord(row: AppRegistryReviewRow): ReviewRecord {
  return {
    review_id: row.id,
    app_id: row.app_id,
    version: row.version,
    revision: row.revision,
    form: row.form,
    entry: row.entry ?? '',
    redirect_uris: row.redirect_uris,
    allowed_groups: row.allowed_groups,
    data_domains: row.data_domains,
    compat: row.compat,
    module: row.module,
    casdoor: row.casdoor,
    owner: row.owner,
    submitted_by: row.submitted_by,
    submitted_at: row.submitted_at.toISOString(),
    reviewer: row.reviewer,
    reviewed_at: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    decision: row.decision,
    decision_reason: row.decision_reason,
    // 路由已前置校验 status ∈ {approved, provisioned}；'superseded' 等其它状态到不了这里
    status: row.status as ReviewStatus,
    artifact_receipts: row.artifact_receipts,
  }
}

/**
 * 注册 provision 端点（由 registerAppRegistryRoutes 统一挂载，见 index.ts）。
 * 路由前置的 x-admin-subject 解析中间件在 index.ts 中注册，对本路由同样生效。
 */
export function registerAppRegistryProvisionRoutes(router: Router, deps: ProvisionRoutesDeps): void {
  const { sql } = deps
  const env = deps.env ?? process.env
  const stepSeconds = stepUpWindowSeconds(env)

  // provisioner 的仓库层注入（provisioner.ts ReviewStore 与 app_registry.repo.ts 三函数一一对应）
  const store: ReviewStore = {
    find: async (id) => {
      const row = await findReviewById(sql, id)
      return row ? rowToReviewRecord(row) : null
    },
    saveReceipts: (id, receipts) => updateArtifactReceipts(sql, id, receipts),
    updateStatus: (id, from, to) => updateStatus(sql, { reviewId: id, from, to }),
  }

  // POST /api/v1/apps/:appId/reviews/:reviewId/provision —— 上架（reviewer + step-up）
  router.post(`${API_PREFIX}/apps/:appId/reviews/:reviewId/provision`, async (ctx) => {
    try {
      // 身份：与 approve/reject 同一套 RBAC + step-up（provision 写外部目标，属敏感操作）
      const identity = await requireAdminRole(sql, readAdminSubject(ctx), 'identity_reviewer')
      assertRecentAuth(readAuthTime(ctx), stepSeconds)

      // fail closed：编排层依赖未配置 → 503（先于任何 DB 读，不用空实现假装成功）
      const provisioning = deps.provisioning
      if (!provisioning) {
        ctx.status = 503
        ctx.body = { error: 'provisioner_not_configured' }
        return
      }

      const appId = assertAppId(ctx.params.appId ?? '')
      const reviewId = ctx.params.reviewId ?? ''
      // 404：不存在或不属于路径中的应用（IDOR 语义同 approve/reject）
      const row = await findReviewById(sql, reviewId)
      if (!row || row.app_id !== appId) {
        throw new DomainError('REVIEW_NOT_FOUND', '审核记录不存在', 404)
      }
      // 409：状态前置（只有 approved/provisioned 可 provision）
      if (row.status !== 'approved' && row.status !== 'provisioned') {
        throw new AppRegistryError('INVALID_STATE', `只有 approved/provisioned 可 provision，当前 ${row.status}`)
      }
      const review = rowToReviewRecord(row)

      // 调编排层（冻结）：安全阀 / 顺序 / 幂等 / 回执语义全部由 provisioner.ts 决定
      const result = await runProvisioning(reviewId, {
        store,
        snapshot: provisioning.snapshot,
        adapters: provisioning.adapters,
        presentation: provisioning.presentation,
        allowedDomains: provisioning.allowedDomains,
      })

      // 安全阀（stopped / exitCode 2）：409 + 可读 stopReason；不落库状态
      // （provisioner 保证该情形零次适配器调用、回执不动）
      if (result.stopped || result.exitCode === 2) {
        const reason = result.stopReason ?? '安全阀触发：整轮停止'
        ctx.status = 409
        ctx.body = { error: 'provision_stopped', message: reason, stop_reason: reason }
        return
      }

      // 全部成功：状态从 approved 迁到 provisioned（条件 UPDATE，并发安全）+ 审计（同一事务）
      if (result.allSucceeded) {
        await sql.withTransaction(async (tx) => {
          if (review.status === 'approved') {
            const moved = await updateStatus(tx, {
              reviewId: review.review_id,
              from: 'approved',
              to: 'provisioned',
            })
            if (!moved) {
              throw new AppRegistryError('INVALID_TRANSITION', `状态迁移失败：记录已不在 approved 状态（当前并发已改变）`)
            }
          }
          await writeAuditEvent(tx, {
            eventType: 'APP_PROVISIONED',
            actorType: 'admin',
            actorId: identity.userId,
            targetType: 'app_registry_review',
            targetId: review.review_id,
            result: 'success',
            requestCorrelationId: (ctx.state.requestId as string | undefined) ?? null,
            metadata: {
              app_id: review.app_id,
              review_id: review.review_id,
              version: review.version,
              revision: review.revision,
              receipts_saved: result.receiptsSaved,
            },
          })
        })
        ctx.status = 200
        ctx.body = {
          reviewId: result.reviewId,
          allSucceeded: true,
          suggestedStatus: result.suggestedStatus,
          steps: result.steps,
        }
        return
      }

      // 部分失败：不改状态（provisioner 已把回执写回仓库层），返回明细供对账重试
      ctx.status = 200
      ctx.body = {
        reviewId: result.reviewId,
        allSucceeded: false,
        failures: result.failures,
        receiptsSaved: result.receiptsSaved,
      }
    } catch (err) {
      respondProvisionError(ctx, err)
    }
  })
}
