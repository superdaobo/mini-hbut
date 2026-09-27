import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ERROR_CODES,
  ERROR_CODE_TABLE,
  GamePlatformError,
  MiniHBUTGame,
  SDK_VERSION,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  applyRegistryEntry,
  assertNoForbiddenFields,
  buildLegacySubmitBody,
  canonicalJson,
  clearLaunchTicketFromUrl,
  compareVersions,
  createGameAdapter,
  createHostOriginGuard,
  createJumpOutLegacyAdapter,
  finishPayloadSignature,
  normalizeError,
  normalizeLegacyRankApiBase,
  readLaunchTicket,
  sanitizeTelemetryFields,
  stableStringify,
  stripPiiFields
} from '../../../../website/modules-src/_sdk/src/index.js'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'

const repoRoot = resolve(process.cwd(), '../..')

describe('SDK：版本与错误码（必须与 protocol-v1.md §5 的 17 码逐字一致）', () => {
  it('暴露 17 个协议错误码且不自造码', () => {
    expect(Object.keys(ERROR_CODES)).toHaveLength(17)
    expect(Object.keys(ERROR_CODE_TABLE).sort()).toEqual(Object.keys(ERROR_CODES).sort())
    expect(Object.keys(ERROR_CODES)).toEqual([
      'AUTH_REQUIRED',
      'GAME_SESSION_EXPIRED',
      'TICKET_INVALID',
      'TICKET_USED',
      'RUN_ALREADY_FINISHED',
      'RUN_INVALID',
      'REWARD_DISABLED',
      'GAME_DISABLED',
      'RATE_LIMITED',
      'FEATURE_DISABLED',
      'LEGACY_ONLY',
      'INTERNAL_ERROR',
      'PROTOCOL_VERSION_UNSUPPORTED',
      'CLIENT_VERSION_TOO_OLD',
      'SCHEMA_INVALID',
      'IDEMPOTENCY_CONFLICT',
      'FORBIDDEN_ACTOR'
    ])
  })

  it('HTTP / retryable 与协议表一致（409 与 4xx 一律不可重试）', () => {
    expect(ERROR_CODE_TABLE.RATE_LIMITED).toMatchObject({ http: 429, retryable: true })
    expect(ERROR_CODE_TABLE.INTERNAL_ERROR).toMatchObject({ http: 500, retryable: true })
    expect(ERROR_CODE_TABLE.REWARD_DISABLED).toMatchObject({ http: 200, retryable: false })
    expect(ERROR_CODE_TABLE.RUN_ALREADY_FINISHED).toMatchObject({ http: 409, retryable: false })
    expect(ERROR_CODE_TABLE.FORBIDDEN_ACTOR).toMatchObject({ http: 403, retryable: false })
    expect(ERROR_CODE_TABLE.CLIENT_VERSION_TOO_OLD).toMatchObject({ http: 426, retryable: false })
  })

  it('未知 code 归一为 INTERNAL_ERROR（禁止自造码）', () => {
    const error = normalizeError(new Error('boom'), { stage: 'unit' })
    expect(error.code).toBe('INTERNAL_ERROR')
    expect(error.toReport().stage).toBe('unit')
    const custom = new GamePlatformError('TOTALLY_MADE_UP')
    expect(custom.code).toBe('INTERNAL_ERROR')
    expect(custom.toReport().request_id).toBe('')
  })

  it('SDK 版本与 package.json 一致，且协议区间为 [1,1]', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'website/modules-src/_sdk/package.json'), 'utf8')
    ) as { version: string; miniHbut?: { protocol_version?: number; sdk_version?: string } }
    expect(pkg.version).toBe(SDK_VERSION)
    expect(pkg.miniHbut?.sdk_version).toBe(SDK_VERSION)
    expect(pkg.miniHbut?.protocol_version).toBe(PROTOCOL_VERSION)
    expect(SUPPORTED_PROTOCOL_VERSIONS).toEqual({ min: 1, max: 1 })
    expect(MiniHBUTGame.sdkVersion).toBe(SDK_VERSION)
    expect(MiniHBUTGame.protocolVersion).toBe(PROTOCOL_VERSION)
  })

  it('语义化版本比较支持 registry 软门禁', () => {
    expect(compareVersions('1.4.12', '1.4.11')).toBe(1)
    expect(compareVersions('1.4.11', '1.4.11')).toBe(0)
    expect(compareVersions('1.4.9', '1.4.11')).toBe(-1)
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1)
  })
})

