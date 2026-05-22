import { describe, expect, test } from 'vitest'
import * as monopoly from './monopoly.js'

const fixedDice = () => 3

describe('湖工大富翁进阶规则契约', () => {
  test('提供阶段配置，并用阶段初始化资源、压力、精力和目标', () => {
    expect(Array.isArray(monopoly.MONOPOLY_STAGES)).toBe(true)
    expect(monopoly.MONOPOLY_STAGES.length).toBeGreaterThanOrEqual(3)

    const stageIndex = 1
    const stage = monopoly.MONOPOLY_STAGES[stageIndex]
    const state = monopoly.createInitialState({ stageIndex, seed: 7 })

    expect(state.stageIndex).toBe(stageIndex)
    expect(state.stageName).toBe(stage.name)
    expect(state.targetCredits).toBe(stage.targetCredits)
    expect(state.targetInfluence).toBe(stage.targetInfluence)
    expect(state.energy).toBe(stage.initialEnergy)
    expect(state.stress).toBe(stage.initialStress)
    expect(state.status).toBe('playing')
    expect(state.phase).toBe('roll')
  })

  test('骰子回合会消耗精力、增加压力，并把资源限制在合法范围', () => {
    const state = monopoly.createInitialState({
      coins: 20,
      credits: 0,
      energy: 6,
      stress: 94,
      stageIndex: 0,
      seed: 3
    })

    const next = monopoly.playTurn(state, fixedDice())

    expect(typeof next.energy).toBe('number')
    expect(typeof next.stress).toBe('number')
    expect(next.energy).toBeGreaterThanOrEqual(0)
    expect(next.energy).toBeLessThanOrEqual(100)
    expect(next.stress).toBeGreaterThanOrEqual(0)
    expect(next.stress).toBeLessThanOrEqual(100)
    expect(next.energy).toBeLessThan(state.energy)
    expect(next.stress).toBeGreaterThan(state.stress)
    expect(next.phase).toMatch(/event|choice|roll/)
  })

  test('事件选择会产生不同收益，并记录已选择事件', () => {
    expect(typeof monopoly.applyEventChoice).toBe('function')

    const state = monopoly.createInitialState({
      coins: 180,
      credits: 2,
      energy: 72,
      stress: 28,
      stageIndex: 0,
      pendingEvent: {
        id: 'lab-roadshow',
        title: '实验室路演',
        choices: [
          { id: 'sponsor', label: '拉赞助', effects: { coins: 90, stress: 12, influence: 2 } },
          { id: 'polish', label: '打磨项目', effects: { coins: -30, credits: 2, energy: -10 } }
        ]
      }
    })

    const next = monopoly.applyEventChoice(state, 'polish')

    expect(next.pendingEvent).toBeNull()
    expect(next.coins).toBe(150)
    expect(next.credits).toBe(4)
    expect(next.energy).toBe(62)
    expect(next.influence).toBe(0)
    expect(next.eventHistory.at(-1)).toMatchObject({ eventId: 'lab-roadshow', choiceId: 'polish' })
  })

  test('卡牌效果可以跨回合改变资源和下一次掷骰结果', () => {
    expect(typeof monopoly.applyActionCard).toBe('function')

    const state = monopoly.createInitialState({
      coins: 100,
      credits: 1,
      energy: 48,
      stress: 40,
      cards: [{ id: 'library-pass', name: '图书馆通宵卡' }]
    })

    const next = monopoly.applyActionCard(state, 'library-pass')

    expect(next.cards).toHaveLength(0)
    expect(next.credits).toBeGreaterThan(state.credits)
    expect(next.energy).toBeLessThan(state.energy)
    expect(next.activeEffects.some((effect) => effect.type === 'diceBoost')).toBe(true)
  })

  test('达成阶段目标进入下一阶段，压力或资金越界会失败', () => {
    expect(typeof monopoly.resolveStageProgress).toBe('function')

    const passed = monopoly.resolveStageProgress({
      ...monopoly.createInitialState({ stageIndex: 0 }),
      credits: 8,
      influence: 4,
      coins: 260,
      energy: 50,
      stress: 35
    })

    expect(passed.stageIndex).toBe(1)
    expect(passed.phase).toBe('roll')
    expect(passed.status).toBe('playing')
    expect(passed.log[0]).toContain('进入第 2 阶段')

    const failed = monopoly.resolveStageProgress({
      ...monopoly.createInitialState({ stageIndex: 1 }),
      coins: -1,
      energy: 0,
      stress: 100
    })

    expect(failed.status).toBe('lost')
    expect(failed.log[0]).toMatch(/资金|压力|精力/)
  })
})
