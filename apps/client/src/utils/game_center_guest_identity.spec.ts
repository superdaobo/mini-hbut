import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { MiniHBUTGame } from '../../../../website/modules-src/_sdk/src/index.js'
import * as hbut2048 from '../../../../website/modules-src/hbut_2048/project/src/utils/game_rank.js'
import { HBUT_STACK_ADAPTER } from '../../../../website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js'
import { GAME_CENTER_GAME_IDS } from './game_center/launch'
import {
  PROFILE_STORAGE_PREFIX,
  appendIdentityQueryParams,
  readCachedPlayerProfile
} from './game_center/profile'
import { useAuthStore } from '../stores/auth'
import { reconcileGameIdentityOnBoot } from './api.js'
import { createFetchRouter } from './_sdk_test_harness'

/**
 * 契约 D（第十轮 Phase 0）——身份收紧与游客态：**离线冷启无法确认当前用户 ⇒ 游客态**。
 *
 * 覆盖四条不可回退的约束：
 * 1. 「会话已确认」（`stores/auth.sessionVerified`）是游戏身份的**单一事实源**；
 *    `studentId` 非空 **≠** 会话已确认（#355 的离线缓存身份不得用于游戏身份）；
 * 2. 游客态展示：`readCachedPlayerProfile` 一律空档案，不展示上一用户姓名 / 班级；
 * 3. 游客态注入：`appendIdentityQueryParams` 一律零注入（即使 profile 带缓存学号）；
 * 4. 游客态端到端：Legacy 模板模块（hbut_2048）与 SDK 模块（hbut_stack）在
 *    「落盘上一用户身份 + 会话未确认」下 → 学号为空、判定不可提交、**零 fetch**；
 *    同时本地游玩不受阻（模块可打开、SDK 本地结算成功）。
 *
 * 写法说明：全部用**真实函数**驱动（不做行为替身）——读取面 / 注入面用 profile.ts，
 * 启动收口用 api.ts，模块链路用 website/modules-src 的真实源码；仅接线护栏用源码文本断言
 * （与 `game_center_p0_identity.spec.ts` / `game_center_wiring_contract.spec.ts` 同风格）。
 */

const PREVIOUS_SID = '20240001'
const PREVIOUS_NAME = '上一位用户'
const PREVIOUS_CLASS = '电气2401'
const RANK_API_BASE = 'https://rank.example/api/game-rank'
const GAME_URL = 'https://games.example/hbut_2048/index.html'

/** URL 中的身份参数（契约 D：会话未确认时一个都不允许出现） */
const IDENTITY_PARAM_KEYS = ['student_id', 'player_name', 'class_name', 'major', 'school_name'] as const

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
  localStorage.setItem(
    `${PROFILE_STORAGE_PREFIX}${PREVIOUS_SID}`,
    JSON.stringify({ student_id: PREVIOUS_SID, name: PREVIOUS_NAME, class_name: PREVIOUS_CLASS })
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

/** 宿主模块 URL 的真实构造：身份部分走真实函数 appendIdentityQueryParams */
const buildHostModuleUrl = (rawUrl: string, profile: Record<string, unknown>, sessionVerified: boolean) => {
  const url = new URL(rawUrl)
  url.searchParams.set('from', 'mini_hbut')
  url.searchParams.set('runtime', 'remote-site')
  url.searchParams.set('rank_api', RANK_API_BASE)
  const applied = appendIdentityQueryParams(url, profile, sessionVerified)
  return { url, applied }
}

const expectNoIdentityParams = (url: URL) => {
  for (const key of IDENTITY_PARAM_KEYS) {
    expect(url.searchParams.has(key), `会话未确认时 URL 不得出现身份参数 ${key}`).toBe(false)
  }
  expect(url.toString()).not.toContain(PREVIOUS_SID)
}

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('契约 D-0 单一事实源：会话已确认（sessionVerified）与 studentId 的区别', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('studentId 非空 ≠ 会话已确认：离线冷启（cached_offline）等相位一律未确认', () => {
    const store = useAuthStore()
    store.hydrate({ studentId: PREVIOUS_SID })
    store.onlineSessionState = 'cached_offline'

    // #355 的离线缓存身份：本地展示语义（isLoggedIn）仍为 true，但会话未确认
    expect(store.studentId).toBe(PREVIOUS_SID)
    expect(store.isLoggedIn).toBe(true)
    expect(store.sessionVerified).toBe(false)
    expect(store.verifiedStudentId).toBe('')

    for (const state of ['unknown', 'recovering', 'needs_login'] as const) {
      store.onlineSessionState = state
      expect(store.sessionVerified, `onlineSessionState=${state} 不得视为已确认`).toBe(false)
      expect(store.verifiedStudentId).toBe('')
    }
  })

  it('会话真正建立（online）→ 确认；登出清会话 → 回到未确认且游戏身份学号为空', () => {
    const store = useAuthStore()
    store.hydrate({ studentId: PREVIOUS_SID })

    store.onlineSessionState = 'online'
    expect(store.sessionVerified).toBe(true)
    expect(store.verifiedStudentId).toBe(PREVIOUS_SID)

    store.clearSession()
    expect(store.onlineSessionState).toBe('unknown')
    expect(store.sessionVerified).toBe(false)
    expect(store.verifiedStudentId).toBe('')
  })
})

