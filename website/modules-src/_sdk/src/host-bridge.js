/**
 * Host 握手桥（postMessage）+ Launch Ticket 读取/清理。
 *
 * 协议依据：
 * - §6.2.3：ticket 经 iframe URL query 传入；SDK 首次读取后立即 history.replaceState 清除；
 * - §6.2.3 L5：禁止把 ticket/GS token 写进 localStorage / sessionStorage / IndexedDB / cookie；
 * - §10 L1：禁止把 ticket / Authorization 原值写入日志（本文件无任何日志输出）；
 * - #904 任务：postMessage **必须校验 event.origin**。
 *
 * 安全模型（关键决策）：
 * 1. 结构校验：`event.source` 必须是宿主窗口（window.parent）；
 * 2. 来源校验：`event.origin` 必须落在允许集合内 —— 允许集合**只来自显式来源**：
 *      显式配置 `hostOrigins` > Host 在 iframe URL 注入的 `host_origin`；
 *    **绝不回落 `document.referrer` / 自身页面 origin**（P1-B 契约 C：任意第三方页面
 *    嵌入游戏不得被当成可信宿主）。无任何显式来源 → 不允许集合为空 → 拒绝一切来源
 *    （`origin_unverifiable`），且宿主桥不发送握手消息、不发起 V2 请求（fail closed）。
 *    `'null'`（opaque origin，file:// / sandbox iframe）默认**拒绝**，需显式 opt-in；
 * 3. 关联校验：`request_id` 必须与本次握手请求一致（拒绝陈旧/串台响应）；
 * 4. 绑定校验：`game_id` / `protocol_version` 不匹配 → 拒绝并降级（不使用该响应携带的 ticket）；
 * 5. 任何一次握手失败都不抛错，只降级（standalone/compatibility 由上层决定）。
 */

import { HOST_MESSAGE_TYPES, LAUNCH_TICKET_QUERY_KEYS, SUPPORTED_PROTOCOL_VERSIONS } from './version.js'
import {
  getHistory,
  getHostWindow,
  getLocation,
  getWindow,
  isEmbedded,
  readSearchParams
} from './env.js'
import { createPrefixedId, safeText } from './utils.js'

const MAX_TICKET_LENGTH = 512
/** gpt_ 前缀 + base64url 32 字节（§6.2.1）；其余形状按 legacy_shape 接受并记诊断 */
const MODERN_TICKET_RE = /^gpt_[A-Za-z0-9_-]{16,}$/
const GENERIC_TICKET_RE = /^[A-Za-z0-9._~-]{16,512}$/
/**
 * P1-B：宿主显式注入自身 origin 的 URL 参数（additive）。
 * 这是除 `config.hostOrigins` 之外**唯一**的宿主自证渠道 —— 绝不回落 referrer / 自身 origin。
 *
 * ⚠ 信任级别 / 能力边界（issue #959，结论性声明）：
 * `host_origin` 是**宿主自声明**参数 —— 由被嵌入页面自己的 iframe URL 携带，SDK 在
 * 客户端侧**无法验证其真实性**：任何第三方页面嵌入游戏并自带
 * `?host_origin=<自身 origin>` 即会被本 SDK 视为"可信宿主"，从而触发宿主握手并发出
 * `GET /meta` 与 `POST /sessions` 请求。这是**已知并接受的风险边界**（降级防御）：
 *  - 第三方页面拿不到合法 Launch Ticket（ticket 由 App 宿主签发并经 iframe URL 传入），
 *    因此 `/sessions` 兑换必然失败，**无法取得真正 verified、零写入**；
 *  - 但"第三方嵌入零 V2 请求"的纵深防御会被打破（可被用于探测与噪声）；
 *  - 真正的身份边界在服务端：ticket/session 兑换不信任客户端声明的宿主来源；
 *    长期方向（选项 A）是在 Launch Ticket 签发时绑定宿主 origin、兑换时复核，
 *    落地后本参数的自声明语义即失效。
 * 详见 `docs/game-platform/trust-model.md` §2.4 与 `docs/game-platform/host-injection.md`。
 */
export const HOST_ORIGIN_QUERY_KEY = 'host_origin'

/**
 * 归一化 origin（与宿主侧 `game_center/base.ts#normalizeGameOrigin` 同规则）：
 * http(s) → `URL.origin`；Capacitor/Tauri 等自定义 scheme → `${protocol}//${host}`
 *（`new URL('tauri://localhost').origin` 是字符串 `"null"`，直接取值会把本地宿主误杀）。
 * `*` / `'null'` / 无 host / 非法输入 → 空串。
 */
