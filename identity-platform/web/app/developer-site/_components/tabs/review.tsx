/**
 * Tab 5：Review —— 当前状态 / 提交时间 / 请求 scopes / 管理员反馈 / 拒绝原因（只读）。
 * P4-4（mini-hbut#1219）：提交/重新提交按钮移除（自建注册表审核流退役）；
 * 审核改由清单仓库 manifest/apps.json + PR 审核完成。
 */
'use client'

import { StatusBadge } from '../status-badge'
import type { TabProps } from './types'

export function ReviewTab({ app }: TabProps) {
  const rejected = app.status === 'rejected'

  return (
    <div className="dev-card">
      <h2>审核</h2>
      <p className="dev-inline-hint">
        查看审核进度与反馈（只读）。自建注册表已退役：接入与变更的审核统一在
        清单仓库通过 PR 完成。
      </p>

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

      <p style={{ marginTop: 16, marginBottom: 0 }} className="dev-inline-hint">
        如需重新提交或修改申请内容：在清单仓库 <code>manifest/apps.json</code> 更新条目并重新开 PR。
      </p>
    </div>
  )
}
