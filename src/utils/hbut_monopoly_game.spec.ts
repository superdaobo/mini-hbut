import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CAMPUS_BOARD,
  MONOPOLY_STAGES,
  computeRankScore,
  createInitialState,
  playTurn,
  restartGame
} from '../../website/modules-src/hbut_monopoly/project/src/game/monopoly.js'

const moduleRoot = path.join(process.cwd(), 'website', 'modules-src', 'hbut_monopoly', 'project')

describe('hbut_monopoly core gameplay', () => {
  it('提供包含湖工地点和事件类型的闭环棋盘', () => {
    expect(CAMPUS_BOARD.length).toBeGreaterThanOrEqual(12)
    expect(CAMPUS_BOARD[0].name).toContain('校门')
    expect(CAMPUS_BOARD.some((tile) => tile.name.includes('南湖'))).toBe(true)
    expect(CAMPUS_BOARD.some((tile) => tile.name.includes('图书馆'))).toBe(true)
    expect([...new Set(CAMPUS_BOARD.map((tile) => tile.type))]).toEqual(
      expect.arrayContaining(['grant', 'study', 'fee', 'event'])
    )
  })

  it('投骰后沿棋盘移动并结算校园地点事件', () => {
    const state = createInitialState()
    const next = playTurn(state, 2)

    expect(next.position).toBe(2)
    expect(next.turn).toBe(1)
    expect(next.dice).toBe(2)
    expect(next.coins).not.toBe(state.coins)
    expect(next.log[0]).toContain('图书馆')
  })

  it('经过起点获得奖学金，并能在最后阶段目标达成时胜利', () => {
    let state = {
      ...createInitialState({
        stageIndex: MONOPOLY_STAGES.length - 1,
        credits: 16,
        influence: 12
      }),
      position: CAMPUS_BOARD.length - 1
    }

    state = playTurn(state, 2)

    expect(state.position).toBe(1)
    expect(state.coins).toBeGreaterThan(300)
    expect(state.status).toBe('won')
    expect(computeRankScore(state)).toBeGreaterThan(0)
  })

  it('金币耗尽时失败，重开会恢复初始资源', () => {
    const failed = playTurn(
      {
        ...createInitialState(),
        coins: 5,
        position: 2
      },
      2
    )

    expect(failed.status).toBe('lost')

    const restarted = restartGame(failed)
    expect(restarted.status).toBe('playing')
    expect(restarted.position).toBe(0)
    expect(restarted.coins).toBe(320)
    expect(restarted.credits).toBe(0)
    expect(restarted.turn).toBe(0)
  })

  it('竖屏嵌入页面使用动态视口固定高度，避免 iframe 内部滚动条挤压宽度', () => {
    const styleSource = fs.readFileSync(path.join(moduleRoot, 'src', 'style.css'), 'utf8')

    expect(styleSource).toMatch(/html,\s*\nbody\s*\{[\s\S]*height:\s*calc\(var\(--module-vh,\s*1vh\)\s*\*\s*100\)/)
    expect(styleSource).toMatch(/html,\s*\nbody\s*\{[\s\S]*overflow:\s*hidden/)
    expect(styleSource).toMatch(/body\s*\{[\s\S]*padding:\s*0;/)
    expect(styleSource).toMatch(/#app\s*\{[\s\S]*height:\s*100%;[\s\S]*padding:/)
    expect(styleSource).toMatch(/\.app-shell\s*\{[\s\S]*height:\s*100%;/)
  })
})
