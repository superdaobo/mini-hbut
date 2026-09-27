/**
 * 门户登录成功结果广播（GitHub #932）
 *
 * 背景：登录组件在「登录进行中被切走」时会随视图卸载，而 Vue 会丢弃已卸载
 * 实例的 emit（runtime-core 的 `if (instance.isUnmounted) return`）—— 登录其实
 * 已经成功，应用层却收不到，用户回到登录页看到的仍是空白表单。
 *
 * 因此把「门户登录成功」从组件事件提升为应用级事件：无论登录由哪个组件实例
 * 发起、无论该实例是否仍在挂载，结果都能被 AuthCoordinator 接收并推进到已登录态。
 *
 * 与既有 `hbu-identity-login-resumed` / `hbu-session-logout` 保持一致的事件风格。
 */

export interface PortalLoginSucceededDetail {
  /** 登录成功后的学号（登录组件已写入 hbu_username，此处仅作通道载荷） */
  studentId: string
  /** 登录方式标记：portal_password / portal_qr_temp 等 */
  method: string
}

const EVENT_NAME = 'hbu-portal-login-succeeded'

/**
 * 登录方式标记（即写入 `hbu_login_method` 的取值）。
 *
 * 复用「在飞登录结果」的路径（#932）无法自行得知原始登录方式，必须由发起方
 * 在进入单飞门时标注，否则会把扫码/学习通登录错误地落成门户密码登录 —— 那会
 * 让临时扫码会话被当成正式会话（失效不再退回登录页）、并让学习通会话的自动
 * 重登改走门户密码分支（本地无密码 → 必然失败）。
 */
export const LOGIN_METHOD_PORTAL_PASSWORD = 'portal_password'
export const LOGIN_METHOD_PORTAL_QR = 'portal_qr_temp'
export const LOGIN_METHOD_CHAOXING_PASSWORD = 'chaoxing_password'
export const LOGIN_METHOD_CHAOXING_QR = 'chaoxing_qr_temp'

/** 门户密码登录才会触发 Rust 的 60s 冷却门（其余登录命令不走 client.login） */
export const triggersLoginCooldown = (method: string): boolean =>
  method === LOGIN_METHOD_PORTAL_PASSWORD

export interface NormalizedPortalLoginOutcome {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * 把单飞门内的结果归一化为适配层响应形状。
 *
 * 门里存放的是各调用点的真实返回：手动提交经 axios 适配层得到 `{ success, data }`，
 * 而后台自动重登 / 二维码确认是直连 invoke，返回裸 `UserInfo`（无 success 字段）。
 * 「登录中切回页面」的复用路径无法预知来源，故必须容忍两种形状 —— 否则会把一次
 * 成功的登录误判为失败。
 */
export const normalizePortalLoginOutcome = (raw: unknown): NormalizedPortalLoginOutcome => {
  if (!raw || typeof raw !== 'object') return { success: false }
  const record = raw as Record<string, unknown>
  if ('success' in record) {
    return {
      success: Boolean(record.success),
      // 部分登录命令返回 {success, student_id, ...}（无 data 包装，如学习通登录）：
      // 提升为 data，避免复用路径回退到表单值而丢失真实学号。
      data: record.data ?? (record.student_id ? record : undefined),
      error: typeof record.error === 'string' ? record.error : undefined
    }
  }
  return { success: true, data: raw }
}

/** 广播门户登录成功（登录组件调用，不依赖实例是否仍挂载） */
export const publishPortalLoginSucceeded = (detail: PortalLoginSucceededDetail): void => {
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }))
  } catch {
    // 事件派发失败不影响登录主流程
  }
}

/** 订阅门户登录成功；返回取消订阅函数 */
export const subscribePortalLoginSucceeded = (
  handler: (detail: PortalLoginSucceededDetail) => void
): (() => void) => {
  const listener = (event: Event) => {
    handler(((event as CustomEvent).detail || {}) as PortalLoginSucceededDetail)
  }
  window.addEventListener(EVENT_NAME, listener)
  return () => window.removeEventListener(EVENT_NAME, listener)
}
