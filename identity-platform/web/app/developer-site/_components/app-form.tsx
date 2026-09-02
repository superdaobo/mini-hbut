/**
 * 创建应用表单（/apps/new，client component）。
 * 字段（issue #624）：
 *  - 应用名称/描述必填；主页 URL 对 web_confidential 必填；
 *  - 隐私政策 URL 与开发者联系方式在申请敏感 scope 时必填；
 *  - Redirect URI 动态列表（前端实时提示，服务端最终校验）；
 *  - Scope：openid 必选锁定；敏感 scope 需填写使用理由。
 * 创建成功 → 先落 Draft；client_secret 一次性展示（仅此一次，刷新即失）。
 */
'use client'
import { TurnstileField } from './turnstile-field'

import { useState } from 'react'
import type { DeveloperClientType, RedirectUriKind } from '@/lib/developer/contract'
import { SCOPE_META, SCOPE_WHITELIST } from '@/lib/developer/scopes'
import type { ScopeId } from '@/lib/developer/scopes'
import { validateRedirectUri } from '@/lib/developer/redirect-uri'
import type { RedirectUriValidation } from '@/lib/developer/redirect-uri'
import { ClientApiError, createApp, fetchMe } from './api'

interface UriRow {
  uri: string
  kind: RedirectUriKind
  validation: RedirectUriValidation | null
}

interface ScopeRow {
  selected: boolean
  justification: string
}

const KIND_LABEL: Record<RedirectUriKind, string> = {
  web_https: 'Web（https）',
  native_custom: 'Native 自定义 scheme',
  native_loopback: 'Native loopback（127.0.0.1）',
}

