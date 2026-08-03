// 测试 fixture：hbut_parking 游戏模块类型声明（与 parking.js 导出对齐）
export interface ParkingVehicle {
  id: string
  label: string
  row: number
  col: number
  length: number
  orientation: 'h' | 'v'
  target?: boolean
}

export interface ParkingLevel {
  name: string
  width: number
  height: number
  vehicles: ParkingVehicle[]
  exit: { row: number; col: number }
}

export interface ParkingGameState {
  levelIndex: number
  vehicles: ParkingVehicle[]
  selectedId: string | null
  clearedLevels: number
  totalSteps: number
  status: 'playing' | 'won' | 'lost'
  log: string[]
}

export interface ParkingDirectionResult {
  ok: boolean
  state: ParkingGameState
}

export type ParkingGameOptions = Partial<{
  levelIndex: number
  vehicles: ParkingVehicle[]
  selectedId: string | null
  clearedLevels: number
  totalSteps: number
  status: ParkingGameState['status']
  log: string[]
}>

export const PARKING_LEVELS: readonly ParkingLevel[]
export function computeParkingScore(options?: { clearedLevels?: number; totalSteps?: number; durationMs?: number }): number
export function getLevelDefinition(levelIndex?: number): ParkingLevel
export function vehicleCells(vehicle: ParkingVehicle): Array<{ row: number; col: number }>
export function buildOccupancy(vehicles: ParkingVehicle[], width: number, height: number): boolean[][]
export function canSlideVehicle(state: ParkingGameState, vehicleId: string, delta: number): boolean
export function isLevelCleared(state: ParkingGameState): boolean
export function createInitialParkingState(options?: ParkingGameOptions): ParkingGameState
export function restartParkingGame(options?: ParkingGameOptions): ParkingGameState
export function selectVehicle(state: ParkingGameState, vehicleId: string): ParkingGameState
export function slideVehicle(state: ParkingGameState, vehicleId: string, delta: number): ParkingGameState
export function slideSelected(state: ParkingGameState, delta: number): ParkingGameState
export function deltaFromDirection(dir: string): { dr: number; dc: number }
export function isDirectionAllowedForVehicle(vehicle: Pick<ParkingVehicle, 'orientation'>, dir: string): boolean
export function applyDirectionInput(state: ParkingGameState, dir: string): ParkingDirectionResult
export function directionFromKey(key: string): string | null
