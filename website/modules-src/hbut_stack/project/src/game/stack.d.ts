// 测试 fixture：hbut_stack 游戏模块类型声明（与 stack.js 导出对齐）
export interface StackBlock {
  left: number
  width: number
  height?: number
  direction?: number
  speed?: number
}

export interface StackCutResult {
  moving: StackBlock
  dropped?: StackBlock
  perfect: boolean
  missed: boolean
  overlapLeft: number
  overlapWidth: number
  cut: boolean
}

export interface StackGameState {
  base: StackBlock
  moving: StackBlock
  blocks: StackBlock[]
  layers: number
  layerIndex: number
  score: number
  perfectCombo: number
  status: 'playing' | 'won' | 'lost'
  log: string[]
}

export type StackGameOptions = Partial<{
  base: StackBlock
  moving: StackBlock
  blocks: StackBlock[]
  layers: number
  layerIndex: number
  score: number
  perfectCombo: number
  status: StackGameState['status']
  log: string[]
}>

export const WORLD_WIDTH: number
export const BASE_BLOCK_WIDTH: number
export const BLOCK_HEIGHT: number
export const PERFECT_THRESHOLD: number
export const LAYER_SCORE: number
export const PERFECT_BONUS: number
export const COMBO_PERFECT_BONUS: number
export const MIN_SPEED: number
export const SPEED_STEP: number
export const MAX_SPEED: number
export function cutBlockAgainstBase(
  moving: StackBlock,
  base: StackBlock,
  perfectThreshold?: number
): StackCutResult
export function scoreForSuccessfulDrop(options?: { perfect?: boolean; perfectCombo?: number }): number
export function layerLabel(layerIndex: number): string
export function speedForLayer(layerIndex: number): number
export function computeCameraOffsetY(options?: {
  blockCount?: number
  blockHeightPx?: number
  viewportHeight?: number
  groundY?: number
  focusRatio?: number
}): number
export function createInitialStackState(options?: StackGameOptions): StackGameState
export function restartStackGame(options?: StackGameOptions): StackGameState
export function tickMovingBlock(state: StackGameState, deltaMs: number): StackGameState
export function dropStackBlock(state: StackGameState): StackGameState