export const normalizeHostOrigin = (value) => {
  const text = safeText(value)
  if (!text || text === '*' || text === 'null') return ''
  try {
    const url = new URL(text)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin
    if (!url.host) return ''
    if (!/^[a-z][a-z0-9+.-]*:$/i.test(url.protocol)) return ''
    return `${url.protocol}//${url.host}`
  } catch {
    return ''
  }
}

/** 读取 URL 注入的 `host_origin`：优先显式 params（引擎注入 / 测试），其次当前页面 URL。 */
const readInjectedHostOrigin = (options = {}) => {
  const params = options.params || readSearchParams()
  const fromParams = safeText(params?.get?.(HOST_ORIGIN_QUERY_KEY))
  if (fromParams) return fromParams
  return safeText(readSearchParams().get(HOST_ORIGIN_QUERY_KEY))
}

/** 读取 URL 中的 Launch Ticket（只读一次；**不得**落盘） */
export const readLaunchTicket = (options = {}) => {
  const params = options.params || readSearchParams()
  for (const key of LAUNCH_TICKET_QUERY_KEYS) {
    const value = safeText(params.get(key))
    if (!value || value.length > MAX_TICKET_LENGTH) continue
    if (MODERN_TICKET_RE.test(value)) return { ticket: value, source: `url.${key}`, shape: 'modern' }
    if (GENERIC_TICKET_RE.test(value)) return { ticket: value, source: `url.${key}`, shape: 'legacy_shape' }
  }
  return null
}

/**
 * 清除 URL 中的 ticket query（纵深防御，§10 L5）。
 * 不修改 iframe 的 src 属性：宿主 remount 时仍会重放 URL，由宿主按 §6.2.3 策略 A 更新 URL。
 */
export const clearLaunchTicketFromUrl = (options = {}) => {
  const historyRef = options.history || getHistory()
  const locationRef = options.location || getLocation()
  if (!historyRef || typeof historyRef.replaceState !== 'function' || !locationRef) return false
  try {
    const params = new URLSearchParams(String(locationRef.search || '').replace(/^\?/, ''))
    let changed = false
    for (const key of LAUNCH_TICKET_QUERY_KEYS) {
      if (params.has(key)) {
        params.delete(key)
        changed = true
      }
    }
    if (!changed) return false
    const query = params.toString()
    const nextUrl = `${String(locationRef.pathname || '')}${query ? `?${query}` : ''}${String(locationRef.hash || '')}`
    historyRef.replaceState(null, '', nextUrl)
    return true
  } catch {
    // replaceState 在部分 WebView / 沙箱 iframe 会抛错；清理失败不影响主流程（ticket 仍只在内存中使用）
    return false
  }
}

/**
 * 创建来源守卫（fail closed）。
 *
 * 允许集合的解析顺序（P1-B 契约 C，**只有这两级**）：
 *   ① 显式配置 `options.hostOrigins`（数组，逐项 `normalizeHostOrigin`）；
 *   ② Host 在 iframe URL 注入的 `host_origin`（`options.params` 或当前页面 URL）。
 * 都没有 → 允许集合为空 → 一切来源 `origin_unverifiable`（**绝不**回落 referrer / 自身 origin）。
 *
 * ⚠ 信任级别（issue #959）：两级来源都是**页面自声明**（② 更是页面 URL 自带），
 * 本守卫校验的是"消息来源与声明一致"，**不是宿主身份证明** —— 第三方页面可声明任意
 * origin 并通过握手（拿不到合法 ticket，verified 不可达，但会发出 /meta 与失败的
 * /sessions 请求）。SDK 侧只做降级防御，最终边界在服务端 ticket/session；
 * 详见 `HOST_ORIGIN_QUERY_KEY` 处声明与 `docs/game-platform/trust-model.md` §2.4。
 *
 * @returns {(event: MessageEvent) => { ok: boolean, reason: string }}
 */
export const createHostOriginGuard = (options = {}) => {
  const explicit = Array.isArray(options.hostOrigins)
    ? options.hostOrigins.map((item) => normalizeHostOrigin(item)).filter(Boolean)
    : []
  const allowOpaque = options.allowOpaqueOrigin === true
  const injected = explicit.length ? [] : [normalizeHostOrigin(readInjectedHostOrigin(options))].filter(Boolean)
  const allowList = explicit.length ? explicit.slice() : injected

  const guard = (event) => {
    const origin = safeText(event?.origin)
    if (!origin) return { ok: false, reason: 'origin_missing' }
    if (origin === 'null') {
      // opaque origin：仅显式 opt-in（Tauri/file:// 宿主）才接受
      return allowOpaque || allowList.includes('null')
        ? { ok: true, reason: 'opaque_allowed' }
        : { ok: false, reason: 'origin_opaque_rejected' }
    }
    if (!allowList.length) return { ok: false, reason: 'origin_unverifiable' }
    return allowList.includes(origin) ? { ok: true, reason: '' } : { ok: false, reason: 'origin_rejected' }
  }
  guard.allowList = allowList
  return guard
}