describe('SDK：canonical json / 本地签名', () => {
  it('键排序、无空白、整数最短十进制', () => {
    expect(canonicalJson({ b: 1, a: 'x' })).toBe('{"a":"x","b":1}')
    expect(canonicalJson({ n: -12, t: true, z: null })).toBe('{"n":-12,"t":true,"z":null}')
    expect(canonicalJson([1, 'a', false])).toBe('[1,"a",false]')
  })

  it('浮点一律拒绝（协议 §3.3.1 禁止浮点）', () => {
    expect(() => canonicalJson({ v: 1.5 })).toThrow()
    expect(() => canonicalJson({ v: 0.1 + 0.2 })).toThrow()
    expect(() => canonicalJson([1, 2.5])).toThrow()
  })

  it('stableStringify 用于本地输入比较，容忍浮点与缺省字段', () => {
    expect(stableStringify({ b: 1, a: 1.5 })).toBe(stableStringify({ a: 1.5, b: 1 }))
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }))
  })
})

describe('SDK：Game Adapter 机制', () => {
  it('拒绝非法 gameId / metric（程序员错误用 TypeError）', () => {
    expect(() => createGameAdapter({ gameId: 'Bad-Id', metric: { name: 'layers', semantics: 'count', max: 1 } })).toThrow(
      TypeError
    )
    expect(() =>
      createGameAdapter({ gameId: 'ok_game', metric: { name: 'Layers', semantics: 'count', max: 1 } })
    ).toThrow(TypeError)
    expect(() =>
      createGameAdapter({ gameId: 'ok_game', metric: { name: 'layers', semantics: 'nope', max: 1 } })
    ).toThrow(TypeError)
  })

  it('参考游戏 adapter 取值与 game-registry.md §3/§4.8 一致', () => {
    expect(HBUT_STACK_ADAPTER.gameId).toBe('hbut_stack')
    expect(HBUT_STACK_ADAPTER.metric).toMatchObject({ name: 'layers', semantics: 'count', max: 100000 })
    expect(HBUT_STACK_ADAPTER.resultSchemaVersion).toBe(1)
    expect(HBUT_STACK_ADAPTER.capabilities).toMatchObject({
      ranked: true,
      classicMirror: true,
      legacyCompatible: true,
      seasonEligible: true,
      multiplayer: false
    })
    expect(HBUT_STACK_ADAPTER.legacy.maxLevelRule).toBe('1:1')
    expect(HBUT_STACK_ADAPTER.endedReasonMap).toEqual({ lost: 'lost' })
  })

  it('构造 V2 envelope：Legacy payload 命名 1:1 映射，max_level 语义不变', () => {
    const built = HBUT_STACK_ADAPTER.buildResult({
      score: 1240,
      maxLevel: 26,
      moveCount: 26,
      durationMs: 151400,
      endedReason: 'lost',
      extra: { perfectCount: 9, perfectCombo: 4 }
    })
    expect(built.result).toEqual({
      schema_version: 1,
      score: 1240,
      metric: { name: 'layers', value: 26 },
      moves: 26,
      ended_reason: 'lost',
      extra: { perfectCount: 9, perfectCombo: 4 }
    })
    // 反向换算：V2 → Legacy（dual-write 反算）
    expect(HBUT_STACK_ADAPTER.toLegacyPayload(built)).toEqual({
      score: 1240,
      max_level: 26,
      move_count: 26,
      ended_reason: 'lost',
      duration_ms: 151400,
      payload: { perfectCount: 9, perfectCombo: 4 }
    })
  })

  it('0 基 metric 游戏（如 hbut_monopoly）声明的 −1/+1 换算只在一处生效', () => {
    // 取值依据 game-registry.md §4.5：Legacy max_level = metric.value + 1
    const adapter = createGameAdapter({
      gameId: 'hbut_monopoly',
      metric: { name: 'stage_index', semantics: 'progress_index', max: 2 },
      legacy: { maxLevelRule: 'max_level = metric.value + 1', fromLegacyMaxLevel: (v: number) => v - 1, toLegacyMaxLevel: (v: number) => v + 1 }
    })
    const built = adapter.buildResult({ score: 29150, maxLevel: 3, moveCount: 47, endedReason: 'lost' })
    expect(built.result.metric).toEqual({ name: 'stage_index', value: 2 })
    expect(adapter.toLegacyPayload(built).max_level).toBe(3)
  })

  it('数值越界与浮点 extra 在本地就被拦下（避免服务端 SCHEMA_INVALID）', () => {
    expect(() => HBUT_STACK_ADAPTER.buildResult({ score: 1e9 + 1 })).toThrowError(/成绩/)
    expect(() => HBUT_STACK_ADAPTER.buildResult({ score: 1, moveCount: 1.5 })).toThrowError(
      expect.objectContaining({ code: 'SCHEMA_INVALID' })
    )
    expect(() => HBUT_STACK_ADAPTER.buildResult({ score: 1, durationMs: 86400001 })).toThrowError(
      expect.objectContaining({ code: 'SCHEMA_INVALID' })
    )
    const built = HBUT_STACK_ADAPTER.buildResult({
      score: 1,
      extra: { perfectCount: 1.5, perfectCombo: 2, note: 'ok' }
    })
    // 浮点被丢弃、未在 extraKeys 白名单内的键也被丢弃（服务端 extra schema 只认声明过的键）
    expect(built.result.extra).toEqual({ perfectCombo: 2 })
    expect(built.diagnostics.droppedExtraKeys).toEqual(['perfectCount', 'note'])
  })

  it('未声明的 ended_reason → unknown（不拒绝请求）', () => {
    const built = HBUT_STACK_ADAPTER.buildResult({ score: 1, endedReason: 'mystery' })
    expect(built.result.ended_reason).toBe('unknown')
    expect(built.diagnostics.endedReasonRaw).toBe('mystery')
  })
})

