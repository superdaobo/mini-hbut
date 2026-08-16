/**
 * /admin/apps/[id] —— 应用审核详情页（issue #625，8 分区）。
 *
 * 1. Application identity     4. Requested Scopes     7. Review history
 * 2. Developer                5. Privacy / usage      8. Decision
 * 3. Redirect URIs            6. Security metadata
 *
 * 安全要点：
 * - 主页链接安全打开：新窗口 + rel="noopener noreferrer"，绝不 iframe 第三方站点；
 * - redirect URI 逐条完整展示（不截断），风险高亮为提示（不替代 Core 校验）；
 * - 决策基于不可变快照；revision_mismatch 由 Core 判定后在此展示；
 * - 敏感 scope 审核 / suspend / revoke 需近期认证（Core 校验，过期触发重新登录）；
 * - 不展示学号；secret 只显示元数据。
 */
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  approveReview,
  rejectReview,
  suspendApp,
  unsuspendApp,
  revokeApp,
  fetchAdminMe,
  fetchApp,
  AdminClientApiError,
  type MeResult,
} from '../../_components/admin-api'
import type { AdminAppDetailDTO, AdminReviewDTO, ScopeDecisionInput } from '@/lib/admin/contract'
import { classifyRedirectRisk, scopeLabel, scopeRisk, REDIRECT_RISK_LABELS } from '@/lib/admin/risk'
import { formatTime, shortId } from '../../page'

