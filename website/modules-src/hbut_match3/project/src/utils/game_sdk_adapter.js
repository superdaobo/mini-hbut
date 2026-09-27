/**
 * 湖工消消乐 —— Game Platform SDK adapter（#907d 迁移）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.10（metric 证据）、§5（ended_reason 映射）。
 * 本文件只声明语义，不含任何玩法数值；玩法与计分仍完全由 `src/game/match3.js` 决定。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const HBUT_MATCH3_ADAPTER = createGameAdapter({
  gameId: 'hbut_match3',
  displayName: '湖工消消乐',
  resultSchemaVersion: 1,
  capabilities: {
    ranked: true,
    multiplayer: false,
    // 参与 XP/湖工币结算（数值规则由 #909 定义，SDK 不参与计算）
    economyEligible: true,
    classicMirror: true,
    seasonEligible: true,
    legacyCompatible: true
  },
  // 无等级语义：metric.value 恒 0，排序只看 score（registry §4.10 / protocol-v1.md U5）
  metric: { name: 'score_only', semantics: 'none', max: 0, label: '无等级' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    // Legacy max_level 历史硬编码 1：入向必须折算为 0（metric.max=0，否则本地即 SCHEMA_INVALID），
    // 出向（dual-write 反算）必须写回 1，保持经典榜历史数值语义不变
    maxLevelRule: 'max_level 恒 1 → metric.value 恒 0；反算恒 1',
    fromLegacyMaxLevel: () => 0,
    toLegacyMaxLevel: () => 1,
    endedReasonMap: { lost: 'lost' }
  },
  result: {
    // extra 键名原样保留 camelCase，与旧 payload 逐字一致（protocol-v1.md §4.1）
    extraKeys: ['movesLeft', 'chainPeak', 'moveLimit']
  }
})

export default HBUT_MATCH3_ADAPTER
