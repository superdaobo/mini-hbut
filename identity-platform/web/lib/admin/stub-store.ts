/**
 * Admin Store 桩实现（Core /api/v1/admin/* 未接入前的内存替身，issue #625）。
 *
 * 语义与 Core 合同（lib/admin/store.ts）完全一致：
 *  - 角色：identity_reviewer 可查看/审核；identity_admin 才可 suspend/revoke/audit；
 *  - self-review 默认禁止（owner sub == 审核人 sub → forbidden）；
 *  - 审核快照懒物化 + 内容寻址 revision：应用内容变化 → 旧 review superseded，
 *    approve 比对 revision（TOCTOU 防护）；
 *  - 敏感 scope 审核 / suspend / unsuspend / revoke 要求近期认证（authTime 窗口）；
 *  - 全部 mutation 幂等（重复操作返回既有状态，不重复写审计）；
 *  - 审计事件类型与 Core ADMIN_EVENTS 对齐，metadata 不含 secret/token。
 *
 * 与 developer 桩的关系：应用数据从 developer 桩（_allApps() 的 live 引用）只读
 * 同步——开发者门户创建的应用会出现在审核队列；管理员决策（审核/暂停）记录在本
 * 桩自己的状态，不回写 developer 桩内部（避免越权修改 #624 数据；本地演示的
 * 状态联动由真实 Core 提供）。
 */
import { createHash } from 'node:crypto'
import { getStubDeveloperStore } from '@/lib/developer-api/stub-store'
import { AdminApiError } from './contract'
import type {
  AdminAppDetailDTO,
  AdminAppSummaryDTO,
  AdminAuditEntryDTO,
  AdminMeDTO,
  AdminOverviewDTO,
  AdminReviewDTO,
  AdminRole,
  ScopeDecisionInput,
} from './contract'
import type { AdminAppListFilter, AdminStore } from './store'

/** developer 桩的应用行（内部类型未导出，用 ReturnType 推断；只读使用） */
type DevStubStore = ReturnType<typeof getStubDeveloperStore>
type StubApp = ReturnType<DevStubStore['_allApps']>[number]

/** 默认桩管理员：developer 桩的登录 sub（本地演示开箱即用） */
const DEFAULT_STUB_ADMIN_SUB = 'dev_sub_stub_0001'

export interface StubAdminStoreOptions {
  now?: () => Date
  /** step-up 窗口（秒）；默认 600 */
  stepUpWindowSeconds?: number
  /** 应用数据源（默认共享 developer 桩；测试注入独立实例） */
  devStore?: ReturnType<typeof getStubDeveloperStore>
  /** 角色表（sub → roles）；默认桩开发者为 identity_admin */
  roles?: Record<string, AdminRole[]>
}

interface StubScopeDecision {
  status: 'approved' | 'rejected'
  note: string | null
  applied_at: Date
}

interface StubReview {
  id: string
  appId: string
  revision: string
  submitted_by: string
  submitted_at: Date
  metadata: Record<string, unknown>
  redirect_uris: Array<{ uri: string; kind: string; created_at: string }>
  scopes: Array<{ scope: string; status: string; review_note: string | null; requested_at: string }>
  status: 'pending' | 'approved' | 'rejected' | 'superseded'
  reviewer_user_id: string | null
  reviewed_at: Date | null
  decision_note: string | null
  scope_decisions: Array<{ scope: string; decision: string; note: string | null }> | null
}

const AUDIT_EVENTS = {
  APP_APPROVED: 'ADMIN_APP_APPROVED',
  APP_REJECTED: 'ADMIN_APP_REJECTED',
  SCOPE_APPROVED: 'ADMIN_SCOPE_APPROVED',
  SCOPE_REJECTED: 'ADMIN_SCOPE_REJECTED',
  CLIENT_SUSPENDED: 'ADMIN_CLIENT_SUSPENDED',
  CLIENT_UNSUSPENDED: 'ADMIN_CLIENT_UNSUSPENDED',
  CLIENT_REVOKED: 'ADMIN_CLIENT_REVOKED',
  ROLE_GRANTED: 'ADMIN_ROLE_GRANTED',
  ROLE_REVOKED: 'ADMIN_ROLE_REVOKED',
} as const

