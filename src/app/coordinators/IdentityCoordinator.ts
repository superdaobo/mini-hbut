// src/app/coordinators/IdentityCoordinator.ts
//
// #621（冻结）+ #623（本文件扩展）：Identity 授权请求调度与审批流程 Coordinator。
//
// #621 合同（不可删除）：
//   submitIntent / flushPendingIntents / completeIntent / dismissIntent / setPhase /
//   reset / getSnapshot / subscribe / dispose —— 行为与 #621 交付时完全一致。
//
// #623 扩展（本文件新增）：
//   - 收到请求后自动拉取 Core sanitized 详情（fetchRequestDetail）；
//   - 未登录 -> 复用现有登录（handleRequireLogin / Me 视图）+ 登录成功后 resume hook；
//   - 敏感 scope（student.identity）允许前在线刷新本地学校 session；
//   - 允许：Rust identity_sign_auth_request 签名（私钥不进 JS）-> TS 提交 Core approve；
//   - 拒绝/取消：best-effort 通知 Core（冻结 Core 无 deny 路由时本地终态 + TTL 兜底）；
//   - 成功后不建立任何轮询/WebSocket 常连（#617 信任边界）；
//   - 设备未绑定时用当前请求 handoff 自动完成 enrollment（#622 防匿名设计）。
//
// 安全红线：handoff 只在本模块/identityIntentStore 内存中流转，不落日志/存储。

import type { AppRuntime, IdentityCoordinator } from '../contracts/runtime'
import {
  completeIdentityIntent,
  dismissIdentityIntent,
  enqueueIdentityIntent,
  getIdentityIntentSnapshot,
  resetIdentityIntentStore,
  setIdentityIntentPhase,
  subscribeIdentityIntentStore,
  type IdentityIntent,
  type IdentityIntentPhase,
  type PendingExternalIntent
} from '../../features/identity/identityIntentStore'
import {
  createServiceError,
  fetchEnrollmentChallenge,
  fetchRequestDetail,
  getIdentityCoreBaseUrl, getIdentityBffBaseUrl,
  submitApprove,
  submitTerminalAction
} from '../../features/identity/identityService'
import {
  clearIdentityLastResult,
  finishIdentityRequest,
  identityUiState,
  markIdentityVerifiedNow,
  resetIdentityUiState,
  setIdentityApprovalPhase,
  setIdentityDeviceMeta,
  setIdentityLastResult,
  setIdentityQueuedCount,
  setIdentitySessionValidation,
  setIdentitySuppressedForLogin
} from '../../features/identity/identityStore'
import { hasSensitiveScope } from '../../features/identity/identityScopes'
import {
  getIdentityDeviceDisplayName,
  invokeNative
} from '../../platform/native'
import { IdentityServiceError } from '../../features/identity/types'
import type {
  IdentityEnrollResult,
  IdentityLocalDeviceStatus,
  IdentityRequestDetail,
  IdentitySignedApproval,
  IdentityUserSafeErrorCode
} from '../../features/identity/types'
import { showToast } from '../../utils/toast'

/** 本地 bootstrap 等待轮询：100ms 间隔、最多 5s（仅本地瞬态等待，不是网络轮询/常驻） */
const BOOT_WAIT_INTERVAL_MS = 100
const BOOT_WAIT_MAX_TICKS = 50

/** 登录恢复事件（AuthCoordinator.handleLoginSuccess 派发；#623 resume hook） */
export const IDENTITY_LOGIN_RESUMED_EVENT = 'hbu-identity-login-resumed'

/** 登出事件（AuthCoordinator.handleLogout 派发，已有） */
const SESSION_LOGOUT_EVENT = 'hbu-session-logout'

