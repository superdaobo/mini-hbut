// src/features/identity/identityStore.ts
//
// #623：Identity 授权确认 Overlay 的 UI 响应式状态（单例，非持久化）。
//
// 职责边界：
//   - 只保存“可展示状态”（12 相位 / requestDetail / 用户可读错误 / 结果页）；
//   - 不执行网络请求、不持有 handoff（handoff 留在 identityIntentStore 内存，#621 冻结）；
//   - 设备元数据（device_id / user_id / verified_at）为非敏感展示信息，允许 localStorage；
//     任何 secret（handoff/私钥）绝不写入本层。
//
// 状态推进由 IdentityCoordinator 单向驱动（组件只读 + 用户动作回调）。

import { computed, reactive, type ComputedRef } from 'vue'
import type {
  IdentityApprovalOutcome,
  IdentityApprovalPhase,
  IdentityLocalDeviceStatus,
  IdentityRequestDetail,
  IdentityResultInfo,
  IdentityUserSafeErrorCode
} from './types'
import { groupScopesByRisk, hasSensitiveScope } from './identityScopes'
import { getCachedData } from '../../utils/api'

// ─── 设备元数据持久化键（非敏感，允许 localStorage；与 #621 的 handoff 禁令不冲突） ──

export const IDENTITY_DEVICE_ID_KEY = 'hbu_identity_device_id'
export const IDENTITY_USER_ID_KEY = 'hbu_identity_user_id'
export const IDENTITY_VERIFIED_AT_KEY = 'hbu_identity_verified_at'

const safeStorage = (): Storage | null => {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

const readStorageString = (key: string): string | null => {
  const storage = safeStorage()
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

const writeStorageString = (key: string, value: string): void => {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // 配额/隐私模式异常：仅影响展示，不阻断授权主流程
  }
}

const removeStorageKey = (key: string): void => {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // ignore
  }
}

/** 会话验证子状态（validating_session 期间使用） */
export type IdentitySessionValidation = 'idle' | 'validating' | 'ok' | 'failed'

interface IdentityUiState {
  /** 12 相位状态机（issue #623「Identity Store 状态」） */
  approvalPhase: IdentityApprovalPhase
  /** 当前活跃请求 id（不含 handoff） */
  activeRequestId: string | null
  /** 请求详情（服务端 sanitized 数据） */
  requestDetail: IdentityRequestDetail | null
  /** 用户可读错误码（error 相位时存在） */
  errorCode: IdentityUserSafeErrorCode | null
  /** 用户可读错误说明 */
  userSafeMessage: string
  /** 队列中等待的请求数量（展示“还有 N 个待处理”） */
  queuedCount: number
  /** 是否处于“需要本地登录”相位 */
  needsLogin: boolean
  /** 会话验证子状态 */
  sessionValidation: IdentitySessionValidation
  /** 结果页信息（approved/denied/expired/error 后展示，用户关闭后清空） */
  lastResult: IdentityResultInfo | null
  /** 前往登录时暂时隐藏 Overlay（意图仍保留在内存，登录成功自动恢复） */
  suppressedForLogin: boolean

  // ── 设备安全设置（Security Tab） ──
  deviceStatus: IdentityLocalDeviceStatus | null
  deviceId: string | null
  userId: string | null
  verifiedAt: number | null
  revoking: boolean
  deviceError: string
  deviceRefreshing: boolean
}

const state = reactive<IdentityUiState>({
  approvalPhase: 'idle',
  activeRequestId: null,
  requestDetail: null,
  errorCode: null,
  userSafeMessage: '',
  queuedCount: 0,
  needsLogin: false,
  sessionValidation: 'idle',
  lastResult: null,
  suppressedForLogin: false,
  deviceStatus: null,
  deviceId: readStorageString(IDENTITY_DEVICE_ID_KEY),
  userId: readStorageString(IDENTITY_USER_ID_KEY),
  verifiedAt: (() => {
    const raw = readStorageString(IDENTITY_VERIFIED_AT_KEY)
    const ts = Number(raw || 0)
    return Number.isFinite(ts) && ts > 0 ? ts : null
  })(),
  revoking: false,
  deviceError: '',
  deviceRefreshing: false
})

// ─── 派生状态 ────────────────────────────────────────────────────────────────

/** 是否包含敏感 scope（student.identity） */
export const hasSensitiveRequestScope: ComputedRef<boolean> = computed(() =>
  hasSensitiveScope(state.requestDetail?.scopes || [])
)

