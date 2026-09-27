import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import { createGameAdapter } from '../../../../website/modules-src/_sdk/src/adapters/adapter.js'
import { createJumpOutLegacyAdapter } from '../../../../website/modules-src/_sdk/src/legacy/legacy-jump-out.js'
import { createFakeHostWindow, createFetchRouter, okJson } from './_sdk_test_harness'

/**
 * Legacy 通道的**字段保真**回归测试（#907 集成期修复的 P0）。
 *
 * 背景：四个并行迁移 Agent 中三个独立发现 —— dual-write 把 **V2 归一后**的
 * `ended_reason` 写进了经典榜 body（parking 的 `won` 变 `cleared`、2048 的 `win` 变 `won`、
 * jump_out 的 `fall` 变 `lost`），违反 `game-registry.md` §5「Legacy 表存原值」。
 * 修法：`run.js` 把 `buildResult().diagnostics.endedReasonRaw` 透传给 `toLegacyPayload`。
 *
 * 本文件即那条修复的护栏：**归一化只许出现在 V2 envelope，不许污染经典榜**。
 *
 * 注：本文件用 `createGameAdapter` 自建探针 adapter（非恒等与恒等映射各一），
 * 不依赖任何具体游戏的 adapter 文件 —— 那些文件由并行的 #907 分支引入。
 */

const LEGACY_QUERY =
  'student_id=20240111&player_name=测试&class_name=机械2401&app_version=1.4.11&rank_api=https://rank.example/api/game-rank'

const legacyOnlyRouter = () =>
  createFetchRouter([{ match: '/submit', method: 'POST', respond: () => okJson({ success: true }) }])

const stubBrowserEnv = () => {
  const host = createFakeHostWindow({ search: `?${LEGACY_QUERY}` })
  vi.stubGlobal('window', host.win)
  vi.stubGlobal('localStorage', host.win.localStorage)
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: 'Win32', userAgent: 'test' },
    configurable: true
  })
  return host
}

/** 非恒等映射探针：won → cleared（正是 parking 的映射，也是污染最明显的一类） */
const makeNonIdentityAdapter = () =>
  createGameAdapter({
    gameId: 'probe_nonidentity',
    metric: { name: 'cleared_levels', semantics: 'count', max: 6 },
    legacy: { endedReasonMap: { won: 'cleared' } }
  })

/** 恒等映射对照 */
const makeIdentityAdapter = () =>
  createGameAdapter({
    gameId: 'probe_identity',
    metric: { name: 'level_index', semantics: 'progress_index', max: 5 },
    legacy: { endedReasonMap: { lost: 'lost' } }
  })

