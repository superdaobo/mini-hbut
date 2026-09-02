/**
 * API 密钥管理页客户端组件（#688）。
 *
 * 结构：
 *  1. 说明卡：什么是账户级 API Key、谁能用、怎么用；
 *  2. 创建表单：名称必填 → 签发成功展示一次性明文大卡片（复制 + 关闭即不可再见警示）；
 *  3. Key 列表：名称 / prefix / 状态 / 创建时间 / 最后使用，吊销需二次确认；
 *  4. curl 示例：Agent 直连 Core 的 Bearer 用法。
 *
 * 安全约定：
 * - 明文只在签发响应出现一次，前端不做任何持久化（不落 localStorage）；
 * - mutation 一律带 x-csrf-token（双提交 Cookie，与 developer API 同机制）。
 */
'use client'
import { TurnstileField } from './turnstile-field'

import { consumeTurnstileToken } from '@/lib/developer/turnstile-client'

import { useEffect, useState } from 'react'
import { ClientApiError, fetchMe } from './api'

interface ApiKeyInfo {
  id: string
  name: string
  prefix: string
  status: 'active' | 'revoked'
  last_used_at?: string
  created_at: string
}

class KeysClientApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.name = 'KeysClientApiError'
    this.status = status
    this.code = code
  }
}

/** 同源请求封装（GET 无需 CSRF；mutation 必须带 x-csrf-token） */
async function keysRequest<T>(path: string, init?: { method?: string; body?: unknown; csrf?: string }): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init?.body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  if (init?.csrf) {
    headers['x-csrf-token'] = init.csrf
  }
  // #708：创建密钥属敏感写动作，附带一次性 Turnstile 令牌
  const tt = consumeTurnstileToken()
  if (tt) {
    headers['x-turnstile-token'] = tt
  }
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let code = 'internal'
    try {
      const parsed = (await res.json()) as { error?: string }
      if (parsed && typeof parsed.error === 'string') {
        code = parsed.error
      }
    } catch {
      // 非 JSON 错误体
    }
    throw new KeysClientApiError(res.status, code)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

function errorMessage(err: unknown): string {
  if (err instanceof KeysClientApiError || err instanceof ClientApiError) {
    switch (err.code) {
      case 'unauthorized':
        return '登录已过期，请重新登录'
      case 'forbidden':
        return '没有权限执行该操作'
      case 'not_found':
        return '密钥不存在或已被删除'
      case 'invalid_request':
        return '提交的内容不合法，请检查名称是否已填写'
      default:
        return '服务暂时不可用，请稍后重试'
    }
  }
  return '网络异常，请稍后重试'
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="dev-copy-btn"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}

const CURL_EXAMPLE = [
  '# 完整密钥形如 mhbat_ 前缀 + 标识 + 主体串；建议经环境变量注入，不要硬编码',
  'export MHBAT_API_KEY=<粘贴你的完整密钥>',
  '',
  'curl https://core.example.com/api/v1/account/me \\',
  '  -H "Authorization: Bearer $MHBAT_API_KEY"',
].join('\n')