describe('SDK：actor / 奖励字段防线（trust-model §3、protocol §2.3）', () => {
  it('V2 请求体出现 actor 字段 → FORBIDDEN_ACTOR', () => {
    expect(() => assertNoForbiddenFields({ game_id: 'hbut_stack', student_id: '20240111' })).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN_ACTOR' })
    )
    expect(() => assertNoForbiddenFields({ result: { extra: { user_id: 'x' } } })).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN_ACTOR' })
    )
  })

  it('V2 请求体出现奖励数量 / 服务端权威字段 → SCHEMA_INVALID', () => {
    for (const field of ['xp_amount', 'coin_amount', 'reward', 'reward_amount', 'season_id', 'trust_level']) {
      expect(() => assertNoForbiddenFields({ [field]: 1 })).toThrowError(
        expect.objectContaining({ code: 'SCHEMA_INVALID' })
      )
    }
  })

  it('榜单条目 PII 守卫剔除身份字段', () => {
    const safe = stripPiiFields({ rank: 1, player_name: '张三', student_id: '20240111', player_id: 'p1', sub: 's' })
    expect(safe).toEqual({ rank: 1, player_name: '张三' })
  })
})

describe('SDK：遥测脱敏（protocol §10 L4）', () => {
  it('非白名单字段一律丢弃（含凭据与学号）', () => {
    const safe = sanitizeTelemetryFields({
      game_id: 'hbut_stack',
      code: 'RATE_LIMITED',
      student_id: '20240111',
      ticket: 'gpt_secret',
      authorization: 'Bearer x',
      player_name: '张三',
      attempt: 2
    } as Record<string, unknown>)
    expect(safe).toEqual({ game_id: 'hbut_stack', code: 'RATE_LIMITED', attempt: 2 })
  })
})