export const createIdentityCoordinator = (runtime: AppRuntime): IdentityCoordinator => {
  const { state } = runtime

  /** 冷启动缓冲：app shell 尚未 bootstrap 时收到的 Intent（仅内存，不持久化） */
  let pendingBuffer: IdentityIntent[] = []
  let bootWaitTimer: ReturnType<typeof setTimeout> | null = null

  // ── #623 流程状态（每实例） ──────────────────────────────────────────────
  /** 正在执行加载流程的 requestId（防同一请求重复触发；不同请求可交错推进） */
  let flowRequestId: string | null = null
  /** 审批动作（approve/deny/cancel）进行中（防双击/并发） */
  let actionInFlight = false
  /**
   * 已产生终态结果但用户尚未确认的结果页记录（#623「结果页优先展示」）：
   * - finishIdentityRequest 只写 UI 结果，不立即 completeIntent（否则队列下一个请求的
   *   启动流程会同步清掉刚设置的结果页，用户看不到「已允许登录」反馈）；
   * - 用户在结果页点「完成」-> confirmResult() -> 清结果页 + 推进队列。
   */
  let pendingTerminal: { requestId: string; status: 'done' | 'error'; error?: string } | null = null
  /** 本地过期倒计时 timer（不常连；仅当前请求一次定时） */
  let expiryTimer: ReturnType<typeof setTimeout> | null = null
  /** 已安装的全局事件监听（dispose 时移除） */
  let removeResumeListener: (() => void) | null = null
  let removeLogoutListener: (() => void) | null = null

  const clearExpiryTimer = (): void => {
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer)
      expiryTimer = null
    }
  }

  /** 当前活跃请求是否仍是该 requestId（异步返回后防被取消/替换） */
  const isCurrentActive = (requestId: string): boolean =>
    getIdentityIntentSnapshot().active?.requestId === requestId

  /** 错误 → 用户可读信息（内部 code 仅脱敏日志，UI 不显示 stack/crypto detail） */
  const toUserSafeError = (
    err: unknown
  ): { code: IdentityUserSafeErrorCode; message: string; retryable: boolean } => {
    if (err instanceof IdentityServiceError) {
      return {
        code: err.code,
        message: err.message,
        retryable: err.code === 'network_unavailable'
      }
    }
    // invokeNative 抛错：Rust 已返回简体中文、不含敏感材料，可直接展示
    const message = String((err as Error)?.message || err || '授权处理失败').trim()
    return { code: 'unknown', message: message || '授权处理失败', retryable: false }
  }

  // ── 过期倒计时（本地计算，不向服务器轮询） ────────────────────────────────
  const scheduleExpiryTimer = (expiresAtIso: string, requestId: string): void => {
    clearExpiryTimer()
    const expires = new Date(expiresAtIso).getTime()
    if (!Number.isFinite(expires)) return
    const delay = Math.max(0, expires - Date.now()) + 500
    expiryTimer = setTimeout(() => {
      expiryTimer = null
      if (!isCurrentActive(requestId)) return
      const active = getIdentityIntentSnapshot().active
      if (!active || active.phase === 'done' || active.phase === 'error') return
      if (actionInFlight) return // 审批动作进行中：由动作决定终态
      if (pendingTerminal) return // 已有未确认的结果页：由确认流程决定终态
      // 先记录 UI 结果；队列推进延后到用户确认结果页（confirmResult）
      clearExpiryTimer()
      finishIdentityRequest(requestId, 'expired', {
        message: '应用请求已过期，请从网页重新发起授权',
        errorCode: 'request_expired'
      })
      pendingTerminal = { requestId, status: 'error', error: '应用请求已过期' }
    }, delay)
  }

  // ── 登录后分支：会话新鲜度校验 -> ready ───────────────────────────────────
  /**
   * 已登录分支：
   * - 仅包含基础 scope：本地已登录即可授权（不读取学校身份，见 Contract 测试 5）；
   * - 含敏感 scope（student.identity）：允许前必须在线刷新本地学校 session，
   *   刷新/恢复失败时明确不给 student.identity（本地有缓存学号 ≠ 验证成功）。
   */
  const proceedLoggedIn = async (
    active: PendingExternalIntent,
    detail: IdentityRequestDetail
  ): Promise<void> => {
    // 敏感 scope 验证结果：ready 相位会重置 sessionValidation，验证成功需在此之后显式标记
    let sensitiveVerified = false
    if (hasSensitiveScope(detail.scopes)) {
      setIdentityApprovalPhase('validating_session', { requestId: active.requestId, detail })
      setIdentitySessionValidation('validating')
      let verified = false
      try {
        verified = await runtime.session.refreshSessionVerified({ quiet: true })
      } catch {
        verified = false
      }
      if (!isCurrentActive(active.requestId)) return
      if (!verified) {
        // 明确失效：走现有静默恢复（restore/auto-relogin）
        let recovered = false
        try {
          recovered = await runtime.session.attemptOnlineRecovery({ silent: true })
        } catch {
          recovered = false
        }
        if (!isCurrentActive(active.requestId)) return
        if (!recovered) {
          finishIdentityRequest(active.requestId, 'error', {
            message: '学校登录需要重新验证，请重新登录后再试',
            errorCode: 'session_revalidation_required'
          })
          pendingTerminal = { requestId: active.requestId, status: 'error', error: '学校登录需要重新验证' }
          return
        }
      }
      markIdentityVerifiedNow()
      sensitiveVerified = true
    }
    setIdentityApprovalPhase('ready', { requestId: active.requestId, detail })
    setIdentityIntentPhase(active.requestId, 'ready', { detail })
    if (sensitiveVerified) setIdentitySessionValidation('ok')
  }

  // ── 请求加载流程（received -> loading -> 详情 -> needs_login / ready） ─────
  const runActiveFlow = async (active: PendingExternalIntent): Promise<void> => {
    if (active.phase !== 'received') return
    if (flowRequestId === active.requestId) return
    flowRequestId = active.requestId
    try {
      setIdentityLastResult(null)
      clearExpiryTimer()
      setIdentityApprovalPhase('loading_request', { requestId: active.requestId })
      setIdentityIntentPhase(active.requestId, 'loading')
      const detail = await fetchRequestDetail({
        baseUrl: getIdentityBffBaseUrl(),
        requestId: active.requestId,
        handoff: active.handoff
      })
      if (!isCurrentActive(active.requestId)) return
      scheduleExpiryTimer(detail.expires_at, active.requestId)
      const loggedIn = !!state.studentId.value && (state.isLoggedIn.value || !!state.studentId.value)
      if (!loggedIn) {
        // 未登录：保留意图（仅内存），复用现有登录流程；
        // detail 一并存入 intent store（登录成功 resume 后审批签名需要）
        setIdentityApprovalPhase('needs_login', { requestId: active.requestId, detail, needsLogin: true })
        setIdentityIntentPhase(active.requestId, 'awaiting_local_login', { detail })
        return
      }
      await proceedLoggedIn(active, detail)
    } catch (err) {
      if (!isCurrentActive(active.requestId)) return
      const mapped = toUserSafeError(err)
      // 先记录 UI 结果；队列推进延后到用户确认结果页（confirmResult）
      finishIdentityRequest(active.requestId, 'error', {
        message: mapped.message,
        errorCode: mapped.code,
        retryable: mapped.retryable
      })
      pendingTerminal = { requestId: active.requestId, status: 'error', error: mapped.message }
    } finally {
      if (flowRequestId === active.requestId) flowRequestId = null
    }
  }

  /** 意图 store 变更订阅：同步队列计数 + 自动启动新请求的加载流程 */
  const handleIntentStoreChange = (): void => {
    const snap = getIdentityIntentSnapshot()
    setIdentityQueuedCount(snap.queue.length)
    if (snap.phase === 'received' && snap.active) {
      void runActiveFlow(snap.active)
    }
  }

  // ── 设备绑定（#622：用当前请求 handoff 获取 enrollment challenge） ────────
  const ensureDeviceBound = async (handoff: string): Promise<string> => {
    let status: IdentityLocalDeviceStatus | null = null
    try {
      status = await invokeNative<IdentityLocalDeviceStatus>('identity_device_status')
    } catch {
      status = null
    }
    if (status === null || status.available === false) {
      throw new IdentityServiceError(
        'secure_storage_unavailable',
        '本机安全存储不可用，无法完成授权',
        status?.error || 'identity_device_status unavailable'
      )
    }
    if (!status.has_key) {
      // 未绑定：当前请求 handoff 绑定创建 challenge（防匿名无限创建）
      const { challenge } = await fetchEnrollmentChallenge({
        baseUrl: getIdentityCoreBaseUrl(),
        handoff
      })
      const enroll = await invokeNative<IdentityEnrollResult>('identity_enroll_device', {
        baseUrl: getIdentityCoreBaseUrl(),
        challenge,
        deviceName: getIdentityDeviceDisplayName(),
        handoff
      })
      setIdentityDeviceMeta({ deviceId: enroll.device_id, userId: enroll.user_id })
      return enroll.device_id
    }
    const storedDeviceId = identityUiState.deviceId
    if (!storedDeviceId) {
      throw new IdentityServiceError(
        'device_not_bound',
        '当前设备尚未完成绑定，请先完成绑定后再授权',
        'device key exists but device_id missing locally'
      )
    }
    return storedDeviceId
  }

  // ── 允许（approve） ───────────────────────────────────────────────────────
  const approveActive = async (): Promise<void> => {
    const snap = getIdentityIntentSnapshot()
    const active = snap.active
    if (!active || active.phase !== 'ready') return
    if (actionInFlight) return
    if (pendingTerminal) return // 已有未确认的结果页：等待确认，不接受新动作
    actionInFlight = true
    const requestId = active.requestId
    const detail = active.detail as IdentityRequestDetail | undefined
    try {
      if (!detail) {
        throw new IdentityServiceError('unknown', '请求数据缺失，请重新发起授权', 'approve without detail')
      }
      if (!detail.challenge || !detail.client_id) {
        // #622 冻结 Core 的 sanitized 详情不含签名材料（issue #623 示例含 challenge）：
        // 前端宽容解析，缺失时明确失败而不是伪造签名上下文。
        throw createServiceError(
          'signing_material_missing',
          undefined,
          `core detail missing challenge/client_id (request=${requestId})`
        )
      }
      setIdentityApprovalPhase('approving', { requestId })
      setIdentityIntentPhase(requestId, 'approving')
      // 确保设备已绑定（未绑定则自动 enrollment；device_id 是签名输入）
      const deviceId = await ensureDeviceBound(active.handoff)
      if (!isCurrentActive(requestId)) return
      // Rust 侧签名：私钥不进 JS，只返回 device_id/issued_at/nonce/signature
      const signed = await invokeNative<IdentitySignedApproval>('identity_sign_auth_request', {
        input: {
          request_id: requestId,
          challenge: detail.challenge,
          client_id: detail.client_id,
          scopes: detail.scopes.map((scope) => scope.id),
          device_id: deviceId
        }
      })
      if (!isCurrentActive(requestId)) return
      await submitApprove({
        baseUrl: getIdentityCoreBaseUrl(),
        requestId,
        handoff: active.handoff,
        approval: signed
      })
      if (!isCurrentActive(requestId)) return
      // 先记录结果；队列推进延后到用户确认结果页（confirmResult）
      clearExpiryTimer()
      finishIdentityRequest(requestId, 'approved', {
        message: '已允许登录，网页将自动完成登录，你可以返回浏览器'
      })
      pendingTerminal = { requestId, status: 'done' }
    } catch (err) {
      if (!isCurrentActive(requestId)) return
      const mapped = toUserSafeError(err)
      clearExpiryTimer()
      finishIdentityRequest(requestId, 'error', {
        message: mapped.message,
        errorCode: mapped.code,
        retryable: mapped.retryable
      })
      pendingTerminal = { requestId, status: 'error', error: mapped.message }
    } finally {
      actionInFlight = false
    }
  }

  // ── 拒绝 / 取消 ───────────────────────────────────────────────────────────
  /**
   * 拒绝/取消当前请求：
   * - 拒绝按钮与关闭按钮语义一致（都是终止本次授权，不留悬空 WAITING 感知）；
   * - best-effort 通知 Core（#622 冻结 Core 暂无 deny/cancel 路由，404 时服务器
   *   TTL 自然过期，UI 明确说明，不让用户误以为已拒绝但服务器仍在等待）；
   * - 清除本地 handoff（completeIntent 即清内存）后不可再 approve。
   */
  const runTerminalAction = async (action: 'deny' | 'cancel'): Promise<void> => {
    const snap = getIdentityIntentSnapshot()
    const active = snap.active
    if (!active) return
    const allowed: IdentityIntentPhase[] = ['received', 'loading', 'ready', 'awaiting_local_login']
    if (!allowed.includes(active.phase)) return
    if (actionInFlight) return
    if (pendingTerminal) return // 已有未确认的结果页：等待确认，不接受新动作
    actionInFlight = true
    const requestId = active.requestId
    const handoff = active.handoff
    try {
      setIdentityApprovalPhase('denying', { requestId })
      const delivered = await submitTerminalAction({
        baseUrl: getIdentityCoreBaseUrl(),
        requestId,
        handoff,
        action
      })
      if (!isCurrentActive(requestId)) return
      if (action === 'deny') {
        finishIdentityRequest(requestId, 'denied', {
          message: delivered ? '已拒绝授权' : '已拒绝授权（服务器端请求将自动过期）'
        })
      } else {
        finishIdentityRequest(requestId, 'cancelled', {
          message: delivered ? '已取消授权' : '已取消授权（服务器端请求将自动过期）'
        })
      }
      // 队列推进延后到用户确认结果页（confirmResult）
      pendingTerminal = { requestId, status: 'done' }
    } finally {
      actionInFlight = false
    }
  }

  /**
   * 结果页确认（overlay 结果页「完成」按钮 / Escape / 关闭按钮调用）：
   * - 清空结果页；
   * - 若有未 complete 的终态请求，此刻推进队列（下一个请求自动进入加载流程）。
   * 语义：成功/拒绝/过期/失败的结果必须让用户看到，确认后才允许下一个请求抢占 Overlay。
   */
  const confirmResult = (): void => {
    clearIdentityLastResult()
    const pending = pendingTerminal
    pendingTerminal = null
    if (pending) {
      completeIdentityIntent(pending.requestId, pending.status, pending.error)
    }
  }

  // ── 登录恢复 hook ─────────────────────────────────────────────────────────
  const resumeAfterLogin = async (): Promise<void> => {
    const snap = getIdentityIntentSnapshot()
    const active = snap.active
    if (!active || active.phase !== 'awaiting_local_login') return
    const detail = active.detail as IdentityRequestDetail | undefined
    if (!detail) return
    setIdentitySuppressedForLogin(false)
    setIdentityApprovalPhase('validating_session', { requestId: active.requestId, detail })
    setIdentityIntentPhase(active.requestId, 'loading')
    await proceedLoggedIn(active, detail)
  }

  /** 前往现有登录流程（Me 视图）：隐藏 Overlay，意图保留在内存 */
  const goLogin = (): void => {
    const snap = getIdentityIntentSnapshot()
    const active = snap.active
    if (!active || active.phase !== 'awaiting_local_login') return
    setIdentitySuppressedForLogin(true)
    runtime.navigation.goToView('me', { push: true })
  }

  // ── #621 原有调度逻辑（保持行为不变） ─────────────────────────────────────

  const stopBootWait = (): void => {
    if (bootWaitTimer !== null) {
      clearTimeout(bootWaitTimer)
      bootWaitTimer = null
    }
  }

  const flushPendingIntents = (): void => {
    stopBootWait()
    if (pendingBuffer.length === 0) return
    const batch = pendingBuffer
    pendingBuffer = []
    for (const intent of batch) {
      const result = enqueueIdentityIntent(intent)
      if (!result.accepted) showToast(result.message, 'warning')
    }
  }

  const scheduleBootWait = (): void => {
    if (bootWaitTimer !== null || state.mutable.appBootstrapped) return
    let ticks = 0
    const tick = (): void => {
      if (state.mutable.appBootstrapped) {
        flushPendingIntents()
        return
      }
      ticks += 1
      if (ticks >= BOOT_WAIT_MAX_TICKS) {
        // 超时兜底：buffer 保留，等待 flushPendingIntents 显式冲刷（bootstrap 完成时必然调用）
        bootWaitTimer = null
        return
      }
      bootWaitTimer = setTimeout(tick, BOOT_WAIT_INTERVAL_MS)
    }
    bootWaitTimer = setTimeout(tick, BOOT_WAIT_INTERVAL_MS)
  }

  const submitIntent = (intent: IdentityIntent): void => {
    if (!intent || typeof intent.requestId !== 'string' || intent.requestId === '') return
    if (typeof intent.handoff !== 'string' || intent.handoff === '') return
    // 只保留合同字段：任何 deep link 附加的展示资料（name/scope/student_id）一律丢弃
    const normalized: IdentityIntent = {
      requestId: intent.requestId,
      handoff: intent.handoff,
      arrivedAt: typeof intent.arrivedAt === 'number' ? intent.arrivedAt : Date.now()
    }
    if (!state.mutable.appBootstrapped) {
      // 冷启动：shell 未就绪前只写入内存缓冲，不操作 UI；bootstrap 后统一入队
      pendingBuffer.push(normalized)
      scheduleBootWait()
      return
    }
    const result = enqueueIdentityIntent(normalized)
    if (!result.accepted) showToast(result.message, 'warning')
  }

  const handleLoginResumed = (): void => {
    void resumeAfterLogin()
  }

  const handleSessionLogout = (): void => {
    // 授权等待中登出：回到“需要登录”状态（意图保留，登录后自动恢复）
    const snap = getIdentityIntentSnapshot()
    const active = snap.active
    if (!active) return
    if (active.phase === 'ready' || active.phase === 'loading') {
      setIdentityApprovalPhase('needs_login', { requestId: active.requestId, needsLogin: true })
      setIdentityIntentPhase(active.requestId, 'awaiting_local_login')
    }
  }

  const installGlobalListeners = (): void => {
    if (removeResumeListener !== null) return
    const onResume = (): void => handleLoginResumed()
    const onLogout = (): void => handleSessionLogout()
    window.addEventListener(IDENTITY_LOGIN_RESUMED_EVENT, onResume)
    window.addEventListener(SESSION_LOGOUT_EVENT, onLogout)
    removeResumeListener = () => window.removeEventListener(IDENTITY_LOGIN_RESUMED_EVENT, onResume)
    removeLogoutListener = () => window.removeEventListener(SESSION_LOGOUT_EVENT, onLogout)
  }

  const uninstallGlobalListeners = (): void => {
    removeResumeListener?.()
    removeLogoutListener?.()
    removeResumeListener = null
    removeLogoutListener = null
  }

  // 启动：订阅意图 store（自动驱动加载流程）+ 全局登录事件（node 测试环境无 window，跳过监听）
  const unsubscribeStore = subscribeIdentityIntentStore(handleIntentStoreChange)
  if (typeof window !== 'undefined') {
    installGlobalListeners()
  }

  const dispose = (): void => {
    stopBootWait()
    clearExpiryTimer()
    pendingBuffer = []
    pendingTerminal = null
    unsubscribeStore()
    uninstallGlobalListeners()
  }

  return {
    // #621 合同（原样保留）
    submitIntent,
    flushPendingIntents,
    completeIntent: (requestId, status, error) => completeIdentityIntent(requestId, status, error),
    dismissIntent: (requestId) => dismissIdentityIntent(requestId),
    setPhase: (requestId, nextPhase: Exclude<IdentityIntentPhase, 'done' | 'error'> | 'error', options) =>
      setIdentityIntentPhase(requestId, nextPhase, options),
    reset: () => {
      dispose()
      resetIdentityIntentStore()
      resetIdentityUiState()
    },
    getSnapshot: () => getIdentityIntentSnapshot(),
    subscribe: (listener) => subscribeIdentityIntentStore(listener),
    dispose,
    // #623 扩展（审批流程 + 登录恢复）
    approveActive,
    denyActive: () => runTerminalAction('deny'),
    cancelActive: () => runTerminalAction('cancel'),
    resumeAfterLogin,
    goLogin,
    confirmResult
  }
}
