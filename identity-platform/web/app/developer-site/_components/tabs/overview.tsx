/**
 * Tab 1：Overview —— 基本信息只读展示。
 * P4-4（mini-hbut#1219）：编辑表单移除（自建注册表退役）；
 * 应用信息变更改由清单仓库 manifest/apps.json + PR 审核。
 */
'use client'

import type { TabProps } from './types'

export function OverviewTab({ app }: TabProps) {
  return (
    <div className="dev-card">
      <h2>概览</h2>
      <p className="dev-inline-hint">
        应用的基本信息与身份标识（只读）。需要变更时，请在清单仓库对
        <code> manifest/apps.json </code>
        提交 PR。
      </p>

      <dl className="dev-kv">
        <dt>应用 ID</dt>
        <dd>
          <code className="dev-mono">{app.id}</code>
        </dd>
      </dl>
      <dl className="dev-kv">
        <dt>Client ID</dt>
        <dd>
          <code className="dev-mono">{app.client_id}</code>
          <span className="dev-inline-hint"> 应用的公开身份标识，接入时填进你的代码或配置里；它不是机密，可以放心展示。</span>
        </dd>
      </dl>
      <dl className="dev-kv">
        <dt>应用描述</dt>
        <dd>{app.description || '—'}</dd>
      </dl>
      <dl className="dev-kv">
        <dt>主页 URL</dt>
        <dd>{app.homepage_url ?? '—'}</dd>
      </dl>
      <dl className="dev-kv">
        <dt>隐私政策 URL</dt>
        <dd>{app.privacy_policy_url ?? '—'}</dd>
      </dl>
      <dl className="dev-kv">
        <dt>开发者联系方式</dt>
        <dd>{app.contact ?? '—'}</dd>
      </dl>
      <dl className="dev-kv">
        <dt>创建时间</dt>
        <dd>{new Date(app.created_at).toLocaleString('zh-CN')}</dd>
      </dl>
      <dl className="dev-kv">
        <dt>最近更新</dt>
        <dd>{new Date(app.updated_at).toLocaleString('zh-CN')}</dd>
      </dl>
    </div>
  )
}
