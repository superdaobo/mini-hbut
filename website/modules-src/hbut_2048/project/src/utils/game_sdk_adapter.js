/**
 * 2048 湖工大版 —— Game Platform SDK adapter（#907a 迁移）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.3（metric 证据）、§5（ended_reason 映射）
 * + `docs/game-platform/sdk-migration-guide.md` §5.1。
 * 本文件只声明语义，不含任何玩法数值；玩法与计分仍完全由 `src/game/GameManager.js` 决定。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const HBUT_2048_ADAPTER = createGameAdapter({
  gameId: 'hbut_2048',
  displayName: '2048 湖工大版',
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
  // metric 语义：本局最大方块数值（2^17 = 131072 为理论上限）；1:1 映射 Legacy max_level（§4.3）
  metric: { name: 'max_tile', semantics: 'value', max: 131072, label: '最大方块' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    maxLevelRule: '1:1',
    // 双向换算显式声明（迁移指南 §9.1）：旧榜 max_level 就是本局最大方块
    fromLegacyMaxLevel: (maxLevel) => maxLevel,
    toLegacyMaxLevel: (metricValue) => metricValue,
    // 只有无步可走才提交，reason ∈ {win, game_over}（game-registry.md §5）
    endedReasonMap: { win: 'won', game_over: 'game_over' }
  },
  result: {
    // extra 键名逐字保留（与旧 payload.extra 一致）
    extraKeys: ['maxTile']
  }
})

export default HBUT_2048_ADAPTER
