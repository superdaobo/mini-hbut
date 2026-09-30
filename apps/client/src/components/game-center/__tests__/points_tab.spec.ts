/**
 * #909 积分中心 / 总排行榜组件测试（Worker C）。
 *
 * 仓库未引入 @vue/test-utils、vitest 主配置为 node 环境（无 DOM），本文件沿用
 * `features/identity/authHistoryViewRegression.spec.ts`（#775）确立的「无 DOM 组件测试」范式：
 *   A. **源码契约**（readFileSync + 注释剥离）：锁定唯一网络入口、i18n 用法、
 *      降级/重试分支、禁止 `--` 占位、禁止 PII 字段名进入模板；
 *   B. **行为级**：用 `vue/compiler-sfc` 把 `<script setup>` 编译为可执行 setup 函数，
 *      注入真实 Vue（ref/computed/watch/onMounted）与 **mock 的 points.ts 网络函数**，
 *      复刻「挂载 → 自动加载 → 状态切换 / 闸门变化 → 补加载 / 分页合并」数据流。
 *
 * 网络与归一化细节由 `points.spec.ts` / `global_rank.spec.ts` 覆盖；本文件验证组件编排。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from 'vue/compiler-sfc'
import { computed, nextTick, reactive, ref, watch } from 'vue'

vi.mock('../../../utils/game_center/points', async (importOriginal) => {
  // 纯函数 / 常量保留真实实现（无副作用），只把四个网络函数替换为 mock
  const actual = await importOriginal<typeof import('../../../utils/game_center/points')>()
  return {
    ...actual,
    fetchPointsWallet: vi.fn(),
    fetchPointsDailyTasks: vi.fn(),
    fetchPointsLedger: vi.fn(),
    fetchGlobalXpLeaderboard: vi.fn()
  }
})

import {
  LEDGER_DEFAULT_LIMIT,
  dailyTaskTitleI18nKey,
  fetchGlobalXpLeaderboard,
  fetchPointsDailyTasks,
  fetchPointsLedger,
  fetchPointsWallet,
  formatDelta,
  formatPointsTimestamp,
  isPointsAuthError,
  isPointsFeatureDisabled,
  ledgerEntryTypeI18nKey,
  ledgerReasonI18nKey,
  levelProgressPercent,
  mergeGlobalRankRows,
  mergeLedgerEntries,
  rewardStatusI18nKey,
  taskProgressPercent
} from '../../../utils/game_center/points'
import { useI18n, tf } from '../../../utils/app_i18n'

const walletMock = vi.mocked(fetchPointsWallet)
const tasksMock = vi.mocked(fetchPointsDailyTasks)
const ledgerMock = vi.mocked(fetchPointsLedger)
const globalRankMock = vi.mocked(fetchGlobalXpLeaderboard)

// ─── 源码契约基建 ────────────────────────────────────────────────────────────

const readComponent = (relative: string): string =>
  readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

/** 剥离注释（HTML 注释 / JS 块注释 / 行注释）后按行返回，避免注释中的字段名命中扫描 */
const codeLines = (source: string): string[] => {
  const text = source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  return text.split('\n').map((line) => {
    const index = line.indexOf('//')
    return index >= 0 ? line.slice(0, index) : line
  })
}

/** 组件代码中不得出现的 PII 字段名（`sub` 单独用词边界正则，避免 subtitle 误伤） */
const FORBIDDEN_IN_COMPONENT = ['student_id', 'studentId', 'user_id', 'userId', 'hbut_student_id', 'player_id']

// ─── SFC 编译基建：把 <script setup> 编译为可执行 setup 函数 ────────────────

interface SetupState {
  [key: string]: unknown
}

/**
 * 编译组件并把 setup 体在测试进程内执行。
 * - 依赖全部经参数注入（真实 Vue + mock 的 points.ts 网络函数 + i18n + 真实纯函数）；
 * - `onMounted` 收集为可手动触发的钩子，复刻真实挂载时机。
 */