describe('SDK：Host 握手来源校验（wrong origin 必须被拒绝）', () => {
  it('显式 hostOrigins 精确匹配；未知来源拒绝', () => {
    const guard = createHostOriginGuard({ hostOrigins: ['https://app.example'], pageOrigin: '', referrerOrigin: '' })
    expect(guard({ origin: 'https://app.example' }).ok).toBe(true)
    expect(guard({ origin: 'https://evil.example' })).toMatchObject({ ok: false, reason: 'origin_rejected' })
    expect(guard({ origin: 'https://app.example.evil.com' }).ok).toBe(false)
    expect(guard({ origin: '' })).toMatchObject({ ok: false, reason: 'origin_missing' })
  })

  it('opaque origin（null）默认拒绝，显式 opt-in 才放行', () => {
    const strict = createHostOriginGuard({ pageOrigin: 'https://app.example' })
    expect(strict({ origin: 'null' })).toMatchObject({ ok: false, reason: 'origin_opaque_rejected' })
    const relaxed = createHostOriginGuard({ pageOrigin: 'https://app.example', allowOpaqueOrigin: true })
    expect(relaxed({ origin: 'null' }).ok).toBe(true)
  })

  it('未显式配置时从 referrer / 自身 origin 推导允许集合；无法验证则拒绝', () => {
    const derived = createHostOriginGuard({ pageOrigin: 'https://cdn.example', referrerOrigin: 'https://app.example' })
    expect(derived.allowList).toEqual(['https://cdn.example', 'https://app.example'])
    const empty = createHostOriginGuard({ pageOrigin: '', referrerOrigin: '' })
    expect(empty({ origin: 'https://app.example' })).toMatchObject({ ok: false, reason: 'origin_unverifiable' })
  })
})

