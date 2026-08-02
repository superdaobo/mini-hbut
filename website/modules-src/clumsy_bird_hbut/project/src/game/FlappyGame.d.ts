// 测试 fixture：clumsy_bird_hbut FlappyGame 模块类型声明（与 FlappyGame.js 导出对齐）
export interface FlappyCanvasLayout {
  logicalWidth: number
  logicalHeight: number
  cssWidth: number
  cssHeight: number
  pixelWidth: number
  pixelHeight: number
  renderScale: number
}

export interface FlappyGameplayLimits {
  gapInitial: number
  gapMin: number
  speedInitial: number
  speedMax: number
  spawnInitialMs: number
  spawnMinMs: number
  maxScore?: number
}

export interface FlappyPipe {
  x: number
  topHeight: number
  bottomY: number
  passed: boolean
  width: number
}

export const STATE: Record<string, string>
export const LOGICAL_WIDTH: number
export const LOGICAL_HEIGHT: number
export const GAMEPLAY_LIMITS: FlappyGameplayLimits
export function getPipeGap(score: number): number
export function getPipeSpeed(score: number): number
export function getPipeSpawnInterval(score: number): number
export function calculateFlappyCanvasLayout(options: {
  containerWidth: number
  containerHeight: number
  devicePixelRatio: number
}): FlappyCanvasLayout

export default class FlappyGame {
  constructor(canvas: HTMLCanvasElement)
  renderScale: number
  score: number
  bestScore: number
  state: string
  birdY: number
  birdVelocity: number
  pipes: FlappyPipe[]
  pipeTimerMs: number
  onScoreChange: ((score: number) => void) | null
  onGameOver: ((data: unknown) => void) | null
  onStateChange: ((state: string) => void) | null
  start(): void
  reset(): void
  update(timestamp?: number): void
  render(): void
  _render(): void
  _handleTap(): void
  _gameOver(): void
  getState(): string
  getScore(): number
}
