/**
 * 宿主侧 Game SDK 握手桥（#905）。
 *
 * 与 `website/modules-src/_sdk/src/host-bridge.js`（SDK 侧，唯一约定来源）成对实现：
 * - 消息类型字符串必须与 `_sdk/src/version.js` 的 `HOST_MESSAGE_TYPES` 逐字一致
 *   （由 `game_center_host_bridge_contract.spec.ts` 直接读取 SDK 源码断言，防止漂移）；
 * - 关联校验：回复必须携带与请求相同的 `request_id`，`game_id` 不匹配一律拒绝；
 * - 协议版本：只接受 `[1,1]`，超区间不回复（fail closed，与 SDK 的降级语义一致）。
 *
 * 安全模型（关键决策，协议 §6 与 issue #905 硬要求）：
 * 1. 结构校验：`event.source` 必须是本 iframe 的 contentWindow；
 * 2. **来源校验：`event.origin` 必须落在白名单内**（白名单由实际 iframe URL 推导，
 *    绝不含 `*`；空白名单一律拒绝）；
 * 3. 回复目标 origin 使用 `event.origin` 精确值（**禁止 `'*'`**）；
 * 4. ticket 只回复给通过来源校验的 iframe；单飞 + 冷却 + 次数上限，防止被套取或形成取票循环；
 * 5. 本文件不做任何 console 输出，`rejections()` 只保留拒绝原因（不含 payload）。
 */

/** 协议版本区间（protocol-v1.md §1.3） */
export const HOST_PROTOCOL_VERSION = 1

/**
 * 宿主握手消息类型（与 SDK `version.js` 的 HOST_MESSAGE_TYPES 逐字一致；
 * 契约测试会读取 SDK 源码比对，改这里必须同步改 SDK）。
 */
export const HOST_MESSAGE_TYPES = Object.freeze({
  hello: 'mini-hbut:game-sdk:hello',
  welcome: 'mini-hbut:game-sdk:welcome',
  ticketRequest: 'mini-hbut:game-sdk:request-ticket',
  ticketResponse: 'mini-hbut:game-sdk:ticket',
  mode: 'mini-hbut:game-sdk:mode'
})

/** 取票冷却与次数上限（协议 §6.2.4：/tickets 玩家维度 10 次/分钟；这里更保守） */
export const TICKET_REQUEST_COOLDOWN_MS = 3000
export const TICKET_REQUEST_MAX_PER_SESSION = 3

export interface HostBridgeFeatures {
  game_center_enabled: boolean
  game_verified_session_enabled: boolean
  game_economy_enabled: boolean
  drift_bottle_enabled: boolean
}

export interface HostTicketGrant {
  ticket: string
  expiresAt?: string
}

export interface ModuleHostBridgeOptions {
  /** 当前 iframe 承载的 module id */
  moduleId: string
  /** 目标 iframe 的 contentWindow（未就绪时传 null，届时一律拒绝） */
  frameWindow: Window | null
  /** 允许的 iframe origin 白名单（由 launch.ts 推导；空数组 = 一律拒绝） */
  allowedOrigins: string[]
  /** 宿主能力开关（下发到 welcome.features，供游戏侧隐藏未完成能力） */
  features?: Partial<HostBridgeFeatures>
  /** 取票回调（由组件接线到 fetchGameLaunchTicket + 合规夹紧）；失败返回空 ticket */
  requestTicket?: (input: { reason: string; requestId: string }) => Promise<HostTicketGrant | null>
  /** 游戏上报当前运行模式（verified/compatibility/standalone） */
  onMode?: (mode: string, trustLevel: string) => void
  /** 注入时钟（测试用） */
  now?: () => number
}

export interface HostBridgeRejection {
  reason: string
  at: number
}

export interface ModuleHostBridge {
  handleMessage(event: MessageEvent): void
  /** 当前 whether 桥处于可用状态（有 iframe + 非空白名单） */
  isActive(): boolean
  rejections(): HostBridgeRejection[]
  lastMode(): { mode: string; trustLevel: string } | null
  dispose(): void
}

const safeText = (value: unknown): string => String(value ?? '').trim()

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * 创建宿主桥。
 * 注意：本函数不做任何 DOM 监听注册，由调用方把 `handleMessage` 挂到 window 上，
 * 便于在 window 重建 / iframe remount 时整体替换（避免监听泄漏）。
 */
