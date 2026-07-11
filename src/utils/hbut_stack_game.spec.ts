import { describe, expect, it } from 'vitest'
import {
  cutBlockAgainstBase,
  createInitialStackState,
  dropStackBlock,
  scoreForSuccessfulDrop
} from '../../website/modules-src/hbut_stack/project/src/game/stack.js'

describe('hbut_stack pure cut/score', () => {
  it('cuts overhang and keeps overlap width', () => {
    const result = cutBlockAgainstBase({ left: 10, width: 40 }, { left: 20, width: 40 })
    expect(result.missed).toBe(false)
    expect(result.overlapLeft).toBe(20)
    expect(result.overlapWidth).toBe(30)
    expect(result.cut).toBe(true)
    expect(result.perfect).toBe(false)
  })

  it('marks perfect when nearly aligned', () => {
    const result = cutBlockAgainstBase({ left: 20.5, width: 40 }, { left: 20, width: 40 }, 1.2)
    expect(result.perfect).toBe(true)
    expect(result.missed).toBe(false)
    expect(result.overlapWidth).toBe(40)
  })

  it('marks miss when no overlap', () => {
    const result = cutBlockAgainstBase({ left: 0, width: 10 }, { left: 30, width: 20 })
    expect(result.missed).toBe(true)
    expect(result.overlapWidth).toBe(0)
  })

  it('scores layers with perfect and combo bonus', () => {
    expect(scoreForSuccessfulDrop({ perfect: false })).toBe(100)
    expect(scoreForSuccessfulDrop({ perfect: true, perfectCombo: 1 })).toBe(150)
    expect(scoreForSuccessfulDrop({ perfect: true, perfectCombo: 3 })).toBe(200)
  })

  it('drops increase score/layers and miss ends the run', () => {
    let state = createInitialStackState()
    state = {
      ...state,
      moving: { ...state.moving, left: state.blocks[0].left, width: state.blocks[0].width }
    }
    state = dropStackBlock(state)
    expect(state.layers).toBe(1)
    expect(state.score).toBeGreaterThanOrEqual(100)
    expect(state.status).toBe('playing')

    state = {
      ...state,
      moving: { left: 0, width: 5, direction: 1, speed: 30 }
    }
    // force miss: place moving far right of thin base
    const base = state.blocks[state.blocks.length - 1]
    state = {
      ...state,
      moving: { left: base.left + base.width + 5, width: 10, direction: 1, speed: 30 }
    }
    state = dropStackBlock(state)
    expect(state.status).toBe('lost')
  })
})