/**
 * 创建 Host 桥。
 * @param {object} [options]
 * @param {object} [options.windowRef] 注入 window（默认惰性取全局）
 * @param {string[]} [options.hostOrigins] 显式允许的宿主 origin（优先级最高）
 * @param {URLSearchParams} [options.params] 引擎注入的 URL query（缺省取当前页面 URL）
 * @param {boolean} [options.allowOpaqueOrigin] 是否接受 'null' origin（默认 false）
 * @param {number} [options.welcomeTimeoutMs] 握手超时（默认 1200ms，超时即降级，不阻塞游戏）
 * @param {number} [options.ticketTimeoutMs] 申请新 ticket 超时（默认 3000ms）
 * @param {object} [options.telemetry]
 */
export const createHostBridge = (options = {}) => {
  const windowRef = options.windowRef || getWindow()
  const hostWindow = options.hostWindow || getHostWindow()
  const telemetry = options.telemetry
  const welcomeTimeoutMs = Number(options.welcomeTimeoutMs || 1200)
  const ticketTimeoutMs = Number(options.ticketTimeoutMs || 3000)
  const embedded = !!hostWindow
  const guard = createHostOriginGuard({
    hostOrigins: options.hostOrigins,
    params: options.params,
    allowOpaqueOrigin: options.allowOpaqueOrigin
  })
  /**
   * P1-B fail closed：没有任何显式宿主来源 → 不承认任何「可信宿主」：
   * 不发握手（hello / request-ticket）、不广播 mode；上位判定因此走
   * compatibility / standalone，且**零 V2 请求**（无 welcome 即不兑换 ticket）。
   */
  const trustedHost = guard.allowList.length > 0
  /** 握手/取票的目标 origin：显式来源的第一个（无显式来源时不会被使用） */
  const targetOrigin = guard.allowList[0] || '*'

  /** 单条待响应请求（按类型区分，避免 welcome 与 ticket 串台） */
  const pending = new Map()
  let disposed = false
  let listenerInstalled = false

  const rejections = []

  const noteRejection = (reason, detail = {}) => {
    rejections.push({ reason, ...detail })
    if (telemetry) telemetry.event('host.handshake.rejected', { reason, ...detail })
  }

  const resolvePending = (kind, value) => {
    const entry = pending.get(kind)
    if (!entry) return false
    pending.delete(kind)
    entry.finish(value)
    return true
  }

  const handleMessage = (event) => {
    if (disposed) return
    if (!hostWindow || event?.source !== hostWindow) {
      noteRejection('source_rejected')
      return
    }
    const verdict = guard(event)
    if (!verdict.ok) {
      // 任务硬要求：wrong origin 必须被拒绝（不读其内容、不影响任何状态）
      noteRejection(verdict.reason)
      return
    }
    const payload = event?.data
    if (!payload || typeof payload !== 'object') return
    const type = safeText(payload.type)
    if (type === HOST_MESSAGE_TYPES.welcome) {
      const entry = pending.get('welcome')
      if (!entry) return
      if (safeText(payload.request_id) !== entry.requestId) {
        noteRejection('request_id_mismatch')
        return
      }
      if (entry.gameId && safeText(payload.game_id) && safeText(payload.game_id) !== entry.gameId) {
        noteRejection('game_id_mismatch', { expected: entry.gameId, actual: safeText(payload.game_id) })
        resolvePending('welcome', { welcome: null, error: 'game_id_mismatch' })
        return
      }
      const protocolVersion = Number(payload.protocol_version)
      if (Number.isInteger(protocolVersion) && (protocolVersion < SUPPORTED_PROTOCOL_VERSIONS.min || protocolVersion > SUPPORTED_PROTOCOL_VERSIONS.max)) {
        noteRejection('protocol_version_unsupported', { protocol_version: protocolVersion })
        resolvePending('welcome', { welcome: null, error: 'protocol_version_unsupported' })
        return
      }
      resolvePending('welcome', { welcome: payload, error: '' })
      return
    }
    if (type === HOST_MESSAGE_TYPES.ticketResponse) {
      const entry = pending.get('ticket')
      if (!entry) return
      if (safeText(payload.request_id) !== entry.requestId) {
        noteRejection('request_id_mismatch')
        return
      }
      if (entry.gameId && safeText(payload.game_id) && safeText(payload.game_id) !== entry.gameId) {
        noteRejection('game_id_mismatch', { expected: entry.gameId, actual: safeText(payload.game_id) })
        resolvePending('ticket', { ticket: '', error: 'game_id_mismatch' })
        return
      }
      const ticket = safeText(payload.ticket || payload.gpt)
      resolvePending('ticket', { ticket: MODERN_TICKET_RE.test(ticket) || GENERIC_TICKET_RE.test(ticket) ? ticket : '', error: '' })
      return
    }
    // 其他类型（宿主广播）不参与握手
  }

  const install = () => {
    if (listenerInstalled || disposed || !embedded) return
    if (!windowRef || typeof windowRef.addEventListener !== 'function') return
    windowRef.addEventListener('message', handleMessage)
    listenerInstalled = true
  }

  /** 发送消息（目标 origin 已做收敛；消息体永不包含任何凭据明细之外的秘密） */
  const post = (payload) => {
    if (!trustedHost || !embedded || !hostWindow || typeof hostWindow.postMessage !== 'function') return false
    try {
      hostWindow.postMessage(payload, targetOrigin)
      return true
    } catch {
      return false
    }
  }

  const request = (kind, payload, timeoutMs) =>
    new Promise((resolve) => {
      if (!trustedHost || !embedded) {
        resolve({ welcome: null, ticket: '', error: !embedded ? 'not_embedded' : 'host_origin_untrusted' })
        return
      }
      install()
      const entry = {
        requestId: payload.request_id,
        gameId: payload.game_id,
        timer: null,
        finish: (value) => {
          if (entry.timer && typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(entry.timer)
          resolve(value)
        }
      }
      pending.set(kind, entry)
      const sent = post(payload)
      if (!sent) {
        pending.delete(kind)
        resolve({ welcome: null, ticket: '', error: 'post_message_unavailable' })
        return
      }
      entry.timer = globalThis.setTimeout(() => {
        pending.delete(kind)
        resolve({ welcome: null, ticket: '', error: 'timeout' })
      }, Math.max(1, timeoutMs))
    })

  const bridge = {
    embedded,
    /** 允许的宿主 origin 列表（诊断用） */
    allowedOrigins: guard.allowList.slice(),
    targetOrigin,
    rejections: () => rejections.slice(),
    /** 握手：请求宿主能力/feature flags/可选 ticket；超时或拒绝一律返回 null */
    async requestWelcome({ gameId }) {
      if (!embedded) return null
      const requestId = createPrefixedId('hs', Date.now(), '')
      const result = await request(
        'welcome',
        {
          type: HOST_MESSAGE_TYPES.hello,
          protocol_version: SUPPORTED_PROTOCOL_VERSIONS.min,
          game_id: safeText(gameId),
          request_id: requestId
        },
        welcomeTimeoutMs
      )
      return result.welcome || null
    },
    /** 会话过期/ticket 兑换失败后向宿主申请新 ticket（§6.2.3 恢复策略 A） */
    async requestTicket({ gameId, reason }) {
      if (!embedded) return ''
      const requestId = createPrefixedId('hs', Date.now(), '')
      const result = await request(
        'ticket',
        {
          type: HOST_MESSAGE_TYPES.ticketRequest,
          protocol_version: SUPPORTED_PROTOCOL_VERSIONS.min,
          game_id: safeText(gameId),
          request_id: requestId,
          reason: safeText(reason)
        },
        ticketTimeoutMs
      )
      return result.ticket || ''
    },
    /** 通知宿主当前模式（宿主可据此展示角标；无响应等待） */
    notifyMode({ gameId, mode, trustLevel }) {
      return post({
        type: HOST_MESSAGE_TYPES.mode,
        protocol_version: SUPPORTED_PROTOCOL_VERSIONS.min,
        game_id: safeText(gameId),
        mode: safeText(mode),
        trust_level: safeText(trustLevel)
      })
    },
    dispose() {
      disposed = true
      if (listenerInstalled && windowRef && typeof windowRef.removeEventListener === 'function') {
        windowRef.removeEventListener('message', handleMessage)
      }
      listenerInstalled = false
      for (const [kind, entry] of pending) {
        pending.delete(kind)
        if (entry.timer && typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(entry.timer)
        entry.finish({ welcome: null, ticket: '', error: 'disposed' })
      }
    }
  }
  install()
  return bridge
}

export { isEmbedded }
