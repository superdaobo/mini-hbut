/**
 * Tab 6：Audit / Activity —— 审计记录（secret 值永不出现；只读）。
 */
'use client'

import type { TabProps } from './types'

const ACTION_LABEL: Record<string, string> = {
  'app.created': '创建应用',
  'app.updated': '更新应用信息',
  'app.deleted': '删除应用',
  'app.submitted': '提交审核',
  'app.reviewed': '审核',
  'app.revoked': '撤销应用',
  'app.suspended': '暂停应用',
  'app.activated': '启用应用',
  'redirect_uri.added': '新增 Redirect URI',
  'redirect_uri.removed': '删除 Redirect URI',
  'scopes.updated': '更新 Scope',
  'secret.rotated': '轮换 Client Secret',
}

export function AuditTab({ app }: TabProps) {
  if (app.audit.length === 0) {
    return (
      <div className="dev-card">
        <h2>动态</h2>
        <p className="dev-inline-hint">应用的操作流水：创建、修改、轮换密钥等都会记录在这里。</p>
        <div className="dev-empty">暂无记录</div>
      </div>
    )
  }
  return (
    <div className="dev-card">
      <h2>动态</h2>
      <p className="dev-inline-hint">应用的操作流水：创建、修改、轮换密钥等都会记录在这里。</p>
      <p className="dev-inline-hint">记录不含任何 secret 明文（审计日志只记动作，不记值）。</p>
      <table className="dev-audit-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>操作者</th>
            <th>动作</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {app.audit.map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(entry.at).toLocaleString('zh-CN')}</td>
              <td>{entry.actor === 'admin' ? '管理员' : entry.actor === 'system' ? '系统' : '开发者'}</td>
              <td>{ACTION_LABEL[entry.action] ?? entry.action}</td>
              <td>{entry.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
