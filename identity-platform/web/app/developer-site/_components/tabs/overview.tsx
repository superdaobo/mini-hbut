/**
 * Tab 1：Overview —— 基本信息展示 + 可编辑表单（仅 draft/rejected）。
 */
'use client'

import { useState } from 'react'
import { ClientApiError, updateApp } from '../api'
import { editLocked, editLockedHint, type TabProps } from './types'

export function OverviewTab({ app, me, setApp, reload }: TabProps) {
  const locked = editLocked(app)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(app.name)
  const [description, setDescription] = useState(app.description ?? '')
  const [homepageUrl, setHomepageUrl] = useState(app.homepage_url ?? '')
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState(app.privacy_policy_url ?? '')
  const [contact, setContact] = useState(app.contact ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function handleSave() {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const updated = await updateApp(
        app.id,
        {
          name: name.trim(),
          description: description.trim(),
          homepage_url: homepageUrl.trim() || null,
          privacy_policy_url: privacyPolicyUrl.trim() || null,
          contact: contact.trim() || null,
        },
        me.csrf_token,
      )
      setApp(updated)
      setEditing(false)
      setOk('已保存（草稿）')
      void reload()
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dev-card">
      <h2>概览</h2>
      {ok && <div className="dev-success">{ok}</div>}
      {error && <div className="dev-error">{error}</div>}
      {locked && <p className="dev-inline-hint">{editLockedHint(app)}</p>}

      {editing ? (
        <>
          <div className="dev-field">
            <label>应用名称</label>
            <input className="dev-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="dev-field">
            <label>应用描述</label>
            <textarea className="dev-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <div className="dev-field">
            <label>主页 URL</label>
            <input className="dev-input" value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} />
          </div>
          <div className="dev-field">
            <label>隐私政策 URL</label>
            <input className="dev-input" value={privacyPolicyUrl} onChange={(e) => setPrivacyPolicyUrl(e.target.value)} />
          </div>
          <div className="dev-field">
            <label>开发者联系方式</label>
            <input className="dev-input" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <button type="button" className="dev-btn dev-btn-primary" disabled={busy} onClick={() => void handleSave()}>
            {busy ? '保存中…' : '保存'}
          </button>{' '}
          <button type="button" className="dev-btn" onClick={() => setEditing(false)}>
            取消
          </button>
        </>
      ) : (
        <>
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
          {!locked && (
            <button type="button" className="dev-btn" onClick={() => setEditing(true)}>
              编辑基本信息
            </button>
          )}
        </>
      )}
    </div>
  )
}
