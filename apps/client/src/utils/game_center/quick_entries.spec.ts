/**
 * 「更多」页游乐场快捷入口契约测试（#910）。
 *
 * 看守三条不可回退的约束：
 * 1. 四个入口（积分中心 / 总排行榜 / 漂流瓶 / 全部游戏）存在，且目标 Tab 全在
 *    `GameCenterView` 的 Tab 白名单内（想改 tab 名字必须两处一起改）；
 * 2. 可见性是「flag AND capability」：flags 未就绪 / 总开关关闭 → fail closed 全隐藏；
 *    提供 capability 表时未实现端点对应入口必须隐藏；
 * 3. 导航意图通道是一次性 + 白名单：未知 Tab / 空值不得登记，也不得覆盖已有意图。
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  GAME_CENTER_QUICK_ENTRIES,
  GAME_CENTER_QUICK_ENTRY_IDS,
  GAME_CENTER_TAB_KEYS,
  consumeGameCenterTab,
  findGameCenterQuickEntry,
  isGameCenterQuickEntryVisible,
  listVisibleGameCenterQuickEntries,
  peekGameCenterTab,
  requestGameCenterTab,
  requestGameCenterTabForEntry
} from './quick_entries'
import type { GameCenterQuickEntryDefinition } from './quick_entries'

/** 全部 flag 打开（远程配置全放行时的形态） */
const ALL_FLAGS_ON: Record<string, boolean> = {
  game_center_enabled: true,
  game_verified_session_enabled: true,
  game_economy_enabled: true,
  drift_bottle_enabled: true,
  classic_game_entries_visible: true,
  game_daily_tasks_enabled: true,
  gomoku_competitive_enabled: true,
  verified_reward_enabled: true
}

const requireEntry = (id: string): GameCenterQuickEntryDefinition => {
  const entry = findGameCenterQuickEntry(id)
  if (!entry) throw new Error(`入口缺失：${id}`)
  return entry
}

