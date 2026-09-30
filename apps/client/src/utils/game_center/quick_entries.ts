/**
 * 「更多」页游乐场快捷入口定义与导航意图通道（#910，Worker E 独占）。
 *
 * 目标（可发现性）：让用户在「更多」页一眼看到 **积分中心 / 总排行榜 / 漂流瓶 / 全部游戏**
 * 四个入口，而不是只有 Game Center 主入口；点击后进入 `GameCenterView` 并落到对应 Tab
 * （`points` / `globalRank` / `drift` / `games`，#909 集成后前两者是独立 Tab）。
 *
 * 关键决策：
 * 1. **Visibility 双层闸门与 GameCenterView 同语义**：flag 表达「产品想不想要」，
 *    capability 表达「端点是否真的实现」。`capabilities` **未提供**（更多页不探测 /meta）时
 *    只按 flag 乐观显示 —— 点击后在 GameCenterView 内仍会被双层闸门拦住（Tab 不存在即停在首页），
 *    不会出现「点了必然报错」；提供了 capability 表则按严格 AND（任何一项不成立即隐藏）。
 * 2. **不复制导航状态机**：与 `pending_open.ts` 同一模式 —— 进程内一次性意图，
 *    `MoreView` 只负责 `navigate('game_center')`，`GameCenterView` 启动时 consume 落 Tab。
 *    意图值受 `GAME_CENTER_TAB_KEYS` 白名单约束，拒绝任意字符串注入。
 * 3. 经典 11 个游戏入口与旧版路径**完全不受影响**：本模块不触碰 `MoreView` 的模块宫格链路。
 */

import type { GamePlatformCapabilityKey } from './api'
import type { GameCenterFlagKey } from './flags'

/** `GameCenterView` 的 Tab key 白名单（与 GameCenterView 内 activeTab 取值一致） */
export const GAME_CENTER_TAB_KEYS = Object.freeze([
  'home',
  'games',
  'rank',
  'globalRank',
  'points',
  'drift',
  'me'
] as const)

export type GameCenterTabKey = (typeof GAME_CENTER_TAB_KEYS)[number]

/** 四个快捷入口 id（顺序即 UI 展示顺序） */
export const GAME_CENTER_QUICK_ENTRY_IDS = Object.freeze(['points', 'rank', 'drift', 'games'] as const)

export type GameCenterQuickEntryId = (typeof GAME_CENTER_QUICK_ENTRY_IDS)[number]

export interface GameCenterQuickEntryDefinition {
  id: GameCenterQuickEntryId
  icon: string
  /** i18n key（三语字典必须齐全，见 i18n_coverage.spec.ts 测试 2） */
  titleKey: string
  descKey: string
  /** 目标 Tab（GameCenterView 的 activeTab） */
  tab: GameCenterTabKey
  /** 全部为 true 才可见（flag 是「产品开关」） */
  requiredFlags: readonly GameCenterFlagKey[]
  /** 提供的 capability 表中必须全部为 true（未提供 capability 表时跳过本项判定） */
  requiredCapabilities: readonly GamePlatformCapabilityKey[]
}

/**
 * 四个入口定义。
 *
 * 集成裁决（#909 + #910）：积分中心 / 总排行榜在本轮各自成为**独立 Tab**
 * （`points` / `globalRank`，见 `GameCenterView.vue`），因此入口直接落到对应 Tab，
 * 而不是旧的 `me` / `rank` 落位（否则「总排行榜」入口会把用户带到单游戏「排行」Tab）。
 * 落位仍受 `GameCenterView` 的 `tabs.some(...)` 守卫：目标 Tab 因能力/开关未就绪不存在时
 * 停在首页，不会报错。
 */
