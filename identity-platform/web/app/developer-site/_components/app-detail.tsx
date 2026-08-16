/**
 * 应用详情容器（client component）：加载详情 + 7 个 Tab 切换。
 * 持有 app 状态与一次性 secret（create/rotate 响应），Tab 间共享刷新。
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DeveloperAppDetailDTO } from '@/lib/developer/contract'
import { ClientApiError, fetchApp, fetchMe } from './api'
import type { MeResult } from './api'
import { OverviewTab } from './tabs/overview'
import { RedirectUrisTab } from './tabs/redirect-uris'
import { ScopesTab } from './tabs/scopes'
import { CredentialsTab } from './tabs/credentials'
import { ReviewTab } from './tabs/review'
import { AuditTab } from './tabs/audit'
import { DangerZoneTab } from './tabs/danger'

/** 应用状态中文标签（面向非专业用户，不暴露内部英文状态名） */
const STATUS_ZH: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '已批准',
  active: '已启用',
  rejected: '已拒绝',
  suspended: '已暂停',
  revoked: '已撤销',
}

function appStatusZh(status: string): string {
  return STATUS_ZH[status] ?? status
}

const TABS = [
  { id: 'overview', label: '概览' },
  { id: 'redirect-uris', label: '回调地址' },
  { id: 'scopes', label: '权限' },
  { id: 'credentials', label: '凭据' },
  { id: 'review', label: '审核' },
  { id: 'audit', label: '动态' },
  { id: 'danger', label: '危险操作' },
] as const

type TabId = (typeof TABS)[number]['id']

export function AppDetail({ appId }: { appId: string }) {
  const [app, setApp] = useState<DeveloperAppDetailDTO | null>(null)
  const [me, setMe] = useState<MeResult | null>(null)
  const [tab, setTab] = useState<TabId>('overview')
  const [error, setError] = useState<string | null>(null)
  /** 一次性 secret（rotate 响应），仅内存持有，刷新即失 */
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const detail = await fetchApp(appId)
      setApp(detail)
      setError(null)
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '加载失败')
    }
  }, [appId])

  useEffect(() => {
    let alive = true
    fetchMe()
      .then((m) => {
        if (alive) {
          setMe(m)
        }
      })
      .catch(() => {
        // 401 已在 fetchMe 内跳登录
      })
    fetchApp(appId)
      .then((detail) => {
        if (alive) {
          setApp(detail)
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof ClientApiError ? err.message : '加载失败')
        }
      })
    return () => {
      alive = false
    }
  }, [appId])

  if (error) {
    return <div className="dev-error">{error}</div>
  }
  if (!app || !me) {
    return <div className="dev-empty">加载中…</div>
  }

  const tabProps = {
    app,
    me,
    setApp,
    oneTimeSecret,
    setOneTimeSecret,
    reload,
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{app.name}</h1>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <span className={`dev-status ${app.status === 'active' ? 'status-active' : app.status === 'rejected' ? 'status-rejected' : app.status === 'pending_review' ? 'status-pending' : app.status === 'suspended' ? 'status-suspended' : app.status === 'revoked' ? 'status-revoked' : app.status === 'approved' ? 'status-approved' : ''}`}>
          {appStatusZh(app.status)}
        </span>
        <code className="dev-mono">{app.client_id}</code>
        <span className="dev-inline-hint">{app.client_type === 'web_confidential' ? 'Web 应用（服务端）' : '原生 / 移动端应用'}</span>
      </div>

      <div className="dev-tabs" role="tablist" aria-label="应用详情">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className="dev-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab {...tabProps} />}
      {tab === 'redirect-uris' && <RedirectUrisTab {...tabProps} />}
      {tab === 'scopes' && <ScopesTab {...tabProps} />}
      {tab === 'credentials' && <CredentialsTab {...tabProps} />}
      {tab === 'review' && <ReviewTab {...tabProps} />}
      {tab === 'audit' && <AuditTab {...tabProps} />}
      {tab === 'danger' && <DangerZoneTab {...tabProps} />}
    </div>
  )
}
