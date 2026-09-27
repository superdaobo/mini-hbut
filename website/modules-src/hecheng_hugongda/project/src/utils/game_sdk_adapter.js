/**
 * 合成湖工大 —— Game Platform SDK adapter（#907a 迁移）。
 *
 * 取值来源：`docs/game-platform/game-registry.md` §3（registry 行）+ §4.1（metric 证据）、§5（ended_reason 映射）
 * + `docs/game-platform/sdk-migration-guide.md` §5.1/§7。
 * 本文件只声明语义，不含任何玩法数值；玩法与计分仍完全由 `src/App.vue` 决定。
 */
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

/** 共享 storage key 串味修复：读优先模块私有 key，回落旧全局共享 key；写只写私有 key（SDK 只在读路径使用旧 key） */
export const HECHENG_HUGONGDA_STORAGE_KEYS = ['hecheng_hugongda_rank_context_v1', 'hbut_game_rank_context_v1']

export const HECHENG_HUGONGDA_ADAPTER = createGameAdapter({
  gameId: 'hecheng_hugongda',
  displayName: '合成湖工大',
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
  // metric 语义：本局合成到的最高学校等级（0 基，schools 共 10 项 → 上限 9）；1:1 映射 Legacy max_level（§4.1）
  metric: { name: 'school_level', semantics: 'progress_index', max: 9, label: '最高学校等级' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: {
    maxLevelRule: '1:1',
    // 双向换算都显式声明，避免漏写导致本地 SCHEMA_INVALID 静默丢分或榜上数值错位（迁移指南 §9.1）
    fromLegacyMaxLevel: (maxLevel) => maxLevel,
    toLegacyMaxLevel: (metricValue) => metricValue,
    // 旧代码只产出 cleared / failed 两种结束原因（game-registry.md §5）
    endedReasonMap: { cleared: 'cleared', failed: 'failed' },
    storageKeys: HECHENG_HUGONGDA_STORAGE_KEYS
  },
  result: {
    // 与迁移前 payload.extra 完全一致（`is_mobile` 符合 SDK 键名正则 ^[a-z][A-Za-z0-9_]{0,31}$，不会被丢弃）
    extraKeys: ['source', 'is_mobile', 'from', 'runtime']
  }
})

export default HECHENG_HUGONGDA_ADAPTER
