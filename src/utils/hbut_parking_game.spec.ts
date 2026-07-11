import { describe, expect, it } from 'vitest'
import {
  PARKING_LEVELS,
  canSlideVehicle,
  computeParkingScore,
  createInitialParkingState,
  isLevelCleared,
  slideVehicle
} from '../../website/modules-src/hbut_parking/project/src/game/parking.js'

describe('hbut_parking move legality and score', () => {
  it('provides at least 5 levels', () => {
    expect(PARKING_LEVELS.length).toBeGreaterThanOrEqual(5)
  })

  it('score = cleared*10000 - steps*10 - floor(ms/1000)', () => {
    expect(computeParkingScore({ clearedLevels: 2, totalSteps: 15, durationMs: 4500 })).toBe(
      2 * 10000 - 15 * 10 - 4
    )
  })

  it('rejects illegal slides and accepts free path slides', () => {
    const openState = {
      ...createInitialParkingState({ levelIndex: 0 }),
      vehicles: [{ id: 'bus', label: '校车', row: 2, col: 1, length: 2, orientation: 'h', target: true }]
    }
    expect(canSlideVehicle(openState, 'bus', 1)).toBe(true)
    expect(canSlideVehicle(openState, 'bus', -2)).toBe(false) // would leave board

    const collisionState = {
      ...createInitialParkingState({ levelIndex: 0 }),
      vehicles: [
        { id: 'bus', label: '校车', row: 2, col: 1, length: 2, orientation: 'h', target: true },
        { id: 'block', label: 'X', row: 2, col: 3, length: 1, orientation: 'h' }
      ]
    }
    expect(canSlideVehicle(collisionState, 'bus', 1)).toBe(false)
  })

  it('detects exit win when target front reaches exit column', () => {
    const state = createInitialParkingState({ levelIndex: 0 })
    state.vehicles = [{ id: 'bus', label: '校车', row: 2, col: 4, length: 2, orientation: 'h', target: true }]
    expect(isLevelCleared(state)).toBe(true)
  })

  it('sliding target into exit advances or wins', () => {
    let state = createInitialParkingState({ levelIndex: 0 })
    state.vehicles = [{ id: 'bus', label: '校车', row: 2, col: 3, length: 2, orientation: 'h', target: true }]
    state = slideVehicle(state, 'bus', 1)
    expect(state.clearedLevels).toBe(1)
    expect(state.levelIndex === 1 || state.status === 'won').toBe(true)
  })
})
