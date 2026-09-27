/**
 * 湖工挪车 —— Game Platform SDK adapter（#907d 迁移）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.9（metric 证据）、§5（ended_reason 映射）。
 * 本文件只声明语义，不含任何玩法数值；玩法与计分仍完全由 `src/game/parking.js` 决定。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const HBUT_PARKING_ADAPTER = createGameAdapter({
  gameId: 'hbut_parking',
  displayName: '湖工挪车',
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
  // metric 语义：累计通关数（0 基，6 关 levels.json）；1:1 映射 Legacy max_level（§4.9）
  metric: { name: 'cleared_levels', semantics: 'count', max: 6, label: '通关数' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    maxLevelRule: '1:1',
    // 只有通关（won）才提交；V2 枚举要求归一化为 cleared（protocol-v1.md §4.2 语义校验）
    endedReasonMap: { won: 'cleared' }
  },
  result: {
    // extra 键名原样保留 camelCase，与旧 payload 逐字一致（protocol-v1.md §4.1）
    extraKeys: ['clearedLevels', 'totalSteps', 'levelIndex']
  }
})

export default HBUT_PARKING_ADAPTER
