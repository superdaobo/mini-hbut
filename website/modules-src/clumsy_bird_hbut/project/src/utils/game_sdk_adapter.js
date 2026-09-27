/**
 * 笨鸟先飞 —— Game Platform SDK adapter（#907b 迁移）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.4（metric 证据）+ §5（ended_reason 映射）。
 * 本文件只声明语义，不含任何玩法数值；玩法与计分仍完全由 `src/game/FlappyGame.js` 决定。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const CLUMSY_BIRD_ADAPTER = createGameAdapter({
  gameId: 'clumsy_bird_hbut',
  displayName: '笨鸟先飞',
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
  // 本游戏是全仓唯一异类：metric 是**历史最高分**（非本局），semantics=historical_best（registry §4.4）。
  // 提交时 Legacy max_level 仍是 data.bestScore（1:1），V2 主排序用本局 score（U-R4）。
  metric: { name: 'best_score_legacy', semantics: 'historical_best', max: 100000, label: '历史最高分' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    maxLevelRule: '1:1',
    // 笨鸟只有“撞管道”一种结束原因（game-registry.md §5）
    endedReasonMap: { collision: 'collision' }
  },
  result: {
    // 迁移前 payload 没有 extra（main.js:139-146）→ 空白名单：任何 extra 键都按未声明丢弃
    extraKeys: []
  }
})

export default CLUMSY_BIRD_ADAPTER