describe('游乐场快捷入口定义（#910 可发现性）', () => {
  it('四个入口齐全，顺序固定为 积分中心 / 总排行榜 / 漂流瓶 / 全部游戏', () => {
    expect([...GAME_CENTER_QUICK_ENTRY_IDS]).toEqual(['points', 'rank', 'drift', 'games'])
    expect(GAME_CENTER_QUICK_ENTRIES.map((entry) => entry.id)).toEqual([
      'points',
      'rank',
      'drift',
      'games'
    ])
  })

  it('每个入口的目标 Tab 都在 GameCenterView Tab 白名单内，且文案 key 有统一前缀', () => {
    for (const entry of GAME_CENTER_QUICK_ENTRIES) {
      expect(GAME_CENTER_TAB_KEYS as readonly string[]).toContain(entry.tab)
      expect(entry.titleKey.startsWith('more.quickEntries.')).toBe(true)
      expect(entry.descKey.startsWith('more.quickEntries.')).toBe(true)
      expect(entry.icon.length).toBeGreaterThan(0)
    }
  })

  it('白名单与 GameCenterView 的 Tab 定义逐字同步（顺序 + 集合，改一处必须改两处）', () => {
    const view = readFileSync(
      new URL('../../components/GameCenterView.vue', import.meta.url),
      'utf8'
    )
    // GameCenterView 的 tabs computed 里只有 `{ key: '<tab>'` 这一种字面量形态
    const declared = [...view.matchAll(/\{ key: '([A-Za-z]+)'/g)].map((match) => match[1])
    expect(declared).toEqual([...GAME_CENTER_TAB_KEYS])
  })

  it('入口 → Tab 映射与 GameCenterView 语义一致（积分中心→points、总榜→globalRank、漂流瓶→drift、游戏→games）', () => {
    expect(requireEntry('points').tab).toBe('points')
    expect(requireEntry('rank').tab).toBe('globalRank')
    expect(requireEntry('drift').tab).toBe('drift')
    expect(requireEntry('games').tab).toBe('games')
  })

  it('flags 未就绪（null / 缺失 / 非对象）→ 全部隐藏（fail closed，不显示点了必然失败的入口）', () => {
    expect(listVisibleGameCenterQuickEntries({ flags: null })).toEqual([])
    expect(listVisibleGameCenterQuickEntries({})).toEqual([])
    expect(
      listVisibleGameCenterQuickEntries({ flags: 'nope' as unknown as Record<string, unknown> })
    ).toEqual([])
    expect(listVisibleGameCenterQuickEntries({ flags: { game_center_enabled: false } })).toEqual([])
  })

  it('全部 flag 打开且 capability 未探测 → 四个入口都可见（乐观；点击后由 GameCenterView 双层闸门兜底）', () => {
    const visible = listVisibleGameCenterQuickEntries({ flags: ALL_FLAGS_ON })
    expect(visible.map((entry) => entry.id)).toEqual(['points', 'rank', 'drift', 'games'])
  })

  it('总开关关闭 → 四个入口全隐藏（含全部游戏）', () => {
    expect(
      listVisibleGameCenterQuickEntries({ flags: { ...ALL_FLAGS_ON, game_center_enabled: false } })
    ).toEqual([])
  })

  it('提供 capability 表时按严格 AND：未实现的端点对应入口隐藏', () => {
    const capabilities = {
      wallet: false,
      leaderboards: true,
      drift_bottle: false,
      daily_tasks: false,
      gomoku_match: false,
      verified_reward: false
    }
    const visible = listVisibleGameCenterQuickEntries({ flags: ALL_FLAGS_ON, capabilities })
    expect(visible.map((entry) => entry.id)).toEqual(['rank', 'games'])
    // 已探测但未声明任何能力：未知即不可用 → 仅保留不依赖 capability 的「全部游戏」
    expect(
      listVisibleGameCenterQuickEntries({ flags: ALL_FLAGS_ON, capabilities: {} }).map(
        (entry) => entry.id
      )
    ).toEqual(['games'])
    // 垃圾（非对象）能力表按最小信任处理：整块隐藏，不把不可信输入当「未探测」乐观放行
    expect(
      listVisibleGameCenterQuickEntries({
        flags: ALL_FLAGS_ON,
        capabilities: 'bad' as unknown as Record<string, unknown>
      })
    ).toEqual([])
  })

  it('经济 flag 关闭 → 仅积分中心隐藏；漂流瓶 flag 关闭 → 仅漂流瓶隐藏（互不误伤）', () => {
    expect(
      listVisibleGameCenterQuickEntries({ flags: { ...ALL_FLAGS_ON, game_economy_enabled: false } }).map(
        (entry) => entry.id
      )
    ).toEqual(['rank', 'drift', 'games'])
    expect(
      listVisibleGameCenterQuickEntries({ flags: { ...ALL_FLAGS_ON, drift_bottle_enabled: false } }).map(
        (entry) => entry.id
      )
    ).toEqual(['points', 'rank', 'games'])
  })

  it('UGC 策略夹紧后（drift_bottle_enabled 被 clamp 为 false）漂流瓶入口不可见', () => {
    const clamped = { ...ALL_FLAGS_ON, drift_bottle_enabled: false }
    expect(isGameCenterQuickEntryVisible(requireEntry('drift'), { flags: clamped })).toBe(false)
    expect(isGameCenterQuickEntryVisible(requireEntry('games'), { flags: clamped })).toBe(true)
  })
})

describe('快捷入口导航意图通道（一次性 + 白名单）', () => {
  beforeEach(() => {
    consumeGameCenterTab()
  })

  it('白名单内的 Tab 可登记，consume 后立即清空（一次性语义）', () => {
    expect(requestGameCenterTab('drift')).toBe(true)
    expect(peekGameCenterTab()).toBe('drift')
    expect(consumeGameCenterTab()).toBe('drift')
    expect(consumeGameCenterTab()).toBe('')
    expect(peekGameCenterTab()).toBe('')
    // #909 集成新增的两个 Tab 也在白名单内（与 GameCenterView 的 tabs 逐字一致）
    expect(requestGameCenterTab('points')).toBe(true)
    expect(consumeGameCenterTab()).toBe('points')
    expect(requestGameCenterTab('globalRank')).toBe(true)
    expect(consumeGameCenterTab()).toBe('globalRank')
  })

  it('白名单外 / 空值 / 非字符串一律拒绝，且不覆盖已有意图', () => {
    expect(requestGameCenterTab('evil')).toBe(false)
    expect(requestGameCenterTab('')).toBe(false)
    expect(requestGameCenterTab('  ')).toBe(false)
    expect(requestGameCenterTab(null)).toBe(false)
    expect(requestGameCenterTab({} as unknown)).toBe(false)
    expect(peekGameCenterTab()).toBe('')
    expect(requestGameCenterTab('rank')).toBe(true)
    expect(requestGameCenterTab('nope')).toBe(false)
    expect(peekGameCenterTab()).toBe('rank')
  })

  it('按入口 id 登记：id → tab 映射正确，未知 id 不登记', () => {
    expect(requestGameCenterTabForEntry('points')).toBe(true)
    expect(consumeGameCenterTab()).toBe('points')
    expect(requestGameCenterTabForEntry('rank')).toBe(true)
    expect(consumeGameCenterTab()).toBe('globalRank')
    expect(requestGameCenterTabForEntry('games')).toBe(true)
    expect(consumeGameCenterTab()).toBe('games')
    expect(requestGameCenterTabForEntry('unknown')).toBe(false)
    expect(peekGameCenterTab()).toBe('')
  })
})