describe('SDK：Launch Ticket 读取与 URL 清理（§6.2.3 / §10 L5）', () => {
  it('识别 gpt_ 形状 ticket，非法形状忽略', () => {
    const ok = readLaunchTicket({ params: new URLSearchParams('gpt=gpt_abcdefghijklmnopqrstuvwx') })
    expect(ok).toMatchObject({ shape: 'modern', source: 'url.gpt' })
    expect(readLaunchTicket({ params: new URLSearchParams('ticket=short') })).toBeNull()
    expect(readLaunchTicket({ params: new URLSearchParams('gpt=not-a-ticket!!') })).toBeNull()
  })

  it('读取后立即 replaceState 清除 URL 中的 ticket（保留其它参数）', () => {
    const calls: string[] = []
    const changed = clearLaunchTicketFromUrl({
      location: { search: '?gpt=gpt_abcdefghijklmnopqrstuvwx&student_id=20240111', pathname: '/index.html', hash: '' },
      history: { replaceState: (_s: unknown, _t: string, url: string) => calls.push(url) }
    })
    expect(changed).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toContain('gpt=')
    expect(calls[0]).not.toContain('gpt_abcdefghijklmnopqrstuvwx')
    expect(calls[0]).toContain('student_id=20240111')
  })

  it('没有 ticket 时不触发 replaceState', () => {
    const calls: string[] = []
    const changed = clearLaunchTicketFromUrl({
      location: { search: '?student_id=20240111', pathname: '/index.html', hash: '' },
      history: { replaceState: (_s: unknown, _t: string, url: string) => calls.push(url) }
    })
    expect(changed).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('SDK：Legacy Adapter（10 游戏模板协议冻结）', () => {
  it('API base 归一与既有实现一致', () => {
    expect(normalizeLegacyRankApiBase('https://rank.example/api/game-rank')).toBe('https://rank.example/api/game-rank')
    expect(normalizeLegacyRankApiBase('https://rank.example/api')).toBe('https://rank.example/api/game-rank')
    expect(normalizeLegacyRankApiBase('rank.example')).toBe('https://rank.example/api/game-rank')
    expect(normalizeLegacyRankApiBase('')).toBe('https://mini-hbut-testocr1.hf.space/api/game-rank')
  })

  it('submit body 字段名与既有 game_rank.js:186-203 逐字一致（冻结契约）', () => {
    const body = buildLegacySubmitBody({
      gameId: 'hbut_stack',
      context: {
        legacyStudentId: '20240111',
        playerName: '叠塔',
        className: '机械2401',
        schoolName: '湖北工业大学',
        major: '',
        runtime: 'module-web',
        appVersion: '1.4.11'
      },
      legacy: { runId: 'run_1', score: 650, maxLevel: 5, moveCount: 5, endedReason: 'lost', durationMs: 20000, payload: { perfectCount: 1 } }
    })
    expect(Object.keys(body)).toEqual([
      'game_id',
      'run_id',
      'student_id',
      'player_name',
      'class_name',
      'school_name',
      'major',
      'score',
      'max_level',
      'duration_ms',
      'move_count',
      'ended_reason',
      'client_version',
      'platform',
      'runtime',
      'payload'
    ])
    expect(body).toMatchObject({
      game_id: 'hbut_stack',
      run_id: 'run_1',
      student_id: '20240111',
      player_name: '叠塔',
      class_name: '机械2401',
      score: 650,
      max_level: 5,
      move_count: 5,
      ended_reason: 'lost',
      duration_ms: 20000,
      runtime: 'module-web',
      payload: { perfectCount: 1 }
    })
  })

  it('jump_out_hbut 旧协议：无 rank_api 直接判定不可用（无默认 base）', async () => {
    const adapter = createJumpOutLegacyAdapter()
    expect(adapter.protocol).toBe('snake_case_legacy_v0')
    const context = adapter.readContext({ params: new URLSearchParams(''), storage: null })
    expect(context.rank_api).toBe('')
    expect(adapter.canSubmit(context)).toBe(false)
    const result = await adapter.submit({ context, payload: { run_id: '1', score: 10 }, transport: {} })
    expect(result).toMatchObject({ success: false, error: 'no_api', code: 'FEATURE_DISABLED' })
  })

  it('jump_out_hbut 旧协议：run_id 无 run_ 前缀，payload 原样 snake_case 透传', () => {
    const runs = new Set<string>()
    for (let index = 0; index < 20; index += 1) runs.add(createJumpOutLegacyAdapter().createRunId(() => 1700000000000))
    expect(runs.size).toBeGreaterThan(1)
    for (const value of runs) expect(value.startsWith('run_')).toBe(false)
  })
})

describe('SDK：legacy 上下文不被当作 V2 actor（trust-model §3.1）', () => {
  it('SDK 源码中 student_id 只出现在 Legacy 通道文件里', () => {
    const v2Files = [
      'website/modules-src/_sdk/src/platform/game-platform-client.js',
      'website/modules-src/_sdk/src/run.js',
      'website/modules-src/_sdk/src/game.js'
    ]
    for (const file of v2Files) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8')
      expect(source, `${file} 不得读取自报 student_id`).not.toMatch(/params\.get\(['"]student_id['"]\)/)
      expect(source, `${file} 不得把 student_id 放进 V2 请求体`).not.toMatch(/student_id:/)
    }
  })

  it('SDK 源码不在任何地方调用 console（§10 L5/L6 日志脱敏）', () => {
    const files = [
      'website/modules-src/_sdk/src/transport.js',
      'website/modules-src/_sdk/src/game.js',
      'website/modules-src/_sdk/src/run.js',
      'website/modules-src/_sdk/src/host-bridge.js',
      'website/modules-src/_sdk/src/platform/game-platform-client.js',
      'website/modules-src/_sdk/src/legacy/legacy-rank.js'
    ]
    for (const file of files) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8')
      expect(source, `${file} 不得打日志`).not.toMatch(/console\.(log|warn|error|info|debug)/)
    }
  })
})

describe('SDK：不落盘凭据（§6.2.3）', () => {
  it('SDK 源码不写 localStorage / sessionStorage（除 Legacy 展示上下文）', () => {
    const files = [
      'website/modules-src/_sdk/src/game.js',
      'website/modules-src/_sdk/src/run.js',
      'website/modules-src/_sdk/src/host-bridge.js',
      'website/modules-src/_sdk/src/platform/game-platform-client.js',
      'website/modules-src/_sdk/src/transport.js'
    ]
    for (const file of files) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8')
      expect(source, `${file} 不得使用持久化存储`).not.toMatch(
        /(localStorage|sessionStorage|indexedDB)\s*\.\s*(get|set|remove|clear|open|delete)/
      )
    }
  })

  it('session token 只存在于客户端实例内存（setSession/clearSession）', () => {
    const source = readFileSync(
      resolve(repoRoot, 'website/modules-src/_sdk/src/platform/game-platform-client.js'),
      'utf8'
    )
    expect(source).toContain('setSession')
    expect(source).toContain('clearSession')
    expect(source).toContain('Authorization')
    expect(source).not.toMatch(/localStorage|sessionStorage/)
  })
})

describe('SDK：canonical 签名与幂等输入稳定性', () => {
  it('同一 finish 输入生成同一签名（保证 content_hash 稳定）', () => {
    const base = {
      gameId: 'hbut_stack',
      runId: 'run_1',
      durationMs: 1000,
      result: { schema_version: 1, score: 1, metric: { name: 'layers', value: 1 }, moves: 1, ended_reason: 'lost', extra: {} },
      requireRewards: false
    }
    expect(finishPayloadSignature(base)).toBe(finishPayloadSignature({ ...base }))
    expect(finishPayloadSignature(base)).not.toBe(finishPayloadSignature({ ...base, requireRewards: true }))
  })
})

describe('SDK：registry 快照覆盖与软门禁', () => {
  it('服务端 metric/legacy_compatible 覆盖游戏自报值并记冲突', () => {
    const applied = applyRegistryEntry(HBUT_STACK_ADAPTER, {
      game_id: 'hbut_stack',
      status: 'active',
      metric: { name: 'layers', max: 512, semantics: 'count' },
      legacy_compatible: false
    })
    expect(applied.blocked).toBeNull()
    expect(applied.adapter.metric.max).toBe(512)
    expect(applied.adapter.capabilities.legacyCompatible).toBe(false)
    expect(applied.conflicts).toContain('metric.max:100000→512')
    expect(applied.conflicts).toContain('legacy_compatible:true→false')
  })

  it('status=disabled / legacy_only 返回可路由的阻断码', () => {
    expect(applyRegistryEntry(HBUT_STACK_ADAPTER, { game_id: 'hbut_stack', status: 'disabled' }).blocked).toMatchObject({
      code: 'GAME_DISABLED'
    })
    expect(
      applyRegistryEntry(HBUT_STACK_ADAPTER, { game_id: 'hbut_stack', status: 'legacy_only' }).blocked
    ).toMatchObject({ code: 'LEGACY_ONLY' })
  })
})

describe('SDK：facade 只暴露必要入口', () => {
  it('MiniHBUTGame 提供 init/create/枚举，且不暴露奖励数量相关 API', () => {
    expect(typeof MiniHBUTGame.init).toBe('function')
    expect(typeof MiniHBUTGame.create).toBe('function')
    expect(typeof MiniHBUTGame.createEngine).toBe('function')
    expect(MiniHBUTGame.modes).toEqual({ verified: 'verified', compatibility: 'compatibility', standalone: 'standalone' })
    const publicKeys = Object.keys(MiniHBUTGame).join(' ')
    expect(publicKeys).not.toMatch(/xp|coin|reward_amount/i)
    expect(vi.isMockFunction(MiniHBUTGame.init)).toBe(false)
  })
})
