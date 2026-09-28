import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import * as hbut2048 from '../../../../website/modules-src/hbut_2048/project/src/utils/game_rank.js'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'
import { GAME_CENTER_GAME_IDS } from './game_center/launch'
import {
  PROFILE_STORAGE_PREFIX,
  readCachedPlayerProfile,
  type ModuleContextIdentityProfile
} from './game_center/profile'
import { createFetchRouter } from './_sdk_test_harness'

/**
 * P0 收口（PRR#2）：**登出 / 未登录后，游乐场与经典入口不得再以上一用户身份展示或提交成绩**。
 *
 * 真实证据链（PRR#2 探针）：落盘 `{studentId:'20240001',playerName:'上一位用户'}` + 空身份注入
 * （`?student_id=&player_name=&rank_api=…`）后 → Legacy 模板模块解析出 `studentId=20240001`
 * 并以其提交；SDK 模块 `mode=compatibility`、`uploaded=true`。
 *
 * 本文件全部用**真实函数**驱动（不做源码文本断言）：
 * 1. `readCachedPlayerProfile`：无会话 → 空档案（不得合并任何游戏上下文身份）；
 * 2. `appendIdentityQueryParams`（MoreView.appendModuleContextQuery 的真实注入点）：无会话 →
 *    URL 不含任何身份参数（非空才注入）；
 * 3. `clearGameIdentityCaches` / `clearUserScopedCaches`：游戏落盘身份被清、无关键保留；
 * 4. 端到端：登出清理后无会话打开模块（Legacy 模板模块 + SDK 模块）→ 不会得到上一用户学号、
 *    不会以其身份提交（零提交请求）；
 * 5. 启动期收口（P0-4）：强杀 / 崩溃后**不经过任何登出入口**的冷启动 → 设备级游戏身份被清，
 *    模块链路同样零身份零提交；有会话 / 有缓存身份 / 重复执行都零动作（幂等）。
 *
 * 写法说明：`appendIdentityQueryParams` / `clearGameIdentityCaches` / `reconcileGameIdentityOnBoot`
 * 是本次新增导出，修复前不存在，因此对新导出用**动态 import + 类型断言**访问（修复前测试文件仍能
 * 加载并逐条断言失败，而不是整文件因缺导出而报错）——与 `hbut_gomoku_relay_rebind_contract.spec.ts`
 * 同一写法。
 */

const PREVIOUS_SID = '20240001'
const PREVIOUS_NAME = '上一位用户'
const PREVIOUS_CLASS = '电气2401'
const CURRENT_SID = '20240002'
const RANK_API_BASE = 'https://rank.example/api/game-rank'
const GAME_URL = 'https://games.example/hbut_2048/index.html'

/** 上一用户在各游戏上下文 / 模块档案里留下的身份快照 */
const seedPreviousUserIdentity = () => {
  for (const gameId of GAME_CENTER_GAME_IDS) {
    localStorage.setItem(
      `${gameId}_rank_context_v1`,
      JSON.stringify({
        gameId,
        studentId: PREVIOUS_SID,
        playerName: PREVIOUS_NAME,
        className: PREVIOUS_CLASS,
        schoolName: '湖北工业大学',
        major: '电气工程'
      })
    )
  }
  // hecheng_hugongda 的历史共享键（与 isLegacyRankContextKey 约定一致）
  localStorage.setItem(
    'hbut_game_rank_context_v1',
    JSON.stringify({ studentId: PREVIOUS_SID, playerName: PREVIOUS_NAME })
  )
  localStorage.setItem(
    `${PROFILE_STORAGE_PREFIX}${PREVIOUS_SID}`,
    JSON.stringify({ student_id: PREVIOUS_SID, name: PREVIOUS_NAME, class_name: PREVIOUS_CLASS })
  )
  localStorage.setItem(
    `cache:studentinfo:${PREVIOUS_SID}`,
    JSON.stringify({ data: { name: PREVIOUS_NAME, class_name: PREVIOUS_CLASS }, timestamp: Date.now() })
  )
}

const createStorage = () => {
  const values = new Map<string, string>()
  const setItem = vi.fn((key: string, value: string) => {
    values.set(String(key), String(value))
  })
  const removeItem = vi.fn((key: string) => {
    values.delete(String(key))
  })
  return {
    values,
    setItem,
    removeItem,
    api: {
      getItem: (key: string) => (values.has(key) ? values.get(key)! : null),
      setItem,
      removeItem,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() {
        return values.size
      },
      clear: () => values.clear()
    }
  }
}

