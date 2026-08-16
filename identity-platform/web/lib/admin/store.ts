/**
 * Admin Store 接口 —— Web 与 Core Admin API 的对接合同（issue #625）。
 *
 * 语义（与 Core /api/v1/admin/* 一致）：
 *  1. 身份一律由调用方传入的 sub 推导（BFF 从加密会话读取），不接受 body 传身份；
 *  2. 角色：view 操作要求任意 admin 角色；suspend/unsuspend/revoke/audit 查询
 *     要求 identity_admin；敏感 scope 审核 / suspend / revoke 要求近期认证
 *     （authTimeSec 由 BFF 从会话 iat 传入，过期 Core 返回 step_up_required）；
 *  3. 审核基于不可变快照：approve 时 Core 比对 revision，内容已变 →
 *     revision_mismatch（TOCTOU 防护）；
 *  4. 所有 mutation 幂等：重复提交返回既有状态；
 *  5. 错误统一 AdminApiError（status + code），不泄露资源存在性差异。
 */
import type {
  AdminAppDetailDTO,
  AdminAppSummaryDTO,
  AdminAuditEntryDTO,
  AdminMeDTO,
  AdminOverviewDTO,
  AdminReviewDTO,
  ScopeDecisionInput,
} from './contract'

export interface AdminAppListFilter {
  status?: string
  client_type?: string
  search?: string
  developer?: string
  sensitive_scope?: boolean
}

export interface AdminAppListResult {
  apps: AdminAppSummaryDTO[]
  total: number
}

export interface AdminStore {
  /** 当前管理员身份 + 角色（Core 侧 RBAC 判定） */
  me(sub: string): Promise<AdminMeDTO>
  overview(sub: string): Promise<AdminOverviewDTO>
  listApps(sub: string, filter?: AdminAppListFilter): Promise<AdminAppListResult>
  getApp(sub: string, appId: string): Promise<AdminAppDetailDTO | null>
  listReviews(sub: string, appId: string): Promise<AdminReviewDTO[]>

  approveReview(
    sub: string,
    appId: string,
    reviewId: string,
    input: { scope_decisions: ScopeDecisionInput[]; note?: string | null },
    authTimeSec: number,
  ): Promise<{ status: string }>
  rejectReview(
    sub: string,
    appId: string,
    reviewId: string,
    input: { reason: string },
    authTimeSec: number,
  ): Promise<{ status: string }>

  suspendClient(sub: string, appId: string, reason: string, authTimeSec: number): Promise<{ status: string }>
  unsuspendClient(sub: string, appId: string, reason: string, authTimeSec: number): Promise<{ status: string }>
  revokeClient(sub: string, appId: string, reason: string, authTimeSec: number): Promise<{ status: string }>

  listAudit(sub: string, opts?: { event_type?: string; before?: string; limit?: number }): Promise<AdminAuditEntryDTO[]>
}
