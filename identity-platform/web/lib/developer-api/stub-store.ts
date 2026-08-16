/**
 * Developer Store 桩实现（Core #620 未实现 /api/v1/developer/* 前的内存替身）。
 *
 * 语义与 lib/developer-api/store.ts 的对接合同完全一致：
 *  - owner 从 sub 推导；非本人所有与不存在一律返回 null（→ 404，防枚举）；
 *  - 生命周期状态机（lib/developer/status.ts）；
 *  - redirect/scope 变更在 pending 及之后自动重新进入审核；
 *  - secret 只显示一次 + rotate 不落 audit 明文；
 *  - suspended 开发者拒绝一切 mutation。
 *
 * 管理员审核动作（approved/active/rejected/suspended）属于 #625，
 * 桩提供 simulateAdminReview() 仅供测试/本地演示调用，BFF 路由绝不暴露它。
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { DeveloperApiError } from '@/lib/developer/contract'
import type {
  AuditAction,
  AuditEntryDTO,
  CreateAppInput,
  CreateAppResult,
  DeveloperAppDetailDTO,
  DeveloperAppStatus,
  DeveloperAppSummaryDTO,
  DeveloperDTO,
  DeveloperStatus,
  RedirectUriDTO,
  RedirectUriInput,
  RedirectUriKind,
  RedirectUriValidationStatus,
  ScopeDTO,
  ScopeStatus,
  UpdateAppInput,
} from '@/lib/developer/contract'
import {
  canSubmit,
  isDeletable,
  isEditable,
  isRevocable,
  isTerminal,
  redirectChangeRequiresReview,
} from '@/lib/developer/status'
import {
  kindAllowedFor,
  validateRedirectUri,
  validateRedirectUriSet,
} from '@/lib/developer/redirect-uri'
import { hasSensitiveScope, isWhitelistedScope, validateScopeRequest } from '@/lib/developer/scopes'
import { generateClientSecret, secretMetadataFromSecret } from '@/lib/developer/secret'
import { validateCreateAppInput, validateUpdateAppInput } from '@/lib/developer/validation'
import type { DeveloperStore } from './store'

/** 桩模式可配置项（本地演示/测试） */
export interface StubStoreOptions {
  /** 本地开发放行 http://localhost 的 web_https（默认跟随 IDENTITY_ENVIRONMENT） */
  allowLocalhostDev?: boolean
  now?: () => Date
}

interface StubDeveloper {
  sub: string
  display_name: string
  status: DeveloperStatus
  created_at: Date
}

interface StubAuditEntry {
  id: string
  at: Date
  action: AuditAction
  actor: 'developer' | 'admin' | 'system'
  detail: string
}

interface StubSecret {
  value: string
  created_at: Date
  last_rotated_at: Date | null
}

interface StubReview {
  decision: 'approved' | 'rejected' | null
  rejection_reason: string | null
  review_notes: string | null
  needs_changes: string[] | null
}

/**
 * 内部存储形态（时间字段用 Date）：
 * 不与 DTO 交叉（DTO 的 created_at/requested_at 是 string，交叉会产生
 * `string & Date` 的不可赋值类型），出参时由 scopeDTO/redirectDTO 统一 iso() 化。
 */
interface StubRedirectUri {
  id: string
  uri: string
  kind: RedirectUriKind
  validation_status: RedirectUriValidationStatus
  created_at: Date
}

interface StubScope {
  scope: string
  status: ScopeStatus
  justification: string | null
  privacy_policy_url: string | null
  contact: string | null
  requested_at: Date
  approved_at: Date | null
  review_note: string | null
}