export function AppForm() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [homepageUrl, setHomepageUrl] = useState('')
  const [clientType, setClientType] = useState<DeveloperClientType>('web_confidential')
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState('')
  const [contact, setContact] = useState('')
  const [uris, setUris] = useState<UriRow[]>([{ uri: '', kind: 'web_https', validation: null }])
  const [scopes, setScopes] = useState<Record<ScopeId, ScopeRow>>({
    openid: { selected: true, justification: '' },
    profile: { selected: false, justification: '' },
    'student.identity': { selected: false, justification: '' },
    offline_access: { selected: false, justification: '' },
    // #697 学习数据域：授权时由 App 加密上传数据快照（≤7 天），供第三方在有效期内读取
    'student.grades.read': { selected: false, justification: '' },
    'student.timetable.read': { selected: false, justification: '' },
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 高级设置默认折叠：面向非专业用户，基础配置即可创建 */
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [created, setCreated] = useState<{ id: string; clientId: string; secret: string | null } | null>(null)

  const sensitiveSelected = (Object.keys(scopes) as ScopeId[]).some(
    (id) => scopes[id]!.selected && SCOPE_META[id].risk === 'sensitive',
  )

  function updateUri(index: number, patch: Partial<UriRow>) {
    setUris((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function liveValidate(index: number) {
    const row = uris[index]!
    if (!row.uri) {
      updateUri(index, { validation: null })
      return
    }
    updateUri(index, { validation: validateRedirectUri(row.uri, row.kind) })
  }

  function addUriRow() {
    setUris((prev) => [...prev, { uri: '', kind: clientType === 'web_confidential' ? 'web_https' : 'native_custom', validation: null }])
  }

  function removeUriRow(index: number) {
    setUris((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function setScope(id: ScopeId, patch: Partial<ScopeRow>) {
    setScopes((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }))
  }

  async function handleSubmit() {
    setBusy(true)
    setError(null)
    try {
      // 服务端会最终校验；这里先做前端快速检查
      if (!name.trim() || !description.trim()) {
        throw new ClientApiError(400, 'invalid_request', '应用名称与描述为必填')
      }
      if (clientType === 'web_confidential' && !homepageUrl.trim()) {
        throw new ClientApiError(400, 'invalid_request', 'Web 应用必须提供主页 URL')
      }
      if (uris.some((u) => !u.uri || !u.validation?.ok)) {
        throw new ClientApiError(400, 'invalid_request', '请填写合法的 redirect URI（至少一条）')
      }
      if (sensitiveSelected && !privacyPolicyUrl.trim()) {
        throw new ClientApiError(400, 'invalid_request', '申请敏感 scope 必须提供隐私政策 URL')
      }
      if (sensitiveSelected && !contact.trim()) {
        throw new ClientApiError(400, 'invalid_request', '申请敏感 scope 必须提供开发者联系方式')
      }

      const me = await fetchMe()
      const selectedScopes = (Object.keys(scopes) as ScopeId[]).filter((id) => scopes[id]!.selected)
      const result = await createApp(
        {
          name: name.trim(),
          description: description.trim(),
          homepage_url: homepageUrl.trim() || null,
          client_type: clientType,
          privacy_policy_url: privacyPolicyUrl.trim() || null,
          contact: contact.trim() || null,
          redirect_uris: uris.map((u) => ({ uri: u.uri.trim(), kind: u.kind })),
          scopes: selectedScopes.map((id) => ({
            scope: id,
            justification: scopes[id]!.justification.trim() || null,
          })),
        },
        me.csrf_token,
      )
      setCreated({ id: result.id, clientId: result.client_id, secret: result.client_secret })
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '提交失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="dev-card">
        <h2>应用已创建（草稿）</h2>
        <p>
          应用 <code>{name}</code> 已进入草稿状态：提交审核前可自由修改；审核通过后才会启用。
        </p>
        {created.secret ? (
          <div className="dev-secret-banner">
            <h3>Client Secret（仅此一次展示，请立即复制保存）</h3>
            <p>
              关闭页面或刷新后将无法再次查看。如需新值，可在「凭据」页轮换。
            </p>
            <div className="dev-secret-value">{created.secret}</div>
            <button
              type="button"
              className="dev-btn dev-btn-primary"
              onClick={() => void navigator.clipboard?.writeText(created.secret!)}
            >
              复制 Secret
            </button>
          </div>
        ) : (
          <p className="dev-success">
            Native/Public 应用不使用 client secret，认证方式为 PKCE S256。
          </p>
        )}
        <p style={{ marginTop: 16 }}>
          <a className="dev-btn dev-btn-primary" href={`/apps/${encodeURIComponent(created.id)}`}>
            进入应用详情
          </a>{' '}
          <a className="dev-btn" href="/apps">
            返回列表
          </a>
        </p>
      </div>
    )
  }

  return (
    <div className="dev-card">
      <h2>创建应用</h2>
      {error && <div className="dev-error">{error}</div>}

      <h3 className="dev-form-section-title">① 基础信息</h3>
      <p className="dev-hint dev-form-section-hint">
        只需要填写应用名称和简单描述，即可创建应用。稍后可以在「高级设置」中配置登录回调地址和权限。
      </p>

      <div className="dev-field">
        <label htmlFor="app-name">应用名称 *</label>
        <input
          id="app-name"
          className="dev-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="例如：课程表助手"
        />
      </div>

      <div className="dev-field">
        <label htmlFor="app-desc">应用描述 *</label>
        <textarea
          id="app-desc"
          className="dev-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="向审核员与用户说明这个应用做什么"
        />
      </div>

      <div className="dev-field">
        <label htmlFor="app-type">应用类型 *</label>
        <select
          id="app-type"
          className="dev-select"
          value={clientType}
          onChange={(e) => setClientType(e.target.value as DeveloperClientType)}
        >
          <option value="web_confidential">Web（服务端持有 secret，Authorization Code + PKCE）</option>
          <option value="native_public">Native / 移动端（无 secret，强制 PKCE S256）</option>
        </select>
        <p className="dev-hint">Native 应用不会生成 client secret——禁止把 secret 内置到 App。</p>
      </div>

      <div className="dev-field">
        <label htmlFor="app-home">主页 URL {clientType === 'web_confidential' ? '*' : ''}</label>
        <input
          id="app-home"
          className="dev-input"
          value={homepageUrl}
          onChange={(e) => setHomepageUrl(e.target.value)}
          placeholder="https://example.com"
        />
      </div>

      <div className="dev-advanced-toggle">
        <button
          type="button"
          className="dev-btn dev-btn-ghost"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? '▾ 收起高级设置' : '▸ 高级设置（回调地址 / 权限）'}
        </button>
        <p className="dev-hint">
          大多数应用只需要填写回调地址；权限在创建后可在应用详情中随时调整。
        </p>
      </div>

      {showAdvanced && (
      <div className="dev-advanced-panel">
      <div className="dev-field">
        <label>Redirect URIs *（服务端精确匹配校验）</label>
        {uris.map((row, index) => (
          <div key={index} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              className="dev-input"
              style={{ flex: 1, minWidth: 240 }}
              value={row.uri}
              placeholder={
                row.kind === 'native_loopback'
                  ? 'http://127.0.0.1:动态端口/callback'
                  : row.kind === 'native_custom'
                    ? 'my-app:/oauth/callback'
                    : 'https://example.com/oauth/callback'
              }
              onChange={(e) => updateUri(index, { uri: e.target.value })}
              onBlur={() => liveValidate(index)}
            />
            <select
              className="dev-select"
              style={{ width: 200 }}
              value={row.kind}
              onChange={(e) => updateUri(index, { kind: e.target.value as RedirectUriKind, validation: null })}
            >
              {clientType === 'web_confidential' ? (
                <option value="web_https">Web（https）</option>
              ) : (
                <>
                  <option value="native_custom">Native 自定义 scheme</option>
                  <option value="native_loopback">Native loopback</option>
                </>
              )}
            </select>
            {uris.length > 1 && (
              <button type="button" className="dev-btn" onClick={() => removeUriRow(index)}>
                删除
              </button>
            )}
          </div>
        ))}
        <button type="button" className="dev-btn" onClick={addUriRow}>
          + 添加 Redirect URI
        </button>
        {uris.some((u) => u.validation && !u.validation.ok) && (
          <p className="dev-error" style={{ marginTop: 8 }}>
            {uris.find((u) => u.validation && !u.validation.ok)?.validation?.error}
          </p>
        )}
        <p className="dev-hint">
          禁止通配符 / fragment / userinfo；Web 必须 https（本地开发可 localhost）；Native 按 RFC 8252。
        </p>
      </div>

      <div className="dev-field">
        <label>Scope 请求</label>
        <ul className="dev-list">
          {SCOPE_WHITELIST.map((id) => {
            const meta = SCOPE_META[id]
            const row = scopes[id]!
            const locked = meta.mandatory
            return (
              <li key={id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    disabled={locked}
                    onChange={(e) => setScope(id, { selected: e.target.checked })}
                  />
                  <strong>
                    <code>{meta.id}</code>
                  </strong>
                  {meta.risk === 'sensitive' && <span className="risk-tag">敏感</span>}
                  {locked && <span className="dev-inline-hint">必选，不可移除</span>}
                  <span className="dev-inline-hint">{meta.description}</span>
                </div>
                {meta.requiresJustification && row.selected && (
                  <textarea
                    className="dev-textarea"
                    style={{ marginTop: 8 }}
                    placeholder={`申请 ${meta.id} 的使用理由（必填，至少 10 字）`}
                    value={row.justification}
                    onChange={(e) => setScope(id, { justification: e.target.value })}
                  />
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {sensitiveSelected && (
        <>
          <div className="dev-field">
            <label htmlFor="app-privacy">隐私政策 URL *（申请敏感 scope 必填）</label>
            <input
              id="app-privacy"
              className="dev-input"
              value={privacyPolicyUrl}
              onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
              placeholder="https://example.com/privacy"
            />
          </div>
          <div className="dev-field">
            <label htmlFor="app-contact">开发者联系方式 *（申请敏感 scope 必填）</label>
            <input
              id="app-contact"
              className="dev-input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="邮箱 / 群 / 工单地址"
            />
          </div>
        </>
      )}
      </div>
      )}

      {/* #708 人机验证（站点钥匙未配置时不渲染） */}
      <TurnstileField />
      <button type="button" className="dev-btn dev-btn-primary" disabled={busy} onClick={() => void handleSubmit()}>
        {busy ? '提交中…' : '创建应用（草稿）'}
      </button>
    </div>
  )
}