export const createModuleHostBridge = (options: ModuleHostBridgeOptions): ModuleHostBridge => {
  const moduleId = safeText(options.moduleId)
  const allowedOrigins = (Array.isArray(options.allowedOrigins) ? options.allowedOrigins : [])
    .map((item) => safeText(item))
    .filter((item) => item && item !== '*')
  const now = options.now || (() => Date.now())
  const features: HostBridgeFeatures = {
    game_center_enabled: false,
    game_verified_session_enabled: false,
    game_economy_enabled: false,
    drift_bottle_enabled: false,
    ...(options.features || {})
  }

  const rejections: HostBridgeRejection[] = []
  let disposed = false
  let ticketGranted = 0
  let lastTicketAt = 0
  let ticketInFlight: Promise<HostTicketGrant | null> | null = null
  let modeReport: { mode: string; trustLevel: string } | null = null

  const noteRejection = (reason: string): void => {
    rejections.push({ reason, at: now() })
  }

  const reply = (event: MessageEvent, payload: Record<string, unknown>): boolean => {
    const target = event.source as Window | null
    const origin = safeText(event.origin)
    if (!target || typeof (target as Window).postMessage !== 'function') return false
    if (!origin || origin === '*') return false
    try {
      // 关键：目标 origin 使用事件来源的精确 origin，禁止 '*'
      ;(target as Window).postMessage(payload, origin)
      return true
    } catch {
      return false
    }
  }

  const resolveTicket = async (
    reason: string,
    requestId: string
  ): Promise<HostTicketGrant | null> => {
    if (!options.requestTicket) return null
    const stamp = now()
    if (ticketGranted >= TICKET_REQUEST_MAX_PER_SESSION) {
      noteRejection('ticket_quota_exhausted')
      return null
    }
    if (stamp - lastTicketAt < TICKET_REQUEST_COOLDOWN_MS) {
      noteRejection('ticket_cooldown')
      return null
    }
    if (ticketInFlight) return ticketInFlight
    lastTicketAt = stamp
    ticketGranted += 1
    ticketInFlight = options
      .requestTicket({ reason, requestId })
      .then((grant) => (grant && safeText(grant.ticket) ? grant : null))
      .catch(() => null)
      .finally(() => {
        ticketInFlight = null
      })
    return ticketInFlight
  }

  const handleMessage = (event: MessageEvent): void => {
    if (disposed) return
    const frameWindow = options.frameWindow
    if (!frameWindow || event.source !== frameWindow) {
      // 非本 iframe 的消息一律忽略（不记录，避免噪声）
      return
    }
    const origin = safeText(event.origin)
    if (!allowedOrigins.length) {
      noteRejection('origin_allowlist_empty')
      return
    }
    if (!origin || origin === '*' || !allowedOrigins.includes(origin)) {
      noteRejection('origin_rejected')
      return
    }
    const payload = event.data
    if (!isPlainObject(payload)) return
    const type = safeText(payload.type)
    if (!type) return

    const requestId = safeText(payload.request_id)
    const payloadGameId = safeText(payload.game_id)

    if (type === HOST_MESSAGE_TYPES.hello) {
      const protocolVersion = Number(payload.protocol_version)
      if (Number.isInteger(protocolVersion) && protocolVersion !== HOST_PROTOCOL_VERSION) {
        noteRejection('protocol_version_unsupported')
        return
      }
      if (payloadGameId && moduleId && payloadGameId !== moduleId) {
        noteRejection('game_id_mismatch')
        return
      }
      reply(event, {
        type: HOST_MESSAGE_TYPES.welcome,
        protocol_version: HOST_PROTOCOL_VERSION,
        game_id: moduleId,
        request_id: requestId,
        features: { ...features },
        // 会话过期时的恢复路径：宿主支持重新签发 ticket（§6.2.3 策略 A）
        capabilities: {
          launch_ticket: features.game_verified_session_enabled && !!options.requestTicket,
          session_recovery: true
        }
      })
      return
    }

    if (type === HOST_MESSAGE_TYPES.ticketRequest) {
      if (!requestId) {
        noteRejection('request_id_missing')
        return
      }
      if (payloadGameId && moduleId && payloadGameId !== moduleId) {
        noteRejection('game_id_mismatch')
        return
      }
      const reason = safeText(payload.reason)
      void resolveTicket(reason, requestId).then((grant) => {
        if (disposed) return
        reply(event, {
          type: HOST_MESSAGE_TYPES.ticketResponse,
          protocol_version: HOST_PROTOCOL_VERSION,
          game_id: moduleId,
          request_id: requestId,
          ticket: safeText(grant?.ticket),
          ...(grant?.expiresAt ? { expires_at: grant.expiresAt } : {})
        })
      })
      return
    }

    if (type === HOST_MESSAGE_TYPES.mode) {
      modeReport = {
        mode: safeText(payload.mode),
        trustLevel: safeText(payload.trust_level)
      }
      options.onMode?.(modeReport.mode, modeReport.trustLevel)
    }
  }

  return {
    handleMessage,
    isActive: () => !disposed && !!options.frameWindow && allowedOrigins.length > 0,
    rejections: () => rejections.slice(),
    lastMode: () => modeReport,
    dispose: () => {
      disposed = true
      rejections.length = 0
      ticketInFlight = null
    }
  }
}