export function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  /** 一次性明文（关闭卡片后置空，无法找回） */
  const [issuedKey, setIssuedKey] = useState<{ key: string; info: ApiKeyInfo } | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null)
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    let alive = true
    keysRequest<{ keys: ApiKeyInfo[] }>('/api/v1/developer/keys')
      .then((data) => {
        if (alive) {
          setKeys(data.keys)
        }
      })
      .catch((err) => {
        if (err instanceof KeysClientApiError && err.status === 401) {
          window.location.href = '/login'
          return
        }
        if (alive) {
          setError(errorMessage(err))
        }
      })
    return () => {
      alive = false
    }
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setFormError('请先给这把密钥起个名字，例如「本机 Agent」')
      return
    }
    setCreating(true)
    try {
      const csrf = (await fetchMe()).csrf_token
      const result = await keysRequest<{ key: string; info: ApiKeyInfo }>('/api/v1/developer/keys', {
        method: 'POST',
        body: { name: trimmed },
        csrf,
      })
      setIssuedKey(result)
      setName('')
      // 刷新列表
      const list = await keysRequest<{ keys: ApiKeyInfo[] }>('/api/v1/developer/keys')
      setKeys(list.keys)
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      const csrf = (await fetchMe()).csrf_token
      await keysRequest<void>(`/api/v1/developer/keys/${encodeURIComponent(revokeTarget.id)}`, {
        method: 'DELETE',
        csrf,
      })
      setRevokeTarget(null)
      const list = await keysRequest<{ keys: ApiKeyInfo[] }>('/api/v1/developer/keys')
      setKeys(list.keys)
    } catch (err) {
      setError(errorMessage(err))
      setRevokeTarget(null)
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div>
      {/* 区块 1：通俗说明 */}
      <div className="dev-card">
        <h2>什么是 API 密钥？</h2>
        <p className="dev-inline-hint">
          API 密钥让你的本地工具（例如命令行 Agent）以你的身份访问开放平台接口，
          比如管理应用、查询设备与审计记录。它相当于一把「程序用的钥匙」：
          你只需要把它交给自己的工具，工具就能替你干活，而不用把账号密码告诉任何人。
        </p>
        <p className="dev-inline-hint">
          注意：完整密钥只在创建成功时显示一次，平台只保存它的指纹摘要。
          如果丢失，随时可以吊销旧密钥并重新创建一把。
        </p>
      </div>

      {error ? <div className="dev-error">{error}</div> : null}

      {/* 区块 2：创建表单 */}
      <div className="dev-card">
        <h2>创建新密钥</h2>
        <p className="dev-hint">起一个好认的名字（比如「办公电脑」「CI 服务器」），方便以后管理。</p>
        {/* #708 人机验证（申请密钥属敏感写动作） */}
        <TurnstileField />
        <form onSubmit={(e) => void handleCreate(e)}>
          <div className="dev-field">
            <label htmlFor="api-key-name">密钥名称（必填）</label>
            <input
              id="api-key-name"
              className="dev-input"
              value={name}
              maxLength={64}
              placeholder="例如：本机 Agent"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button className="dev-btn dev-btn-primary" type="submit" disabled={creating}>
            {creating ? '创建中…' : '创建密钥'}
          </button>
        </form>
        {formError ? <div className="dev-error">{formError}</div> : null}

        {issuedKey ? (
          <div className="dev-secret-banner" role="alert">
            <h3>创建成功！请立即复制保存这把密钥</h3>
            <p>
              这是唯一一次展示机会。<strong>关闭本提示后将无法再查看完整密钥</strong>
              （平台只存摘要，谁也无法找回）。请粘贴到你的本地工具配置中妥善保管。
            </p>
            <div className="dev-secret-value">{issuedKey.key}</div>
            <div className="dev-app-card-meta">
              <CopyButton text={issuedKey.key} />
              <button type="button" className="dev-btn" onClick={() => setIssuedKey(null)}>
                我已保存，关闭
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* 区块 3：Key 列表 */}
      <div className="dev-card">
        <h2>我的密钥</h2>
        <p className="dev-hint">
          列表中只显示密钥前缀（前 14 个字符），用于辨认；完整密钥任何人都看不到。
          不再使用的密钥建议尽快吊销，防止泄露风险。
        </p>
        {keys === null ? (
          <div className="dev-empty">加载中…</div>
        ) : keys.length === 0 ? (
          <div className="dev-empty">还没有密钥，用上面的表单创建第一把吧。</div>
        ) : (
          <ul className="dev-list">
            {keys.map((k) => (
              <li key={k.id}>
                <div className="dev-app-card-meta" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <strong>{k.name}</strong>{' '}
                    <span className={`dev-status status-${k.status}`}>
                      {k.status === 'active' ? '启用中' : '已吊销'}
                    </span>
                  </span>
                  {k.status === 'active' ? (
                    <button
                      type="button"
                      className="dev-btn dev-btn-danger"
                      onClick={() => setRevokeTarget(k)}
                    >
                      吊销
                    </button>
                  ) : null}
                </div>
                <div className="dev-app-card-meta">
                  <span className="dev-mono">{k.prefix}…</span>
                  <CopyButton text={k.prefix} />
                </div>
                <div className="dev-app-card-updated">
                  创建于 {new Date(k.created_at).toLocaleString('zh-CN')}
                  {k.last_used_at ? ` · 最后使用 ${new Date(k.last_used_at).toLocaleString('zh-CN')}` : ' · 从未使用'}
                </div>
              </li>
            ))}
          </ul>
        )}

        {revokeTarget ? (
          <div className="dev-confirm-panel" role="alertdialog" aria-label="确认吊销">
            <p style={{ color: 'var(--danger-text)' }}>
              确定要吊销「{revokeTarget.name}」吗？使用它的工具会立即失去访问权限，此操作不可恢复。
            </p>
            <div className="dev-app-card-meta">
              <button
                type="button"
                className="dev-btn dev-btn-danger"
                disabled={revoking}
                onClick={() => void handleRevoke()}
              >
                {revoking ? '处理中…' : '确认吊销'}
              </button>
              <button type="button" className="dev-btn" onClick={() => setRevokeTarget(null)}>
                取消
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* 区块 4：curl 示例 */}
      <div className="dev-card dev-docs">
        <h2>在本地工具中使用</h2>
        <p className="dev-hint">
          把整串密钥放进请求头 Authorization: Bearer 后面即可调用开放接口（示例为查询当前账户信息）：
        </p>
        <pre>
          <code>{CURL_EXAMPLE}</code>
        </pre>
        <p className="dev-note">
          请像保管密码一样保管密钥：不要写进公开代码仓库、不要发给他人；
          发现疑似泄露时立刻在本页吊销并重新创建。
        </p>
      </div>
    </div>
  )
}