export default function AdminAppDetailPage() {
  const params = useParams<{ id: string }>()
  const appId = params.id
  const [me, setMe] = useState<MeResult | null>(null)
  const [app, setApp] = useState<AdminAppDetailDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const detail = await fetchApp(appId)
      setApp(detail)
    } catch (err) {
      if (err instanceof AdminClientApiError && err.status === 401) return
      if (err instanceof AdminClientApiError && err.status === 404) {
        setError('应用不存在')
        return
      }
      setError(err instanceof Error ? err.message : '加载失败')
    }
  }, [appId])

  useEffect(() => {
    void fetchAdminMe().then(setMe).catch(() => undefined)
    void reload()
  }, [reload])

  if (!app) {
    return (
      <div>
        <h1 className="admin-title">应用审核</h1>
        {error ? <div className="admin-error">{error}</div> : <div className="admin-empty">加载中…</div>}
      </div>
    )
  }

  const isAdmin = me?.admin.roles.includes('identity_admin') ?? false
  const { application, developer, redirect_uris, scopes, reviews, pending_review } = app

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <a href="/admin/apps" className="admin-muted">← 返回队列</a>
      </p>
      <h1 className="admin-title">
        {application.name}
        <span className={statusBadgeClass(application.status)} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{statusLabel(application.status)}</span>
      </h1>
      {notice && <div className="admin-note" style={{ color: '#065f46', background: '#ecfdf5', padding: 8, borderRadius: 6 }}>{notice}</div>}
      {error && <div className="admin-error">{error}</div>}

      {/* 非官方保证级别提醒（敏感 scope 审核必读） */}
      {(pending_review?.scopes.some((s) => scopeRisk(s.scope) === 'sensitive') ?? false) && (
        <div className="admin-warning-banner" role="note">
          ⚠️ 当前 HBUT identity 是 Mini-HBUT App 本地验证，不是湖北工业大学官方 OIDC 签名，
          不应批准给需要官方强实名保证的用途。
        </div>
      )}

      <section className="admin-section">
        <h2>1. Application identity</h2>
        <dl className="admin-dl">
          <dt>应用名</dt><dd>{application.name}</dd>
          <dt>描述</dt><dd>{application.description ?? '—'}</dd>
          <dt>主页</dt>
          <dd>
            {application.homepage_url ? (
              <a className="admin-external-link" href={application.homepage_url} target="_blank" rel="noopener noreferrer">
                {application.homepage_url}
              </a>
            ) : '—'}
          </dd>
          <dt>Client type</dt><dd>{clientTypeLabel(application.client_type)}</dd>
          <dt>client_id</dt><dd><span className="admin-code">{application.client_id}</span></dd>
          <dt>创建时间</dt><dd>{formatTime(application.created_at)}</dd>
          <dt>提交时间</dt><dd>{application.submitted_at ? formatTime(application.submitted_at) : '—'}</dd>
        </dl>
      </section>

      <section className="admin-section">
        <h2>2. Developer</h2>
        {developer ? (
          <dl className="admin-dl">
            <dt>显示名</dt><dd>{developer.display_name}</dd>
            <dt>联系方式</dt><dd>{developer.contact_email ?? '—'}</dd>
            <dt>内部用户引用</dt><dd><span className="admin-code">{shortId(developer.user_id)}</span></dd>
            <dt>历史</dt>
            <dd>
              名下 {developer.total_apps} 个应用；其中{' '}
              <span className={developer.penalized_apps > 0 ? 'admin-risk' : ''}>
                {developer.penalized_apps} 个被暂停/撤销
              </span>
            </dd>
          </dl>
        ) : (
          <p className="admin-muted">（开发者档案缺失）</p>
        )}
      </section>

      <section className="admin-section">
        <h2>3. Redirect URIs</h2>
        {redirect_uris.length === 0 && <p className="admin-muted">—</p>}
        {redirect_uris.map((r) => (
          <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
            {/* 逐条完整显示，不截断 hostname/path */}
            <span className="admin-code">{r.uri}</span>
            <span className="admin-muted" style={{ marginLeft: 8 }}>{kindLabel(r.kind)}</span>
            <div style={{ marginTop: 4 }}>
              <RiskFlags uri={r.uri} kind={r.kind} homepageUrl={application.homepage_url} reviews={reviews} />
            </div>
          </div>
        ))}
        <p className="admin-note">以上为风险提示，不替代 Core 的 redirect_uri 精确注册校验。</p>
      </section>

      <section className="admin-section">
        <h2>4. Requested Scopes</h2>
        {scopes.map((s) => {
          const risk = scopeRisk(s.scope)
          return (
            <div className="admin-scope-item" key={s.scope}>
              <div>
                <strong>{scopeLabel(s.scope)}</strong>
                <span className={`admin-risk ${risk === 'sensitive' ? '' : 'risk-info'}`} style={{ marginLeft: 8 }}>
                  {risk === 'sensitive' ? '敏感' : '基础'}
                </span>
                <div className="admin-muted">状态：{scopeStatusLabel(s.status)}</div>
                {s.review_note && <div className="admin-note">审核意见：{s.review_note}</div>}
              </div>
              {risk === 'sensitive' && (
                <div className="admin-muted" style={{ maxWidth: 300, fontSize: 13 }}>
                  敏感 scope 需人工审核用途；隐私政策：
                  {application.privacy_policy_url ? (
                    <a className="admin-external-link" href={application.privacy_policy_url} target="_blank" rel="noopener noreferrer">查看</a>
                  ) : '（未提供，应拒绝）'}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="admin-section">
        <h2>5. Privacy / usage explanation</h2>
        <dl className="admin-dl">
          <dt>用途说明</dt><dd>{application.description ?? '—'}</dd>
          <dt>隐私政策</dt>
          <dd>
            {application.privacy_policy_url ? (
              <a className="admin-external-link" href={application.privacy_policy_url} target="_blank" rel="noopener noreferrer">
                {application.privacy_policy_url}
              </a>
            ) : '（未提供）'}
          </dd>
          <dt>开发者联系方式</dt><dd>{developer?.contact_email ?? '—'}</dd>
        </dl>
      </section>

      <section className="admin-section">
        <h2>6. Security metadata</h2>
        <dl className="admin-dl">
          <dt>Client type</dt><dd>{clientTypeLabel(application.client_type)}</dd>
          <dt>Token endpoint auth</dt><dd>{application.token_endpoint_auth_method}</dd>
          <dt>Subject type</dt><dd>{application.subject_type}</dd>
          <dt>Client secret</dt>
          <dd>
            {application.has_secret ? '已生成（明文只展示给开发者一次）' : '无（public client）'}
            {application.client_secret_expires_at ? `；过期时间 ${formatTime(application.client_secret_expires_at)}` : ''}
          </dd>
        </dl>
      </section>

      <section className="admin-section">
        <h2>7. Review history</h2>
        {reviews.length === 0 && <p className="admin-muted">暂无审核记录</p>}
        {reviews.map((r) => (
          <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span className={statusBadgeClass(r.status)}>{reviewStatusLabel(r.status)}</span>
            <span className="admin-muted" style={{ marginLeft: 8 }}>
              {formatTime(r.submitted_at)}
              {r.reviewer_user_id ? ` · 审核人 ${shortId(r.reviewer_user_id)}` : ''}
              {r.reviewed_at ? ` · ${formatTime(r.reviewed_at)}` : ''}
            </span>
            {r.decision_note && <div className="admin-note">意见：{r.decision_note}</div>}
            {r.scope_decisions && (
              <div className="admin-note">
                Scope 决策：
                {r.scope_decisions.map((d) => (
                  <span key={d.scope} className={d.decision === 'approved' ? 'admin-risk risk-info' : 'admin-risk'} style={{ marginLeft: 4 }}>
                    {d.scope}: {d.decision === 'approved' ? '批准' : '拒绝'}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="admin-section">
        <h2>8. Decision</h2>
        {pending_review ? (
          <ReviewDecisionPanel
            appId={appId}
            review={pending_review}
            csrf={me?.csrf_token ?? ''}
            onDone={async () => {
              setNotice('操作成功')
              await reload()
            }}
            onError={setError}
          />
        ) : (
          <RuntimeActionsPanel
            appId={appId}
            status={application.status}
            isAdmin={isAdmin}
            csrf={me?.csrf_token ?? ''}
            onDone={async (msg) => {
              setNotice(msg)
              await reload()
            }}
            onError={setError}
          />
        )}
      </section>
    </div>
  )
}

/** Redirect URI 风险标记（与上一份审核对比） */
function RiskFlags({ uri, kind, homepageUrl, reviews }: {
  uri: string
  kind: string
  homepageUrl: string | null
  reviews: AdminReviewDTO[]
}) {
  const previousUris = useMemo(() => {
    const lastClosed = [...reviews].reverse().find((r) => r.status !== 'pending')
    return lastClosed?.redirect_uris.map((u) => u.uri) ?? []
  }, [reviews])
  const { flags } = classifyRedirectRisk({ uri, kind, homepage_url: homepageUrl, previousUris })
  if (flags.length === 0) return null
  return (
    <>
      {flags.map((f) => (
        <span key={f} className={f === 'changed' ? 'admin-risk risk-info' : 'admin-risk'}>
          {REDIRECT_RISK_LABELS[f]}
        </span>
      ))}
    </>
  )
}

/** 决策面板：逐 scope 批准/拒绝 + 整体意见 + 通过/拒绝（敏感 scope 走 step-up） */
function ReviewDecisionPanel({ appId, review, csrf, onDone, onError }: {
  appId: string
  review: AdminReviewDTO
  csrf: string
  onDone: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected'>>(() =>
    Object.fromEntries(review.scopes.map((s) => [s.scope, 'approved' as const])),
  )
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const hasSensitive = review.scopes.some((s) => scopeRisk(s.scope) === 'sensitive')

  async function submit(mode: 'approve' | 'reject') {
    if (!csrf) return
    setBusy(true)
    onError('')
    try {
      if (mode === 'approve') {
        const scopeDecisions: ScopeDecisionInput[] = review.scopes.map((s) => ({
          scope: s.scope,
          decision: decisions[s.scope] ?? 'approved',
        }))
        await approveReview(appId, review.id, { scope_decisions: scopeDecisions, note: note || null }, csrf)
      } else {
        if (reason.trim().length === 0) {
          onError('拒绝必须填写开发者可读的原因')
          setBusy(false)
          return
        }
        await rejectReview(appId, review.id, reason, csrf)
      }
      await onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {hasSensitive && (
        <div className="admin-warning-banner" role="note">
          本审核包含敏感 Scope（student.identity / offline_access）。批准前请核实：用途是否确需学校身份、
          隐私政策是否说明用途与保存期限、是否只需要「是 Mini-HBUT 用户」而不是学号。
          此操作要求近期认证（10 分钟内完成过登录），过期将引导重新认证。
        </div>
      )}
      <p className="admin-muted" style={{ marginBottom: 10 }}>
        审核快照 {shortId(review.id)}（revision {shortId(review.revision)}），提交于 {formatTime(review.submitted_at)}；
        以下决策基于不可变快照，应用内容在此期间变化会自动作废本次审核。
      </p>
      {review.scopes.map((s) => (
        <div className="admin-scope-item" key={s.scope}>
          <div>
            <strong>{scopeLabel(s.scope)}</strong>
            <span className={`admin-risk ${scopeRisk(s.scope) === 'sensitive' ? '' : 'risk-info'}`} style={{ marginLeft: 8 }}>
              {scopeRisk(s.scope) === 'sensitive' ? '敏感' : '基础'}
            </span>
          </div>
          <div className="admin-checkbox-row">
            <label><input type="radio" name={`scope-${s.scope}`} checked={decisions[s.scope] === 'approved'} onChange={() => setDecisions((d) => ({ ...d, [s.scope]: 'approved' }))} /> 批准</label>
            <label><input type="radio" name={`scope-${s.scope}`} checked={decisions[s.scope] === 'rejected'} onChange={() => setDecisions((d) => ({ ...d, [s.scope]: 'rejected' }))} /> 拒绝</label>
          </div>
        </div>
      ))}
      <div className="admin-form-row" style={{ marginTop: 12 }}>
        <label htmlFor="review-note">整体审核意见（可选）</label>
        <textarea id="review-note" className="admin-textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </div>
      <div className="admin-form-row">
        <label htmlFor="reject-reason">拒绝原因（拒绝时必填，开发者可见）</label>
        <textarea id="reject-reason" className="admin-textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="例如：redirect URI 不符合要求 / 用途描述不足 / 缺少隐私政策…" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="admin-btn admin-btn-primary" disabled={busy || !csrf} onClick={() => void submit('approve')}>
          通过并激活
        </button>
        <button className="admin-btn admin-btn-danger" disabled={busy || !csrf} onClick={() => void submit('reject')}>
          拒绝
        </button>
      </div>
    </div>
  )
}

/** 非 pending 状态的管理动作（suspend / unsuspend / revoke；identity_admin + step-up） */
function RuntimeActionsPanel({ appId, status, isAdmin, csrf, onDone, onError }: {
  appId: string
  status: string
  isAdmin: boolean
  csrf: string
  onDone: (msg: string) => Promise<void>
  onError: (msg: string) => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (!isAdmin) {
    return <p className="admin-muted">需要 identity_admin 角色才能执行 Suspend/Revoke（审核员仅可处理待审核应用）。</p>
  }

  async function run(action: 'suspend' | 'unsuspend' | 'revoke', label: string) {
    if (reason.trim().length === 0) {
      onError('请填写操作原因（将写入审计）')
      return
    }
    setBusy(true)
    onError('')
    try {
      if (action === 'suspend') await suspendApp(appId, reason, csrf)
      else if (action === 'unsuspend') await unsuspendApp(appId, reason, csrf)
      else await revokeApp(appId, reason, csrf)
      await onDone(`${label}成功（已写入审计）`)
      setReason('')
    } catch (err) {
      onError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const canSuspend = status === 'active'
  const canUnsuspend = status === 'suspended'
  const canRevoke = !['revoked'].includes(status)

  return (
    <div>
      <div className="admin-form-row">
        <label htmlFor="runtime-reason">操作原因（必填，写入审计，不存 secret/token）</label>
        <input id="runtime-reason" className="admin-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="例如：安全事件响应 / 确认无风险后恢复" />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {canSuspend && (
          <button className="admin-btn admin-btn-warn" disabled={busy || !csrf} onClick={() => void run('suspend', '暂停')}>
            ⏸ 暂停 Client（新授权与刷新立即失效）
          </button>
        )}
        {canUnsuspend && (
          <button className="admin-btn admin-btn-primary" disabled={busy || !csrf} onClick={() => void run('unsuspend', '恢复')}>
            ▶ 恢复 Client
          </button>
        )}
        {canRevoke && (
          <button className="admin-btn admin-btn-danger" disabled={busy || !csrf} onClick={() => void run('revoke', '撤销')}>
            🚫 永久撤销（终态不可逆）
          </button>
        )}
      </div>
      <p className="admin-note">
        暂停/撤销会真实作用于 oidc-provider：新 authorize 与 token refresh 立即失败，全部 grant/token 链被撤销。
        这些是高风险动作，要求近期认证（10 分钟内），过期将引导重新登录。
      </p>
    </div>
  )
}

function statusBadgeClass(status: string): string {
  return `admin-badge badge-${status}`
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: '草稿', pending_review: '待审核', approved: '已批准', active: '已启用',
    rejected: '已拒绝', suspended: '已暂停', revoked: '已撤销',
  }
  return map[status] ?? status
}

function reviewStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '待审核', approved: '已通过', rejected: '已拒绝', superseded: '已作废（内容变更）',
  }
  return map[status] ?? status
}

function scopeStatusLabel(status: string): string {
  const map: Record<string, string> = { requested: '申请中', approved: '已批准', rejected: '已拒绝' }
  return map[status] ?? status
}

function clientTypeLabel(t: string): string {
  const map: Record<string, string> = {
    web_confidential: 'Web（confidential）',
    native_public: 'Native（public）',
    browser_public: 'Browser（public）',
  }
  return map[t] ?? t
}

function kindLabel(k: string): string {
  const map: Record<string, string> = {
    web_https: 'Web HTTPS',
    native_custom: 'Native 自定义 scheme',
    native_loopback: 'Native loopback',
  }
  return map[k] ?? k
}
