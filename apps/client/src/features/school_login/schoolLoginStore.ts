// src/features/school_login/schoolLoginStore.ts
//
// goal-20：「用 Mini-HBUT 登录」（新认证测试应用）的前端状态机。
// 协议见 student-auth docs/school-login-contract.md；签名、学号核验、cookie 全在 Rust 命令里完成：
//   identity_school_login_detail  → 读来源 / 要共享的字段
//   identity_school_login_approve → 先学号核验（复用或带 cookie）再设备签名批准
//   identity_school_login_deny    → 拒绝
//
// 安全约定：
//   - requestId / code 只放在本模块内存里，关闭即清空；不写存储、不打印、不进 URL；
//   - 前端只展示 Rust 返回的公开字段（掩码学号、核验状态、原因码），原因码一律转成固定文案。

import { reactive, readonly } from 'vue'

import { invokeNative, isTauriRuntime } from '../../platform/native'
import { parseMiniHbutDeepLink } from '../../platform/deep_link'

export type SchoolLoginPhase = 'idle' | 'loading' | 'confirm' | 'approving' | 'done' | 'denied' | 'error'

export interface SchoolLoginRequestRef {
  requestId: string
  code: string
}

/** Rust `SchoolLoginDetail`（serde 字段名） */
export interface SchoolLoginDetailPayload {
  ok: boolean
  status: string
  reason?: string | null
  http_status?: number | null
  client_name?: string | null
  shared_fields?: string[]
  expires_in?: number | null
}

/** Rust `SchoolVerifyPayload` 中前端用到的部分 */
export interface SchoolVerifySummary {
  ok: boolean
  status: string
  reason?: string | null
  cookie_sent?: boolean
}

/** Rust `SchoolLoginApproval` */
export interface SchoolLoginApprovalPayload {
  ok: boolean
  status: string
  reason?: string | null
  http_status?: number | null
  student_id_masked?: string | null
  verify?: SchoolVerifySummary | null
}

export interface SchoolLoginState {
  phase: SchoolLoginPhase
  clientName: string
  sharedFields: string[]
  expiresIn: number
  /** 批准前那次学号核验：verified（本次读取了学校学籍信息）/ reused（复用最近的核验） */
  verifyStatus: string
  studentMasked: string
  errorText: string
}

/** 契约 §10 共享字段的中文名（确认弹窗逐项列出） */
export const SHARED_FIELD_LABELS: Record<string, string> = {
  student_id: '学号（学校核验）',
  verified_at: '学校核验时间',
  approved_at: '授权时间',
  device_id: '设备标识'
}

const DEFAULT_CLIENT_NAME = 'Mini-HBUT 新认证测试应用'

/** 原因码 → 给用户看的一句话（未知原因码给通用文案，不回显服务端原文） */
const REASON_TEXT: Record<string, string> = {
  invalid_link: '这不是有效的 Mini-HBUT 登录二维码',
  request_not_found: '登录请求已失效（可能已过期或服务重启过），请在网页上重新发起',
  request_expired: '二维码已过期，请在网页上重新发起',
  request_not_pending: '这次登录已经处理过了',
  code_invalid: '二维码无效，请在网页上重新发起',
  device_not_verified: '这台设备还没有通过学号核验，请稍后重试',
  rate_limited: '操作太频繁，请稍后再试',
  too_many_pending: '服务繁忙，请稍后再试',
  store_unavailable: '服务暂时不可用，请稍后再试',
  network_error: '网络错误，请检查网络后重试',
  bad_response: '服务返回异常，请稍后再试',
  client_timeout: '请求超时，请稍后再试',
  unsupported_platform: '当前平台暂不支持（安卓版后续支持）',
  no_local_login: '请先登录 Mini-HBUT 再确认',
  device_key_unavailable: '本机安全存储不可用，无法签名',
  signing_failed: '设备签名失败，请重试',
  not_in_app: '只能在 Mini-HBUT App 里确认登录'
}

/** 学号核验失败时的细分原因（`verify.reason`） */
const VERIFY_REASON_TEXT: Record<string, string> = {
  campus_cookie_required: '需要教务登录状态：请在 App 里重新登录教务系统后再试',
  landed_on_login_page: '教务登录已失效：请在 App 里重新登录后再试',
  student_id_mismatch: '学校返回的学号与本机登录的学号不一致',
  school_unavailable: '学校教务系统暂时连不上，请稍后再试',
  daily_budget_exhausted: '今天的核验次数已用完，请明天再试',
  rate_limited: '核验太频繁，请稍后再试'
}

