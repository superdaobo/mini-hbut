/**
 * Dashboard 应用列表（client component）。
 * 卡片：应用名称 / client_id（可复制）/ 类型 / 状态 / Scopes 摘要 / 最近更新时间。
 */
'use client'

import { useEffect, useState } from 'react'
import type { DeveloperAppSummaryDTO } from '@/lib/developer/contract'
import { ClientApiError, fetchApps } from './api'
import { StatusBadge } from './status-badge'

const CLIENT_TYPE_LABEL: Record<string, string> = {
  web_confidential: 'Web（Confidential）',
  native_public: 'Native（Public + PKCE）',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="dev-copy-btn"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}

export function AppsList() {
  const [apps, setApps] = useState<DeveloperAppSummaryDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchApps()
      .then((list) => {
        if (alive) {
          setApps(list)
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof ClientApiError ? err.message : '加载失败，请稍后重试')
        }
      })
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return <div className="dev-error">{error}</div>
  }
  if (!apps) {
    return <div className="dev-empty">加载中…</div>
  }
  if (apps.length === 0) {
    return (
      <div className="dev-empty">
        还没有应用。
        <a href="/apps/new" style={{ marginLeft: 8 }}>
          创建第一个应用 →
        </a>
      </div>
    )
  }

  return (
    <div className="dev-app-grid">
      {apps.map((app) => (
        <a key={app.id} className="dev-app-card" href={`/apps/${encodeURIComponent(app.id)}`}>
          <p className="dev-app-card-name">{app.name}</p>
          <div className="dev-app-card-meta">
            <StatusBadge status={app.status} />
            <span className="dev-mono">{app.client_id}</span>
            <CopyButton text={app.client_id} />
          </div>
          <div className="dev-app-card-meta">
            <span className="dev-inline-hint">{CLIENT_TYPE_LABEL[app.client_type]}</span>
          </div>
          <div className="dev-app-card-scopes">
            Scopes：{app.scopes.length > 0 ? app.scopes.join('、') : '—'}
          </div>
          <div className="dev-app-card-updated">最近更新：{new Date(app.updated_at).toLocaleString('zh-CN')}</div>
        </a>
      ))}
    </div>
  )
}
