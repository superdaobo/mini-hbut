/**
 * Tab 3：Scopes —— 已授予数据域 / 权限的只读列表（含审核状态）。
 * P4-4（mini-hbut#1219）：勾选/理由/保存表单移除（自建注册表退役）；
 * 数据域申请改由清单仓库 manifest/apps.json + PR 审核。
 */
'use client'

import type { ScopeId } from '@/lib/developer/scopes'
import { SCOPE_META } from '@/lib/developer/scopes'
import { ScopeStatusBadge } from '../status-badge'
import type { TabProps } from './types'

export function ScopesTab({ app }: TabProps) {
  return (
    <div className="dev-card">
      <h2>权限（Scopes）</h2>
      <p className="dev-inline-hint">
        你的应用当前申请/已授予的用户数据域（只读）。标记「敏感」的 scope 需使用理由与管理员批准。
        需要变更时，请在清单仓库对 <code>manifest/apps.json</code> 提交 PR。
      </p>

      {app.scopes.length === 0 ? (
        <div className="dev-empty">尚未申请任何数据域</div>
      ) : (
        <ul className="dev-list">
          {app.scopes.map((s) => {
            const meta = SCOPE_META[s.scope as ScopeId]
            return (
              <li key={s.scope} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <strong>
                    <code>{s.scope}</code>
                  </strong>
                  {meta?.risk === 'sensitive' && <span className="risk-tag">敏感</span>}
                  {meta?.mandatory && <span className="dev-inline-hint">必选</span>}
                  <ScopeStatusBadge status={s.status} />
                </div>
                {meta?.description && <p className="dev-inline-hint">{meta.description}</p>}
                {s.justification && (
                  <p className="dev-inline-hint">申请理由：{s.justification}</p>
                )}
                {s.review_note && (
                  <p className="dev-inline-hint" style={{ color: '#b45309' }}>
                    审核意见：{s.review_note}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
