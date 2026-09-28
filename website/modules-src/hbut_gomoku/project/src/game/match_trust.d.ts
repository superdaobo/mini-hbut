// 测试 fixture：hbut_gomoku match_trust 模块类型声明（与 match_trust.js 导出对齐）
//
// 为什么需要：`apps/client/src/utils/hbut_gomoku_trust_contract.spec.ts` 以相对路径
// import 该 JS 源码，tsconfig 的 `strict: true` 下 import 无声明文件的 JS 会触发 TS7016
// —— 与 hbut_stack 的 `stack.d.ts` 同处理（项目既有惯例）。
//
// 声明按 match_trust.js 的**真实结构**书写（枚举是 Object.freeze 对象、不是字符串数组）；
// 内部状态机不复刻，只保证符号可解析与常见用法类型正确。

export interface MatchView {
  matchId?: string
  status?: string
  result?: string | null
  winner?: string | null
  seats?: Record<string, any>
  /** W1：着法是否可归因于已验证身份（缺字段 = 旧服务端，按已认证兼容处理） */
  authenticated?: boolean
  [key: string]: any
}

export interface AuthoritativeOutcome {
  result?: string | null
  trustLevel?: string | null
  authoritative?: boolean
  [key: string]: any
}

export interface TrustSnapshot {
  matchId?: string
  seat?: string | null
  outcome?: string | null
  claimVerdict?: string | null
  /** W1：relay 绑定凭证（内存态；换场/复位清空） */
  relayBinding?: string
  relayBindingExpiresAt?: number
  /** W1/F1：凭证所属 match_id（只有与当前房间下发的 match_id 一致才允许携带） */
  relayBindingMatchId?: string
  [key: string]: any
}

export interface RelayBinding {
  /** 服务端 HMAC 签名凭证（**不含 PII**） */
  token: string
  /** epoch 秒；0 表示未提供 */
  expiresAt: number
}

export interface MatchTrust {
  rememberMatch(input?: { matchId?: string; roomCode?: string }): string
  claimSeat(input?: { peerId?: string; roomCode?: string; force?: boolean }): Promise<any>
  reportResult(input?: Record<string, any>): Promise<any>
  refreshStats(input?: Record<string, any>): Promise<any>
  /** W1：当前 relay 绑定凭证（无则空串） */
  relayBinding(): string
  /** W1/F1：凭证所属 match_id（空 = 无有效凭证） */
  relayBindingMatchId(): string
  /** W1/F1：只返回属于指定 match_id 的凭证（matchId 未下发时恒为空串） */
  relayBindingForMatch(matchId?: string): string
  /** W1/F1：离开 / 重置房间时作废内存里的 relay 凭证 */
  forgetRelayBinding(): string
  /** 冻结字段：更新己方持有的 peer_secret（空值保留旧值——记录存活期间旧值仍有效） */
  setPeerSecret(value?: string): void
  /** 冻结字段：读取当前持有的 peer_secret（空串 = 未持有） */
  peerSecret(): string
  [key: string]: any
}

export interface MatchTrustOptions {
  transport?: any
  /** 状态变化回调（本模块全旁路、永不 throw） */
  onUpdate?: (snapshot: TrustSnapshot) => void
  [key: string]: any
}

export interface PlatformMatchTransport {
  /** 服务端下发的 match_id；未开局或开关关闭时为 ''（#908） */
  getMatchId(): string
  pollOnce?(): Promise<any>
  close?(): void
  [key: string]: any
}

export interface PlatformMatchTransportOptions {
  sessionToken?: string
  peerId?: string
  baseUrl?: string
  gameId?: string
  transport?: any
  fetchImpl?: (url: string, init?: Record<string, any>) => Promise<any>
  pollIntervalMs?: number
  onEvent?: (event: Record<string, any>) => void
  [key: string]: any
}

export const GOMOKU_GAME_ID: string
/** server_verified_match（trust-model 的第三档） */
export const MATCH_TRUST_LEVEL: string
/** 客户端可上报的"我以为"枚举（**不是赛果**） */
export const CLAIM_OUTCOMES: Readonly<{ win: 'win'; loss: 'loss'; draw: 'draw' }>
/** 服务端比赛结果枚举（MatchRecord.result） */
export const MATCH_RESULTS: Readonly<{
  blackWin: 'black_win'
  whiteWin: 'white_win'
  draw: 'draw'
  abandoned: 'abandoned'
}>
export const CLAIM_RETRY_DELAYS_MS: readonly number[]
/** W1：席位绑定声明头 —— 服务端据此对该席位的 relay 请求强制校验 */
export const RELAY_AUTH_HEADER: string

export function resolveGamePlatformBase(...args: any[]): string
export function matchPaths(...args: any[]): Record<string, string>
export function buildSeatClaimBody(...args: any[]): Record<string, any>
export function buildResultClaimBody(...args: any[]): Record<string, any>
/** W1：从席位绑定响应提取 relay 绑定凭证（只含非 PII 字段） */
export function extractRelayBinding(...args: any[]): RelayBinding
export function outcomeForSeat(...args: any[]): string | null
export function normalizeMatchView(...args: any[]): MatchView
export function resolveAuthoritativeOutcome(...args: any[]): AuthoritativeOutcome
export function describeMatchOutcome(...args: any[]): string
export function isRetryableMatchError(...args: any[]): boolean
export function createPlatformMatchTransport(options?: PlatformMatchTransportOptions): PlatformMatchTransport
export function createGomokuMatchTrust(options?: MatchTrustOptions): MatchTrust
export function bootstrapMatchSession(...args: any[]): any
export function createGomokuMatchTrustFromHost(...args: any[]): MatchTrust
