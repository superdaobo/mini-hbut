/**
 * Tab 3：Scopes —— 审核状态 + 理由 + 编辑（openid 锁定；敏感 scope 需理由；
 * Pending 及之后修改自动重新进入审核）。
 */
'use client'

import { useEffect, useState } from 'react'
import type { ScopeId } from '@/lib/developer/scopes'
import { SCOPE_META, SCOPE_WHITELIST } from '@/lib/developer/scopes'
import { ClientApiError, fetchScopes, putScopes } from '../api'
import { ScopeStatusBadge } from '../status-badge'
import { editLockedHint, type TabProps } from './types'

export function ScopesTab({ app, me, setApp, reload }: TabProps) {
  const [justifications, setJustifications] = useState<Record<string, string>>(() =>
    Object.fromEntries(app.scopes.map((s) => [s.scope, s.justification ?? ''])),
  )
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(app.scopes.map((s) => [s.scope, true])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // #687：初始化时经 BFF GET /scopes 拉一次权威列表（含审核状态与理由），
  // 覆盖本地初始态；失败时静默回退到详情自带的 scopes，不打断页面
  useEffect(() => {
    let alive = true
    fetchScopes(app.id)
      .then((scopes) => {
        if (!alive) return
        setJustifications(Object.fromEntries(scopes.map((s) => [s.scope, s.justification ?? ''])))
        setSelected(Object.fromEntries(scopes.map((s) => [s.scope, true])))
      })
      .catch(() => {
        // 静默回退：沿用详情接口的 scopes 数据
      })
    return () => {
      alive = false
    }
  }, [app.id])

  const reReview = app.status === 'pending_review' || app.status === 'approved' || app.status === 'active' || app.status === 'suspended'

  async function handleSave() {
    setBusy(true)
    setError(null)
    try {
      const chosen = (Object.keys(selected) as string[]).filter((s) => selected[s])
      // openid 必选（服务端也会校验）
      if (!chosen.includes('openid')) {
        throw new ClientApiError(400, 'invalid_request', '必须包含 openid（基础登录必选）')
      }
      const updated = await putScopes(
        app.id,
        chosen.map((s) => ({ scope: s, justification: justifications[s]?.trim() || null })),
        me.csrf_token,
      )
      setApp(updated)
      void reload()
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dev-card">
      <h2>权限（Scopes）</h2>
      <p className="dev-inline-hint">
        勾选你的应用需要拿到的用户数据；申请越多审核越严，按实际需要选择即可。
        <br />
        敏感 scope（student.identity / offline_access）需要使用理由、隐私政策与管理员人工批准。
        {editLockedHint(app)}
      </p>
      {reReview && (
        <p className="dev-recheck-note">
          ⚠️ 当前应用已提交/启用：修改 Scope 将使应用自动重新进入审核。
        </p>
      )}
      {error && <div className="dev-error">{error}</div>}

      <ul className="dev-list">
        {SCOPE_WHITELIST.map((id) => {
          const meta = SCOPE_META[id]
          const existing = app.scopes.find((s) => s.scope === id)
          const checked = selected[id] ?? !!existing
          const locked = meta.mandatory
          return (
            <li key={id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [id]: e.target.checked }))}
                />
                <strong>
                  <code>{meta.id}</code>
                </strong>
                {meta.risk === 'sensitive' && <span className="risk-tag">敏感</span>}
                {locked && <span className="dev-inline-hint">必选</span>}
                {existing && <ScopeStatusBadge status={existing.status} />}
              </div>
              <p className="dev-inline-hint">{meta.description}</p>
              {meta.requiresJustification && checked && (
                <textarea
                  className="dev-textarea"
                  style={{ marginTop: 8 }}
                  placeholder={`申请 ${meta.id} 的使用理由（必填，至少 10 字）`}
                  value={justifications[id] ?? ''}
                  onChange={(e) => setJustifications((prev) => ({ ...prev, [id]: e.target.value }))}
                />
              )}
              {existing?.review_note && (
                <p className="dev-inline-hint" style={{ color: '#b45309' }}>
                  审核意见：{existing.review_note}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <button type="button" className="dev-btn dev-btn-primary" disabled={busy} onClick={() => void handleSave()}>
        {busy ? '保存中…' : '保存 Scope 请求'}
      </button>
    </div>
  )
}
