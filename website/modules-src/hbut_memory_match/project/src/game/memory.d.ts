// 测试 fixture：hbut_memory_match 游戏模块类型声明（与 memory.js 导出对齐）
export interface MemoryPair {
  id: string
  label: string
  hint: string
  category: string
}

export interface MemoryCard {
  id: string
  pairId: string
  label: string
  hint: string
  category: string
  revealed: boolean
  matched: boolean
}

export interface MemoryLevel {
  name: string
  pairCount: number
  timeLeftMs: number
  previewMs: number
  matchScore: number
  comboBonus: number
  mismatchPenalty: number
  hintMode: 'full' | 'category' | 'minimal'
}

export type MemoryGameStatus = 'preview' | 'playing' | 'won' | 'lost'

export interface MemoryGameState {
  status: MemoryGameStatus
  levelIndex: number
  levelNumber: number
  levelName: string
  totalLevels: number
  hintMode: MemoryLevel['hintMode']
  timeLimitMs: number
  timeLeftMs: number
  previewLeftMs: number
  moves: number
  matchedPairs: number
  startedAt: number
  elapsedMs: number
  score: number
  combo: number
  mistakes: number
  pairs: MemoryPair[]
  allPairs: MemoryPair[]
  cards: MemoryCard[]
  selectedCardIds: string[]
  pendingMismatch: string[] | null
  seed: number
  shuffle: boolean
  log: string[]
}

export type MemoryGameOptions = Partial<{
  pairs: MemoryPair[]
  levelIndex: number
  pairCount: number
  timeLeftMs: number
  previewLeftMs: number
  status: MemoryGameStatus
  seed: number
  shuffle: boolean
  moves: number
  startedAt: number
  elapsedMs: number
  score: number
  combo: number
  mistakes: number
  log: string[]
}>

export const CAMPUS_MEMORY_PAIRS: readonly MemoryPair[]
export const MEMORY_LEVELS: readonly MemoryLevel[]
export function createInitialMemoryState(options?: MemoryGameOptions): MemoryGameState
export function flipMemoryCard(state: MemoryGameState, cardId: string): MemoryGameState
export function restartMemoryGame(
  state: MemoryGameState,
  options?: Partial<{ levelIndex: number; seed: number; shuffle: boolean }>
): MemoryGameState
export function tickMemoryGame(state: MemoryGameState, deltaMs: number): MemoryGameState
