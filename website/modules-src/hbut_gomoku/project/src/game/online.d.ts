// 测试 fixture：hbut_gomoku online 模块类型声明（与 online.js 导出对齐）
//
// 为什么需要：`apps/client/src/utils/hbut_gomoku_trust_contract.spec.ts` 以相对路径
// import 该 JS 源码（把 1199 行的 online.test.js 接进 CI 的同一条通道），而 tsconfig 的
// `strict: true` 下 import 无声明文件的 JS 会触发 TS7016 —— 与 hbut_stack 的
// `stack.d.ts` 同处理（项目既有惯例）。
//
// 类型保持宽松：被测的是运行期行为，声明只需让 typecheck 能解析符号。

export interface GomokuRelayEvent {
  type: string
  [key: string]: any
}

export interface GomokuRelayRoomOptions {
  baseUrl?: string
  roomCode?: string
  peerId?: string
  fetchImpl?: (url: string, init?: Record<string, any>) => Promise<any>
  pollIntervalMs?: number
  /** W1：服务端签发的 relay 绑定凭证（席位绑定下发；无则保持旧请求形状） */
  relayBinding?: string
  /** W1/F2：凭证失效（403 RELAY_BINDING_REQUIRED / SEAT_PEER_OWNERSHIP_REQUIRED）时回调宿主重绑；可返回 Promise（房间会 await 后再重试），也可返回 { ok, code } 供 UI 文案 */
  onBindingRequired?: () => any
  /** 冻结字段：已持有的 peer_secret（join 时会带回；服务端匹配当前值才重签） */
  peerSecret?: string
  /** 冻结字段：join 响应下发的新 peer_secret（只在新值非空时回调；空/缺字段不清空旧值） */
  onPeerSecret?: (secret: string) => void
  /** F3：轮询中断 / 重绑停机的可读文案上报（poll_recovered 表示恢复） */
  onError?: (event: Record<string, any>) => void
  /** additive match_id 走这里（#908） */
  onEvent?: (event: GomokuRelayEvent) => void
  [key: string]: any
}

export interface GomokuRelayRoom {
  /** 服务端下发的 match_id；未开局或开关关闭时为 ''（#908） */
  getMatchId(): string
  /** W1：热更新 relay 绑定凭证（席位绑定 / 重绑后由宿主回填） */
  setRelayBinding(value: string): void
  /** 冻结字段：宿主同步已持有的 peer_secret（空值保留旧值） */
  setPeerSecret?(value: string): void
  /** 冻结字段：当前持有的 peer_secret（空串 = 未持有） */
  getPeerSecret?(): string
  /** F5：宿主主动重新 join（带回当前 peer_secret，刷新服务端重签的值） */
  rejoin?(): Promise<any>
  [key: string]: any
}

export const ONLINE_APP_ID: string
export const MATCHMAKING_ROOM_CODE: string
export const HF_RELAY_STRATEGY: any
export const DEFAULT_HF_RELAY_BASE_URL: string
export const TRYSTERO_NOSTR_URL: string
export const TRYSTERO_TORRENT_URL: string
export const DEFAULT_NOSTR_RELAY_URLS: any
export const DEFAULT_TORRENT_TRACKER_URLS: any
/** W1：relay 拒绝"未携带绑定凭证"的请求时的机器可读错误码 */
export const RELAY_BINDING_REQUIRED_CODE: string
/** W1：席位身份凭证所有权不足（与 RELAY_BINDING_REQUIRED 同类处理） */
export const SEAT_PEER_OWNERSHIP_REQUIRED_CODE: string
/** F5：重绑达到上限停机时的错误码 */
export const RELAY_BINDING_SUSPENDED_CODE: string
/** F5：宿主重绑的有界策略参数 */
export const RELAY_BINDING_MAX_REFRESH_ATTEMPTS: number
export const RELAY_BINDING_REFRESH_BASE_DELAY_MS: number
export const RELAY_BINDING_REFRESH_MAX_DELAY_MS: number
/** F3：poll 连续失败达到该次数后上报"联机中断" */
export const RELAY_POLL_FAILURE_REPORT_THRESHOLD: number
/** F3：relay 失败 → 可展示简体中文 */
export function describeRelayError(error: any): string

export function normalizeRoomCode(value: string | null | undefined): string
export function formatRoomCode(value: string | null | undefined): string
export function createRoomCode(...args: any[]): string
export function createMatchmakingState(...args: any[]): Record<string, any>
export function getMatchmakingOnlineCount(...args: any[]): number
export function getMatchmakingQueueCount(...args: any[]): number
export function resolveMatchPair(...args: any[]): any
export function buildLobbyPresenceMessage(...args: any[]): any
export function buildQueueMessage(...args: any[]): any
export function buildCancelMessage(...args: any[]): any
export function buildMatchStartMessage(...args: any[]): any
export function applyLobbyMessage(...args: any[]): any

/** 建 relay 房间连接（HTTP 轮询；additive match_id 事件见 options.onEvent） */
export function createHfRelayGomokuRoom(options: GomokuRelayRoomOptions): GomokuRelayRoom