export const schoolLoginReasonText = (reason?: string | null, verifyReason?: string | null): string => {
  if (reason === 'school_verify_failed') {
    const detail = (verifyReason && (VERIFY_REASON_TEXT[verifyReason] || REASON_TEXT[verifyReason])) || ''
    return detail ? `学号核验没有通过：${detail}` : '学号核验没有通过，请稍后再试'
  }
  return (reason && REASON_TEXT[reason]) || '登录没有完成，请稍后再试'
}

/** 把扫码 / 粘贴得到的文本解析成登录请求；不是 school-login 链接时返回 null */
export const parseSchoolLoginText = (raw: string): SchoolLoginRequestRef | null => {
  const result = parseMiniHbutDeepLink(String(raw || '').trim())
  if (!result.ok || result.link.kind !== 'school-login') return null
  return { requestId: result.link.requestId, code: result.link.code }
}

const state = reactive<SchoolLoginState>({
  phase: 'idle',
  clientName: '',
  sharedFields: [],
  expiresIn: 0,
  verifyStatus: '',
  studentMasked: '',
  errorText: ''
})

/** 只在模块闭包里保存，不进响应式状态（避免被 devtools / 序列化带出） */
let current: SchoolLoginRequestRef | null = null

export const schoolLoginState = readonly(state)

const resetState = (): void => {
  state.phase = 'idle'
  state.clientName = ''
  state.sharedFields = []
  state.expiresIn = 0
  state.verifyStatus = ''
  state.studentMasked = ''
  state.errorText = ''
}

const fail = (text: string): void => {
  state.phase = 'error'
  state.errorText = text
}

/** 收到登录请求（深链 / 扫码 / 粘贴）：读取请求信息并弹出确认。正在批准时忽略新请求。 */
export const openSchoolLogin = async (request: SchoolLoginRequestRef): Promise<void> => {
  if (state.phase === 'approving') return
  resetState()
  current = { requestId: request.requestId, code: request.code }
  state.phase = 'loading'
  if (!isTauriRuntime()) {
    fail(REASON_TEXT.not_in_app)
    return
  }
  const opened = current
  let detail: SchoolLoginDetailPayload | null = null
  try {
    detail = await invokeNative<SchoolLoginDetailPayload>('identity_school_login_detail', {
      requestId: opened.requestId,
      code: opened.code
    })
  } catch {
    detail = null
  }
  if (current !== opened) return // 期间被关闭或换成了别的请求
  if (!detail || !detail.ok) {
    fail(schoolLoginReasonText(detail?.reason || 'network_error'))
    return
  }
  state.clientName = (detail.client_name || '').trim() || DEFAULT_CLIENT_NAME
  state.sharedFields = (detail.shared_fields || []).filter((field) => field in SHARED_FIELD_LABELS)
  state.expiresIn = Math.max(0, Number(detail.expires_in) || 0)
  state.phase = 'confirm'
}

/** 用户点「确认登录」：Rust 侧先学号核验再签名批准 */
export const confirmSchoolLogin = async (): Promise<void> => {
  if (state.phase !== 'confirm' || !current) return
  const approving = current
  state.phase = 'approving'
  let result: SchoolLoginApprovalPayload | null = null
  try {
    result = await invokeNative<SchoolLoginApprovalPayload>('identity_school_login_approve', {
      requestId: approving.requestId,
      code: approving.code
    })
  } catch {
    result = null
  }
  if (current !== approving) return
  current = null // 批准请求已发出：code 不再需要
  if (!result || !result.ok) {
    fail(schoolLoginReasonText(result?.reason || 'network_error', result?.verify?.reason))
    return
  }
  state.verifyStatus = result.verify?.status || ''
  state.studentMasked = result.student_id_masked || ''
  state.phase = 'done'
}

/** 用户点「拒绝」：尽力通知服务端（失败也照样关闭本地确认） */
export const denySchoolLogin = async (): Promise<void> => {
  if (state.phase !== 'confirm' || !current) return
  const denying = current
  current = null
  state.phase = 'denied'
  try {
    await invokeNative('identity_school_login_deny', { requestId: denying.requestId, code: denying.code })
  } catch {
    // 拒绝是尽力而为：服务端 5 分钟后也会自然过期
  }
}

/** 关闭弹窗：清空内存里的 requestId / code */
export const closeSchoolLogin = (): void => {
  if (state.phase === 'approving') return
  current = null
  resetState()
}

/** 仅供单测：当前是否还持有 code（验证关闭即清空） */
export const __hasPendingCodeForTest = (): boolean => current !== null
