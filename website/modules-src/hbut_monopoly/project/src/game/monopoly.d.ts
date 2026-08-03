// 测试 fixture：hbut_monopoly 游戏模块类型声明（与 monopoly.js 导出对齐）
export interface MonopolyEffects {
  coins?: number
  credits?: number
  influence?: number
  energy?: number
  stress?: number
}

export interface MonopolyActionCard {
  id: string
  name: string
  description: string
  effects?: MonopolyEffects
  activeEffects?: Array<{ type: string; amount?: number; turns?: number; label?: string }>
}

export interface MonopolyChoice {
  id: string
  label: string
  effects?: MonopolyEffects
}

export interface MonopolyEvent {
  id: string
  title: string
  description: string
  choices: MonopolyChoice[]
}

export interface MonopolyTile {
  id: string
  name: string
  type: string
  siteId?: string
  eventId?: string
  cardId?: string
  effects?: MonopolyEffects
  description: string
}

export interface MonopolyStage {
  name: string
  targetCredits: number
  targetInfluence: number
  initialCoins: number
  initialEnergy: number
  initialStress: number
  startingCards: string[]
}

export type MonopolyStatus = 'playing' | 'won' | 'lost'

export interface MonopolyGameState {
  position: number
  coins: number
  credits: number
  influence: number
  energy: number
  stress: number
  stageIndex: number
  stageName: string
  targetCredits: number
  targetInfluence: number
  totalStages: number
  turn: number
  dice: number
  baseDice: number
  status: MonopolyStatus
  phase: string
  passedStart: boolean
  pendingEvent: MonopolyEvent | null
  eventHistory: Array<{ eventId: string; choiceId: string }>
  cards: MonopolyActionCard[]
  activeEffects: MonopolyEffects[]
  investments: Record<string, { id: string; name: string; level: number; totalSpent: number }>
  log: string[]
}

export type MonopolyGameOptions = Partial<{
  stageIndex: number
  credits: number
  influence: number
  coins: number
  energy: number
  stress: number
  position: number
  turn: number
  dice: number
  status: MonopolyStatus
  cards: MonopolyActionCard[]
  investments: Record<string, { id: string; name: string; level: number; totalSpent: number }>
  activeEffects: MonopolyEffects[]
  log: string[]
}>

export const PASS_START_BONUS: number
export const WIN_CREDITS: number
export const INITIAL_COINS: number
export const MONOPOLY_STAGES: readonly MonopolyStage[]
export const ACTION_CARDS: readonly MonopolyActionCard[]
export const CAMPUS_INVESTMENTS: readonly unknown[]
export const CAMPUS_EVENTS: readonly MonopolyEvent[]
export const CAMPUS_BOARD: readonly MonopolyTile[]
export function createInitialState(options?: MonopolyGameOptions): MonopolyGameState
export function resolveStageProgress(currentState: MonopolyGameState): MonopolyGameState
export function applyEventChoice(currentState: MonopolyGameState, choiceId: string): MonopolyGameState
export function applyActionCard(currentState: MonopolyGameState, cardId: string): MonopolyGameState
export function investInCampusSite(currentState: MonopolyGameState, siteId: string): MonopolyGameState
export function playTurn(currentState: MonopolyGameState, diceInput: number | (() => number)): MonopolyGameState
export function restartGame(
  previousState?: MonopolyGameState,
  options?: MonopolyGameOptions
): MonopolyGameState
export function computeRankScore(state?: Partial<MonopolyGameState>): number
export function createDeterministicDice(seed?: number): () => number
