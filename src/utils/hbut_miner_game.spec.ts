import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CAMPUS_MINER_ITEMS,
  createInitialMinerState,
  fireHook,
  stepMinerGame,
  restartMinerGame
} from '../../website/modules-src/hbut_miner/project/src/game/miner.js'

const moduleRoot = path.join(process.cwd(), 'website', 'modules-src', 'hbut_miner', 'project')

describe('hbut_miner core gameplay', () => {
  it('提供湖工主题抓取物和关卡目标', () => {
    expect(CAMPUS_MINER_ITEMS.length).toBeGreaterThanOrEqual(8)
    expect(CAMPUS_MINER_ITEMS.some((item) => item.name.includes('南湖'))).toBe(true)
    expect(CAMPUS_MINER_ITEMS.some((item) => item.name.includes('图书馆'))).toBe(true)
    expect(CAMPUS_MINER_ITEMS.some((item) => item.type === 'bonus')).toBe(true)
    expect(CAMPUS_MINER_ITEMS.some((item) => item.type === 'heavy')).toBe(true)
  })

  it('空闲时吊钩会在角度边界内摆动', () => {
    const state = createInitialMinerState()
    const next = stepMinerGame(state, 1200)

    expect(next.hook.angle).toBeGreaterThanOrEqual(-58)
    expect(next.hook.angle).toBeLessThanOrEqual(58)
    expect(next.status).toBe('aiming')
  })

  it('发射后命中物品会回收并增加分数', () => {
    const state = createInitialMinerState({
      items: [
        {
          id: 'library-scroll',
          name: '图书馆书卷',
          type: 'bonus',
          x: 0,
          y: 120,
          radius: 18,
          value: 180,
          drag: 1
        }
      ]
    })

    const fired = fireHook({ ...state, hook: { ...state.hook, angle: 0 } })
    const extended = stepMinerGame(fired, 450)
    const collected = stepMinerGame(extended, 1600)

    expect(extended.hook.carrying?.name).toBe('图书馆书卷')
    expect(collected.score).toBe(180)
    expect(collected.items).toHaveLength(0)
    expect(collected.status).toBe('aiming')
    expect(collected.log[0]).toContain('图书馆书卷')
  })

  it('达到目标分数胜利，时间耗尽失败，重开恢复初始状态', () => {
    const almostWon = createInitialMinerState({
      targetScore: 180,
      items: [
        {
          id: 'south-lake-pearl',
          name: '南湖珍珠',
          type: 'bonus',
          x: 0,
          y: 110,
          radius: 18,
          value: 200,
          drag: 1
        }
      ]
    })
    const won = stepMinerGame(
      stepMinerGame(fireHook({ ...almostWon, hook: { ...almostWon.hook, angle: 0 } }), 450),
      1600
    )

    expect(won.status).toBe('won')

    const lost = stepMinerGame(createInitialMinerState({ timeLeftMs: 200 }), 400)
    expect(lost.status).toBe('lost')

    const restarted = restartMinerGame(won)
    expect(restarted.status).toBe('aiming')
    expect(restarted.score).toBe(0)
    expect(restarted.hook.mode).toBe('swinging')
  })

  it('竖屏嵌入页面固定动态视口高度，避免 iframe 内部滚动条挤压宽度', () => {
    const styleSource = fs.readFileSync(path.join(moduleRoot, 'src', 'style.css'), 'utf8')

    expect(styleSource).toMatch(/html,\s*\nbody\s*\{[\s\S]*height:\s*calc\(var\(--module-vh,\s*1vh\)\s*\*\s*100\)/)
    expect(styleSource).toContain('overflow-x: hidden')
    expect(styleSource).toContain('overflow-y: hidden')
    expect(styleSource).toMatch(/#app\s*\{[\s\S]*height:\s*100%;[\s\S]*padding:/)
  })
})
