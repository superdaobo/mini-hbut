/**
 * 校园码刷新链 / 订单状态轮询（issue #1114）。
 *
 * 背景：旧实现里 `scheduleAutoRefresh` 只在成功路径被调用，自动刷新一次失败后
 * 既没有下一轮调度、也不报错（silent 场景）→ 永久停止。本模块把「调度 + 退避 +
 * 恢复」抽成纯策略 + 依赖可注入的控制器，组件只负责 UI 状态与渲染：
 *
 * - classifyCampusCodeFailure：把各种失败形态（Axios 响应 / 适配器 payload /
 *   Tauri 对象错误 / 纯字符串）归一成 { kind, retryable, message }；
 * - nextRetryDelayMs：有界退避 5s → 10s → 20s → 30s（封顶，永不风暴、永不永久停止）；
 * - createCampusCodeRefreshChain：普通周期调度 + 失败退避 + 成功后恢复 +
 *   手动立即触发 + stop/dispose + 请求序号（旧响应不写回）；
 * - createOrderStatusPoller：订单状态独立轮询，仅在二维码有效时继续，
 *   失败按同一退避阶梯继续，绝不把失败当「已支付」。
 *
 * 所有计时器均通过注入的 setTimeoutFn/clearTimeoutFn 管理，node 环境可用
 * vi.useFakeTimers 直接测试，不依赖 DOM。
 */

/** 退避阶梯：连续失败 1/2/3 次分别 5s/10s/20s，第 4 次起封顶 30s */
export const RETRY_DELAYS_MS = [5000, 10000, 20000, 30000]

/** 后端 A1 契约的 kind → 归一化类型（kind 未合并时一律回退 unknown） */
const KIND_NORMALIZATION = {
  campus_code_auth_required: 'auth_required',
  campus_code_empty_response: 'empty_response',
  campus_code_non_json: 'non_json',
  campus_code_upstream_unavailable: 'upstream_unavailable',
  campus_code_transport: 'transport',
  campus_code_business_rejected: 'business_rejected'
}

/** transient 类型：允许有界退避自动重试；auth / business 不自动重试（防风暴） */
const TRANSIENT_RAW_KINDS = new Set([
  'campus_code_empty_response',
  'campus_code_non_json',
  'campus_code_upstream_unavailable',
  'campus_code_transport'
])

const asText = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * 从任意「失败载体」中提取 { kind, message }。
 * 兼容形态：
 * - 字符串（旧适配器 errorMessage / 纯文本）
 * - { kind, message }（Tauri A1 对象错误）
 * - { error: { kind, message } | '字符串' }（后端 400 payload / 适配器 data）
 * - Error 实例（message 为字符串）
 * 无法提取时返回 null。
 */
const readErrorInfo = (value) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const text = value.trim()
    return text ? { kind: null, message: text } : null
  }
  if (typeof value !== 'object') return null

  const info = { kind: null, message: '' }
  const directKind = asText(value.kind)
  if (directKind) info.kind = directKind
  const directMessage = asText(value.message)
  if (directMessage) info.message = directMessage
  if (!info.kind && !info.message) {
    const nested = readErrorInfo(value.error)
    if (nested) {
      info.kind = nested.kind
      info.message = nested.message
    }
  }
  return info.kind || info.message ? info : null
}

/**
 * 按「最具体」的优先级收集候选：Axios 响应的 data / response / 异常本体。
 * kind 只信任第一个带 kind 的候选，避免外层包裹把 kind 冲掉。
 */
const extractErrorInfo = (error) => {
  const candidates = []
  if (error !== null && typeof error === 'object') {
    const response = error.response
    if (response !== null && typeof response === 'object') {
      candidates.push(response.data)
      candidates.push(response)
    }
    candidates.push(error)
  } else {
    candidates.push(error)
  }

  for (const candidate of candidates) {
    const info = readErrorInfo(candidate)
    if (info && info.kind) return info
  }
  for (const candidate of candidates) {
    const info = readErrorInfo(candidate)
    if (info && info.message) return info
  }
  return { kind: null, message: '' }
}

/**
 * 归一化校园码请求失败：
 * - kind：auth_required / empty_response / non_json / upstream_unavailable /
 *   transport / business_rejected / unknown（后端 kind 未合并时回退 unknown）；
 * - retryable：transient 与 unknown 允许自动退避重试（保证「永不永久停止」）；
 *   auth_required（登录失效）与 business_rejected（业务拒绝）不自动重试（防风暴），
 *   手动刷新仍然可用。
 */
