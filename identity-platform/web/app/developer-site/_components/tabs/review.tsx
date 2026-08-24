/**
 * Tab 5：Review —— 当前状态 / 提交时间 / 请求 scopes / 管理员反馈 / 拒绝原因 /
 * 需修改项目 / 重新提交按钮。被拒绝时必须展示可行动的 review note（不只红色失败）。
 */
'use client'

import { useState } from 'react'
import { ClientApiError, submitApp } from '../api'
import { canSubmit } from '@/lib/developer/status'
import { StatusBadge } from '../status-badge'
import type { TabProps } from './types'

export function ReviewTab({ app, me, setApp, reload }: TabProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setBusy(true)
    setError(null)
    try {
      const updated = await submitApp(app.id, me.csrf_token)
      setApp(updated)
      void reload()
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '提交失败')
    } finally {
      setBusy(false)
    }
  }

  const rejected = app.status === 'rejected'
  const submittable = canSubmit(app.status)

  return (
    <div className="dev-card">
      <h2>审核</h2>
      <p className="dev-inline-hint">查看审核进度与管理员的反馈；被拒绝时按「需要修改的项目」改完后可重新提交。</p>
      {error && <div className="dev-error">{error}</div>}

      <dl className="dev-kv">
        <dt>当前状态</dt>
        <dd>
          <StatusBadge status={app.status} />
        </dd>
      </dl>
      <dl className="dev-kv">
        <dt>提交时间</dt>
        <dd>{app.submitted_at ? new Date(app.submitted_at).toLocaleString('zh-CN') : '尚未提交'}</dd>
      </dl>
      <dl className="dev-kv">
        <dt>请求的 Scopes</dt>
        <dd>
          {app.scopes.map((s) => (
            <span key={s.scope} style={{ marginRight: 8 }}>
              <code>{s.scope}</code>
              {s.status === 'approved' ? '（已批准）' : s.status === 'rejected' ? '（已拒绝）' : '（待批准）'}
            </span>
          ))}
        </dd>
      </dl>
      <dl className="dev-kv">
        <dt>审核时间</dt>
        <dd>{app.review.reviewed_at ? new Date(app.review.reviewed_at).toLocaleString('zh-CN') : '—'}</dd>
      </dl>
      <dl className="dev-kv">
        <dt>审核结论</dt>
        <dd>
          {app.review.decision === 'approved' ? (
            <span className="dev-success">已批准（待启用）</span>
          ) : app.review.decision === 'rejected' ? (
            <span style={{ color: 'var(--danger)' }}>已拒绝</span>
          ) : (
            '待审核'
          )}
        </dd>
      </dl>

      {rejected && (
        <div className="dev-confirm-panel" style={{ borderColor: '#f0b8b3' }}>
          <h3 style={{ margin: '0 0 8px' }}>被拒绝原因</h3>
          {app.review.rejection_reason ? (
            <p style={{ margin: '0 0 8px' }}>{app.review.rejection_reason}</p>
          ) : (
            <p style={{ margin: '0 0 8px' }}>管理员未填写具体原因，请通过文档页「Errors」中的联系方式咨询。</p>
          )}
          {app.review.needs_changes && app.review.needs_changes.length > 0 && (
            <>
              <p style={{ margin: '0 0 4px' }}>
                <strong>需要修改的项目：</strong>
              </p>
              <ul>
                {app.review.needs_changes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {app.review.review_notes && <p style={{ margin: '8px 0 0' }}>管理员补充：{app.review.review_notes}</p>}
        </div>
      )}

      {submittable && (
        <p style={{ marginTop: 16 }}>
          {app.status === 'rejected' ? (
            <>
              已根据反馈修改完成？修改 Redirect URI / Scope / 基本信息后，
            </>
          ) : (
            '确认信息无误后提交审核：'
          )}
          <button type="button" className="dev-btn dev-btn-primary" disabled={busy} onClick={() => void handleSubmit()}>
            {busy ? '提交中…' : app.status === 'rejected' ? '重新提交审核' : '提交审核'}
          </button>
        </p>
      )}
    </div>
  )
}