/** 按风险分组的 scope（展示顺序：基础 → 敏感） */
export const groupedRequestScopes: ComputedRef<{
  basic: IdentityRequestDetail['scopes']
  sensitive: IdentityRequestDetail['scopes']
}> = computed(() => {
  const grouped = groupScopesByRisk(state.requestDetail?.scopes || [])
  return { basic: grouped.basic, sensitive: grouped.sensitive }
})

/**
 * Overlay 可见性（#623「Overlay 优先级」）：
 * - 有活跃请求且不在 idle；
 * - 终态结果页（approved/denied/expired/error）存在时也必须可见
 *   （finishIdentityRequest 已把 activeRequestId 置空，结果页不依赖活跃请求 id）；
 * - 未被 force update / blocking announcement 等强制遮罩压制（由组件传入 computed 判断）；
 * - 未因“前往登录”而暂时隐藏。
 */
export const overlayVisible: ComputedRef<boolean> = computed(
  () =>
    state.lastResult !== null ||
    (state.approvalPhase !== 'idle' &&
      state.activeRequestId !== null &&
      !state.suppressedForLogin)
)

/** 学号脱敏展示：25******06（非 10 位学号原样返回） */
export const maskStudentId = (studentId: string): string => {
  const sid = String(studentId || '').trim()
  if (!/^\d{10}$/.test(sid)) return sid
  return `${sid.slice(0, 2)}******${sid.slice(-2)}`
}

/**
 * 缓存中的学生姓名（仅本地缓存读取，不触发网络请求）：
 * - 用于 Overlay“当前身份”展示（有则显示，无则只显示脱敏学号）；
 * - 不做任何学校身份读取（Contract 测试 5：非敏感 scope 不读取学校身份）。
 */
export const getCachedStudentName = (studentId: string): string => {
  const sid = String(studentId || '').trim()
  if (!sid) return ''
  try {
    const cached = getCachedData<Record<string, unknown>>(`studentinfo:${sid}`)
    const payload = cached?.data as { data?: { name?: unknown } } | undefined
    return String(payload?.data?.name || '').trim()
  } catch {
    return ''
  }
}

/** 本地倒计时（秒）：请求剩余可批准时间；已过期返回 0 */
export const getRemainingSeconds = (detail: IdentityRequestDetail | null): number => {
  if (!detail?.expires_at) return 0
  const expires = new Date(detail.expires_at).getTime()
  if (!Number.isFinite(expires)) return 0
  return Math.max(0, Math.ceil((expires - Date.now()) / 1000))
}

// ─── 写操作（仅 IdentityCoordinator 调用） ───────────────────────────────────

/** 推进 12 相位 + 可选错误信息（coordinator 统一入口，防止组件直接改状态） */
export const setIdentityApprovalPhase = (
  phase: IdentityApprovalPhase,
  options: {
    requestId?: string | null
    detail?: IdentityRequestDetail | null
    errorCode?: IdentityUserSafeErrorCode | null
    message?: string
    needsLogin?: boolean
  } = {}
): void => {
  state.approvalPhase = phase
  if (options.requestId !== undefined) state.activeRequestId = options.requestId
  if (options.detail !== undefined) state.requestDetail = options.detail
  if (options.errorCode !== undefined) state.errorCode = options.errorCode
  if (options.message !== undefined) state.userSafeMessage = options.message
  if (options.needsLogin !== undefined) state.needsLogin = options.needsLogin
  // 进入 ready 前重置旧的错误提示
  if (phase === 'ready') {
    state.errorCode = null
    state.userSafeMessage = ''
    state.sessionValidation = 'idle'
  }
}

/** 更新队列计数（供 Overlay 展示“还有 N 个待处理”） */
export const setIdentityQueuedCount = (count: number): void => {
  state.queuedCount = Math.max(0, count)
}

/** 会话验证子状态（validating_session 期间） */
export const setIdentitySessionValidation = (status: IdentitySessionValidation): void => {
  state.sessionValidation = status
}

/** 记录最终结果（结果页展示）；新请求激活时由 coordinator 清空 */
export const setIdentityLastResult = (result: IdentityResultInfo | null): void => {
  state.lastResult = result
}

/** 前往登录时隐藏 Overlay（意图保留；登录成功后恢复） */
export const setIdentitySuppressedForLogin = (suppressed: boolean): void => {
  state.suppressedForLogin = suppressed
}