const setSearch = (search = '') => {
  vi.stubGlobal('window', {
    location: { search, origin: 'https://app.example' },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  })
}

/** 动态取新增导出（修复前不存在 → 断言失败而不是加载失败） */
const loadProfileModule = async (): Promise<Record<string, any>> =>
  (await import('./game_center/profile')) as unknown as Record<string, any>

const loadApiModule = async (): Promise<Record<string, any>> =>
  (await import('./api.js')) as unknown as Record<string, any>

const requireAppendIdentityQueryParams = async () => {
  const mod = await loadProfileModule()
  const fn = mod.appendIdentityQueryParams as
    | ((url: URL, profile: ModuleContextIdentityProfile) => string[])
    | undefined
  expect(typeof fn, 'appendIdentityQueryParams 必须是可用的真实函数（P0-3）').toBe('function')
  return fn!
}

const requireClearGameIdentityCaches = async () => {
  const api = await loadApiModule()
  const fn = api.clearGameIdentityCaches as ((studentId: unknown) => void) | undefined
  expect(typeof fn, 'clearGameIdentityCaches 必须是可用的真实函数（P0-2）').toBe('function')
  return fn!
}

const requireReconcileGameIdentityOnBoot = async () => {
  const api = await loadApiModule()
  const fn = api.reconcileGameIdentityOnBoot as
    | ((sessionVerified: unknown, currentStudentId: unknown) => void)
    | undefined
  expect(typeof fn, 'reconcileGameIdentityOnBoot 必须是可用的真实函数（P0-4）').toBe('function')
  return fn!
}

/**
 * 宿主模块 URL 的测试替身：**身份部分走真实函数** `appendIdentityQueryParams`
 * （MoreView.appendModuleContextQuery 的注入点），其余按宿主既有语义补 from / runtime / rank_api。
 * 用于端到端模拟「宿主在无会话时打开模块」的最终 URL。
 */
const buildHostModuleSearch = async (options: {
  moduleId: string
  rawUrl: string
  profile: ModuleContextIdentityProfile
  rankApiBase?: string
}) => {
  const appendIdentityQueryParams = await requireAppendIdentityQueryParams()
  const url = new URL(options.rawUrl)
  url.searchParams.set('from', 'mini_hbut')
  url.searchParams.set('runtime', 'remote-site')
  appendIdentityQueryParams(url, options.profile)
  if (options.rankApiBase) url.searchParams.set('rank_api', options.rankApiBase)
  return url
}

/**
 * 端到端：宿主在「无会话 / 无身份」下打开模块 → Legacy 模板模块与 SDK 模块都不得解析出
 * 任何身份，也不得以任何身份提交（零提交请求、请求里绝不出现上一用户学号）。
 */
const expectNoIdentityModuleChain = async (runTag: string) => {
  // Legacy 模板模块（hbut_2048）
  const legacyParams = (
    await buildHostModuleSearch({
      moduleId: 'hbut_2048',
      rawUrl: GAME_URL,
      profile: readCachedPlayerProfile('', GAME_CENTER_GAME_IDS),
      rankApiBase: RANK_API_BASE
    })
  ).searchParams
  expect(legacyParams.has('student_id')).toBe(false)
  expect(legacyParams.has('player_name')).toBe(false)
  setSearch(`?${legacyParams.toString()}`)
  const context = hbut2048.readGameModuleContext()
  expect(context.studentId).toBe('')
  expect(context.playerName).toBe('')
  expect(hbut2048.canUseGameRank(context)).toBe(false)

  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await expect(
    hbut2048.submitGameRank(context, { runId: `run_${runTag}`, score: 100 })
  ).rejects.toThrow(/未注入学号/)
  expect(fetchMock).not.toHaveBeenCalled()

  // SDK 模块（hbut_stack）
  const sdkParams = (
    await buildHostModuleSearch({
      moduleId: 'hbut_stack',
      rawUrl: 'https://games.example/hbut_stack/index.html',
      profile: readCachedPlayerProfile('', GAME_CENTER_GAME_IDS),
      rankApiBase: RANK_API_BASE
    })
  ).searchParams
  expect(sdkParams.has('student_id')).toBe(false)
  expect(sdkParams.get('rank_api')).toBe(RANK_API_BASE)

  const router = createFetchRouter([])
  vi.stubGlobal('fetch', router.fetch)
  const game = await MiniHBUTGame.init({
    gameId: 'hbut_stack',
    adapter: HBUT_STACK_ADAPTER,
    params: sdkParams,
    timeouts: { welcome: 5 }
  })
  expect(game.mode).toBe('standalone')
  expect(game.capabilities).toMatchObject({ canSubmit: false, canSubmitLegacy: false })

  const run = game.startRun()
  const outcome = await run.finish({ score: 650, maxLevel: 5, durationMs: 20000, moveCount: 5, endedReason: 'lost' })
  expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })

  // 核心断言：没有任何提交类请求，且请求里绝不出现上一用户学号
  expect(router.callsFor(/\/submit|\/runs|\/finish/)).toHaveLength(0)
  expect(JSON.stringify(router.calls)).not.toContain(PREVIOUS_SID)
  game.dispose()
}

