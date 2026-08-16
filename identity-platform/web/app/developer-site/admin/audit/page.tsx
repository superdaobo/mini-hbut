/**
 * /admin/audit —— 审计日志（issue #625；仅 identity_admin，BFF/Core 双重校验）。
 * 事件不含 secret/token/handoff（Core 侧 strict 脱敏）。
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchAdminMe, fetchAudit, AdminClientApiError } from '../_components/admin-api'
import type { AdminAuditEntryDTO } from '@/lib/admin/contract'
import { formatTime, shortId } from '../page'

const EVENT_LABELS: Record<string, string> = {
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

export default function AdminAuditPage() {
  const [events, setEvents] = useState<AdminAuditEntryDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [eventType, setEventType] = useState('')

  const load = useCallback(async (type: string) => {
    setError(null)
    try {
      const me = await fetchAdminMe()
      setIsAdmin(me.admin.roles.includes('identity_admin'))
      setEvents(await fetchAudit({ event_type: type || undefined, limit: 100 }))
    } catch (err) {
      if (err instanceof AdminClientApiError && err.status === 401) return
      setError(err instanceof Error ? err.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    void load('')
  }, [load])

  if (error) {
    return (
      <div>
        <h1 className="admin-title">审计日志</h1>
        <div className="admin-error">{error}</div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="admin-title">审计日志</h1>
      {!isAdmin && !error && <div className="admin-empty">审计查询仅限 identity_admin 角色</div>}
      {isAdmin && (
        <>
          <div className="admin-filters">
            <select className="admin-select" value={eventType} onChange={(e) => { setEventType(e.target.value); void load(e.target.value) }} aria-label="按事件过滤">
              <option value="">全部事件</option>
              {Object.entries(EVENT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          {!events && <div className="admin-empty">加载中…</div>}
          {events && events.length === 0 && <div className="admin-empty">暂无审计事件</div>}
          {events && events.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>事件</th>
                  <th>操作者</th>
                  <th>对象</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="admin-muted">{formatTime(e.created_at)}</td>
                    <td>{EVENT_LABELS[e.event_type] ?? e.event_type}</td>
                    <td className="admin-muted">{e.actor_type} {e.actor_id ? shortId(e.actor_id) : ''}</td>
                    <td className="admin-muted">{e.target_type ?? '-'} {e.target_id ? shortId(e.target_id) : ''}</td>
                    <td className="admin-muted"><MetaPreview metadata={e.metadata} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

function MetaPreview({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata ?? {})
  if (entries.length === 0) return <span>—</span>
  return (
    <span className="admin-code">
      {entries.map(([k, v]) => `${k}=${typeof v === 'string' ? shortId(v) : String(v)}`).join(' ')}
    </span>
  )
}
