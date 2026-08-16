/**
 * 登出按钮（client component）。
 * POST /logout 带 CSRF 头（双提交 cookie 同值由服务端会话提供），成功后回首页。
 */
'use client'

import { useState } from 'react'

export function LogoutButton({ displayName, csrfToken }: { displayName: string; csrfToken: string }) {
  const [busy, setBusy] = useState(false)

  async function handleLogout() {
    setBusy(true)
    try {
      const res = await fetch('/logout', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
      })
      if (res.redirected || res.ok) {
        window.location.href = res.redirected ? res.url : '/'
        return
      }
    } catch {
      // 网络失败：留在当前页
    }
    setBusy(false)
  }

  return (
    <span className="dev-account">
      <span className="dev-account-name" title={displayName}>
        {displayName}
      </span>
      <button type="button" className="dev-logout-btn" onClick={handleLogout} disabled={busy}>
        退出登录
      </button>
    </span>
  )
}