describe('P0-1 无会话（学号为空）不得读取/合并任何游戏上下文身份', () => {
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    storage = createStorage()
    vi.stubGlobal('localStorage', storage.api)
    setSearch('')
    seedPreviousUserIdentity()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('落盘有上一用户身份，但无会话 → readCachedPlayerProfile 返回空档案', () => {
    // 前置：落盘身份确实存在（复现 PRR#2 探针的初始条件）
    expect(storage.values.get('hbut_2048_rank_context_v1')).toContain(PREVIOUS_NAME)

    const profile = readCachedPlayerProfile('', GAME_CENTER_GAME_IDS)
    expect(profile).toEqual({ name: '', className: '', schoolName: '' })
    expect(JSON.stringify(profile)).not.toContain(PREVIOUS_NAME)
    expect(JSON.stringify(profile)).not.toContain(PREVIOUS_CLASS)
  })

  it('空白 / null / undefined 学号一律视为无会话（同样不得合并游戏上下文）', () => {
    for (const sid of ['', '   ', null, undefined]) {
      expect(readCachedPlayerProfile(sid, GAME_CENTER_GAME_IDS)).toEqual({
        name: '',
        className: '',
        schoolName: ''
      })
    }
  })

  it('有会话时仍按既有语义合并（回归护栏：修复不得扩大到登录态展示）', () => {
    const profile = readCachedPlayerProfile(PREVIOUS_SID, GAME_CENTER_GAME_IDS)
    expect(profile.name).toBe(PREVIOUS_NAME)
    expect(profile.className).toBe(PREVIOUS_CLASS)
  })
})

describe('P0-3 空身份不注入（appendIdentityQueryParams 非空才注入）', () => {
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    storage = createStorage()
    vi.stubGlobal('localStorage', storage.api)
    setSearch('')
    seedPreviousUserIdentity()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** 宿主 iframe URL：先有 from/runtime/rank_api，再由真实注入函数处理身份 */
  const hostUrl = async (profile: Record<string, unknown>) => {
    const appendIdentityQueryParams = await requireAppendIdentityQueryParams()
    const url = new URL(GAME_URL)
    url.searchParams.set('from', 'mini_hbut')
    url.searchParams.set('runtime', 'remote-site')
    url.searchParams.set('rank_api', RANK_API_BASE)
    const applied = appendIdentityQueryParams(url, profile)
    return { url, applied }
  }

  it('无会话档案（readCachedPlayerProfile("")）→ URL 不含任何身份参数', async () => {
    const profile = readCachedPlayerProfile('', GAME_CENTER_GAME_IDS)
    const { url, applied } = await hostUrl({
      student_id: '',
      name: profile.name,
      class_name: profile.className,
      major: '',
      school_name: profile.schoolName
    })

    expect(applied).toEqual([])
    for (const key of ['student_id', 'player_name', 'class_name', 'major', 'school_name']) {
      expect(url.searchParams.has(key), `空身份不得注入 ${key}`).toBe(false)
    }
    // 非身份参数仍照常注入（零破坏）
    expect(url.searchParams.get('from')).toBe('mini_hbut')
    expect(url.searchParams.get('runtime')).toBe('remote-site')
    expect(url.searchParams.get('rank_api')).toBe(RANK_API_BASE)
  })

  it('部分字段为空 → 只注入非空字段；绝不携带上一用户残值', async () => {
    const { url, applied } = await hostUrl({ student_id: CURRENT_SID, name: '', class_name: '', major: '' })
    expect(applied).toEqual(['student_id'])
    expect(url.searchParams.get('student_id')).toBe(CURRENT_SID)
    expect(url.searchParams.has('player_name')).toBe(false)
    expect(url.searchParams.has('class_name')).toBe(false)
    expect(url.searchParams.has('major')).toBe(false)
    expect(url.searchParams.has('school_name')).toBe(false)
    expect(url.toString()).not.toContain(PREVIOUS_NAME)
  })

  it('登录态下身份字段照常注入（回归护栏：收紧空值不影响正常展示链路）', async () => {
    localStorage.setItem(
      `${PROFILE_STORAGE_PREFIX}${CURRENT_SID}`,
      JSON.stringify({ name: '当前用户', class_name: '电气2402', school_name: '湖北工业大学' })
    )
    const profile = readCachedPlayerProfile(CURRENT_SID, GAME_CENTER_GAME_IDS)
    const { url, applied } = await hostUrl({
      student_id: CURRENT_SID,
      name: profile.name,
      class_name: profile.className,
      major: '电气工程',
      school_name: profile.schoolName
    })
    expect(applied).toEqual(['student_id', 'player_name', 'class_name', 'major', 'school_name'])
    expect(url.searchParams.get('student_id')).toBe(CURRENT_SID)
    expect(url.searchParams.get('player_name')).toBe('当前用户')
    expect(url.searchParams.get('class_name')).toBe('电气2402')
  })
})

