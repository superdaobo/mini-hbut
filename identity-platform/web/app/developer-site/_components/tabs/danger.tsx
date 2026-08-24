/**
 * Tab 7：Danger Zone —— 撤销（终态）/ 删除（仅草稿）。
 * 与日常编辑明显分开：红色边框区块 + 二次确认（输入应用名）。
 */
'use client'

import { useState } from 'react'
import { isDeletable, isRevocable } from '@/lib/developer/status'
import { ClientApiError, deleteApp, revokeApp } from '../api'
import type { TabProps } from './types'

export function DangerZoneTab({ app, me, setApp, reload }: TabProps) {
  const [confirmAction, setConfirmAction] = useState<'revoke' | 'delete' | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDelete = isDeletable(app.status)
  const canRevoke = isRevocable(app.status)

  async function handleRevoke() {
    setBusy(true)
    setError(null)
    try {
      const updated = await revokeApp(app.id, me.csrf_token)
      setApp(updated)
      setConfirmAction(null)
      setConfirmText('')
      void reload()
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteApp(app.id, me.csrf_token)
      // 已物理删除：回列表
      window.location.href = '/apps'
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : '操作失败')
      setBusy(false)
    }
  }

  const confirmed = confirmText === app.name

  return (
    <div className="dev-danger-zone">
      <h3>⚠️ Danger Zone</h3>
      <p>以下操作不可逆，请谨慎执行。撤销（Revoke）为终态；删除仅限草稿应用。</p>
      <p className="dev-inline-hint">撤销 = 让应用立刻停止服务但保留记录；删除 = 连草稿带配置彻底清掉。动手前请确认真的不再需要它。</p>
      {error && <div className="dev-error">{error}</div>}

      <h4>撤销应用（Revoke）</h4>
      <p>
        撤销后应用立即停止对外授权，<strong>不可恢复</strong>（状态终态 revoked）。
        {!canRevoke && ' 当前状态已不可撤销。'}
      </p>
      {canRevoke &&
        (confirmAction !== 'revoke' ? (
          <button type="button" className="dev-btn dev-btn-danger" onClick={() => setConfirmAction('revoke')}>
            撤销应用
          </button>
        ) : (
          <div className="dev-confirm-panel">
            <p>
              请输入应用名称 <code>{app.name}</code> 以确认撤销：
            </p>
            <input className="dev-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            <p style={{ marginTop: 10 }}>
              <button
                type="button"
                className="dev-btn dev-btn-danger"
                disabled={!confirmed || busy}
                onClick={() => void handleRevoke()}
              >
                {busy ? '处理中…' : '确认撤销'}
              </button>{' '}
              <button type="button" className="dev-btn" onClick={() => setConfirmAction(null)}>
                取消
              </button>
            </p>
          </div>
        ))}

      <h4 style={{ marginTop: 24 }}>删除应用（仅草稿）</h4>
      <p>
        从系统中物理删除该应用记录（包括全部 redirect URI / scope 请求）。
        {canDelete ? ' 仅草稿状态可用。' : ' 当前状态不可删除，请使用撤销（Revoke）。'}
      </p>
      {canDelete &&
        (confirmAction !== 'delete' ? (
          <button type="button" className="dev-btn dev-btn-danger" onClick={() => setConfirmAction('delete')}>
            删除应用
          </button>
        ) : (
          <div className="dev-confirm-panel">
            <p>
              请输入应用名称 <code>{app.name}</code> 以确认删除（不可恢复）：
            </p>
            <input className="dev-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            <p style={{ marginTop: 10 }}>
              <button
                type="button"
                className="dev-btn dev-btn-danger"
                disabled={!confirmed || busy}
                onClick={() => void handleDelete()}
              >
                {busy ? '处理中…' : '确认删除'}
              </button>{' '}
              <button type="button" className="dev-btn" onClick={() => setConfirmAction(null)}>
                取消
              </button>
            </p>
          </div>
        ))}
    </div>
  )
}
