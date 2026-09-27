/**
 * 湖工大富翁 —— Game Platform SDK adapter（#907c 接入）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.5（metric 证据）、§5（ended_reason 映射）。
 * 本文件只声明语义，不含任何玩法数值；计分公式仍在 `src/game/monopoly.js:computeRankScore`（未改动）。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const HBUT_MONOPOLY_ADAPTER = createGameAdapter({
  gameId: 'hbut_monopoly',
  displayName: '湖工大富翁',
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
  // metric 语义：阶段索引（0 基，3 阶段 → 0..2），与 Legacy 榜「第 N 阶段」相差 1（§4.5）
  metric: { name: 'stage_index', semantics: 'progress_index', max: 2, label: '阶段' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    // registry §4.5：max_level = metric.value + 1（旧榜已有数据语义为 1..3，迁移后必须保持不变）
    maxLevelRule: 'max_level = value + 1',
    fromLegacyMaxLevel: (maxLevel) => maxLevel - 1,
    toLegacyMaxLevel: (metricValue) => metricValue + 1,
    // 两种终局原因在 V2 枚举中同名（game-registry.md §5），显式声明避免退化为 unknown
    endedReasonMap: { won: 'won', lost: 'lost' }
  },
  result: {
    // 白名单与迁移前 payload.extra 逐个一致（main.js:263-271）；未声明键会被静默丢弃
    extraKeys: ['credits', 'influence', 'coins', 'energy', 'stress', 'stage', 'stageIndex']
  }
})

export default HBUT_MONOPOLY_ADAPTER
