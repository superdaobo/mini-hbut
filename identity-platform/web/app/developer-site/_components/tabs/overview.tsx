/**
 * Tab 1：Overview —— 基本信息展示 + 可编辑表单（仅 draft/rejected）。
 * #687：头部「修改应用」按钮通过 editSignal 触发本表单自动展开；
 * 各字段附口语化 helper 文案（含义 + 保管建议），降低非专业用户理解成本。
 */
'use client'

import { useEffect, useState } from 'react'
import { ClientApiError, updateApp } from '../api'
import { editLocked, editLockedHint, type TabProps } from './types'

type OverviewTabProps = TabProps & {
  /** 递增信号：>0 时自动展开编辑表单（由容器「修改应用」按钮触发） */
  editSignal?: number
}

export function OverviewTab({ app, me, setApp, reload, editSignal = 0 }: OverviewTabProps) {
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

  // 头部「修改应用」按钮 → 切到本 Tab 并自动展开编辑表单
  useEffect(() => {
    if (editSignal > 0 && !locked) {
      setEditing(true)
    }
  }, [editSignal, locked])

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
      <p className="dev-inline-hint">应用的基本信息与身份标识，审核员和用户都会看到这里的内容。</p>
      {ok && <div className="dev-success">{ok}</div>}
      {error && <div className="dev-error">{error}</div>}
      {locked && <p className="dev-inline-hint">{editLockedHint(app)}</p>}

      {editing ? (
        <>
          <div className="dev-field">
            <label>应用名称</label>
            <input className="dev-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <p className="dev-hint">显示在用户授权页和审核列表里的名字；建议能一眼看出这是什么产品。</p>
          </div>
          <div className="dev-field">
            <label>应用描述</label>
            <textarea className="dev-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            <p className="dev-hint">用一两句话说明应用是做什么的、给谁用；审核员会据此判断用途是否合规。</p>
          </div>
          <div className="dev-field">
            <label>主页 URL</label>
            <input className="dev-input" value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} />
            <p className="dev-hint">应用对外的主页地址；审核时可能会访问核对，请确保可以打开。</p>
          </div>
          <div className="dev-field">
            <label>隐私政策 URL</label>
            <input className="dev-input" value={privacyPolicyUrl} onChange={(e) => setPrivacyPolicyUrl(e.target.value)} />
            <p className="dev-hint">说明你如何收集和使用用户数据的页面；申请学号、成绩等敏感权限时必须提供。</p>
          </div>
          <div className="dev-field">
            <label>开发者联系方式</label>
            <input className="dev-input" value={contact} onChange={(e) => setContact(e.target.value)} />
            <p className="dev-hint">邮箱或手机号均可；审核有疑问或应用出现异常时，管理员通过它联系你。</p>
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
            <dt>Client Secret</dt>
            <dd>
              {app.client_type === 'native_public' ? (
                <span className="dev-inline-hint">不适用（原生应用使用 PKCE，无需密码）</span>
              ) : app.secret.created_at ? (
                <span className="dev-inline-hint">
                  相当于应用的登录密码，只在创建/轮换时显示一次。请立即保存到安全的地方，切勿写进前端代码或提交进 Git；
                  遗失请到「凭据」Tab 轮换。
                </span>
              ) : (
                <span className="dev-inline-hint">尚未生成；到「凭据」Tab 轮换后即可获得。</span>
              )}
            </dd>
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
