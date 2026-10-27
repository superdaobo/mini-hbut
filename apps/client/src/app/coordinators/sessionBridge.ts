/** 安全会话恢复桥：与 Coordinator 状态机解耦，保留原 Cookie 校验与错误传播语义。 */
export const createSessionBridge = (hasTauri: boolean) => {
  const bridgePost = async (path: string, payload: Record<string, unknown> = {}) => {
    const bridgeBase = hasTauri ? 'http://127.0.0.1:4399' : '/bridge'
    const res = await fetch(`${bridgeBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    })
    return res.json()
  }

  const restoreSessionViaBridge = async (cookies: string) => {
    const res = await bridgePost('/restore_session', { cookies })
    if (res?.success && res?.data?.student_id) {
      return res.data
    }
    throw new Error(res?.error?.message || '恢复会话失败')
  }

  const importCookiesViaBridge = async (snapshot: Record<string, unknown>) => {
    const res = await bridgePost('/import_cookies', snapshot || {})
    if (res?.success && res?.data?.user?.student_id) {
      return res.data.user
    }
    throw new Error(res?.error?.message || '导入 cookies 失败')
  }

  return { restoreSessionViaBridge, importCookiesViaBridge }
}