const runSetup = (
  relative: string,
  propsValues: Record<string, unknown>
): { state: SetupState; props: Record<string, unknown>; mount: () => void } => {
  const source = readComponent(relative)
  const { descriptor, errors } = parse(source, { filename: relative })
  if (errors.length > 0 || !descriptor.scriptSetup) {
    throw new Error(`SFC 解析失败：${errors.map(String).join('; ')}`)
  }
  const compiled = compileScript(descriptor, { id: `points-tab-${relative}` })
  const content = compiled.content
  const startMarker = '__expose();'
  // 切到 `Object.defineProperty(__returned__` 之前：body 内含 `const __returned__ = {...}` 声明，
  // 由本测试追加 `return __returned__`（编译器的 return 在 defineProperty 之后，不取）
  const endMarker = 'Object.defineProperty(__returned__'
  const start = content.indexOf(startMarker)
  const end = content.indexOf(endMarker)
  if (start < 0 || end < 0) {
    throw new Error('SFC 编译输出结构变化，请同步更新本测试的切片标记')
  }
  const body = content.slice(start + startMarker.length, end)
  const onMountedHooks: Array<() => void> = []
  const injects: Record<string, unknown> = {
    ref,
    computed,
    reactive,
    watch,
    nextTick,
    useI18n,
    tf,
    fetchPointsWallet,
    fetchPointsDailyTasks,
    fetchPointsLedger,
    fetchGlobalXpLeaderboard,
    LEDGER_DEFAULT_LIMIT,
    dailyTaskTitleI18nKey,
    formatDelta,
    formatPointsTimestamp,
    isPointsAuthError,
    isPointsFeatureDisabled,
    ledgerEntryTypeI18nKey,
    ledgerReasonI18nKey,
    levelProgressPercent,
    mergeGlobalRankRows,
    mergeLedgerEntries,
    rewardStatusI18nKey,
    taskProgressPercent,
    // 子组件只被 `__returned__` 的 getter 引用（本测试不渲染模板），占位即可
    GameCenterNotice: { name: 'GameCenterNotice' },
    onMounted: (hook: () => void) => {
      onMountedHooks.push(hook)
    }
  }
  const factory = new Function(
    ...Object.keys(injects),
    `return (function(__props){ ${body}\nreturn __returned__ })`
  )
  const props = reactive(propsValues)
  const state = (factory(...Object.values(injects)) as (p: unknown) => SetupState)(props)
  return {
    state,
    props,
    mount: () => {
      for (const hook of onMountedHooks) hook()
    }
  }
}

// ─── mock 数据 ───────────────────────────────────────────────────────────────

const walletData = {
  playerRef: 'ref-me',
  xpTotal: 320,
  level: 4,
  levelCurve: { xpIntoLevel: 90, xpForNext: 110, xpSpan: 200 },
  coinBalance: 88,
  today: { date: '2026-09-30', xpGained: 25, coinGained: 6, runCount: 2 },
  dailyCaps: { xpCap: 100, coinCap: null, runCap: 20 },
  ruleVersion: 'economy-v1',
  economyEnabled: true
}

const tasksData = {
  date: '2026-09-30',
  tasks: [
    {
      taskId: 'daily_play_1',
      title: '完成 1 局游戏',
      target: 1,
      progress: 1,
      completed: true,
      rewardXp: 5,
      rewardCoin: 2,
      rewardStatus: 'granted'
    }
  ],
  ruleVersion: 'economy-v1',
  everydayResetAt: '2026-10-01T00:00:00+08:00'
}

const ledgerData = {
  items: [
    {
      key: 'entry-1',
      entryType: 'reward',
      reasonCode: 'run_settled',
      xpDelta: 15,
      coinDelta: 3,
      createdAt: '2026-09-30T08:00:00'
    }
  ],
  nextCursor: 'cursor-2',
  ruleVersion: 'economy-v1'
}