const playLegacyRun = async (
  adapter: ReturnType<typeof createGameAdapter>,
  input: { score: number; maxLevel: number; durationMs?: number; moveCount?: number; endedReason?: string },
  runId: string
) => {
  stubBrowserEnv()
  const router = legacyOnlyRouter()
  vi.stubGlobal('fetch', router.fetch)

  const game = await MiniHBUTGame.init({
    gameId: (adapter as unknown as { gameId: string }).gameId,
    adapter,
    params: new URLSearchParams(LEGACY_QUERY),
    retryDelaysMs: [1, 1, 1],
    timeouts: { welcome: 10, ticket: 10 },
    requestTimeoutMs: 60
  })
  const run = game.startRun({ runId, startedAt: 1700000000000 })
  const outcome = await run.finish(input)
  const body = router.callsFor('/submit')[0]?.body as Record<string, unknown> | undefined
  game.dispose()
  return { outcome, body }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Legacy 通道字段保真（#907 集成期 P0 修复护栏）', () => {
  it('非恒等映射：经典榜 body 存**原始** ended_reason（不是归一值 cleared）', async () => {
    const { outcome, body } = await playLegacyRun(
      makeNonIdentityAdapter(),
      { score: 1234, maxLevel: 6, moveCount: 42, durationMs: 98000, endedReason: 'won' },
      'run_fidelity_won'
    )
    expect(outcome).toMatchObject({ success: true, mode: 'compatibility', trustLevel: 'legacy' })
    // 关键断言：经典榜是历史数据，必须存原值
    expect(body?.ended_reason).toBe('won')
    // duration 不能因签名调整而丢失
    expect(body?.duration_ms).toBe(98000)
    expect(body?.score).toBe(1234)
    expect(body?.max_level).toBe(6)
  })

  it('win→won 类映射：经典榜存 win（原值），不写归一值', async () => {
    const adapter = createGameAdapter({
      gameId: 'probe_winmap',
      metric: { name: 'max_tile', semantics: 'value', max: 131072 },
      legacy: { endedReasonMap: { win: 'won' } }
    })
    const { body } = await playLegacyRun(
      adapter,
      { score: 4096, maxLevel: 2048, moveCount: 300, durationMs: 60000, endedReason: 'win' },
      'run_fidelity_win'
    )
    expect(body?.ended_reason).toBe('win')
  })

  it('恒等映射对照：原样透传（修复未改变既有语义）', async () => {
    const { body } = await playLegacyRun(
      makeIdentityAdapter(),
      { score: 10, maxLevel: 3, durationMs: 1000, endedReason: 'lost' },
      'run_fidelity_identity'
    )
    expect(body?.ended_reason).toBe('lost')
  })

  it('V2 envelope 仍为归一值（修复只动 Legacy，不动 V2）', () => {
    const adapter = makeNonIdentityAdapter()
    const built = adapter.buildResult({ score: 1, maxLevel: 2, endedReason: 'won' })
    expect(built.result.ended_reason).toBe('cleared') // V2 语义：归一值
    expect(built.diagnostics.endedReasonRaw).toBe('won') // 原始值保留在 diagnostics
    expect(built.diagnostics.endedReasonMapped).toBe(true)
  })

  it('向后兼容：未提供 rawEndedReason 时回落 envelope 归一值（不静默变 unknown）', () => {
    const adapter = makeNonIdentityAdapter()
    const built = adapter.buildResult({ score: 1, maxLevel: 2, endedReason: 'won' })

    const legacyStyle = adapter.toLegacyPayload({ result: built.result, durationMs: 5000 })
    expect(legacyStyle.ended_reason).toBe('cleared')
    expect(legacyStyle.duration_ms).toBe(5000)

    const rawStyle = adapter.toLegacyPayload({
      result: built.result,
      durationMs: 5000,
      rawEndedReason: built.diagnostics.endedReasonRaw
    })
    expect(rawStyle.ended_reason).toBe('won')
    expect(rawStyle.duration_ms).toBe(5000)
  })

  it('未声明映射的未知 reason：Legacy 存原值，V2 存 unknown', () => {
    const adapter = createGameAdapter({
      gameId: 'probe_unknown',
      metric: { name: 'level_index', semantics: 'progress_index', max: 5 }
    })
    const built = adapter.buildResult({ score: 1, maxLevel: 2, endedReason: 'timeout_custom' })
    expect(built.result.ended_reason).toBe('unknown')
    const payload = adapter.toLegacyPayload({
      result: built.result,
      durationMs: 1,
      rawEndedReason: built.diagnostics.endedReasonRaw
    })
    expect(payload.ended_reason).toBe('timeout_custom')
  })

  it('jump_out 通道：body 必须带 run_id（旧实现有；Legacy 表有唯一键约束）', () => {
    const legacy = createJumpOutLegacyAdapter()
    const payload = legacy.toLegacyPayload({
      result: { score: 88, metric: { name: 'jump_count', value: 88 }, moves: 88, ended_reason: 'lost', extra: {} },
      durationMs: 30000,
      runId: 'run_jumpout_1',
      rawEndedReason: 'fall'
    }) as Record<string, unknown>

    expect(payload.run_id).toBe('run_jumpout_1')
    // jump_out 的 fall→lost 是非恒等映射：经典榜同样存原值
    expect(payload.ended_reason).toBe('fall')
    expect(payload.move_count).toBe(88)
    expect(payload.duration_ms).toBe(30000)
  })
})
