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
  /** W1：凭证失效（403 RELAY_BINDING_REQUIRED）时回调宿主重绑 */
  onBindingRequired?: () => void
  /** additive match_id 走这里（#908） */
  onEvent?: (event: GomokuRelayEvent) => void
  [key: string]: any
}

export interface GomokuRelayRoom {
  /** 服务端下发的 match_id；未开局或开关关闭时为 ''（#908） */
  getMatchId(): string
  /** W1：热更新 relay 绑定凭证（席位绑定 / 重绑后由宿主回填） */
  setRelayBinding(value: string): void
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