describe('契约 D-1 游客态展示：不展示上一用户姓名 / 班级', () => {
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

  it('会话未确认（离线冷启）→ 读取面一律空档案（即使缓存里有上一用户身份）', () => {
    // 前置：落盘身份确实存在（真实存在，才有泄漏风险）
    expect(storage.values.get('hbut_2048_rank_context_v1')).toContain(PREVIOUS_NAME)

    const profile = readCachedPlayerProfile(PREVIOUS_SID, GAME_CENTER_GAME_IDS, false)
    expect(profile).toEqual({ name: '', className: '', schoolName: '' })
    expect(JSON.stringify(profile)).not.toContain(PREVIOUS_NAME)
    expect(JSON.stringify(profile)).not.toContain(PREVIOUS_CLASS)
    expect(JSON.stringify(profile)).not.toContain(PREVIOUS_SID)
  })

  it('默认参数 fail-closed：调用方未显式传入会话确认时必须按游客态处理', () => {
    expect(readCachedPlayerProfile(PREVIOUS_SID, GAME_CENTER_GAME_IDS)).toEqual({
      name: '',
      className: '',
      schoolName: ''
    })
  })

  it('会话已确认（在线）→ 展示与 #948 逐字不变（回归护栏：不得误伤在线用户）', () => {
    const profile = readCachedPlayerProfile(PREVIOUS_SID, GAME_CENTER_GAME_IDS, true)
    expect(profile).toEqual({ name: PREVIOUS_NAME, className: PREVIOUS_CLASS, schoolName: '湖北工业大学' })
  })

  it('会话已确认但换号 → 归属校验仍生效（#948 语义保留）', () => {
    const profile = readCachedPlayerProfile('20240002', GAME_CENTER_GAME_IDS, true)
    expect(profile).toEqual({ name: '', className: '', schoolName: '' })
  })
})

describe('契约 D-2 游客态注入：模块 URL 零身份参数', () => {
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

  it('会话未确认 → 即使宿主档案非空（缓存学号 / 姓名 / 班级）也不得注入任何身份参数', () => {
    const cachedProfile = {
      student_id: PREVIOUS_SID,
      name: PREVIOUS_NAME,
      class_name: PREVIOUS_CLASS,
      major: '电气工程',
      school_name: '湖北工业大学'
    }
    const { url, applied } = buildHostModuleUrl(GAME_URL, cachedProfile, false)

    expect(applied).toEqual([])
    expectNoIdentityParams(url)
    // 非身份参数照常注入（零破坏：模块仍能识别宿主与环境）
    expect(url.searchParams.get('from')).toBe('mini_hbut')
    expect(url.searchParams.get('runtime')).toBe('remote-site')
    expect(url.searchParams.get('rank_api')).toBe(RANK_API_BASE)
  })

  it('默认参数 fail-closed：未显式传入会话确认时不注入身份', () => {
    const url = new URL(GAME_URL)
    const applied = appendIdentityQueryParams(url, { student_id: PREVIOUS_SID })
    expect(applied).toEqual([])
    expect(url.searchParams.has('student_id')).toBe(false)
  })

  it('会话已确认 → 注入逐字不变（全字段 + 非空才注入，回归护栏）', () => {
    const cachedProfile = {
      student_id: PREVIOUS_SID,
      name: PREVIOUS_NAME,
      class_name: PREVIOUS_CLASS,
      major: '电气工程',
      school_name: '湖北工业大学'
    }
    const { url, applied } = buildHostModuleUrl(GAME_URL, cachedProfile, true)
    expect(applied).toEqual(['student_id', 'player_name', 'class_name', 'major', 'school_name'])
    expect(url.searchParams.get('student_id')).toBe(PREVIOUS_SID)
    expect(url.searchParams.get('player_name')).toBe(PREVIOUS_NAME)
    expect(url.searchParams.get('class_name')).toBe(PREVIOUS_CLASS)
  })
})

