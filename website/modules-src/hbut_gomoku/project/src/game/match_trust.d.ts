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
  [key: string]: any
}

export interface MatchTrust {
  rememberMatch(input?: { matchId?: string; roomCode?: string }): string
  claimSeat(input?: { peerId?: string }): Promise<any>
  reportResult(input?: Record<string, any>): Promise<any>
  refreshStats(input?: Record<string, any>): Promise<any>
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

export function resolveGamePlatformBase(...args: any[]): string
export function matchPaths(...args: any[]): Record<string, string>
export function buildSeatClaimBody(...args: any[]): Record<string, any>
export function buildResultClaimBody(...args: any[]): Record<string, any>
export function outcomeForSeat(...args: any[]): string | null
export function normalizeMatchView(...args: any[]): MatchView
export function resolveAuthoritativeOutcome(...args: any[]): AuthoritativeOutcome
export function describeMatchOutcome(...args: any[]): string
export function isRetryableMatchError(...args: any[]): boolean
export function createPlatformMatchTransport(options?: PlatformMatchTransportOptions): PlatformMatchTransport
export function createGomokuMatchTrust(options?: MatchTrustOptions): MatchTrust
export function bootstrapMatchSession(...args: any[]): any
export function createGomokuMatchTrustFromHost(...args: any[]): MatchTrust
