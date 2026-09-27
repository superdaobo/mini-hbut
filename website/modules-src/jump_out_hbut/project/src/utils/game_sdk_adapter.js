/**
 * 跳出湖工大 —— Game Platform SDK adapter（#907a 迁移）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.2（metric 证据）、§5（ended_reason 映射）
 * + `docs/game-platform/sdk-migration-guide.md` §5.1/§6。
 * 注意：本游戏使用**旧协议独立通道**（`legacyProtocol: 'jump_out'`），snake_case 与「无默认 API base」
 * 由 `_sdk/src/legacy/legacy-jump-out.js` 统一处理；adapter 只声明语义，不含任何玩法数值。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const JUMP_OUT_HBUT_ADAPTER = createGameAdapter({
  gameId: 'jump_out_hbut',
  displayName: '跳出湖工大',
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
  // metric 语义：本局跳跃次数（count）；1:1 映射 Legacy max_level（§4.2），100000 为工程上限
  metric: { name: 'jump_count', semantics: 'count', max: 100000, label: '跳跃次数' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    maxLevelRule: '1:1',
    // 双向换算显式声明（迁移指南 §9.1）：旧榜 max_level 就是本局跳跃次数
    fromLegacyMaxLevel: (maxLevel) => maxLevel,
    toLegacyMaxLevel: (metricValue) => metricValue,
    // 旧代码只产出 fall 一种结束原因（game-registry.md §5）
    endedReasonMap: { fall: 'lost' }
  },
  result: {
    // 旧 payload 无 extra，白名单为空（不声明任何键，避免多余字段进入请求体）
    extraKeys: []
  }
})

export default JUMP_OUT_HBUT_ADAPTER
