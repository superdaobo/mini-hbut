import { describe, expect, test } from 'vitest'
import * as memory from './memory.js'

const TEST_PAIRS = Object.freeze([
  Object.freeze({ id: 'alpha', label: '南湖', hint: '湖畔晚风', category: 'campus' }),
  Object.freeze({ id: 'beta', label: '图书馆', hint: '书香自习', category: 'study' }),
  Object.freeze({ id: 'gamma', label: '实验室', hint: '调试到深夜', category: 'study' }),
  Object.freeze({ id: 'delta', label: '食堂', hint: '热干面补给', category: 'life' }),
  Object.freeze({ id: 'epsilon', label: '运动场', hint: '晨跑打卡', category: 'life' }),
  Object.freeze({ id: 'zeta', label: '工程楼', hint: '齿轮与图纸', category: 'study' }),
  Object.freeze({ id: 'eta', label: '校门', hint: '启程返校', category: 'campus' }),
  Object.freeze({ id: 'theta', label: '社团招新', hint: '摊位与海报', category: 'campus' })
])

const flipPair = (state, pairId) => {
  const [first, second] = state.cards.filter((card) => card.pairId === pairId)
  return memory.flipMemoryCard(memory.flipMemoryCard(state, first.id), second.id)
}

const flipMismatch = (state, firstPairId = 'alpha', secondPairId = 'beta') => {
  const first = state.cards.find((card) => card.pairId === firstPairId)
  const second = state.cards.find((card) => card.pairId === secondPairId)
  return memory.flipMemoryCard(memory.flipMemoryCard(state, first.id), second.id)
}

describe('湖工记忆牌关卡规则', () => {
  test('提供多关卡配置，并用关卡初始化牌数、时间、预览和评分状态', () => {
    expect(Array.isArray(memory.MEMORY_LEVELS)).toBe(true)
    expect(memory.MEMORY_LEVELS.length).toBeGreaterThanOrEqual(4)

    const levelIndex = 2
    const level = memory.MEMORY_LEVELS[levelIndex]
    const state = memory.createInitialMemoryState({
      levelIndex,
      pairs: TEST_PAIRS,
      shuffle: false
    })

    expect(state.levelIndex).toBe(levelIndex)
    expect(state.levelNumber).toBe(levelIndex + 1)
    expect(state.levelName).toBe(level.name)
    expect(state.pairs).toHaveLength(level.pairCount)
    expect(state.cards).toHaveLength(level.pairCount * 2)
    expect(state.timeLeftMs).toBe(level.timeLeftMs)
    expect(state.previewLeftMs).toBe(level.previewMs)
    expect(state.status).toBe('preview')
    expect(state.score).toBe(0)
    expect(state.combo).toBe(0)
    expect(state.mistakes).toBe(0)
  })

  test('预览倒计时结束后会隐藏未匹配卡牌并进入正式游戏', () => {
    const state = memory.createInitialMemoryState({
      pairs: TEST_PAIRS,
      pairCount: 2,
      previewLeftMs: 1000,
      shuffle: false
    })

    expect(state.cards.every((card) => card.revealed)).toBe(true)

    const next = memory.tickMemoryGame(state, 1200)

    expect(next.status).toBe('playing')
    expect(next.previewLeftMs).toBe(0)
    expect(next.cards.every((card) => !card.revealed && !card.matched)).toBe(true)
  })

  test('正式游戏倒计时耗尽会失败并锁定剩余时间', () => {
    const state = memory.createInitialMemoryState({
      pairs: TEST_PAIRS,
      pairCount: 2,
      timeLeftMs: 900,
      previewLeftMs: 0,
      status: 'playing',
      shuffle: false
    })

    const next = memory.tickMemoryGame(state, 1000)

    expect(next.status).toBe('lost')
    expect(next.timeLeftMs).toBe(0)
    expect(next.log[0]).toContain('时间耗尽')
  })

  test('连续配对会提高连击和得分，后一次连击奖励更高', () => {
    let state = memory.createInitialMemoryState({
      pairs: TEST_PAIRS,
      pairCount: 3,
      previewLeftMs: 0,
      status: 'playing',
      shuffle: false
    })

    state = flipPair(state, 'alpha')
    const firstScore = state.score

    expect(state.combo).toBe(1)
    expect(firstScore).toBeGreaterThan(0)

    state = flipPair(state, 'beta')
    const secondDelta = state.score - firstScore

    expect(state.combo).toBe(2)
    expect(secondDelta).toBeGreaterThan(firstScore)
  })

  test('错配会增加错误数、清空连击、扣分并在下一次翻牌前盖回两张牌', () => {
    let state = memory.createInitialMemoryState({
      pairs: TEST_PAIRS,
      pairCount: 3,
      score: 120,
      combo: 2,
      previewLeftMs: 0,
      status: 'playing',
      shuffle: false
    })

    state = flipMismatch(state)

    expect(state.mistakes).toBe(1)
    expect(state.combo).toBe(0)
    expect(state.score).toBeLessThan(120)
    expect(state.pendingMismatch).toHaveLength(2)

    const gamma = state.cards.find((card) => card.pairId === 'gamma')
    state = memory.flipMemoryCard(state, gamma.id)

    const mismatchedCards = state.cards.filter((card) => card.pairId === 'alpha' || card.pairId === 'beta')
    expect(mismatchedCards.every((card) => !card.revealed && !card.matched)).toBe(true)
    expect(state.selectedCardIds).toEqual([gamma.id])
  })
})
