import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'

/**
 * #904 参考接入守卫：湖工叠塔（hbut_stack）必须真实使用 SDK，且不得改变玩法数值。
 * 与只读契约测试（website_game_modules_contract.spec.ts）互补：
 * 这里只断言「接入形态」与「数值语义」，不改动那条冻结契约。
 */

const repoRoot = resolve(process.cwd(), '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

const MAIN = 'website/modules-src/hbut_stack/project/src/main.js'
const ADAPTER = 'website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'
const LEGACY_RANK = 'website/modules-src/hbut_stack/project/src/utils/game_rank.js'

describe('参考接入：hbut_stack 使用 SDK 提交与查榜', () => {
  it('main.js 通过相对路径 import SDK，并已停止使用旧 game_rank 工具', () => {
    const source = read(MAIN)
    expect(source).toContain("from '../../../_sdk/src/index.js'")
    expect(source).toContain('MiniHBUTGame.create({ gameId: MODULE_ID, adapter: HBUT_STACK_ADAPTER })')
    expect(source).toContain("from './utils/game_sdk_adapter.js'")
    expect(source).not.toMatch(/from '\.\/utils\/game_rank\.js'/)
    expect(source).not.toContain('submitGameRank(')
    expect(source).not.toContain('fetchGameLeaderboard(')
  })

  it('旧 game_rank.js 仍保留（回滚与只读契约测试依赖），未被删除', () => {
    const source = read(LEGACY_RANK)
    expect(source).toContain("const DEFAULT_GAME_ID = 'hbut_stack'")
    expect(source).toContain('export const submitGameRank')
  })

  it('提交数值语义与迁移前一致：score/maxLevel/moveCount/durationMs/endedReason/extra', () => {
    const source = read(MAIN)
    expect(source).toContain('score: state.score')
    expect(source).toContain('maxLevel: state.layers || 0')
    expect(source).toContain('moveCount: state.layers || 0')
    expect(source).toContain('durationMs: Math.max(0, Date.now() - run.startedAt)')
    expect(source).toContain("endedReason")
    expect(source).toContain('perfectCount: state.perfectCount || 0')
    expect(source).toContain('perfectCombo: state.perfectCombo || 0')
  })

  it('重开一局 = 新 run（run_id 由 SDK 生成，不再手写 createRunId）', () => {
    const source = read(MAIN)
    expect(source).toContain('run = sdkGame.startRun({ replaceActive: true })')
    expect(source).not.toContain('createRunId(')
  })

  it('保留宿主高度上报 / 动态视口 / 安全渲染异常文本（冻结契约）', () => {
    const source = read(MAIN)
    expect(source).toContain('mini-hbut:module-size')
    expect(source).toContain('module_id: MODULE_ID')
    expect(source).toContain('--module-vh')
    expect(source).toContain('orientationchange')
    expect(source).toContain("content.innerHTML = '<div class=\"leaderboard-error\"></div>'")
    expect(source).toContain('errorBox.textContent')
  })

  it('adapter 文件与 registry 冻结取值一致，且声明为可回落 Legacy', () => {
    const source = read(ADAPTER)
    expect(source).toContain("gameId: 'hbut_stack'")
    expect(source).toContain("name: 'layers'")
    expect(source).toContain('legacyCompatible: true')
    expect(HBUT_STACK_ADAPTER.capabilities.legacyCompatible).toBe(true)
    expect(HBUT_STACK_ADAPTER.metric.max).toBe(100000)
  })

  it('main.js 不把学号等身份字段写进任何请求体（actor 只来自服务端）', () => {
    const source = read(MAIN)
    // 只允许注释里出现（解释旧上下文），不得作为字段/变量参与提交
    expect(source).not.toMatch(/student_id\s*:|\.student_id|studentId\s*:/)
    expect(source).not.toMatch(/xp_amount|coin_amount|reward_amount/)
  })
})