const SENSITIVE_SCOPES = ['student.identity', 'offline_access']

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}${Date.now().toString(36)}`
}

/** 内容寻址 revision（与 Core computeRevision 语义一致：sha256 规范化 JSON） */
function computeRevision(app: StubApp): string {
  const canonical = JSON.stringify({
    name: app.name,
    description: app.description ?? null,
    homepage_url: app.homepage_url ?? null,
    privacy_policy_url: app.privacy_policy_url ?? null,
    client_type: app.client_type,
    redirect_uris: [...app.redirect_uris]
      .sort((a, b) => a.uri.localeCompare(b.uri))
      .map((r) => ({ uri: r.uri, kind: r.kind })),
    scopes: [...app.scopes]
      .sort((a, b) => a.scope.localeCompare(b.scope))
      .map((s) => ({ scope: s.scope, status: s.status, review_note: s.review_note })),
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/** 管理员角色权重 */
const ROLE_WEIGHT: Readonly<Record<AdminRole, number>> = { identity_reviewer: 1, identity_admin: 2 }

export function createStubAdminStore(opts: StubAdminStoreOptions = {}): AdminStore & {
  /** 桩专用：设置角色（测试/本地演示） */
  setRole(sub: string, role: AdminRole): void
  /** 桩专用：移除角色 */
  removeRole(sub: string, role: AdminRole): void
  /** 测试隔离 */
  clear(): void
  _roles(): Map<string, AdminRole[]>
  _audit(): AdminAuditEntryDTO[]
} {
  const now = opts.now ?? (() => new Date())
  const stepUpWindowSeconds = opts.stepUpWindowSeconds ?? 600
  const devStore = opts.devStore ?? getStubDeveloperStore()
  const roles = new Map<string, AdminRole[]>()
  if (opts.roles) {
    for (const [sub, list] of Object.entries(opts.roles)) {
      roles.set(sub, [...list])
    }
  } else {
    roles.set(DEFAULT_STUB_ADMIN_SUB, ['identity_admin'])
  }

  /** 管理员驱动状态覆盖（appId → status）；不动 developer 桩内部 */
  const statusOverrides = new Map<string, string>()
  /** scope 决策覆盖（appId → scope → decision） */
  const scopeOverrides = new Map<string, Map<string, StubScopeDecision>>()
  /** 审核记录（appId → 历史，倒序） */
  const reviewsByApp = new Map<string, StubReview[]>()
  const audit: AdminAuditEntryDTO[] = []

  function iso(d: Date): string {
    return d.toISOString()
  }

  function rolesOf(sub: string): AdminRole[] {
    return roles.get(sub) ?? []
  }

  function requireRole(sub: string, minRole: AdminRole): void {
    const min = ROLE_WEIGHT[minRole]
    if (!rolesOf(sub).some((r) => ROLE_WEIGHT[r] >= min)) {
      throw new AdminApiError(403, 'forbidden', '没有管理员权限')
    }
  }

  function requireAuthTime(authTimeSec: number | undefined): void {
    if (typeof authTimeSec !== 'number' || !Number.isFinite(authTimeSec)) {
      throw new AdminApiError(403, 'step_up_required')
    }
    const nowSec = Math.floor(now().getTime() / 1000)
    if (authTimeSec > nowSec + 300 || nowSec - authTimeSec > stepUpWindowSeconds) {
      throw new AdminApiError(403, 'step_up_required', `需要 ${Math.floor(stepUpWindowSeconds / 60)} 分钟内的重新认证`)
    }
  }

  function allApps(): StubApp[] {
    return devStore._allApps()
  }

  function findApp(appId: string): StubApp | null {
    return allApps().find((a) => a.id === appId) ?? null
  }

  function effectiveStatus(app: StubApp): string {
    return statusOverrides.get(app.id) ?? app.status
  }

  /** 开发者昵称（从 developer 桩读取；管理员 UI 不展示学号） */
  function developerDisplayName(sub: string): string {
    const dev = devStore._developers().get(sub)
    return dev?.display_name ?? '（未建档开发者）'
  }

  function pushAudit(
    eventType: string,
    actorId: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): void {
    audit.push({
      id: newId('aud'),
      event_type: eventType,
      actor_type: 'admin',
      actor_id: actorId,
      target_type: 'application',
      target_id: targetId,
      result: 'success',
      request_correlation_id: null,
      metadata,
      created_at: iso(now()),
    })
  }

  // -------------------------------------------------------------------------
  // 审核快照（懒物化 + 自动 supersede，与 Core ensurePendingReview 一致）
  // -------------------------------------------------------------------------

  function ensurePendingReview(app: StubApp): StubReview | null {
    if (effectiveStatus(app) !== 'pending_review') {
      return null
    }
    const list = reviewsByApp.get(app.id) ?? []
    const existing = list.find((r) => r.status === 'pending')
    if (existing) {
      if (existing.revision === computeRevision(app)) {
        return existing
      }
      existing.status = 'superseded'
    }
    const review: StubReview = {
      id: newId('rev'),
      appId: app.id,
      revision: computeRevision(app),
      submitted_by: app.owner_sub,
      submitted_at: now(),
      metadata: {
        name: app.name,
        description: app.description ?? null,
        homepage_url: app.homepage_url ?? null,
        privacy_policy_url: app.privacy_policy_url ?? null,
        client_type: app.client_type,
      },
      redirect_uris: app.redirect_uris.map((r) => ({ uri: r.uri, kind: r.kind, created_at: iso(r.created_at) })),
      scopes: app.scopes.map((s) => ({
        scope: s.scope,
        status: s.status,
        review_note: s.review_note,
        requested_at: iso(s.requested_at),
      })),
      status: 'pending',
      reviewer_user_id: null,
      reviewed_at: null,
      decision_note: null,
      scope_decisions: null,
    }
    list.push(review)
    reviewsByApp.set(app.id, list)
    return review
  }

  function reviewDTO(r: StubReview): AdminReviewDTO {
    return {
      id: r.id,
      application_id: r.appId,
      revision: r.revision,
      submitted_by: r.submitted_by,
      submitted_at: iso(r.submitted_at),
      metadata: r.metadata,
      redirect_uris: r.redirect_uris,
      scopes: r.scopes,
      status: r.status,
      reviewer_user_id: r.reviewer_user_id,
      reviewed_at: r.reviewed_at ? iso(r.reviewed_at) : null,
      decision_note: r.decision_note,
      scope_decisions: r.scope_decisions,
    }
  }

  function toSummary(app: StubApp): AdminAppSummaryDTO {
    const live = effectiveStatus(app)
    return {
      id: app.id,
      client_id: app.client_id,
      name: app.name,
      client_type: app.client_type,
      status: live as AdminAppSummaryDTO['status'],
      developer: { user_id: app.owner_sub, display_name: developerDisplayName(app.owner_sub) },
      scope_risks: app.scopes.filter((s) => s.status === 'requested').map((s) => s.scope),
      has_pending_review: live === 'pending_review',
      submitted_at: app.submitted_at ? iso(app.submitted_at) : null,
      reviewed_at: app.reviewed_at ? iso(app.reviewed_at) : null,
      updated_at: iso(app.updated_at),
    }
  }

  function toDetail(app: StubApp): AdminAppDetailDTO {
    ensurePendingReview(app)
    const reviews = (reviewsByApp.get(app.id) ?? []).map(reviewDTO)
    const pending = reviews.find((r) => r.status === 'pending') ?? null
    const overrides = scopeOverrides.get(app.id)
    return {
      application: {
        id: app.id,
        client_id: app.client_id,
        name: app.name,
        description: app.description,
        homepage_url: app.homepage_url,
        privacy_policy_url: app.privacy_policy_url,
        client_type: app.client_type,
        status: effectiveStatus(app) as AdminAppDetailDTO['application']['status'],
        token_endpoint_auth_method: app.client_type === 'web_confidential' ? 'client_secret_basic' : 'none',
        subject_type: 'pairwise',
        has_secret: app.secret !== null,
        client_secret_expires_at: null,
        created_at: iso(app.created_at),
        submitted_at: app.submitted_at ? iso(app.submitted_at) : null,
        reviewed_at: app.reviewed_at ? iso(app.reviewed_at) : null,
        activated_at: app.activated_at ? iso(app.activated_at) : null,
        updated_at: iso(app.updated_at),
      },
      developer: {
        user_id: app.owner_sub,
        display_name: developerDisplayName(app.owner_sub),
        contact_email: app.contact,
        created_at: iso(app.created_at),
        total_apps: allApps().filter((a) => a.owner_sub === app.owner_sub).length,
        penalized_apps: allApps().filter((a) => a.owner_sub === app.owner_sub && (effectiveStatus(a) === 'suspended' || effectiveStatus(a) === 'revoked')).length,
      },
      redirect_uris: app.redirect_uris.map((r) => ({ id: r.id, uri: r.uri, kind: r.kind, created_at: iso(r.created_at) })),
      scopes: app.scopes.map((s) => {
        const o = overrides?.get(s.scope)
        return {
          scope: s.scope,
          status: o?.status ?? s.status,
          requested_at: iso(s.requested_at),
          approved_at: o?.status === 'approved' ? iso(o.applied_at) : (s.approved_at ? iso(s.approved_at) : null),
          review_note: o?.note ?? s.review_note,
        }
      }),
      reviews,
      pending_review: pending,
    }
  }

  // -------------------------------------------------------------------------
  // AdminStore 实现
  // -------------------------------------------------------------------------

  const store: AdminStore = {
    async me(sub) {
      const list = rolesOf(sub)
      if (list.length === 0) {
        throw new AdminApiError(403, 'forbidden')
      }
      const dto: AdminMeDTO = { sub, roles: [...list] }
      return dto
    },

    async overview(sub) {
      requireRole(sub, 'identity_reviewer')
      const apps = allApps()
      // 最近安全事件仅 identity_admin 可见（与 audit 查询权限一致）
      const isAdmin = rolesOf(sub).includes('identity_admin')
      const dto: AdminOverviewDTO = {
        pending_reviews: apps.filter((a) => effectiveStatus(a) === 'pending_review').length,
        pending_sensitive_scopes: apps
          .filter((a) => effectiveStatus(a) === 'pending_review')
          .flatMap((a) => a.scopes)
          .filter((s) => s.status === 'requested' && SENSITIVE_SCOPES.includes(s.scope)).length,
        active_clients: apps.filter((a) => effectiveStatus(a) === 'active').length,
        suspended_clients: apps.filter((a) => effectiveStatus(a) === 'suspended').length,
        recent_events: isAdmin ? [...audit].slice(-10).reverse() : [],
      }
      return dto
    },

    async listApps(sub, filter: AdminAppListFilter = {}) {
      requireRole(sub, 'identity_reviewer')
      let apps = allApps().map(toSummary)
      if (filter.status) {
        apps = apps.filter((a) => a.status === filter.status)
      }
      if (filter.client_type) {
        apps = apps.filter((a) => a.client_type === filter.client_type)
      }
      if (filter.search) {
        const q = filter.search.toLowerCase()
        apps = apps.filter((a) => a.name.toLowerCase().includes(q) || a.client_id.toLowerCase().includes(q) || a.developer.display_name.toLowerCase().includes(q))
      }
      if (filter.sensitive_scope) {
        apps = apps.filter((a) => a.scope_risks.some((s) => SENSITIVE_SCOPES.includes(s)))
      }
      // 默认 pending 优先
      apps.sort((a, b) => {
        if (a.status === 'pending_review' && b.status !== 'pending_review') return -1
        if (b.status === 'pending_review' && a.status !== 'pending_review') return 1
        return (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '')
      })
      return { apps, total: apps.length }
    },

    async getApp(sub, appId) {
      requireRole(sub, 'identity_reviewer')
      const app = findApp(appId)
      return app ? toDetail(app) : null
    },

    async listReviews(sub, appId) {
      requireRole(sub, 'identity_reviewer')
      const app = findApp(appId)
      if (!app) {
        throw new AdminApiError(404, 'not_found')
      }
      ensurePendingReview(app)
      return (reviewsByApp.get(appId) ?? []).map(reviewDTO)
    },

    async approveReview(sub, appId, reviewId, input, authTimeSec) {
      requireRole(sub, 'identity_reviewer')
      const app = findApp(appId)
      if (!app) {
        throw new AdminApiError(404, 'not_found')
      }
      // 注意：不在这里懒物化（与 Core 一致）——approve 直接操作既有 review，
      // revision 比对在下方完成（内容已变 → supersede + revision_mismatch）
      const review = (reviewsByApp.get(appId) ?? []).find((r) => r.id === reviewId)
      if (!review || review.appId !== appId) {
        throw new AdminApiError(404, 'not_found')
      }
      // 幂等重放：已审 → 返回既有结果
      if (review.status === 'approved') {
        return { status: 'approved' }
      }
      if (review.status !== 'pending') {
        throw new AdminApiError(409, 'invalid_state', `审核已处于 ${review.status}`)
      }
      // self-review
      if (app.owner_sub === sub) {
        throw new AdminApiError(403, 'forbidden', '不能审核自己提交的应用')
      }
      // step-up：敏感 scope 需要近期认证
      const hasSensitive = review.scopes.some((s) => SENSITIVE_SCOPES.includes(s.scope))
      if (hasSensitive) {
        requireAuthTime(authTimeSec)
      }
      // TOCTOU：revision 比对
      if (review.revision !== computeRevision(app)) {
        review.status = 'superseded'
        throw new AdminApiError(409, 'revision_mismatch', '应用配置在提交审核后已变化，请开发者重新提交')
      }
      // 决策校验：覆盖快照全部 scope
      const decisions = new Map<string, ScopeDecisionInput>()
      for (const d of input.scope_decisions) {
        if (d.decision !== 'approved' && d.decision !== 'rejected') {
          throw new AdminApiError(400, 'invalid_request', `scope ${d.scope} 决策非法`)
        }
        if (decisions.has(d.scope)) {
          throw new AdminApiError(400, 'invalid_request', `scope ${d.scope} 重复决策`)
        }
        decisions.set(d.scope, d)
      }
      for (const s of review.scopes) {
        if (!decisions.has(s.scope)) {
          throw new AdminApiError(400, 'invalid_request', `缺少 scope ${s.scope} 的决策`)
        }
      }

      review.status = 'approved'
      review.reviewer_user_id = sub
      review.reviewed_at = now()
      review.decision_note = input.note ?? null
      review.scope_decisions = [...decisions.values()].map((d) => ({ scope: d.scope, decision: d.decision, note: d.note ?? null }))
      // 落地：应用激活（approve == activate，V1 决策）+ scope 状态
      statusOverrides.set(app.id, 'active')
      const overrides = scopeOverrides.get(app.id) ?? new Map<string, StubScopeDecision>()
      for (const d of decisions.values()) {
        overrides.set(d.scope, { status: d.decision, note: d.note ?? null, applied_at: now() })
      }
      scopeOverrides.set(app.id, overrides)
      // 审计
      pushAudit(AUDIT_EVENTS.APP_APPROVED, sub, app.id, { review_id: review.id, revision: review.revision, note: input.note ?? null })
      for (const d of decisions.values()) {
        pushAudit(d.decision === 'approved' ? AUDIT_EVENTS.SCOPE_APPROVED : AUDIT_EVENTS.SCOPE_REJECTED, sub, app.id, {
          review_id: review.id,
          revision: review.revision,
          scope: d.scope,
          note: d.note ?? null,
        })
      }
      return { status: 'approved' }
    },

    async rejectReview(sub, appId, reviewId, input, authTimeSec) {
      requireRole(sub, 'identity_reviewer')
      const app = findApp(appId)
      if (!app) {
        throw new AdminApiError(404, 'not_found')
      }
      // 与 approve 一致：不做懒物化，直接操作既有 review（revision 比对见下）
      const review = (reviewsByApp.get(appId) ?? []).find((r) => r.id === reviewId)
      if (!review || review.appId !== appId) {
        throw new AdminApiError(404, 'not_found')
      }
      if (review.status === 'rejected') {
        return { status: 'rejected' }
      }
      if (review.status !== 'pending') {
        throw new AdminApiError(409, 'invalid_state', `审核已处于 ${review.status}`)
      }
      if (app.owner_sub === sub) {
        throw new AdminApiError(403, 'forbidden', '不能审核自己提交的应用')
      }
      const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
      if (reason.length === 0 || reason.length > 2000) {
        throw new AdminApiError(400, 'invalid_request', '拒绝原因必须为 1..2000 字符')
      }
      if (review.revision !== computeRevision(app)) {
        review.status = 'superseded'
        throw new AdminApiError(409, 'revision_mismatch')
      }
      review.status = 'rejected'
      review.reviewer_user_id = sub
      review.reviewed_at = now()
      review.decision_note = reason
      statusOverrides.set(app.id, 'rejected')
      pushAudit(AUDIT_EVENTS.APP_REJECTED, sub, app.id, { review_id: review.id, revision: review.revision, reason })
      return { status: 'rejected' }
    },

    async suspendClient(sub, appId, reason, authTimeSec) {
      requireRole(sub, 'identity_admin')
      requireAuthTime(authTimeSec)
      const app = findApp(appId)
      if (!app) {
        throw new AdminApiError(404, 'not_found')
      }
      if (effectiveStatus(app) === 'suspended') {
        return { status: 'suspended' }
      }
      if (effectiveStatus(app) !== 'active') {
        throw new AdminApiError(409, 'invalid_state', `只有 active 状态可以暂停（当前 ${effectiveStatus(app)}）`)
      }
      statusOverrides.set(app.id, 'suspended')
      pushAudit(AUDIT_EVENTS.CLIENT_SUSPENDED, sub, app.id, { client_id: app.client_id, reason })
      return { status: 'suspended' }
    },

    async unsuspendClient(sub, appId, reason, authTimeSec) {
      requireRole(sub, 'identity_admin')
      requireAuthTime(authTimeSec)
      const app = findApp(appId)
      if (!app) {
        throw new AdminApiError(404, 'not_found')
      }
      if (effectiveStatus(app) === 'active') {
        return { status: 'active' }
      }
      if (effectiveStatus(app) !== 'suspended') {
        throw new AdminApiError(409, 'invalid_state', `只有 suspended 状态可以恢复（当前 ${effectiveStatus(app)}）`)
      }
      statusOverrides.set(app.id, 'active')
      pushAudit(AUDIT_EVENTS.CLIENT_UNSUSPENDED, sub, app.id, { client_id: app.client_id, reason })
      return { status: 'active' }
    },

    async revokeClient(sub, appId, reason, authTimeSec) {
      requireRole(sub, 'identity_admin')
      requireAuthTime(authTimeSec)
      const app = findApp(appId)
      if (!app) {
        throw new AdminApiError(404, 'not_found')
      }
      if (effectiveStatus(app) === 'revoked') {
        return { status: 'revoked' }
      }
      statusOverrides.set(app.id, 'revoked')
      pushAudit(AUDIT_EVENTS.CLIENT_REVOKED, sub, app.id, { client_id: app.client_id, reason })
      return { status: 'revoked' }
    },

    async listAudit(sub, opts = {}) {
      requireRole(sub, 'identity_admin')
      let events = [...audit]
      if (opts.event_type) {
        events = events.filter((e) => e.event_type === opts.event_type)
      }
      if (opts.before) {
        const idx = events.findIndex((e) => e.id === opts.before)
        if (idx >= 0) {
          events = events.slice(idx + 1)
        }
      }
      events.sort((a, b) => b.created_at.localeCompare(a.created_at))
      return events.slice(0, opts.limit ?? 50)
    },
  }

  const extended = Object.assign(store, {
    setRole(sub: string, role: AdminRole): void {
      const list = roles.get(sub) ?? []
      if (!list.includes(role)) {
        list.push(role)
      }
      roles.set(sub, list)
    },
    removeRole(sub: string, role: AdminRole): void {
      const list = roles.get(sub) ?? []
      roles.set(sub, list.filter((r) => r !== role))
    },
    clear(): void {
      roles.clear()
      statusOverrides.clear()
      scopeOverrides.clear()
      reviewsByApp.clear()
      audit.length = 0
      if (opts.roles) {
        for (const [s, list] of Object.entries(opts.roles)) {
          roles.set(s, [...list])
        }
      } else {
        roles.set(DEFAULT_STUB_ADMIN_SUB, ['identity_admin'])
      }
    },
    _roles(): Map<string, AdminRole[]> {
      return roles
    },
    _audit(): AdminAuditEntryDTO[] {
      return [...audit]
    },
  }) as ReturnType<typeof createStubAdminStore>

  return extended
}

/** 模块级桩仓库（桩模式下跨请求共享，与 developer 桩同风格） */
let moduleStub: ReturnType<typeof createStubAdminStore> | null = null

export function getStubAdminStore(): ReturnType<typeof createStubAdminStore> {
  if (!moduleStub) {
    moduleStub = createStubAdminStore()
  }
  return moduleStub
}

export function clearStubAdminStore(): void {
  moduleStub?.clear()
}
