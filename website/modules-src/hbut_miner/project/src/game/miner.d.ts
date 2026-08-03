// 测试 fixture：hbut_miner 游戏模块类型声明（与 miner.js 导出对齐）
export interface MinerItem {
  id: string
  name: string
  type: 'bonus' | 'heavy' | string
  x?: number
  y?: number
  radius?: number
  value?: number
  drag?: number
}

export interface MinerHookState {
  angle: number
  mode: string
  carrying?: MinerItem | null
}

export interface MinerLevel {
  name: string
  targetScore: number
  timeLeftMs: number
}

export interface MinerGameState {
  score: number
  targetScore: number
  timeLeftMs: number
  levelIndex: number
  levelNumber: number
  items: MinerItem[]
  hook: MinerHookState
  status: 'aiming' | 'playing' | 'won' | 'lost'
  log: string[]
}

export type MinerGameOptions = Partial<{
  items: MinerItem[]
  targetScore: number
  timeLeftMs: number
  levelIndex: number
  score: number
  log: string[]
}>

export const SWING_LIMIT_DEGREES: number
export const DEFAULT_TARGET_SCORE: number
export const DEFAULT_TIME_LEFT_MS: number
export const CAMPUS_MINER_ITEMS: readonly MinerItem[]
export const LEVELS: readonly MinerLevel[]
export function createInitialMinerState(options?: MinerGameOptions): MinerGameState
export function restartMinerGame(state?: MinerGameState): MinerGameState
export function fireHook(state: MinerGameState): MinerGameState
export function applyMinerItemEffect(state: MinerGameState, item: MinerItem): MinerGameState
export function stepMinerGame(state: MinerGameState, deltaMs: number): MinerGameState
