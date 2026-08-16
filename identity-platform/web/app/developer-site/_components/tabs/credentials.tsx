/**
 * Tab 4：Credentials —— Client ID / 认证方式 / Secret 元数据 + 轮换（二次确认）。
 * Native：明确显示「不适用」+ PKCE S256；Web：secret 只显示一次（轮换后此处展示，
 * 刷新即失），此后只显示 fingerprint / 末 4 位 / 创建与上次轮换时间。
 */
'use client'

import { useState } from 'react'
import { ClientApiError, rotateSecret } from '../api'
import type { TabProps } from './types'

export function CredentialsTab({ app, me, setApp, oneTimeSecret, setOneTimeSecret }: TabProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRotate() {
    setBusy(true)
    setError(null)
    try {
      const result = await rotateSecret(app.id, me.csrf_token)
      setApp(result.app)
      // 新 secret 只在此展示一次（仅内存，刷新即失）
      setOneTimeSecret(result.client_secret)
      setConfirming(false)
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '轮换失败')
    } finally {
      setBusy(false)
    }
  }

  const isNative = app.client_type === 'native_public'

  return (
    <div className="dev-card">
      <h2>凭据</h2>
      {error && <div className="dev-error">{error}</div>}

      <dl className="dev-kv">
        <dt>Client ID</dt>
        <dd>
          <code className="dev-mono">{app.client_id}</code>
        </dd>
      </dl>
      <dl className="dev-kv">
        <dt>Client Secret</dt>
        <dd>
          {isNative ? (
            <span>
              <strong>不适用</strong>（Native/Public 应用不使用 secret，认证方式：PKCE S256）
            </span>
          ) : app.secret.created_at ? (
            <span>
              已配置：创建于 {new Date(app.secret.created_at).toLocaleString('zh-CN')}
              {app.secret.last_rotated_at
                ? `；上次轮换 ${new Date(app.secret.last_rotated_at).toLocaleString('zh-CN')}`
                : ''}
              <br />
              fingerprint：<code className="dev-mono">{app.secret.fingerprint}</code>（末 4 位：
              <code className="dev-mono">{app.secret.last4}</code>）
            </span>
          ) : (
            '未生成'
          )}
        </dd>
      </dl>

      {isNative && (
        <p className="dev-success">本应用为 Native/Public 类型：禁止生成「方便开发者」的 secret，一律 PKCE S256。</p>
      )}

      {!isNative && (
        <>
          {oneTimeSecret ? (
            <div className="dev-secret-banner">
              <h3>新的 Client Secret（仅此一次展示，请立即复制保存）</h3>
              <p>刷新页面或切换 Tab 后无法再次查看；如再次遗失请重新轮换。</p>
              <div className="dev-secret-value">{oneTimeSecret}</div>
              <button
                type="button"
                className="dev-btn dev-btn-primary"
                onClick={() => void navigator.clipboard?.writeText(oneTimeSecret)}
              >
                复制 Secret
              </button>{' '}
              <button type="button" className="dev-btn" onClick={() => setOneTimeSecret(null)}>
                我已保存
              </button>
            </div>
          ) : (
            <>
              {!confirming ? (
                <button type="button" className="dev-btn" onClick={() => setConfirming(true)}>
                  轮换 Client Secret
                </button>
              ) : (
                <div className="dev-confirm-panel">
                  <p>
                    <strong>二次确认：</strong>轮换后新 secret 立即生效，旧 secret 立即失效，
                    所有使用旧 secret 的集成必须同步更新。此操作会记录到审计日志。
                  </p>
                  <button type="button" className="dev-btn dev-btn-danger" disabled={busy} onClick={() => void handleRotate()}>
                    {busy ? '轮换中…' : '确认轮换'}
                  </button>{' '}
                  <button type="button" className="dev-btn" onClick={() => setConfirming(false)}>
                    取消
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