interface StubApp {
  id: string
  client_id: string
  owner_sub: string
  name: string
  description: string
  homepage_url: string | null
  privacy_policy_url: string | null
  contact: string | null
  client_type: 'web_confidential' | 'native_public'
  status: DeveloperAppStatus
  secret: StubSecret | null
  redirect_uris: StubRedirectUri[]
  scopes: StubScope[]
  audit: StubAuditEntry[]
  review: StubReview
  created_at: Date
  updated_at: Date
  submitted_at: Date | null
  reviewed_at: Date | null
  activated_at: Date | null
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`
}

function newClientId(): string {
  // 与 core 的 newPrefixedRandomId('cli', 16) 对齐（issue 示例的 mh_ 仅为示意）
  return `cli_${randomBytes(12).toString('base64url')}`
}

function iso(d: Date): string {
  return d.toISOString()
}

/** 管理员模拟审核（仅供测试/本地演示；#625 落地后由 Core 承担） */
export interface AdminReviewDecision {
  to: 'approved' | 'rejected' | 'active' | 'suspended'
  rejectionReason?: string
  reviewNotes?: string
  needsChanges?: string[]
}

export function createStubDeveloperStore(opts: StubStoreOptions = {}): DeveloperStore & {
  /** 桩专用：模拟管理员审核（非 Developer API 面） */
  simulateAdminReview(appId: string, decision: AdminReviewDecision): void
  /** 桩专用：暂停/恢复开发者（测试 suspended 语义） */
  setDeveloperStatus(sub: string, status: DeveloperStatus): void
  /** 测试隔离 */
  clear(): void
  /** 测试观察：全部应用（BFF 不可达，仅测试） */
  _allApps(): StubApp[]
  _developers(): Map<string, StubDeveloper>
} {
  const allowLocalhostDev = opts.allowLocalhostDev ?? (process.env.IDENTITY_ENVIRONMENT ?? 'development') === 'development'
  const now = opts.now ?? (() => new Date())

  const developers = new Map<string, StubDeveloper>()
  const apps = new Map<string, StubApp>()

  function requireActiveDeveloper(sub: string): StubDeveloper {
    const dev = developers.get(sub)
    if (!dev) {
      throw new DeveloperApiError(404, 'not_found')
    }
    if (dev.status === 'suspended') {
      throw new DeveloperApiError(403, 'forbidden', '开发者已被暂停')
    }
    return dev
  }

  /** 应用查找：不存在或非本人所有 → null（不泄露存在性） */
  function findOwned(sub: string, appId: string): StubApp | null {
    const app = apps.get(appId)
    if (!app || app.owner_sub !== sub) {
      return null
    }
    return app
  }

  function requireOwned(sub: string, appId: string): StubApp {
    const app = findOwned(sub, appId)
    if (!app) {
      throw new DeveloperApiError(404, 'not_found')
    }
    return app
  }

  function audit(app: StubApp, action: AuditAction, actor: 'developer' | 'admin' | 'system', detail: string): void {
    app.audit.push({ id: randomUUID(), at: now(), action, actor, detail })
  }

  function scopeDTO(s: StubScope): ScopeDTO {
    return {
      scope: s.scope,
      status: s.status,
      justification: s.justification,
      privacy_policy_url: s.privacy_policy_url,
      contact: s.contact,
      requested_at: iso(s.requested_at),
      approved_at: s.approved_at ? iso(s.approved_at) : null,
      review_note: s.review_note,
    }
  }

  function redirectDTO(r: StubRedirectUri): RedirectUriDTO {
    return {
      id: r.id,
      uri: r.uri,
      kind: r.kind,
      validation_status: r.validation_status,
      created_at: iso(r.created_at),
    }
  }

  function toSummary(app: StubApp): DeveloperAppSummaryDTO {
    return {
      id: app.id,
      client_id: app.client_id,
      name: app.name,
      client_type: app.client_type,
      status: app.status,
      scopes: app.scopes.map((s) => s.scope),
      updated_at: iso(app.updated_at),
    }
  }

  /** 敏感 scope 校验 + 应用级隐私政策/联系方式要求（创建/更新/改 scope 共用） */
  function assertSensitiveScopeFields(app: Pick<StubApp, 'privacy_policy_url' | 'contact'>, scopes: readonly string[], justifications: Readonly<Record<string, string | null | undefined>>): void {
    const check = validateScopeRequest({
      scopes,
      justifications,
      privacyPolicyUrl: app.privacy_policy_url ?? null,
      contact: app.contact ?? null,
    })
    if (!check.ok) {
      throw new DeveloperApiError(400, 'invalid_request', check.error)
    }
  }

  /** 变更 redirect/scope 后的重新审核逻辑：pending 及之后 → 回 pending_review */
  function applyReviewReset(app: StubApp): void {
    if (redirectChangeRequiresReview(app.status)) {
      app.status = 'pending_review'
      app.submitted_at = now()
      app.review = { decision: null, rejection_reason: null, review_notes: null, needs_changes: null }
    }
  }

  function buildDetail(app: StubApp): DeveloperAppDetailDTO {
    return {
      id: app.id,
      client_id: app.client_id,
      name: app.name,
      client_type: app.client_type,
      status: app.status,
      updated_at: iso(app.updated_at),
      description: app.description,
      homepage_url: app.homepage_url,
      privacy_policy_url: app.privacy_policy_url,
      contact: app.contact,
      created_at: iso(app.created_at),
      submitted_at: app.submitted_at ? iso(app.submitted_at) : null,
      activated_at: app.activated_at ? iso(app.activated_at) : null,
      redirect_uris: app.redirect_uris.map(redirectDTO),
      scopes: app.scopes.map(scopeDTO),
      review: {
        status: app.status,
        submitted_at: app.submitted_at ? iso(app.submitted_at) : null,
        reviewed_at: app.reviewed_at ? iso(app.reviewed_at) : null,
        decision: app.review.decision,
        rejection_reason: app.review.rejection_reason,
        review_notes: app.review.review_notes,
        needs_changes: app.review.needs_changes,
      },
      secret: app.secret
        ? secretMetadataFromSecret(app.secret.value, iso(app.secret.created_at), app.secret.last_rotated_at ? iso(app.secret.last_rotated_at) : null)
        : { created_at: null, last_rotated_at: null, fingerprint: null, last4: null },
      audit: [...app.audit]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .map((a) => ({ id: a.id, at: iso(a.at), action: a.action, actor: a.actor, detail: a.detail })),
    }
  }

  const store: ReturnType<typeof createStubDeveloperStore> = {
    async getDeveloper(sub) {
      const dev = developers.get(sub)
      if (!dev) {
        return null
      }
      return { sub: dev.sub, display_name: dev.display_name, status: dev.status, created_at: iso(dev.created_at) }
    },

    async ensureDeveloper(sub, displayName) {
      const existing = developers.get(sub)
      if (existing) {
        return { sub: existing.sub, display_name: existing.display_name, status: existing.status, created_at: iso(existing.created_at) }
      }
      const dev: StubDeveloper = { sub, display_name: displayName, status: 'active', created_at: now() }
      developers.set(sub, dev)
      return { sub: dev.sub, display_name: dev.display_name, status: dev.status, created_at: iso(dev.created_at) }
    },

    async listApps(sub) {
      return [...apps.values()]
        .filter((a) => a.owner_sub === sub)
        .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
        .map(toSummary)
    },

    async createApp(sub, input) {
      requireActiveDeveloper(sub)
      const check = validateCreateAppInput(input, { allowLocalhostDev })
      if (!check.ok) {
        throw new DeveloperApiError(400, 'invalid_request', check.error)
      }
      const id = newId('app')
      const privacyPolicyUrl = input.privacy_policy_url ? input.privacy_policy_url.trim() : null
      const contact = input.contact ? input.contact.trim() : null
      const app: StubApp = {
        id,
        client_id: newClientId(),
        owner_sub: sub,
        name: input.name.trim(),
        description: input.description.trim(),
        homepage_url: input.homepage_url ? input.homepage_url.trim() : null,
        privacy_policy_url: privacyPolicyUrl,
        contact,
        client_type: input.client_type,
        status: 'draft',
        secret: input.client_type === 'web_confidential' ? { value: generateClientSecret(), created_at: now(), last_rotated_at: null } : null,
        redirect_uris: input.redirect_uris.map((r) => ({
          id: newId('ru'),
          uri: r.uri,
          kind: r.kind,
          validation_status: 'approved' as const,
          created_at: now(),
        })),
        scopes: input.scopes.map((s) => ({
          scope: s.scope,
          status: 'requested' as const,
          justification: s.justification?.trim() ?? null,
          privacy_policy_url: privacyPolicyUrl,
          contact,
          requested_at: now(),
          approved_at: null,
          review_note: null,
        })),
        audit: [],
        review: { decision: null, rejection_reason: null, review_notes: null, needs_changes: null },
        created_at: now(),
        updated_at: now(),
        submitted_at: null,
        reviewed_at: null,
        activated_at: null,
      }
      apps.set(id, app)
      audit(app, 'app.created', 'developer', `创建应用 ${app.name}`)
      return { id, client_id: app.client_id, client_secret: app.secret ? app.secret.value : null }
    },

    async getApp(sub, appId) {
      const app = findOwned(sub, appId)
      if (!app) {
        return null
      }
      return buildDetail(app)
    },

    async updateApp(sub, appId, input) {
      requireActiveDeveloper(sub)
      const app = requireOwned(sub, appId)
      if (!isEditable(app.status)) {
        throw new DeveloperApiError(409, 'invalid_state', `当前状态（${app.status}）不允许修改基本信息，请等待审核结果`)
      }
      const check = validateUpdateAppInput(input)
      if (!check.ok) {
        throw new DeveloperApiError(400, 'invalid_request', check.error)
      }
      const merged = {
        name: input.name?.trim() ?? app.name,
        description: input.description?.trim() ?? app.description,
        homepage_url: input.homepage_url === null || input.homepage_url === '' ? null : (input.homepage_url?.trim() ?? app.homepage_url),
        privacy_policy_url: input.privacy_policy_url === null || input.privacy_policy_url === '' ? null : (input.privacy_policy_url?.trim() ?? app.privacy_policy_url),
        contact: input.contact === null || input.contact === '' ? null : (input.contact?.trim() ?? app.contact),
      }
      // 敏感 scope 的应用更新后仍需满足隐私政策/联系方式要求
      const sensitive = app.scopes.filter((s) => s.status === 'requested' || s.status === 'approved').map((s) => s.scope)
      if (hasSensitiveScope(sensitive)) {
        const check2 = validateScopeRequest({
          scopes: sensitive,
          justifications: Object.fromEntries(app.scopes.map((s) => [s.scope, s.justification])),
          privacyPolicyUrl: merged.privacy_policy_url,
          contact: merged.contact,
        })
        if (!check2.ok) {
          throw new DeveloperApiError(400, 'invalid_request', check2.error)
        }
      }
      app.name = merged.name
      app.description = merged.description
      app.homepage_url = merged.homepage_url
      app.privacy_policy_url = merged.privacy_policy_url
      app.contact = merged.contact
      for (const s of app.scopes) {
        s.privacy_policy_url = merged.privacy_policy_url
        s.contact = merged.contact
      }
      app.updated_at = now()
      audit(app, 'app.updated', 'developer', '更新应用信息')
      return buildDetail(app)
    },

    async deleteApp(sub, appId) {
      requireActiveDeveloper(sub)
      const app = requireOwned(sub, appId)
      if (!isDeletable(app.status)) {
        throw new DeveloperApiError(409, 'invalid_state', '只有草稿状态的应用可以删除；其他状态请使用撤销（revoke）')
      }
      apps.delete(appId)
      return { deleted: true }
    },

    async addRedirectUri(sub, appId, input) {
      requireActiveDeveloper(sub)
      const app = requireOwned(sub, appId)
      if (isTerminal(app.status)) {
        throw new DeveloperApiError(409, 'invalid_state', '已撤销的应用不允许任何变更')
      }
      if (!kindAllowedFor(input.kind, app.client_type)) {
        throw new DeveloperApiError(400, 'invalid_request', `redirect URI 类型（${input.kind}）与该应用类型不匹配`)
      }
      const v = validateRedirectUri(input.uri, input.kind, { allowLocalhostDev })
      if (!v.ok) {
        throw new DeveloperApiError(400, 'invalid_request', `${input.uri}：${v.error}`)
      }
      if (app.redirect_uris.length >= 20) {
        throw new DeveloperApiError(400, 'invalid_request', 'redirect URI 数量已达上限（20）')
      }
      if (app.redirect_uris.some((r) => r.uri === input.uri)) {
        throw new DeveloperApiError(400, 'invalid_request', `重复的 redirect URI：${input.uri}`)
      }
      app.redirect_uris.push({ id: newId('ru'), uri: input.uri, kind: input.kind, validation_status: 'approved', created_at: now() })
      app.updated_at = now()
      audit(app, 'redirect_uri.added', 'developer', `新增 redirect URI（${input.kind}）`)
      applyReviewReset(app)
      if (redirectChangeRequiresReview(app.status)) {
        audit(app, 'app.submitted', 'developer', '修改 redirect URI 后自动重新进入审核')
      }
      return buildDetail(app)
    },

    async removeRedirectUri(sub, appId, redirectUriId) {
      requireActiveDeveloper(sub)
      const app = requireOwned(sub, appId)
      if (isTerminal(app.status)) {
        throw new DeveloperApiError(409, 'invalid_state', '已撤销的应用不允许任何变更')
      }
      const idx = app.redirect_uris.findIndex((r) => r.id === redirectUriId)
      if (idx < 0) {
        throw new DeveloperApiError(404, 'not_found')
      }
      if (app.redirect_uris.length <= 1) {
        throw new DeveloperApiError(400, 'invalid_request', '至少保留一个 redirect URI')
      }
      app.redirect_uris.splice(idx, 1)
      app.updated_at = now()
      audit(app, 'redirect_uri.removed', 'developer', '删除 redirect URI')
      applyReviewReset(app)
      if (redirectChangeRequiresReview(app.status)) {
        audit(app, 'app.submitted', 'developer', '修改 redirect URI 后自动重新进入审核')
      }
      return buildDetail(app)
    },

    async getScopes(sub, appId) {
      const app = findOwned(sub, appId)
      if (!app) {
        return null
      }
      return app.scopes.map(scopeDTO)
    },

    async putScopes(sub, appId, scopes) {
      requireActiveDeveloper(sub)
      const app = requireOwned(sub, appId)
      if (isTerminal(app.status)) {
        throw new DeveloperApiError(409, 'invalid_state', '已撤销的应用不允许任何变更')
      }
      if (scopes.length === 0 || !scopes.some((s) => s.scope === 'openid')) {
        throw new DeveloperApiError(400, 'invalid_request', '必须包含 openid')
      }
      for (const s of scopes) {
        if (!isWhitelistedScope(s.scope)) {
          throw new DeveloperApiError(400, 'invalid_request', `不在 V1 scope 白名单内：${s.scope}`)
        }
      }
      // 去重（保持输入顺序）
      const seen = new Set<string>()
      const unique = scopes.filter((s) => {
        if (seen.has(s.scope)) {
          return false
        }
        seen.add(s.scope)
        return true
      })
      const justifications: Record<string, string | null> = {}
      for (const s of unique) {
        justifications[s.scope] = s.justification?.trim() ?? null
      }
      assertSensitiveScopeFields(app, unique.map((s) => s.scope), justifications)
      app.scopes = unique.map((s) => {
        const prev = app.scopes.find((x) => x.scope === s.scope)
        return {
          scope: s.scope,
          status: 'requested',
          justification: s.justification?.trim() ?? null,
          privacy_policy_url: app.privacy_policy_url,
          contact: app.contact,
          requested_at: prev?.requested_at ?? now(),
          approved_at: null,
          review_note: null,
        }
      })
      app.updated_at = now()
      audit(app, 'scopes.updated', 'developer', `更新 scope 请求：${unique.map((s) => s.scope).join(', ')}`)
      applyReviewReset(app)
      if (redirectChangeRequiresReview(app.status)) {
        audit(app, 'app.submitted', 'developer', '修改 scope 后自动重新进入审核')
      }
      return buildDetail(app)
    },

    async submitForReview(sub, appId) {
      requireActiveDeveloper(sub)
      const app = requireOwned(sub, appId)
      if (!canSubmit(app.status)) {
        throw new DeveloperApiError(409, 'invalid_state', `当前状态（${app.status}）不能提交审核`)
      }
      // 提交前完整性校验：URI 数量、敏感 scope 字段、基本信息
      const set = validateRedirectUriSet(
        app.redirect_uris.map((r) => ({ uri: r.uri, kind: r.kind })),
        app.client_type,
        { allowLocalhostDev },
      )
      if (!set.ok) {
        throw new DeveloperApiError(400, 'invalid_request', `redirect URI 校验失败：${set.error}`)
      }
      assertSensitiveScopeFields(app, app.scopes.map((s) => s.scope), Object.fromEntries(app.scopes.map((s) => [s.scope, s.justification])))
      app.status = 'pending_review'
      app.submitted_at = now()
      app.reviewed_at = null
      app.review = { decision: null, rejection_reason: null, review_notes: null, needs_changes: null }
      app.updated_at = now()
      audit(app, 'app.submitted', 'developer', '提交审核')
      return buildDetail(app)
    },

    async rotateSecret(sub, appId) {
      requireActiveDeveloper(sub)
      const app = requireOwned(sub, appId)
      if (isTerminal(app.status)) {
        throw new DeveloperApiError(409, 'invalid_state', '已撤销的应用不允许任何变更')
      }
      if (app.client_type !== 'web_confidential') {
        throw new DeveloperApiError(400, 'invalid_request', 'Native/Public 应用不使用 client secret（PKCE S256）')
      }
      const fresh = generateClientSecret()
      app.secret = { value: fresh, created_at: app.secret?.created_at ?? now(), last_rotated_at: now() }
      app.updated_at = now()
      audit(app, 'secret.rotated', 'developer', '轮换 client secret（新 secret 立即生效，旧值立即失效）')
      return { app: buildDetail(app), client_secret: fresh }
    },

    async revokeApp(sub, appId) {
      requireActiveDeveloper(sub)
      const app = requireOwned(sub, appId)
      if (!isRevocable(app.status)) {
        throw new DeveloperApiError(409, 'invalid_state', '应用已是终态（revoked）')
      }
      app.status = 'revoked'
      app.updated_at = now()
      audit(app, 'app.revoked', 'developer', '撤销应用（终态，不可恢复）')
      return buildDetail(app)
    },

    async listAudit(sub, appId) {
      const app = findOwned(sub, appId)
      if (!app) {
        return null
      }
      return [...app.audit]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .map((a) => ({ id: a.id, at: iso(a.at), action: a.action, actor: a.actor, detail: a.detail }))
    },

    // ===== 桩专用（测试/本地演示；BFF 不暴露） =====
    simulateAdminReview(appId, decision) {
      const app = apps.get(appId)
      if (!app) {
        throw new Error(`stub: app ${appId} 不存在`)
      }
      if (decision.to === 'approved') {
        if (app.status !== 'pending_review') {
          throw new Error(`stub: 只能从 pending_review 批准（当前 ${app.status}）`)
        }
        app.status = 'approved'
        app.reviewed_at = now()
        app.review = { decision: 'approved', rejection_reason: null, review_notes: decision.reviewNotes ?? null, needs_changes: null }
      } else if (decision.to === 'active') {
        if (app.status !== 'approved' && app.status !== 'suspended') {
          throw new Error(`stub: 只能从 approved/suspended 启用（当前 ${app.status}）`)
        }
        app.status = 'active'
        app.activated_at = now()
        app.review = { decision: 'approved', rejection_reason: null, review_notes: app.review.review_notes, needs_changes: null }
      } else if (decision.to === 'rejected') {
        if (app.status !== 'pending_review') {
          throw new Error(`stub: 只能拒绝 pending_review（当前 ${app.status}）`)
        }
        app.status = 'rejected'
        app.reviewed_at = now()
        app.review = {
          decision: 'rejected',
          rejection_reason: decision.rejectionReason ?? null,
          review_notes: decision.reviewNotes ?? null,
          needs_changes: decision.needsChanges ?? null,
        }
        for (const s of app.scopes) {
          s.review_note = decision.reviewNotes ?? null
        }
      } else if (decision.to === 'suspended') {
        if (app.status !== 'active') {
          throw new Error(`stub: 只能暂停 active（当前 ${app.status}）`)
        }
        app.status = 'suspended'
        app.reviewed_at = now()
      }
      app.updated_at = now()
      audit(app, decision.to === 'rejected' ? 'app.reviewed' : decision.to === 'suspended' ? 'app.suspended' : decision.to === 'active' ? 'app.activated' : 'app.reviewed', 'admin', `管理员审核：${decision.to}`)
    },

    setDeveloperStatus(sub, status) {
      const dev = developers.get(sub)
      if (!dev) {
        return
      }
      dev.status = status
    },

    clear() {
      developers.clear()
      apps.clear()
    },

    _allApps() {
      return [...apps.values()]
    },

    _developers() {
      return developers
    },
  }

  return store
}

/** 模块级桩仓库（与 core-client 的桩同风格：桩模式下跨请求共享） */
const moduleStub = createStubDeveloperStore()

/** 获取共享桩实例（BFF 使用；测试用 createStubDeveloperStore 独立实例） */
export function getStubDeveloperStore(): ReturnType<typeof createStubDeveloperStore> {
  return moduleStub
}

export function clearStubDeveloperStore(): void {
  moduleStub.clear()
}
