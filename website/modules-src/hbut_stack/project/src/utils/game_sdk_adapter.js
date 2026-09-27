/**
 * 湖工叠塔 —— Game Platform SDK adapter（#904 参考接入）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.8（metric 证据）、§5（ended_reason 映射）。
 * 本文件只声明语义，不含任何玩法数值；玩法与计分仍完全由 `src/game/stack.js` 决定。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const HBUT_STACK_ADAPTER = createGameAdapter({
  gameId: 'hbut_stack',
  displayName: '湖工叠塔',
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
  // metric 语义：已叠层数（0 基）；1:1 映射 Legacy max_level（§4.8）
  metric: { name: 'layers', semantics: 'count', max: 100000, label: '层数' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    maxLevelRule: '1:1',
    // 叠塔只有“塔倒”一种结束原因（game-registry.md §5）
    endedReasonMap: { lost: 'lost' }
  },
  result: {
    // extra 键名原样保留 camelCase（protocol-v1.md §4.3）
    extraKeys: ['perfectCount', 'perfectCombo']
  }
})

export default HBUT_STACK_ADAPTER
