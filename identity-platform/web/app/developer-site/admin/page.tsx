/**
 * /admin —— 审核概览（issue #625）：
 * 待审核应用数 / 待审核敏感 Scope / Active Client 数 / Suspended Client 数 / 最近安全事件。
 */
'use client'

import { useEffect, useState } from 'react'
import { fetchAdminMe, fetchOverview, AdminClientApiError, type MeResult } from './_components/admin-api'
import type { AdminOverviewDTO, AdminAuditEntryDTO } from '@/lib/admin/contract'

export default function AdminOverviewPage() {
  const [me, setMe] = useState<MeResult | null>(null)
  const [overview, setOverview] = useState<AdminOverviewDTO | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [meResult, overviewResult] = await Promise.all([fetchAdminMe(), fetchOverview()])
        if (cancelled) return
        setMe(meResult)
        setOverview(overviewResult)
      } catch (err) {
        if (err instanceof AdminClientApiError && err.status === 401) return // 已跳登录
        setError(err instanceof Error ? err.message : '加载失败')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const isAdmin = me?.admin.roles.includes('identity_admin') ?? false

  return (
    <div>
      <h1 className="admin-title">管理员审核概览</h1>
      {me && (
        <p className="admin-muted" style={{ marginBottom: 16 }}>
          当前身份：{me.admin.display_name}
          {me.admin.roles.map((r) => (
            <span key={r} className="admin-badge badge-default" style={{ marginLeft: 8 }}>
              {r === 'identity_admin' ? '管理员' : '审核员'}
            </span>
          ))}
        </p>
      )}
      {error && <div className="admin-error">{error}</div>}
      {!overview && !error && <div className="admin-empty">加载中…</div>}

      {overview && (
        <>
          <div className="admin-grid">
            <a className="admin-card admin-card-warn" href="/admin/apps?status=pending_review" style={{ textDecoration: 'none' }}>
              <div className="admin-card-value">{overview.pending_reviews}</div>
              <div className="admin-card-label">待审核应用</div>
            </a>
            <a className="admin-card admin-card-warn" href="/admin/apps?sensitive_scope=1" style={{ textDecoration: 'none' }}>
              <div className="admin-card-value">{overview.pending_sensitive_scopes}</div>
              <div className="admin-card-label">待审核敏感 Scope 项</div>
            </a>
            <div className="admin-card">
              <div className="admin-card-value">{overview.active_clients}</div>
              <div className="admin-card-label">Active Client 数</div>
            </div>
            <div className="admin-card">
              <div className="admin-card-value">{overview.suspended_clients}</div>
              <div className="admin-card-label">Suspended Client 数</div>
            </div>
          </div>

          <div className="admin-section">
            <h2>最近安全事件</h2>
            {overview.recent_events.length === 0 && <div className="admin-empty">暂无事件</div>}
            {overview.recent_events.length > 0 && (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>事件</th>
                    <th>对象</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recent_events.map((e) => (
                    <tr key={e.id}>
                      <td><EventLabel event={e} /></td>
                      <td className="admin-muted">{e.target_type ?? '-'} {e.target_id ? <span className="admin-code">{shortId(e.target_id)}</span> : ''}</td>
                      <td className="admin-muted">{formatTime(e.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {isAdmin && (
              <p style={{ marginTop: 10 }}>
                <a className="admin-btn" href="/admin/audit">查看完整审计日志</a>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function EventLabel({ event }: { event: AdminAuditEntryDTO }) {
  const labels: Record<string, string> = {
    ADMIN_APP_APPROVED: '应用审核通过',
    ADMIN_APP_REJECTED: '应用审核拒绝',
    ADMIN_SCOPE_APPROVED: 'Scope 批准',
    ADMIN_SCOPE_REJECTED: 'Scope 拒绝',
    ADMIN_CLIENT_SUSPENDED: 'Client 暂停',
    ADMIN_CLIENT_UNSUSPENDED: 'Client 恢复',
    ADMIN_CLIENT_REVOKED: 'Client 撤销',
    ADMIN_ROLE_GRANTED: '管理员角色授予',
    ADMIN_ROLE_REVOKED: '管理员角色撤销',
  }
  return <span>{labels[event.event_type] ?? event.event_type}</span>
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}
