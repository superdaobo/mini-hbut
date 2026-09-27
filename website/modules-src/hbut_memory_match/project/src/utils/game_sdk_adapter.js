/**
 * 湖工记忆牌 —— Game Platform SDK adapter（#907b 迁移）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.7（metric 证据）+ §5（ended_reason 映射）。
 * 本文件只声明语义，不含任何玩法数值；玩法与计分仍完全由 `src/game/memory.js` 决定。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const HBUT_MEMORY_MATCH_ADAPTER = createGameAdapter({
  gameId: 'hbut_memory_match',
  displayName: '湖工记忆牌',
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
  // metric 语义：关卡索引（0 基）；4 关 → metric.max = 3（registry §4.7）
  metric: { name: 'level_index', semantics: 'progress_index', max: 3, label: '关卡索引' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    // Legacy max_level = levelIndex + 1（main.js 提交 state.levelNumber）→ metric.value = max_level - 1
    maxLevelRule: 'metric.value = max_level - 1',
    fromLegacyMaxLevel: (maxLevel) => maxLevel - 1,
    toLegacyMaxLevel: (metricValue) => metricValue + 1,
    // 四关全通 won / 时间耗尽 lost（game-registry.md §5）
    endedReasonMap: { won: 'won', lost: 'lost' }
  },
  result: {
    // 与迁移前 payload.extra 逐字一致（main.js:170-174）
    extraKeys: ['mistakes', 'levelIndex', 'combo']
  }
})

export default HBUT_MEMORY_MATCH_ADAPTER
