import { describe, expect, it } from 'vitest'
import {
  applyGravity,
  createSeededRandom,
  findMatches,
  resolveBoard,
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
    const board = [
      ['x', 'a', 'a'],
      ['b', 'c', 'd'],
      ['e', 'f', 'g']
    ]
    // swap x with a would need setup: place so swap creates three a's
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
})
