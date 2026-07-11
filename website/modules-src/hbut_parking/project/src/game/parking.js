import levelsData from './levels.json'

const deepClone = (value) => JSON.parse(JSON.stringify(value))
export const PARKING_LEVELS = Object.freeze(levelsData.map((level) => Object.freeze(deepClone(level))))

/**
 * 累计通关得分：
 * score = cleared_levels * 10000 - total_steps * 10 - floor(total_ms / 1000)
 */
export function computeParkingScore({ clearedLevels = 0, totalSteps = 0, durationMs = 0 } = {}) {
  const levels = Math.max(0, Math.trunc(Number(clearedLevels) || 0))
  const steps = Math.max(0, Math.trunc(Number(totalSteps) || 0))
  const seconds = Math.max(0, Math.floor((Number(durationMs) || 0) / 1000))
  return levels * 10000 - steps * 10 - seconds
}

const cloneVehicle = (vehicle) => ({ ...vehicle })
const cloneLevel = (level) => ({
  ...level,
  exit: { ...level.exit },
  vehicles: level.vehicles.map(cloneVehicle)
})

export function getLevelDefinition(levelIndex = 0) {
  const index = Math.max(0, Math.min(PARKING_LEVELS.length - 1, Math.trunc(levelIndex)))
  return cloneLevel(PARKING_LEVELS[index])
}

export function vehicleCells(vehicle) {
  const cells = []
  for (let i = 0; i < vehicle.length; i += 1) {
    if (vehicle.orientation === 'h') {
      cells.push({ row: vehicle.row, col: vehicle.col + i })
    } else {
      cells.push({ row: vehicle.row + i, col: vehicle.col })
    }
  }
  return cells
}

export function buildOccupancy(vehicles, width, height) {
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => null))
  for (const vehicle of vehicles) {
    for (const cell of vehicleCells(vehicle)) {
      if (cell.row < 0 || cell.col < 0 || cell.row >= height || cell.col >= width) continue
      grid[cell.row][cell.col] = vehicle.id
    }
  }
  return grid
}

/**
 * 合法性：仅沿长边滑动 delta 步（delta 可正负），不越界、不撞车。
 */
export function canSlideVehicle(state, vehicleId, delta) {
  const step = Math.trunc(Number(delta) || 0)
  if (!step || !state || state.status !== 'playing') return false
  const vehicle = state.vehicles.find((item) => item.id === vehicleId)
  if (!vehicle) return false

  const occupancy = buildOccupancy(
    state.vehicles.filter((item) => item.id !== vehicleId),
    state.width,
    state.height
  )

  for (let s = 1; s <= Math.abs(step); s += 1) {
    const signed = step > 0 ? s : -s
    const probe =
      vehicle.orientation === 'h'
        ? {
            row: vehicle.row,
            col: step > 0 ? vehicle.col + vehicle.length - 1 + signed : vehicle.col + signed
          }
        : {
            row: step > 0 ? vehicle.row + vehicle.length - 1 + signed : vehicle.row + signed,
            col: vehicle.col
          }
    if (probe.row < 0 || probe.col < 0 || probe.row >= state.height || probe.col >= state.width) {
      return false
    }
    if (occupancy[probe.row][probe.col]) return false
  }
  return true
}

export function isLevelCleared(state) {
  const target = state.vehicles.find((item) => item.target)
  if (!target || !state.exit) return false
  if (target.orientation !== 'h') return false
  if (target.row !== state.exit.row) return false
  const frontCol = target.col + target.length - 1
  return frontCol >= state.exit.col
}

export function createInitialParkingState(options = {}) {
  const levelIndex = Math.max(0, Math.min(PARKING_LEVELS.length - 1, Math.trunc(options.levelIndex || 0)))
  const level = getLevelDefinition(levelIndex)
  return {
    status: 'playing',
    levelIndex,
    levelNumber: levelIndex + 1,
    totalLevels: PARKING_LEVELS.length,
    levelName: level.name,
    width: level.width,
    height: level.height,
    exit: { ...level.exit },
    vehicles: level.vehicles.map(cloneVehicle),
    selectedId: null,
    steps: 0,
    totalSteps: Math.max(0, Math.trunc(options.totalSteps || 0)),
    clearedLevels: Math.max(0, Math.trunc(options.clearedLevels || 0)),
    startedAt: Number.isFinite(options.startedAt) ? options.startedAt : Date.now(),
    log: [`第 ${levelIndex + 1} 关：${level.name}，把校车移到出口。`]
  }
}

export function restartParkingGame(options = {}) {
  return createInitialParkingState({
    levelIndex: 0,
    totalSteps: 0,
    clearedLevels: 0,
    startedAt: Date.now(),
    ...options
  })
}

function addLog(state, message) {
  return { ...state, log: [message, ...(state.log || [])].slice(0, 6) }
}

export function selectVehicle(state, vehicleId) {
  if (!state || state.status !== 'playing') return state
  if (!state.vehicles.some((item) => item.id === vehicleId)) return state
  return { ...state, selectedId: vehicleId }
}

export function slideVehicle(state, vehicleId, delta) {
  if (!canSlideVehicle(state, vehicleId, delta)) {
    return addLog(state, '无法这样挪动。')
  }
  const step = Math.trunc(Number(delta))
  const vehicles = state.vehicles.map((vehicle) => {
    if (vehicle.id !== vehicleId) return vehicle
    if (vehicle.orientation === 'h') {
      return { ...vehicle, col: vehicle.col + step }
    }
    return { ...vehicle, row: vehicle.row + step }
  })
  let next = {
    ...state,
    vehicles,
    selectedId: vehicleId,
    steps: state.steps + Math.abs(step),
    totalSteps: state.totalSteps + Math.abs(step)
  }
  next = addLog(next, `挪动 ${vehicleId} ${step > 0 ? '+' : ''}${step}`)

  if (isLevelCleared(next)) {
    const clearedLevels = state.clearedLevels + 1
    if (state.levelIndex >= PARKING_LEVELS.length - 1) {
      return addLog(
        {
          ...next,
          status: 'won',
          clearedLevels,
          selectedId: null
        },
        '全部关卡通关！'
      )
    }
    const advanced = createInitialParkingState({
      levelIndex: state.levelIndex + 1,
      totalSteps: next.totalSteps,
      clearedLevels,
      startedAt: state.startedAt
    })
    return addLog(advanced, `第 ${state.levelNumber} 关完成，进入下一关。`)
  }
  return next
}

export function slideSelected(state, delta) {
  if (!state?.selectedId) return addLog(state, '请先点选一辆车。')
  return slideVehicle(state, state.selectedId, delta)
}
