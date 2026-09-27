/**
 * 湖工矿工 —— Game Platform SDK adapter（#907b 迁移）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.6（metric 证据）+ §5（ended_reason 映射）。
 * 本文件只声明语义，不含任何玩法数值；玩法与计分仍完全由 `src/game/miner.js` 决定。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const HBUT_MINER_ADAPTER = createGameAdapter({
  gameId: 'hbut_miner',
  displayName: '湖工矿工',
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
  // metric 语义：关卡索引（0 基）；7 关 → metric.max = 6（registry §4.6）
  metric: { name: 'level_index', semantics: 'progress_index', max: 6, label: '关卡索引' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    // Legacy max_level = levelIndex + 1（main.js 提交 state.levelNumber）→ metric.value = max_level - 1
    maxLevelRule: 'metric.value = max_level - 1',
    fromLegacyMaxLevel: (maxLevel) => maxLevel - 1,
    toLegacyMaxLevel: (metricValue) => metricValue + 1,
    // 目标达成 won / 时间耗尽 lost（game-registry.md §5）
    endedReasonMap: { won: 'won', lost: 'lost' }
  },
  result: {
    // 与迁移前 payload.extra 逐字一致（main.js:214-217）
    extraKeys: ['levelName', 'targetScore']
  }
})

export default HBUT_MINER_ADAPTER
