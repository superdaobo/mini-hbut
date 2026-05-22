import { describe, expect, test } from 'vitest'
import * as miner from './miner.js'

const deepestReach = (items) =>
  Math.max(...items.map((item) => Math.hypot(item.x, item.y) + item.radius))

describe('湖工矿工关卡规则', () => {
  test('提供多关卡配置，并用关卡初始化目标、时间和物品', () => {
    expect(Array.isArray(miner.LEVELS)).toBe(true)
    expect(miner.LEVELS.length).toBeGreaterThanOrEqual(4)

    const state = miner.createInitialMinerState({ levelIndex: 1 })

    expect(state.levelIndex).toBe(1)
    expect(state.levelNumber).toBe(2)
    expect(state.targetScore).toBe(miner.LEVELS[1].targetScore)
    expect(state.timeLeftMs).toBe(miner.LEVELS[1].timeLeftMs)
    expect(state.items.map((item) => item.id)).toEqual(
      miner.LEVELS[1].items.map((item) => item.id)
    )
  })

  test('每个关卡的默认钩长覆盖最深物品，避免底部宝物不可达', () => {
    for (let levelIndex = 0; levelIndex < miner.LEVELS.length; levelIndex += 1) {
      const state = miner.createInitialMinerState({ levelIndex })
      const requiredLength = deepestReach(state.items) + 24

      expect(state.hook.maxLength).toBeGreaterThanOrEqual(requiredLength)
    }
  })

  test('垂直发射时可以命中位于矿区底部中心的物品', () => {
    const bottomItem = {
      id: 'bottom-core',
      name: '矿区底层核心',
      type: 'bonus',
      x: 0,
      y: 520,
      radius: 18,
      value: 120,
      drag: 1
    }
    const state = miner.createInitialMinerState({
      items: [bottomItem],
      hook: {
        angle: 0,
        angleVelocity: 0,
        maxLength: 570,
        extendSpeed: 600
      }
    })

    const fired = miner.fireHook(state)
    const afterExtend = miner.stepMinerGame(fired, 1000)

    expect(afterExtend.hook.mode).toBe('returning')
    expect(afterExtend.hook.carrying?.id).toBe(bottomItem.id)
  })

  test('道具物品在回收后会应用加时、倍率和钩长强化效果', () => {
    const state = miner.createInitialMinerState({
      score: 100,
      timeLeftMs: 20_000,
      hook: {
        maxLength: 420
      },
      items: [
        {
          id: 'time-card',
          name: '社团补给卡',
          type: 'powerup',
          x: 0,
          y: 120,
          radius: 16,
          value: 30,
          drag: 0.8,
          effect: { type: 'time', amountMs: 5000 }
        },
        {
          id: 'multiplier-card',
          name: '竞赛倍率卡',
          type: 'powerup',
          x: 0,
          y: 180,
          radius: 16,
          value: 40,
          drag: 0.8,
          effect: { type: 'scoreMultiplier', multiplier: 2 }
        },
        {
          id: 'long-hook',
          name: '工程楼长钩',
          type: 'powerup',
          x: 0,
          y: 240,
          radius: 16,
          value: 50,
          drag: 0.8,
          effect: { type: 'hookBoost', amount: 80 }
        }
      ]
    })

    const withTime = miner.applyMinerItemEffect(state, state.items[0])
    expect(withTime.timeLeftMs).toBe(25_000)

    const withMultiplier = miner.applyMinerItemEffect(state, state.items[1])
    expect(withMultiplier.score).toBe(180)

    const withLongHook = miner.applyMinerItemEffect(state, state.items[2])
    expect(withLongHook.hook.maxLength).toBe(500)
  })

  test('达到当前关目标后推进到下一关，而不是直接结束整局', () => {
    const state = miner.createInitialMinerState({
      levelIndex: 0,
      score: miner.LEVELS[0].targetScore - 10,
      items: [
        {
          id: 'level-clear-item',
          name: '通关宝物',
          type: 'bonus',
          x: 0,
          y: 90,
          radius: 16,
          value: 20,
          drag: 1
        }
      ],
      hook: {
        angle: 0,
        angleVelocity: 0,
        maxLength: 160,
        extendSpeed: 300,
        returnSpeed: 600
      }
    })

    let next = miner.fireHook(state)
    next = miner.stepMinerGame(next, 400)
    next = miner.stepMinerGame(next, 400)

    expect(next.status).toBe('aiming')
    expect(next.levelIndex).toBe(1)
    expect(next.levelNumber).toBe(2)
    expect(next.score).toBe(0)
    expect(next.targetScore).toBe(miner.LEVELS[1].targetScore)
  })
})
