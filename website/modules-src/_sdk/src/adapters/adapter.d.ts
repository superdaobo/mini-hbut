/**
 * Game Adapter 类型声明（与 `adapter.js` 导出对齐）。
 * 游戏侧推荐从 `_sdk/src/index.js` 引入 createGameAdapter；此文件服务直接引用本路径的调用方。
 */
import type { GameAdapter, GameAdapterConfig } from '../index.js'

export type { GameAdapter, GameAdapterConfig }

export const METRIC_SEMANTICS: readonly string[]
export const ENDED_REASONS: readonly string[]
export const LEADERBOARD_ORDERS: readonly string[]
export const RESULT_LIMITS: Record<string, number>
export const DEFAULT_LEADERBOARD_SCOPES: readonly string[]

export function createGameAdapter(config: GameAdapterConfig): GameAdapter