export const classifyCampusCodeFailure = (error) => {
  const info = extractErrorInfo(error)
  const rawKind = info.kind
  const kind = rawKind && rawKind in KIND_NORMALIZATION ? KIND_NORMALIZATION[rawKind] : 'unknown'
  const retryable = kind === 'unknown' || (rawKind && TRANSIENT_RAW_KINDS.has(rawKind))
  return {
    kind,
    rawKind: rawKind ? rawKind : null,
    message: info.message,
    retryable
  }
}

/**
 * 第 N 次连续失败后的退避时长（ms）：1→5s、2→10s、3→20s、≥4→30s（封顶）。
 * 非法/0/负数入参按 1 次处理，永不返回 0（避免 0ms 重试风暴）。
 */
export const nextRetryDelayMs = (failures) => {
  const count = Math.max(1, Math.floor(Number(failures) || 1))
  const index = Math.min(count - 1, RETRY_DELAYS_MS.length - 1)
  return RETRY_DELAYS_MS[index]
}

/**
 * 校园码刷新链控制器（依赖可注入，node 可测）。
 *
 * 选项：
 * - request(origin)：发起一次 QR 请求；成功 resolve 载荷，失败 reject 任意形态
 *   （控制器内部用 classify 归一化）。origin ∈ 'start'|'auto'|'retry'|'manual'。
 * - getIntervalMs()：返回周期毫秒数；返回 null 表示「一次性」语义
 *   （成功后不排周期、失败后不自动退避重试，仅展示失败状态）。
 * - setTimeoutFn/clearTimeoutFn/now：注入以便 fake timers 测试。
 * - classify/nextDelay：可替换策略（默认上述两个导出）。
 * - onState(snapshot)/onSuccess(payload)/onFailure(info)：状态回调。
 *
 * 快照字段：
 * - status: 'idle'|'loading'|'ready'|'failed'|'stopped_auth'|'stopped_business'|'stopped'
 * - kind/message：最近一次失败（成功后清空）
 * - failureCount：连续失败计数（成功清零）
 * - retryDelayMs：status==='failed' 且已排定退避时非空（一次性失败为 null）
 * - lastSuccessAt：最近一次成功的时间戳（now()）
 *
 * 请求序号：每次发起请求递增 seq；旧请求返回时若 seq 已落后（手动触发/stop
 * 已接管）则整体忽略，杜绝乱序覆盖。
 */
export const createCampusCodeRefreshChain = (options = {}) => {
  const {
    request,
    getIntervalMs = () => null,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    now = () => Date.now(),
    classify = classifyCampusCodeFailure,
    nextDelay = nextRetryDelayMs,
    onState = () => {},
    onSuccess = () => {},
    onFailure = () => {}
  } = options

  let disposed = false
  let pendingTimer = null
  let requestSeq = 0
  let failureCount = 0
  let lastFailure = null
  let lastSuccessAt = null
  let retryDelayMs = null
  let status = 'idle'

  const snapshot = () => ({
    status,
    kind: lastFailure ? lastFailure.kind : null,
    message: lastFailure ? lastFailure.message : null,
    failureCount,
    retryDelayMs: status === 'failed' ? retryDelayMs : null,
    lastSuccessAt
  })

  const emit = () => {
    onState(snapshot())
  }

  const clearPending = () => {
    if (pendingTimer !== null) {
      clearTimeoutFn(pendingTimer)
      pendingTimer = null
    }
  }

  const scheduleTimer = (delayMs, fn) => {
    // 单槽位计时器：任何新调度先清旧，保证任一时刻至多一个待执行 timer
    clearPending()
    if (disposed) return
    pendingTimer = setTimeoutFn(() => {
      pendingTimer = null
      void runAttempt(fn)
    }, delayMs)
  }

  const isStale = (seq) => disposed || seq !== requestSeq

  const safeCallback = (fn, arg) => {
    try {
      fn(arg)
    } catch {
      // 回调异常（UI 侧）不允许打断刷新链的调度
    }
  }

  const runAttempt = async (origin) => {
    if (disposed) return
    const seq = ++requestSeq
    status = 'loading'
    emit()
    try {
      const payload = await request(origin)
      if (isStale(seq)) return
      // 成功：重置失败计数，恢复周期调度（一次性语义则不排）
      failureCount = 0
      lastFailure = null
      lastSuccessAt = now()
      retryDelayMs = null
      status = 'ready'
      emit()
      safeCallback(onSuccess, payload)
      const intervalMs = getIntervalMs()
      if (typeof intervalMs === 'number' && intervalMs > 0) {
        scheduleTimer(intervalMs, 'auto')
      }
    } catch (error) {
      if (isStale(seq)) return
      const info = classify(error)
      failureCount += 1
      lastFailure = { kind: info.kind, message: info.message }
      if (info.retryable) {
        const intervalMs = getIntervalMs()
        if (typeof intervalMs === 'number' && intervalMs > 0) {
          // 在线语义：有界退避后继续，永不永久停止
          const delay = nextDelay(failureCount)
          retryDelayMs = delay
          status = 'failed'
          emit()
          safeCallback(onFailure, info)
          scheduleTimer(delay, 'retry')
        } else {
          // 一次性语义（离线手动）：不排自动重试，仅展示失败
          retryDelayMs = null
          status = 'failed'
          emit()
          safeCallback(onFailure, info)
        }
      } else if (info.kind === 'auth_required') {
        retryDelayMs = null
        status = 'stopped_auth'
        emit()
        safeCallback(onFailure, info)
      } else {
        // business_rejected：展示安全文案，不自动风暴重试
        retryDelayMs = null
        status = 'stopped_business'
        emit()
        safeCallback(onFailure, info)
      }
    }
  }

  const start = () => {
    if (disposed) return
    void runAttempt('start')
  }

  const triggerNow = () => {
    // 手动刷新：立即发起并清掉任何待执行 timer（周期或退避）；
    // 若已有请求在途，新请求以更高序号接管，旧响应自动失效
    if (disposed) return
    clearPending()
    void runAttempt('manual')
  }

  const stop = () => {
    if (disposed) return
    disposed = true
    requestSeq += 1 // 使所有在途请求的写回失效
    clearPending()
    status = 'stopped'
    emit()
  }

  const dispose = stop

  return { start, triggerNow, stop, dispose }
}