// ── 设备安全设置写操作 ──────────────────────────────────────────────────────

export const setIdentityDeviceStatus = (status: IdentityLocalDeviceStatus | null): void => {
  state.deviceStatus = status
}

export const setIdentityDeviceMeta = (meta: { deviceId?: string | null; userId?: string | null }): void => {
  if (meta.deviceId !== undefined) {
    state.deviceId = meta.deviceId
    if (meta.deviceId) {
      writeStorageString(IDENTITY_DEVICE_ID_KEY, meta.deviceId)
    } else {
      removeStorageKey(IDENTITY_DEVICE_ID_KEY)
    }
  }
  if (meta.userId !== undefined) {
    state.userId = meta.userId
    if (meta.userId) {
      writeStorageString(IDENTITY_USER_ID_KEY, meta.userId)
    } else {
      removeStorageKey(IDENTITY_USER_ID_KEY)
    }
  }
}

/** 敏感 scope 在线刷新成功后记录“最近验证”时间（本地展示用，非认证依据） */
export const markIdentityVerifiedNow = (): void => {
  const now = Date.now()
  state.verifiedAt = now
  writeStorageString(IDENTITY_VERIFIED_AT_KEY, String(now))
}

export const setIdentityRevoking = (revoking: boolean): void => {
  state.revoking = revoking
}

export const setIdentityDeviceError = (message: string): void => {
  state.deviceError = message
}

export const setIdentityDeviceRefreshing = (refreshing: boolean): void => {
  state.deviceRefreshing = refreshing
}

/** 清空设备展示状态（撤销成功后） */
export const clearIdentityDeviceMeta = (): void => {
  state.deviceId = null
  state.userId = null
  removeStorageKey(IDENTITY_DEVICE_ID_KEY)
  removeStorageKey(IDENTITY_USER_ID_KEY)
}

// ── 结果/重置 ────────────────────────────────────────────────────────────────

/**
 * 完成一个请求时由 coordinator 调用的 UI 收尾：
 * - 记录结果页信息（outcome 细分 approved/denied/cancelled/expired/error）；
 * - 清空当前请求展示状态；
 * - 队列有下一个时重置结果页（下一个请求展示优先）。
 */
export const finishIdentityRequest = (
  requestId: string,
  outcome: IdentityApprovalOutcome,
  options: { message?: string; errorCode?: IdentityUserSafeErrorCode; retryable?: boolean } = {}
): void => {
  state.lastResult = {
    requestId,
    outcome,
    message: options.message || '',
    errorCode: options.errorCode,
    retryable: !!options.retryable
  }
  state.approvalPhase = outcome === 'approved' ? 'approved' : outcome === 'denied' ? 'denied' : outcome === 'cancelled' ? 'denied' : outcome === 'expired' ? 'expired' : 'error'
  state.activeRequestId = null
  state.requestDetail = null
  state.errorCode = options.errorCode ?? null
  state.userSafeMessage = options.message || ''
  state.needsLogin = false
  state.sessionValidation = 'idle'
  state.suppressedForLogin = false
}

/** 关闭结果页（用户确认后） */
export const clearIdentityLastResult = (): void => {
  state.lastResult = null
  if (state.approvalPhase !== 'idle') {
    state.approvalPhase = 'idle'
  }
}

/** 全部重置（登出/测试/coordinator.reset） */
export const resetIdentityUiState = (): void => {
  state.approvalPhase = 'idle'
  state.activeRequestId = null
  state.requestDetail = null
  state.errorCode = null
  state.userSafeMessage = ''
  state.queuedCount = 0
  state.needsLogin = false
  state.sessionValidation = 'idle'
  state.lastResult = null
  state.suppressedForLogin = false
  state.deviceStatus = null
  state.deviceId = readStorageString(IDENTITY_DEVICE_ID_KEY)
  state.userId = readStorageString(IDENTITY_USER_ID_KEY)
  const raw = readStorageString(IDENTITY_VERIFIED_AT_KEY)
  const ts = Number(raw || 0)
  state.verifiedAt = Number.isFinite(ts) && ts > 0 ? ts : null
  state.revoking = false
  state.deviceError = ''
  state.deviceRefreshing = false
}

/** 只读 UI 状态（组件通过该对象读取，避免直接改状态） */
export const identityUiState = state
