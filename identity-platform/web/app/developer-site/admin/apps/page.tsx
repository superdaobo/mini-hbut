/**
 * /admin/apps —— 应用审核队列（issue #625）：
 * 默认 pending 优先；支持 status / client_type / 敏感 scope / 搜索过滤。
 */
'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchApps, AdminClientApiError } from '../_components/admin-api'
import type { AdminAppSummaryDTO } from '@/lib/admin/contract'
import { scopeLabel } from '@/lib/admin/risk'
import { formatTime, shortId } from '../page'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending_review', label: '待审核' },
  { value: 'draft', label: '草稿' },
  { value: 'approved', label: '已批准' },
  { value: 'active', label: '已启用' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'suspended', label: '已暂停' },
  { value: 'revoked', label: '已撤销' },
]

function statusBadgeClass(status: string): string {
  return `admin-badge badge-${status}`
}

function AppsListInner() {
  const searchParams = useSearchParams()
  const [apps, setApps] = useState<AdminAppSummaryDTO[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState(searchParams.get('status') ?? '')
  const [clientType, setClientType] = useState('')
  const [sensitiveOnly, setSensitiveOnly] = useState(searchParams.get('sensitive_scope') === '1')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const load = useCallback(async (opts: { status: string; clientType: string; sensitiveOnly: boolean; search: string }) => {
    setError(null)
    try {
      const result = await fetchApps({
        status: opts.status || undefined,
        client_type: opts.clientType || undefined,
        sensitive_scope: opts.sensitiveOnly,
        search: opts.search || undefined,
      })
      setApps(result.apps)
      setTotal(result.total)
    } catch (err) {
      if (err instanceof AdminClientApiError && err.status === 401) return
      setError(err instanceof Error ? err.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    void load({ status, clientType, sensitiveOnly, search })
  }, [load, status, clientType, sensitiveOnly, search])

  return (
    <div>
      <h1 className="admin-title">应用审核队列</h1>
      <div className="admin-filters">
        <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="按状态过滤">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select className="admin-select" value={clientType} onChange={(e) => setClientType(e.target.value)} aria-label="按类型过滤">
          <option value="">全部类型</option>
          <option value="web_confidential">Web（confidential）</option>
          <option value="native_public">Native（public）</option>
          <option value="browser_public">Browser（public）</option>
        </select>
        <label className="admin-checkbox-row">
          <input type="checkbox" checked={sensitiveOnly} onChange={(e) => setSensitiveOnly(e.target.checked)} />
          仅含敏感 Scope
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(searchInput.trim())
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            className="admin-input"
            style={{ maxWidth: 220 }}
            placeholder="搜索应用名 / client_id / 开发者"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="搜索"
          />
          <button className="admin-btn" type="submit">搜索</button>
        </form>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {!apps && !error && <div className="admin-empty">加载中…</div>}
      {apps && (
        <>
          <p className="admin-muted" style={{ marginBottom: 10 }}>共 {total} 个应用（默认待审核优先）</p>
          {apps.length === 0 && <div className="admin-empty">没有符合条件的应用</div>}
          {apps.length > 0 && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>应用</th>
                  <th>状态</th>
                  <th>开发者</th>
                  <th>Scope</th>
                  <th>提交时间</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <a href={`/admin/apps/${app.id}`} style={{ fontWeight: 500, color: '#3730a3' }}>{app.name}</a>
                      <div className="admin-muted">
                        <span className="admin-code">{app.client_id}</span>
                      </div>
                    </td>
                    <td><span className={statusBadgeClass(app.status)}>{statusLabel(app.status)}</span></td>
                    <td>
                      {app.developer.display_name}
                      {app.developer.user_id && <div className="admin-muted">id {shortId(app.developer.user_id)}</div>}
                    </td>
                    <td>
                      {app.scope_risks.length === 0 && <span className="admin-muted">—</span>}
                      {app.scope_risks.map((s) => (
                        <span key={s} className="admin-risk">{scopeLabel(s)}</span>
                      ))}
                    </td>
                    <td className="admin-muted">{app.submitted_at ? formatTime(app.submitted_at) : '—'}</td>
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

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: '草稿',
    pending_review: '待审核',
    approved: '已批准',
    active: '已启用',
    rejected: '已拒绝',
    suspended: '已暂停',
    revoked: '已撤销',
  }
  return map[status] ?? status
}

export default function AdminAppsPage() {
  return (
    <Suspense fallback={<div className="admin-empty">加载中…</div>}>
      <AppsListInner />
    </Suspense>
  )
}