const boardData = {
  board: 'global_xp',
  seasonId: '',
  items: [
    { rank: 1, playerRef: 'ref-top', displayName: '第一名', xpTotal: 900, level: 9, isSelf: false },
    { rank: 2, playerRef: 'ref-me', displayName: '我', xpTotal: 320, level: 4, isSelf: true }
  ],
  me: { rank: 2, playerRef: 'ref-me', displayName: '我', xpTotal: 320, level: 4, isSelf: true },
  nextCursor: 'board-cursor-2',
  ruleVersion: 'xp-v1',
  generatedAt: '2026-09-30T08:00:00'
}

beforeEach(() => {
  walletMock.mockReset()
  tasksMock.mockReset()
  ledgerMock.mockReset()
  globalRankMock.mockReset()
  walletMock.mockResolvedValue({ ...walletData })
  tasksMock.mockResolvedValue({ ...tasksData, tasks: tasksData.tasks.map((task) => ({ ...task })) })
  ledgerMock.mockResolvedValue({ ...ledgerData, items: ledgerData.items.map((item) => ({ ...item })) })
  globalRankMock.mockResolvedValue({ ...boardData, items: boardData.items.map((row) => ({ ...row })) })
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// A. 源码契约
// ---------------------------------------------------------------------------

describe('积分中心组件源码契约（#909）', () => {
  const source = readComponent('GameCenterPointsTab.vue')
  const code = codeLines(source).join('\n')

  it('唯一网络入口：只 import points.ts，不得绕过直连 api.ts / 不得裸 fetch', () => {
    expect(code).toContain("from '../../utils/game_center/points'")
    expect(code).not.toContain("game_center/api'")
    expect(code).not.toContain("game_center/base'")
    expect(code).not.toMatch(/\bfetch\(/)
  })

  it('展示真数据：Level / XP / 湖工币 / 今日进度 / 每日上限 / 任务进度 / 账本', () => {
    for (const token of [
      'wallet.level',
      'wallet.xpTotal',
      'wallet.coinBalance',
      'wallet.today.xpGained',
      'wallet.today.coinGained',
      'wallet.today.runCount',
      'wallet.dailyCaps.xpCap',
      'wallet.dailyCaps.coinCap',
      'wallet.dailyCaps.runCap',
      'task.progress',
      'task.target',
      'ledgerItems'
    ]) {
      expect(code, `缺少 ${token} 的渲染`).toContain(token)
    }
  })

  it('任务进度必须同时可读（progress / target 文本 + 进度条）', () => {
    expect(code).toContain('taskProgressPercent')
    expect(code).toContain('gameCenter.points.taskProgressValue')
    expect(code).toContain('gc-progress__fill')
  })

  it('账本条目展示原因码 / 正负金额 / 时间戳，且不渲染 ref_id', () => {
    expect(code).toContain('reasonText(entry)')
    expect(code).toContain('formatDelta(entry.xpDelta)')
    expect(code).toContain('formatDelta(entry.coinDelta)')
    expect(code).toContain('formatPointsTimestamp(entry.createdAt)')
    expect(code).not.toContain('ref_id')
    expect(code).not.toContain('refId')
  })

  it('降级：能力关闭提示 + 未登录提示 + 可重试按钮，不出现 `--` 占位', () => {
    expect(code).toContain('gameCenter.points.walletDisabled')
    expect(code).toContain('gameCenter.points.signInRequired')
    expect(code).toContain("t('gameCenter.points.retry')")
    expect(code).toContain('isPointsAuthError')
    expect(code).toContain('isPointsFeatureDisabled')
    // 契约 §4.1：`--` 占位不允许作为最终实现
    expect(code).not.toContain("'--'")
    expect(code).not.toContain('>--<')
  })

  it('能力关闭时不发请求（闸门早退）', () => {
    expect(code).toContain('if (!props.walletEnabled)')
    expect(code).toContain('if (!props.dailyTasksEnabled)')
  })

  it('PII 白名单：模板/脚本代码不得出现身份字段名', () => {
    for (const forbidden of FORBIDDEN_IN_COMPONENT) {
      expect(code, `不得出现 ${forbidden}`).not.toContain(forbidden)
    }
    expect(code).not.toMatch(/\bsub\b/)
  })

  it('文案全部走 i18n（代码区无硬编码中文 UI 文本）', () => {
    expect(code).toContain('useI18n')
    expect(code).not.toMatch(/>\s*[\u4e00-\u9fff]/)
  })
})

describe('总排行榜组件源码契约（#909）', () => {
  const source = readComponent('GameCenterGlobalRankTab.vue')
  const code = codeLines(source).join('\n')

  it('唯一网络入口 + 默认直接请求（不要求先选游戏）', () => {
    expect(code).toContain("from '../../utils/game_center/points'")
    expect(code).toContain('fetchGlobalXpLeaderboard')
    expect(code).not.toContain("game_center/api'")
    expect(code).not.toMatch(/\bfetch\(/)
    // 不得出现「先选游戏」的 props / 逻辑
    expect(code).not.toContain('selectedGameId')
    expect(code).not.toContain('game_id')
  })

  it('「我」置顶 + 高亮 + 未上榜文案', () => {
    expect(code).toContain('board.me')
    expect(code).toContain('myRankTitle')
    expect(code).toContain('notRanked')
    expect(code).toContain('row.isSelf')
    expect(code).toContain('gc-rank-list__row--self')
  })

  it('降级：能力关闭 / 未登录 / 失败重试，不出现 `--` 占位', () => {
    expect(code).toContain('gameCenter.globalRank.disabled')
    expect(code).toContain('gameCenter.globalRank.signInHint')
    expect(code).toContain("t('gameCenter.globalRank.retry')")
    expect(code).toContain('leaderboardsEnabled')
    expect(code).not.toContain("'--'")
    expect(code).not.toContain('>--<')
  })

  it('PII 白名单：只渲染 displayName / xpTotal / level / rank（playerRef 仅作 :key）', () => {
    for (const forbidden of FORBIDDEN_IN_COMPONENT) {
      expect(code, `不得出现 ${forbidden}`).not.toContain(forbidden)
    }
    expect(code).not.toMatch(/\bsub\b/)
    // player_ref 只可作为列表 key，不得进入可见文本
    expect(code).not.toContain('{{ row.playerRef }}')
    expect(code).not.toContain('{{ board.me.playerRef }}')
  })

  it('文案全部走 i18n', () => {
    expect(code).toContain('useI18n')
    expect(code).not.toMatch(/>\s*[\u4e00-\u9fff]/)
  })
})

// ---------------------------------------------------------------------------
// B. 行为级（编译 setup 后复刻数据流）
// ---------------------------------------------------------------------------

const readValue = (state: SetupState, name: string): unknown =>
  (state[name] as { value: unknown } | undefined)?.value

describe('积分中心行为（闸门 / 加载 / 错误 / 分页）', () => {
  it('能力关闭：挂载后零请求，钱包状态保持空', async () => {
    const { state, mount } = runSetup('GameCenterPointsTab.vue', {
      apiBase: '',
      walletEnabled: false,
      dailyTasksEnabled: false,
      ledgerPageSize: 20
    })
    mount()
    await nextTick()
    expect(walletMock).not.toHaveBeenCalled()
    expect(tasksMock).not.toHaveBeenCalled()
    expect(ledgerMock).not.toHaveBeenCalled()
    expect(readValue(state, 'wallet')).toBeNull()
  })

  it('闸门打开：三个请求各发一次，成功后写入展示模型', async () => {
    const { state, mount } = runSetup('GameCenterPointsTab.vue', {
      apiBase: 'https://x.invalid/api/game-platform/v1',
      walletEnabled: true,
      dailyTasksEnabled: true,
      ledgerPageSize: 20
    })
    mount()
    await nextTick()
    await nextTick()
    expect(walletMock).toHaveBeenCalledTimes(1)
    expect(tasksMock).toHaveBeenCalledTimes(1)
    expect(ledgerMock).toHaveBeenCalledTimes(1)
    expect(readValue(state, 'wallet')).toMatchObject({ level: 4, xpTotal: 320, coinBalance: 88 })
    expect(readValue(state, 'tasks')).toMatchObject({ date: '2026-09-30' })
    expect(readValue(state, 'ledgerItems')).toHaveLength(1)
    expect(readValue(state, 'ledgerNextCursor')).toBe('cursor-2')
    expect(readValue(state, 'walletError')).toBeNull()
    expect(readValue(state, 'levelPercent')).toBe(45)
  })

  it('钱包失败（需登录）：错误状态可读、auth 分支为真、重试入口存在', async () => {
    walletMock.mockRejectedValueOnce({ code: 'AUTH_REQUIRED', message: '请先登录', retryable: false })
    const { state, mount } = runSetup('GameCenterPointsTab.vue', {
      apiBase: '',
      walletEnabled: true,
      dailyTasksEnabled: false,
      ledgerPageSize: 20
    })
    mount()
    await nextTick()
    await nextTick()
    expect(readValue(state, 'wallet')).toBeNull()
    expect(readValue(state, 'walletError')).toMatchObject({ code: 'AUTH_REQUIRED', message: '请先登录' })
    expect(readValue(state, 'walletAuthError')).toBe(true)
    expect(typeof state.loadWallet).toBe('function')
  })

  it('任务能力被服务端关闭（FEATURE_DISABLED）：占位语义而不是错误', async () => {
    tasksMock.mockRejectedValue({ code: 'FEATURE_DISABLED', message: '每日任务未开放', retryable: false })
    const { state, mount } = runSetup('GameCenterPointsTab.vue', {
      apiBase: '',
      walletEnabled: true,
      dailyTasksEnabled: true,
      ledgerPageSize: 20
    })
    mount()
    await nextTick()
    await nextTick()
    expect(readValue(state, 'tasksFeatureDisabled')).toBe(true)
    expect(readValue(state, 'tasks')).toBeNull()
  })

  it('闸门动态打开（能力探测到位）后补加载此前被挡住的块', async () => {
    const { props, state, mount } = runSetup('GameCenterPointsTab.vue', {
      apiBase: '',
      walletEnabled: false,
      dailyTasksEnabled: false,
      ledgerPageSize: 20
    })
    mount()
    await nextTick()
    expect(walletMock).not.toHaveBeenCalled()
    props.walletEnabled = true
    props.dailyTasksEnabled = true
    await nextTick()
    await nextTick()
    await nextTick()
    expect(walletMock).toHaveBeenCalledTimes(1)
    expect(tasksMock).toHaveBeenCalledTimes(1)
    expect(ledgerMock).toHaveBeenCalledTimes(1)
    expect(readValue(state, 'wallet')).toMatchObject({ level: 4 })
  })

  it('账本「加载更多」：带 cursor 请求并按键去重合并', async () => {
    const { state, mount } = runSetup('GameCenterPointsTab.vue', {
      apiBase: '',
      walletEnabled: true,
      dailyTasksEnabled: false,
      ledgerPageSize: 20
    })
    mount()
    await nextTick()
    await nextTick()
    ledgerMock.mockResolvedValueOnce({
      items: [
        // 与第一页重复的一行 + 一行新的
        { ...ledgerData.items[0] },
        {
          key: 'entry-2',
          entryType: 'quest_reward',
          reasonCode: 'run_settled',
          xpDelta: 5,
          coinDelta: 2,
          createdAt: '2026-09-30T09:00:00'
        }
      ],
      nextCursor: '',
      ruleVersion: 'economy-v1'
    })
    await (state.loadMoreLedger as () => Promise<void>)()
    await nextTick()
    const items = readValue(state, 'ledgerItems') as Array<{ key: string }>
    expect(items.map((item) => item.key)).toEqual(['entry-1', 'entry-2'])
    const calls = ledgerMock.mock.calls
    const lastCall = calls[calls.length - 1]?.[0] as { cursor?: string }
    expect(lastCall.cursor).toBe('cursor-2')
    expect(readValue(state, 'ledgerNextCursor')).toBe('')
  })
})

describe('总排行榜行为（默认请求 / 我 / 分页）', () => {
  it('挂载即请求总榜（无需选游戏），并写入「我」的排名', async () => {
    const { state, mount } = runSetup('GameCenterGlobalRankTab.vue', {
      apiBase: '',
      leaderboardsEnabled: true,
      pageSize: 50
    })
    mount()
    await nextTick()
    await nextTick()
    expect(globalRankMock).toHaveBeenCalledTimes(1)
    expect(globalRankMock.mock.calls[0][0]).toMatchObject({ limit: 50 })
    expect(readValue(state, 'myRankText')).toBe('2')
    expect((readValue(state, 'board') as { items: unknown[] }).items).toHaveLength(2)
    expect(readValue(state, 'generatedAtText')).toBe('2026-09-30 08:00')
  })

  it('未上榜（rank=0）：显示「暂未上榜」而不是假名次', async () => {
    globalRankMock.mockResolvedValue({
      ...boardData,
      me: { rank: 0, playerRef: 'ref-me', displayName: '我', xpTotal: 10, level: 1, isSelf: true }
    })
    const { state, mount } = runSetup('GameCenterGlobalRankTab.vue', {
      apiBase: '',
      leaderboardsEnabled: true,
      pageSize: 50
    })
    mount()
    await nextTick()
    await nextTick()
    expect(readValue(state, 'myRankText')).toBe('暂未上榜')
  })

  it('能力关闭：零请求 + 状态为空（不白屏，由模板渲染占位）', async () => {
    const { state, mount } = runSetup('GameCenterGlobalRankTab.vue', {
      apiBase: '',
      leaderboardsEnabled: false,
      pageSize: 50
    })
    mount()
    await nextTick()
    expect(globalRankMock).not.toHaveBeenCalled()
    expect(readValue(state, 'board')).toBeNull()
  })

  it('失败：错误状态写入且可重试（重试再次发起请求）', async () => {
    globalRankMock.mockRejectedValueOnce({
      code: 'LOCAL_TRANSPORT_FAILED',
      message: '连接失败',
      retryable: true
    })
    const { state, mount } = runSetup('GameCenterGlobalRankTab.vue', {
      apiBase: '',
      leaderboardsEnabled: true,
      pageSize: 50
    })
    mount()
    await nextTick()
    await nextTick()
    expect(readValue(state, 'error')).toMatchObject({ message: '连接失败', retryable: true })
    globalRankMock.mockResolvedValue({ ...boardData })
    await (state.loadBoard as () => Promise<void>)()
    await nextTick()
    expect(readValue(state, 'error')).toBeNull()
    expect((readValue(state, 'board') as { items: unknown[] }).items).toHaveLength(2)
  })

  it('「加载更多」：带 cursor 请求并合并去重（我的行仍高亮）', async () => {
    const { state, mount } = runSetup('GameCenterGlobalRankTab.vue', {
      apiBase: '',
      leaderboardsEnabled: true,
      pageSize: 50
    })
    mount()
    await nextTick()
    await nextTick()
    globalRankMock.mockResolvedValueOnce({
      ...boardData,
      items: [
        // 重复行（同 player_ref）+ 新行
        { rank: 1, playerRef: 'ref-top', displayName: '第一名', xpTotal: 900, level: 9, isSelf: false },
        { rank: 3, playerRef: 'ref-three', displayName: '第三名', xpTotal: 200, level: 2, isSelf: false }
      ],
      me: null,
      nextCursor: ''
    })
    await (state.loadMore as () => Promise<void>)()
    await nextTick()
    const board = readValue(state, 'board') as {
      items: Array<{ playerRef: string; isSelf: boolean }>
      me: unknown
    }
    expect(board.items.map((row) => row.playerRef)).toEqual(['ref-top', 'ref-me', 'ref-three'])
    // 追加页 me=null 时保留第一页的「我」（不能把已展示的排名丢掉）
    expect(board.me).toMatchObject({ playerRef: 'ref-me' })
    const calls = globalRankMock.mock.calls
    const lastCall = calls[calls.length - 1]?.[0] as { cursor?: string }
    expect(lastCall.cursor).toBe('board-cursor-2')
  })
})