describe('P0-2 登出 / 会话失效 / 换号时清理游戏落盘身份', () => {
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    storage = createStorage()
    vi.stubGlobal('localStorage', storage.api)
    setSearch('')
    seedPreviousUserIdentity()
    // 无关键（必须保留）：会话、账号标记、其他用户的档案、其他游戏的本地偏好、教务缓存
    localStorage.setItem('hbu_username', PREVIOUS_SID)
    localStorage.setItem('hbu_session_cookies', 'cookie-blob')
    localStorage.setItem(`${PROFILE_STORAGE_PREFIX}${CURRENT_SID}`, JSON.stringify({ name: '另一位用户' }))
    localStorage.setItem('hbut_2048_muted', 'true')
    localStorage.setItem('_rank_context_v1', 'short-key-not-a-context')
    localStorage.setItem(`cache:grades:${PREVIOUS_SID}`, JSON.stringify({ data: [], timestamp: 1 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const expectGameIdentityCleared = () => {
    for (const gameId of GAME_CENTER_GAME_IDS) {
      expect(storage.values.has(`${gameId}_rank_context_v1`), `${gameId}_rank_context_v1 必须被清`).toBe(false)
    }
    expect(storage.values.has('hbut_game_rank_context_v1')).toBe(false)
    expect(storage.values.has(`${PROFILE_STORAGE_PREFIX}${PREVIOUS_SID}`)).toBe(false)
  }

  const expectUnrelatedKeysKept = () => {
    expect(storage.values.get('hbu_username')).toBe(PREVIOUS_SID)
    expect(storage.values.get('hbu_session_cookies')).toBe('cookie-blob')
    expect(storage.values.get(`${PROFILE_STORAGE_PREFIX}${CURRENT_SID}`)).toContain('另一位用户')
    expect(storage.values.get('hbut_2048_muted')).toBe('true')
    expect(storage.values.get('_rank_context_v1')).toBe('short-key-not-a-context')
  }

  it('clearGameIdentityCaches：清理游戏上下文与当前用户档案，无关键保留', async () => {
    const clearGameIdentityCaches = await requireClearGameIdentityCaches()
    clearGameIdentityCaches(PREVIOUS_SID)

    expectGameIdentityCleared()
    expectUnrelatedKeysKept()
    // 只清游戏身份：教务缓存不归这个函数管
    expect(storage.values.has(`cache:grades:${PREVIOUS_SID}`)).toBe(true)
  })

  it('clearUserScopedCaches（手动登出既有入口）同样清理游戏身份，且广播不增加', async () => {
    const api = await loadApiModule()
    api.clearUserScopedCaches(PREVIOUS_SID)

    expectGameIdentityCleared()
    expectUnrelatedKeysKept()
    expect(storage.values.has(`cache:grades:${PREVIOUS_SID}`)).toBe(false)

    const broadcastWrites = storage.setItem.mock.calls.filter(
      ([key]) => key === 'hbu_cache_invalidation_broadcast'
    )
    expect(broadcastWrites.length).toBe(1)
  })

  it('学号未知（空）时仍清理设备级游戏上下文，但不误删任何用户档案', async () => {
    const clearGameIdentityCaches = await requireClearGameIdentityCaches()
    clearGameIdentityCaches('')

    for (const gameId of GAME_CENTER_GAME_IDS) {
      expect(storage.values.has(`${gameId}_rank_context_v1`)).toBe(false)
    }
    expect(storage.values.has('hbut_game_rank_context_v1')).toBe(false)
    expect(storage.values.has(`${PROFILE_STORAGE_PREFIX}${PREVIOUS_SID}`)).toBe(true)
    expect(storage.values.has(`${PROFILE_STORAGE_PREFIX}${CURRENT_SID}`)).toBe(true)
  })
})

describe('P0 端到端：登出清理 + 无会话打开模块 → 不会得到上一用户学号', () => {
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    storage = createStorage()
    vi.stubGlobal('localStorage', storage.api)
    setSearch('')
    seedPreviousUserIdentity()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('Legacy 模板模块（hbut_2048）：登出清理后无会话 → 学号为空、不可提交、零请求', async () => {
    // 1) 漏洞前置：落盘身份确实会被模块读到（PRR#2 探针的第一条证据）
    setSearch('')
    expect(hbut2048.readGameModuleContext().studentId).toBe(PREVIOUS_SID)

    // 2) 登出 / 会话失效：清理游戏落盘身份
    const clearGameIdentityCaches = await requireClearGameIdentityCaches()
    clearGameIdentityCaches(PREVIOUS_SID)

    // 3) 宿主按「无会话」档案构造模块 URL（身份非空才注入）→ URL 层面零身份
    const parsed = await buildHostModuleSearch({
      moduleId: 'hbut_2048',
      rawUrl: GAME_URL,
      profile: readCachedPlayerProfile('', GAME_CENTER_GAME_IDS),
      rankApiBase: RANK_API_BASE
    })
    expect(parsed.searchParams.has('student_id')).toBe(false)
    expect(parsed.searchParams.has('player_name')).toBe(false)
    expect(parsed.toString()).not.toContain(PREVIOUS_SID)
    expect(parsed.toString()).not.toContain(PREVIOUS_NAME)

    // 4) 模块侧解析：Legacy 模板模块 + SDK 模块都拿不到上一用户身份、都不提交
    await expectNoIdentityModuleChain('p0_1')
  })

  it('SDK 模块（hbut_stack）：登出清理后无会话 → standalone，零提交、绝不上报上一用户学号', async () => {
    const clearGameIdentityCaches = await requireClearGameIdentityCaches()
    clearGameIdentityCaches(PREVIOUS_SID)

    const params = (
      await buildHostModuleSearch({
        moduleId: 'hbut_stack',
        rawUrl: 'https://games.example/hbut_stack/index.html',
        profile: readCachedPlayerProfile('', GAME_CENTER_GAME_IDS),
        rankApiBase: RANK_API_BASE
      })
    ).searchParams
    expect(params.has('student_id')).toBe(false)
    expect(params.get('rank_api')).toBe(RANK_API_BASE)

    await expectNoIdentityModuleChain('p0_2')
  })

  it('游乐场展示面：登出清理后无会话读到空档案（不再展示上一用户昵称 / 班级）', async () => {
    const clearGameIdentityCaches = await requireClearGameIdentityCaches()
    clearGameIdentityCaches(PREVIOUS_SID)

    const profile = readCachedPlayerProfile('', GAME_CENTER_GAME_IDS)
    expect(profile.name).toBe('')
    expect(profile.className).toBe('')
  })
})

describe('P0-4 启动期收口：异常终止（强杀/崩溃）后的残留通道', () => {
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    storage = createStorage()
    vi.stubGlobal('localStorage', storage.api)
    setSearch('')
    seedPreviousUserIdentity()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('无会话且无身份冷启动（不经过任何登出入口）→ 设备级游戏身份被清、模块链路零身份零提交', async () => {
    const reconcileGameIdentityOnBoot = await requireReconcileGameIdentityOnBoot()

    // 前置：强杀 / 崩溃后设备级上下文与档案仍在（这正是残留通道的初始条件）
    expect(storage.values.get('hbut_2048_rank_context_v1')).toContain(PREVIOUS_NAME)
    expect(storage.values.has(`${PROFILE_STORAGE_PREFIX}${PREVIOUS_SID}`)).toBe(true)

    // 冷启动收口：未确认可用会话 + 当前无身份
    reconcileGameIdentityOnBoot(false, '')

    for (const gameId of GAME_CENTER_GAME_IDS) {
      expect(storage.values.has(`${gameId}_rank_context_v1`), `${gameId}_rank_context_v1 必须被清`).toBe(false)
    }
    expect(storage.values.has('hbut_game_rank_context_v1')).toBe(false)
    // 无 sid 时不动任何档案键（档案键按 sid 归属，永不跨用户读取）
    expect(storage.values.has(`${PROFILE_STORAGE_PREFIX}${PREVIOUS_SID}`)).toBe(true)

    await expectNoIdentityModuleChain('p0_4')
  })

  it('有会话冷启动 → 落盘上下文不被清理，展示与注入语义不变（回归护栏）', async () => {
    const reconcileGameIdentityOnBoot = await requireReconcileGameIdentityOnBoot()
    reconcileGameIdentityOnBoot(true, PREVIOUS_SID)

    for (const gameId of GAME_CENTER_GAME_IDS) {
      expect(storage.values.has(`${gameId}_rank_context_v1`), `${gameId}_rank_context_v1 不得被清`).toBe(true)
    }
    expect(storage.values.has(`${PROFILE_STORAGE_PREFIX}${PREVIOUS_SID}`)).toBe(true)

    // 展示语义不变
    const profile = readCachedPlayerProfile(PREVIOUS_SID, GAME_CENTER_GAME_IDS)
    expect(profile.name).toBe(PREVIOUS_NAME)
    expect(profile.className).toBe(PREVIOUS_CLASS)

    // 注入语义不变
    const appendIdentityQueryParams = await requireAppendIdentityQueryParams()
    const url = new URL(GAME_URL)
    const applied = appendIdentityQueryParams(url, {
      student_id: PREVIOUS_SID,
      name: profile.name,
      class_name: profile.className,
      school_name: profile.schoolName
    })
    expect(applied).toContain('student_id')
    expect(url.searchParams.get('student_id')).toBe(PREVIOUS_SID)
    expect(url.searchParams.get('player_name')).toBe(PREVIOUS_NAME)
  })

  it('无会话但保留缓存身份（#355 离线态）→ 零动作（不误伤进行中的会话恢复）', async () => {
    const reconcileGameIdentityOnBoot = await requireReconcileGameIdentityOnBoot()
    reconcileGameIdentityOnBoot(false, PREVIOUS_SID)

    for (const gameId of GAME_CENTER_GAME_IDS) {
      expect(storage.values.has(`${gameId}_rank_context_v1`)).toBe(true)
    }
    expect(storage.values.has(`${PROFILE_STORAGE_PREFIX}${PREVIOUS_SID}`)).toBe(true)
  })

  it('幂等：同一冷启动收口连续执行两次 → 第二次零删除、零写入', async () => {
    const reconcileGameIdentityOnBoot = await requireReconcileGameIdentityOnBoot()
    reconcileGameIdentityOnBoot(false, '')

    const removeCalls = storage.removeItem.mock.calls.length
    const setCalls = storage.setItem.mock.calls.length
    expect(removeCalls).toBeGreaterThan(0)

    reconcileGameIdentityOnBoot(false, '')
    expect(storage.removeItem.mock.calls.length).toBe(removeCalls)
    expect(storage.setItem.mock.calls.length).toBe(setCalls)
  })

  it('接线契约：启动会话恢复收口（.finally）按「是否确认会话」调用收口函数', () => {
    const src = readFileSync(new URL('../app/useAppRuntime.ts', import.meta.url), 'utf8')

    expect(src).toContain('sessionRestoreVerified = restored || relogged')
    expect(src).toContain('reconcileGameIdentityOnBoot(sessionRestoreVerified, state.studentId.value)')
    expect(src).toContain('.finally(')
  })
})