/**
 * 订单状态轮询器（独立于 QR 刷新链，依赖可注入，node 可测）。
 *
 * 语义：
 * - 仅当 shouldContinue()（组件侧：二维码仍有效）为真时继续轮询；
 * - 正常周期 getIntervalMs()（默认 3s）；失败按 nextRetryDelayMs 有界退避并继续；
 * - 成功回调 onResult(payload)；控制器不解释 payload（是否「已支付」由组件判断，
 *   轮询失败绝不下发任何成功载荷 → 不会伪造「已支付」）；
 * - stop()：清 timer 并使在途响应失效。
 */
export const createOrderStatusPoller = (options = {}) => {
  const {
    request,
    getIntervalMs = () => 3000,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    classify = classifyCampusCodeFailure,
    nextDelay = nextRetryDelayMs,
    shouldContinue = () => true,
    onState = () => {},
    onResult = () => {}
  } = options

  let disposed = false
  let pendingTimer = null
  let requestSeq = 0
  let failureCount = 0
  let status = 'idle'

  const snapshot = () => ({ status, failureCount })

  const emit = () => {
    onState(snapshot())
  }

  const clearPending = () => {
    if (pendingTimer !== null) {
      clearTimeoutFn(pendingTimer)
      pendingTimer = null
    }
  }

  const scheduleTimer = (delayMs) => {
    clearPending()
    if (disposed) return
    pendingTimer = setTimeoutFn(() => {
      pendingTimer = null
      void runPoll()
    }, delayMs)
  }

  const isStale = (seq) => disposed || seq !== requestSeq

  const safeCallback = (fn, arg) => {
    try {
      fn(arg)
    } catch {
      // 回调异常不打断轮询链
    }
  }

  const runPoll = async () => {
    if (disposed) return
    if (!shouldContinue()) {
      // 二维码已失效（被清空/切模式）→ 停止轮询，不再发起请求
      stop()
      return
    }
    const seq = ++requestSeq
    status = 'polling'
    emit()
    try {
      const payload = await request()
      if (isStale(seq)) return
      failureCount = 0
      status = 'ready'
      emit()
      safeCallback(onResult, payload)
      const intervalMs = getIntervalMs()
      if (typeof intervalMs === 'number' && intervalMs > 0) {
        scheduleTimer(intervalMs)
      }
    } catch (error) {
      if (isStale(seq)) return
      // 失败按有界退避继续；分类仅用于诊断，任何失败都不当成功处理
      const info = classify(error)
      failureCount += 1
      status = 'failed'
      emit()
      const delay = nextDelay(failureCount)
      scheduleTimer(delay)
    }
  }

  const start = () => {
    if (disposed) return
    void runPoll()
  }

  const stop = () => {
    if (disposed) return
    disposed = true
    requestSeq += 1
    clearPending()
    status = 'stopped'
    emit()
  }

  const dispose = stop

  return { start, stop, dispose }
}
