// 测试 fixture：hbut_match3 游戏模块类型声明（与 match3.js 导出对齐）
export interface Match3Cell {
  row: number
  col: number
}

export type Match3Board = Array<Array<string | null>>

export interface Match3Feedback {
  type: string
  reason?: string
}

export interface Match3GameState {
  board: Match3Board
  selected: Match3Cell | null
  movesLeft: number
  score: number
  status: 'playing' | 'won' | 'lost'
  feedback?: Match3Feedback | null
  log: string[]
}

export interface Match3SwapResult {
  ok: boolean
  board: Match3Board
  scoreGained?: number
  chainCount?: number
}

export const TILE_TYPES: readonly string[]
export const BOARD_SIZE: number
export const MOVE_LIMIT: number
export const BASE_MATCH_SCORE: number
export function createSeededRandom(seed?: number): () => number
export function randomTileId(random?: () => number): string
export function createEmptyBoard(size?: number): Match3Board
export function cloneBoard(board: Match3Board): Match3Board
export function findMatches(board: Match3Board): Match3Cell[]
export function clearMatches(board: Match3Board, matches: Match3Cell[]): Match3Board
export function applyGravity(board: Match3Board): Match3Board
export function fillBoard(board: Match3Board, random?: () => number): Match3Board
export function areAdjacent(a: Match3Cell, b: Match3Cell): boolean
export function swapCells(board: Match3Board, a: Match3Cell, b: Match3Cell): Match3Board
export function resolveBoard(board: Match3Board, random?: () => number): { board: Match3Board; scoreGained: number }
export function createStableBoard(size?: number, random?: () => number): Match3Board
export function trySwap(board: Match3Board, a: Match3Cell, b: Match3Cell, random?: () => number): Match3SwapResult
export function createInitialMatch3State(options?: Record<string, unknown>): Match3GameState
export function restartMatch3Game(options?: Record<string, unknown>): Match3GameState
export function selectCell(state: Match3GameState, row: number, col: number): Match3GameState
export function swipeFromCell(state: Match3GameState, row: number, col: number, direction: string): Match3GameState