describe('契约 D-3 游客态端到端：离线冷启打开游戏 → 学号空、不可提交、零 fetch', () => {
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

  it('落盘上一用户身份 + 会话未确认 → 收口清理 + 零注入 → Legacy/SDK 全链零身份零提交', async () => {
    // 1) 启动收口（真实接线：会话未确认 ⇒ 按「无身份」交给收口）→ 设备级键被清，
    //    模块自身的 localStorage 回落通道被斩断（否则模块会读到上一用户学号）。
    reconcileGameIdentityOnBoot(false, '')
    for (const gameId of GAME_CENTER_GAME_IDS) {
      expect(storage.values.has(`${gameId}_rank_context_v1`), `${gameId}_rank_context_v1 必须被清`).toBe(false)
    }
    // 档案键按 sid 归属，不随无身份收口删除（#948 语义保留）
    expect(storage.values.has(`${PROFILE_STORAGE_PREFIX}${PREVIOUS_SID}`)).toBe(true)

    // 2) 宿主构造模块 URL：展示面读取产物（空档案）与注入面都不得携带上一用户身份。
    //    这里故意传入「非空缓存档案」，验证注入面自身也 fail-closed（双层防御）。
    const cachedProfile = {
      student_id: PREVIOUS_SID,
      name: PREVIOUS_NAME,
      class_name: PREVIOUS_CLASS,
      major: '电气工程',
      school_name: '湖北工业大学'
    }
    const legacy = buildHostModuleUrl(GAME_URL, cachedProfile, false)
    expect(legacy.applied).toEqual([])
    expectNoIdentityParams(legacy.url)
    expect(readCachedPlayerProfile(PREVIOUS_SID, GAME_CENTER_GAME_IDS, false)).toEqual({
      name: '',
      className: '',
      schoolName: ''
    })

    // 3) Legacy 模板模块真实解析链：学号空 → 判定不可提交 → 零 fetch
    setSearch(`?${legacy.url.searchParams.toString()}`)
    const context = hbut2048.readGameModuleContext()
    expect(context.studentId).toBe('')
    expect(context.playerName).toBe('')
    expect(hbut2048.canUseGameRank(context)).toBe(false)

    const legacyFetch = vi.fn()
    vi.stubGlobal('fetch', legacyFetch)
    await expect(
      hbut2048.submitGameRank(context, { runId: 'run_guest', score: 100 })
    ).rejects.toThrow(/未注入学号/)
    expect(legacyFetch).not.toHaveBeenCalled()

    // 本地游玩不受阻：上下文读取不抛错、身份为空但模块上下文完整（模块可继续本地玩法）
    expect(context.gameId).toBe('hbut_2048')
    expect(context.rankApiBase).toContain('rank.example')

    // 4) SDK 模块（hbut_stack）：standalone、不可提交、本地结算成功、零提交请求
    const sdk = buildHostModuleUrl('https://games.example/hbut_stack/index.html', cachedProfile, false)
    expectNoIdentityParams(sdk.url)
    expect(sdk.url.searchParams.get('rank_api')).toBe(RANK_API_BASE)

    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params: sdk.url.searchParams,
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('standalone')
    expect(game.capabilities).toMatchObject({ canSubmit: false, canSubmitLegacy: false })

    const run = game.startRun()
    const outcome = await run.finish({
      score: 650,
      maxLevel: 5,
      durationMs: 20000,
      moveCount: 5,
      endedReason: 'lost'
    })
    expect(outcome).toMatchObject({ success: true, uploaded: false, mode: 'standalone', trustLevel: null })

    expect(router.callsFor(/\/submit|\/runs|\/finish/)).toHaveLength(0)
    expect(JSON.stringify(router.calls)).not.toContain(PREVIOUS_SID)
    game.dispose()
  })

  it('宿主打开模块前（会话未确认）按启动收口清理：模块回落读取也拿不到任何学号', () => {
    // 模拟 MoreView.handleOpenRemoteModule 的防御（接线由 D-5 的源码护栏锁定）：
    // 打开模块前按启动收口同一路径清理，覆盖「会话恢复链仍在飞、收口未跑」的窗口。
    reconcileGameIdentityOnBoot(false, '')
    for (const gameId of GAME_CENTER_GAME_IDS) {
      expect(storage.values.has(`${gameId}_rank_context_v1`)).toBe(false)
    }

    setSearch('')
    expect(hbut2048.readGameModuleContext().studentId).toBe('')
  })
})

