/**
 * #1169 T13：11 个游戏的清单与入口必须被「冻结」。
 *
 * 模块运行时改造（T04–T08）不能顺手改掉游戏集合 —— 少一个/多一个都是产品回归。
 * 这条测试只校验「集合与入口不变」，不校验游戏内部行为（那需要真机）。
 */
import { describe, expect, it } from 'vitest'
import { GAME_CENTER_GAME_IDS } from './game_center/launch'

/** T08 基线：11 个第一方游戏（顺序也是 UI 顺序，改动需显式更新本断言）。 */
const EXPECTED_GAMES = [
  'hecheng_hugongda',
  'jump_out_hbut',
  'hbut_2048',
  'clumsy_bird_hbut',
  'hbut_monopoly',
  'hbut_miner',
  'hbut_memory_match',
  'hbut_gomoku',
  'hbut_stack',
  'hbut_parking',
  'hbut_match3'
]

describe('#1169 T13 游戏集合冻结', () => {
  it('游戏 id 集合与顺序不变（11 个）', () => {
    expect([...GAME_CENTER_GAME_IDS]).toEqual(EXPECTED_GAMES)
    expect(EXPECTED_GAMES).toHaveLength(11)
  })

  it('每个游戏 id 都是稳定的 slug 形式（可用于 CDN 路径）', () => {
    for (const id of GAME_CENTER_GAME_IDS) {
      expect(id).toMatch(/^[a-z][a-z0-9_]{2,40}$/)
    }
  })
})
