import { describe, expect, it } from 'vitest'
import {
  applyGravity,
  createInitialMatch3State,
  createSeededRandom,
  findMatches,
  resolveBoard,
  selectCell,
  swipeFromCell,
  trySwap
} from '../../website/modules-src/hbut_match3/project/src/game/match3.js'

describe('hbut_match3 pure board functions', () => {
  it('finds horizontal and vertical matches of length >= 3', () => {
    const board = [
      ['a', 'a', 'a', 'b'],
      ['c', 'd', 'e', 'b'],
      ['f', 'g', 'h', 'b'],
      ['i', 'j', 'k', 'l']
    ]
    const matches = findMatches(board)
    const keys = new Set(matches.map((m) => `${m.row},${m.col}`))
    expect(keys.has('0,0')).toBe(true)
    expect(keys.has('0,1')).toBe(true)
    expect(keys.has('0,2')).toBe(true)
    expect(keys.has('0,3')).toBe(true)
    expect(keys.has('1,3')).toBe(true)
    expect(keys.has('2,3')).toBe(true)
  })

  it('applies gravity downward', () => {
    const board = [
      ['a', null],
      [null, 'b'],
      ['c', null]
    ]
    const next = applyGravity(board)
    expect(next[2][0]).toBe('c')
    expect(next[1][0]).toBe('a')
    expect(next[2][1]).toBe('b')
    expect(next[0][1]).toBe(null)
  })

  it('rejects non-adjacent or no-match swaps', () => {
    const board = [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i']
    ]
    expect(trySwap(board, { row: 0, col: 0 }, { row: 0, col: 2 }).ok).toBe(false)
    expect(trySwap(board, { row: 0, col: 0 }, { row: 0, col: 1 }).ok).toBe(false)
  })

  it('accepts swap that creates a match and scores with chain multiplier', () => {
    const setup = [
      ['a', 'x', 'a'],
      ['b', 'a', 'c'],
      ['d', 'e', 'f']
    ]
    // swap (0,1)=x with (1,1)=a => top row a a a
    const result = trySwap(setup, { row: 0, col: 1 }, { row: 1, col: 1 }, () => 0)
    expect(result.ok).toBe(true)
    expect(result.scoreGained).toBeGreaterThan(0)
    expect(result.chainCount).toBeGreaterThanOrEqual(1)
  })

  it('resolveBoard clears chains until stable', () => {
    const board = [
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
      ['c', 'd', 'e']
    ]
    const resolved = resolveBoard(board, createSeededRandom(7))
    expect(findMatches(resolved.board).length).toBe(0)
    expect(resolved.scoreGained).toBeGreaterThan(0)
  })

  it('selectCell marks selection and invalid feedback without spending a move', () => {
    let state = createInitialMatch3State({ seed: 1, size: 4, movesLeft: 10 })
    state = {
      ...state,
      board: [
        ['a', 'b', 'c', 'd'],
        ['e', 'f', 'g', 'h'],
        ['i', 'j', 'k', 'l'],
        ['m', 'n', 'o', 'p']
      ]
    }
    state = selectCell(state, 0, 0)
    expect(state.selected).toEqual({ row: 0, col: 0 })
    expect(state.feedback?.type).toBe('select')
    expect(state.movesLeft).toBe(10)

    state = selectCell(state, 0, 2) // not adjacent
    expect(state.feedback?.type).toBe('invalid')
    expect(state.feedback?.reason).toBe('not_adjacent')
    expect(state.movesLeft).toBe(10)
    expect(state.selected).toEqual({ row: 0, col: 2 })
  })

  it('swipeFromCell swaps adjacent tiles that form a match', () => {
    let state = createInitialMatch3State({ seed: 9, size: 3, movesLeft: 5 })
    state = {
      ...state,
      board: [
        ['a', 'x', 'a'],
        ['b', 'a', 'c'],
        ['d', 'e', 'f']
      ],
      selected: null,
      score: 0
    }
    // from (0,1) swipe down toward (1,1) => three a's on top after swap
    const next = swipeFromCell(state, 0, 1, 'down')
    expect(next.movesLeft).toBe(4)
    expect(next.score).toBeGreaterThan(0)
    expect(next.feedback?.type).toBe('matched')
    expect(next.selected).toBeNull()
  })

  it('swipeFromCell reports invalid when no match forms', () => {
    let state = createInitialMatch3State({ seed: 3, size: 3, movesLeft: 8 })
    state = {
      ...state,
      board: [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
        ['g', 'h', 'i']
      ]
    }
    const next = swipeFromCell(state, 0, 0, 'right')
    expect(next.movesLeft).toBe(8)
    expect(next.feedback?.type).toBe('invalid')
    expect(next.feedback?.reason).toBe('no_match')
  })
})