describe('契约 D-4 在线不误伤：会话已确认 → 展示 / 注入 / 提交流程逐字不变', () => {
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

  it('Legacy 模板模块：会话已确认 + 身份注入 → 照常可提交（fetch 携带学号）', async () => {
    const profile = readCachedPlayerProfile(PREVIOUS_SID, GAME_CENTER_GAME_IDS, true)
    const { url, applied } = buildHostModuleUrl(
      GAME_URL,
      {
        student_id: PREVIOUS_SID,
        name: profile.name,
        class_name: profile.className,
        major: '电气工程',
        school_name: profile.schoolName
      },
      true
    )
    expect(applied).toEqual(['student_id', 'player_name', 'class_name', 'major', 'school_name'])

    setSearch(`?${url.searchParams.toString()}`)
    const context = hbut2048.readGameModuleContext()
    expect(context.studentId).toBe(PREVIOUS_SID)
    expect(hbut2048.canUseGameRank(context)).toBe(true)

    Object.defineProperty(globalThis, 'navigator', {
      value: { platform: 'Win32', userAgent: 'test' },
      configurable: true
    })
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await hbut2048.submitGameRank(context, { runId: 'run_online', score: 100 })
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.student_id).toBe(PREVIOUS_SID)
    expect(body.player_name).toBe(PREVIOUS_NAME)
  })

  it('SDK 模块：会话已确认 + 注入身份 → compatibility（经典榜提交路径保留）', async () => {
    const router = createFetchRouter([])
    vi.stubGlobal('fetch', router.fetch)
    const params = new URLSearchParams({
      student_id: PREVIOUS_SID,
      player_name: PREVIOUS_NAME,
      class_name: PREVIOUS_CLASS,
      rank_api: RANK_API_BASE
    })
    const game = await MiniHBUTGame.init({
      gameId: 'hbut_stack',
      adapter: HBUT_STACK_ADAPTER,
      params,
      timeouts: { welcome: 5 }
    })
    expect(game.mode).toBe('compatibility')
    expect(game.capabilities).toMatchObject({ canSubmitLegacy: true })
    expect(router.calls).toHaveLength(0)
    game.dispose()
  })
})

describe('契约 D-5 接线护栏：游戏侧只从单一事实源读取「会话已确认」', () => {
  it('stores/auth.ts：sessionVerified / verifiedStudentId 是唯一事实源（与 studentId 明确区分）', () => {
    const src = readSource('../stores/auth.ts')
    expect(src).toContain("const sessionVerified = computed(() => onlineSessionState.value === 'online')")
    expect(src).toContain('const verifiedStudentId = computed(() => (sessionVerified.value ? studentId.value :')
    expect(src).toContain('sessionVerified,')
    expect(src).toContain('verifiedStudentId,')
  })

  it('GameCenterView.vue：展示面把 sessionVerified 传给读取面（不得用 studentId 代替）', () => {
    const src = readSource('../components/GameCenterView.vue')
    expect(src).toMatch(/const sessionVerified = computed\(\(\) => authStore\.sessionVerified === true\)/)
    expect(src).toContain('readCachedPlayerProfile(props.studentId, GAME_CENTER_GAME_IDS, sessionVerified.value)')
  })

  it('MoreView.vue：注入面把 sessionVerified 传给 appendIdentityQueryParams，且打开模块前按收口清理', () => {
    const src = readSource('../components/MoreView.vue')
    expect(src).toMatch(/const sessionVerified = computed\(\(\) => authStore\.sessionVerified === true\)/)
    expect(src).toContain('appendIdentityQueryParams(url, profile, sessionVerified.value)')
    expect(src).toMatch(/if \(!sessionVerified\.value\) reconcileGameIdentityOnBoot\(false, ''\)/)
  })

  it('useAppRuntime.ts：启动收口只在会话确认时承认 state.studentId（缓存身份不得豁免清理）', () => {
    const src = readSource('../app/useAppRuntime.ts')
    expect(src).toContain("sessionRestoreVerified ? state.studentId.value : ''")
  })
})
