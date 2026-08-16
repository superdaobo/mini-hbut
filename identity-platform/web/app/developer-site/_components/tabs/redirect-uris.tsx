/**
 * Tab 2：Redirect URIs —— 列表（完整 URI / 类型 / 校验状态 / 删除）+ 新增表单。
 * 前端实时提示，服务端最终重新校验；Pending 及之后修改会自动重新进入审核。
 */
'use client'

import { useState } from 'react'
import type { RedirectUriKind } from '@/lib/developer/contract'
import { validateRedirectUri } from '@/lib/developer/redirect-uri'
import { ClientApiError, addRedirectUri, removeRedirectUri } from '../api'
import { editLockedHint, type TabProps } from './types'

const KIND_LABEL: Record<RedirectUriKind, string> = {
  web_https: 'Web https',
  native_custom: 'Native 自定义 scheme',
  native_loopback: 'Native loopback',
}

const KIND_OPTIONS: ReadonlyArray<{ value: RedirectUriKind; label: string }> = [
  { value: 'web_https', label: 'Web（https）' },
  { value: 'native_custom', label: 'Native 自定义 scheme（my-app:/…）' },
  { value: 'native_loopback', label: 'Native loopback（http://127.0.0.1:动态端口/…）' },
]

export function RedirectUrisTab({ app, me, setApp, reload }: TabProps) {
  const [uri, setUri] = useState('')
  const [kind, setKind] = useState<RedirectUriKind>(app.client_type === 'web_confidential' ? 'web_https' : 'native_custom')
  const [hint, setHint] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reReview = app.status === 'pending_review' || app.status === 'approved' || app.status === 'active' || app.status === 'suspended'

  function onUriChange(value: string) {
    setUri(value)
    if (value) {
      const v = validateRedirectUri(value, kind)
      setHint(v.ok ? { ok: true, text: '格式合法（服务端将最终校验）' } : { ok: false, text: v.error ?? '格式非法' })
    } else {
      setHint(null)
    }
  }

  async function handleAdd() {
    setBusy(true)
    setError(null)
    try {
      const updated = await addRedirectUri(app.id, uri.trim(), kind, me.csrf_token)
      setApp(updated)
      setUri('')
      setHint(null)
      void reload()
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(rid: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await removeRedirectUri(app.id, rid, me.csrf_token)
      setApp(updated)
      void reload()
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dev-card">
      <h2>Redirect URIs</h2>
      <p className="dev-inline-hint">
        服务端精确匹配注册值：禁止通配符 / fragment / userinfo / 前缀后缀扩展。
        {editLockedHint(app)}
      </p>
      {reReview && (
        <p className="dev-recheck-note">
          ⚠️ 当前应用已提交/启用：修改 Redirect URI 将使应用自动重新进入审核，期间不可用。
        </p>
      )}
      {error && <div className="dev-error">{error}</div>}

      <ul className="dev-list">
        {app.redirect_uris.map((r) => (
          <li key={r.id}>
            <span>
              <code>{r.uri}</code>
              <span className="dev-inline-hint">
                {' '}
                [{KIND_LABEL[r.kind]} ·{' '}
                {r.validation_status === 'approved' ? '已生效' : '待审核'}]
              </span>
            </span>
            <button
              type="button"
              className="dev-btn dev-btn-danger"
              disabled={busy || app.redirect_uris.length <= 1}
              onClick={() => void handleRemove(r.id)}
            >
              删除
            </button>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <input
          className="dev-input"
          style={{ flex: 1, minWidth: 260 }}
          value={uri}
          onChange={(e) => onUriChange(e.target.value)}
          placeholder={
            kind === 'native_loopback'
              ? 'http://127.0.0.1:动态端口/callback'
              : kind === 'native_custom'
                ? 'my-app:/oauth/callback'
                : 'https://example.com/oauth/callback'
          }
        />
        <select className="dev-select" value={kind} onChange={(e) => setKind(e.target.value as RedirectUriKind)}>
          {KIND_OPTIONS.filter((o) => (app.client_type === 'web_confidential' ? o.value === 'web_https' : o.value !== 'web_https')).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" className="dev-btn dev-btn-primary" disabled={busy || !uri.trim()} onClick={() => void handleAdd()}>
          添加
        </button>
      </div>
      {hint && (
        <p className="dev-inline-hint" style={{ marginTop: 6, color: hint.ok ? '#1a7f37' : undefined }}>
          {hint.text}
        </p>
      )}
    </div>
  )
}