export const GAME_CENTER_QUICK_ENTRIES: readonly GameCenterQuickEntryDefinition[] = Object.freeze([
  Object.freeze({
    id: 'points',
    icon: '🪙',
    titleKey: 'more.quickEntries.points.title',
    descKey: 'more.quickEntries.points.desc',
    tab: 'points',
    requiredFlags: Object.freeze(['game_center_enabled', 'game_economy_enabled'] as const),
    requiredCapabilities: Object.freeze(['wallet'] as const)
  }),
  Object.freeze({
    id: 'rank',
    icon: '🏆',
    titleKey: 'more.quickEntries.rank.title',
    descKey: 'more.quickEntries.rank.desc',
    tab: 'globalRank',
    requiredFlags: Object.freeze(['game_center_enabled', 'game_verified_session_enabled'] as const),
    requiredCapabilities: Object.freeze(['leaderboards'] as const)
  }),
  Object.freeze({
    id: 'drift',
    icon: '🍾',
    titleKey: 'more.quickEntries.drift.title',
    descKey: 'more.quickEntries.drift.desc',
    tab: 'drift',
    requiredFlags: Object.freeze(['game_center_enabled', 'drift_bottle_enabled'] as const),
    requiredCapabilities: Object.freeze(['drift_bottle'] as const)
  }),
  Object.freeze({
    id: 'games',
    icon: '🎮',
    titleKey: 'more.quickEntries.games.title',
    descKey: 'more.quickEntries.games.desc',
    tab: 'games',
    requiredFlags: Object.freeze(['game_center_enabled'] as const),
    requiredCapabilities: Object.freeze([] as const)
  })
])

export interface GameCenterQuickEntryContext {
  /** 生效 flags（`resolveEffectiveGameCenterFlags` 的结果）；缺省 = 未就绪 → fail closed 全隐藏 */
  flags?: Record<string, unknown> | null
  /** `/meta.capabilities`（可选）；未提供时只按 flag 判定（点击后由 GameCenterView 兜底） */
  capabilities?: Record<string, unknown> | null
}

/** 单个入口是否可见（纯函数，便于单测与 MoreView 侧复用） */
export const isGameCenterQuickEntryVisible = (
  entry: GameCenterQuickEntryDefinition,
  context: GameCenterQuickEntryContext = {}
): boolean => {
  const flags = context.flags
  if (!flags || typeof flags !== 'object') return false
  for (const key of entry.requiredFlags) {
    if (flags[key] !== true) return false
  }
  const capabilities = context.capabilities
  if (capabilities === undefined || capabilities === null) return true
  if (typeof capabilities !== 'object') return false
  for (const key of entry.requiredCapabilities) {
    if (capabilities[key] !== true) return false
  }
  return true
}

/** 当前可见入口列表（保持定义顺序；空数组 = 整块不渲染） */
export const listVisibleGameCenterQuickEntries = (
  context: GameCenterQuickEntryContext = {}
): GameCenterQuickEntryDefinition[] =>
  GAME_CENTER_QUICK_ENTRIES.filter((entry) => isGameCenterQuickEntryVisible(entry, context))

export const findGameCenterQuickEntry = (
  entryId: unknown
): GameCenterQuickEntryDefinition | null => {
  const id = String(entryId ?? '').trim()
  if (!id) return null
  return GAME_CENTER_QUICK_ENTRIES.find((entry) => entry.id === id) || null
}

/**
 * 一次性 Tab 意图通道（与 `pending_open.ts` 同语义：consume 后立即清空 + 进程内不落盘）。
 * 只有白名单内的 Tab key 会被接受，返回值表示是否登记成功（失败时调用方不应导航）。
 */
let pendingTab: string = ''

export const requestGameCenterTab = (tab: unknown): boolean => {
  const key = String(tab ?? '').trim() as GameCenterTabKey
  if (!(GAME_CENTER_TAB_KEYS as readonly string[]).includes(key)) return false
  pendingTab = key
  return true
}

/** 按入口 id 登记意图（入口 → Tab 映射只有本模块知道） */
export const requestGameCenterTabForEntry = (entryId: unknown): boolean => {
  const entry = findGameCenterQuickEntry(entryId)
  if (!entry) return false
  return requestGameCenterTab(entry.tab)
}

/** 读取并清空待落 Tab（无则空串；GameCenterView 启动时消费） */
export const consumeGameCenterTab = (): string => {
  const tab = pendingTab
  pendingTab = ''
  return tab
}

/** 仅用于测试断言：当前是否存在待落 Tab 意图 */
export const peekGameCenterTab = (): string => pendingTab
