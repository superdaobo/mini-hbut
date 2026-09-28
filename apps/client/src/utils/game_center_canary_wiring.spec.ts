/**
 * 契约 A：灰度（canary）在 flags 生效链路上的接线测试 + 默认关闭 + 包内兜底护栏。
 *
 * 覆盖：
 * - 默认关闭：无配置 / 拉取失败（null）/ 垃圾配置 → `game_center_enabled=false`；
 * - 显式开启链路仍可用（enabled + flags 显式 true）；
 * - canary 判定注入 flags：未纳入 ⇒ 坍缩所有 V2 子 flag + 清空 origin 白名单（复用块级关闭语义）；
 * - 夹紧（applyGameCenterPolicyClamp）前后「关就是关」，不会把关打开；
 * - 安装 id 惰性生成（白名单命中 / canary 缺省 / 非法时不写存储）；
 * - 默认 provider：版本取 `import.meta.env.VITE_APP_VERSION`、学号取 `hbu_username`（仅合法学号）；
 * - 包内兜底 `public/remote_config.json` 结构性护栏（不得把 game_platform 置为开启）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFeaturePolicy, setAppStoreBuildOverrideForTests } from '../config/app_store_policy'
import {
  DEFAULT_GAME_CENTER_FLAGS,
  resolveEffectiveGameCenterFlags,
  resolveGameCenterFlags
} from './game_center/flags'
import { GAME_PLATFORM_INSTALL_ID_KEY } from './game_center/install_id'
import { sha256Hex } from './game_center/canary'

const STUDENT = '2024000001'
const BETA_CLIENT = '1.4.12-beta.1'
const INSTALL_ID = sha256Hex('wiring-install-id').slice(0, 32)

/** 显式开启游乐场的远程块（块级 enabled + 子 flag；灰度由 canary 另行控制） */
const enabledBlock = (canary?: unknown) => ({
  game_platform: {
    enabled: true,
    flags: { game_center_enabled: true },
    allowed_game_origins: ['https://games.example'],
    ...(canary === undefined ? {} : { canary })
  }
})

/** 可控内存 localStorage（并把写入记下来，用于「惰性生成」断言） */
const installFakeStorage = () => {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    }
  })
  return map
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  setAppStoreBuildOverrideForTests(null)
  vi.restoreAllMocks()
})

describe('默认关闭（契约 A：无配置 → 关）', () => {
  it('默认值本身即关闭，且 classic_game_entries_visible 语义不受本轮影响', () => {
    expect(DEFAULT_GAME_CENTER_FLAGS.game_center_enabled).toBe(false)
    // 旧「更多」页 11 个经典入口的可见性语义与灰度无关，保持默认可见
    expect(DEFAULT_GAME_CENTER_FLAGS.classic_game_entries_visible).toBe(true)
  })

  it('无配置 / 拉取失败 / 垃圾配置 → game_center_enabled 一律 false', () => {
    const cases: unknown[] = [
      null,
      undefined,
      {},
      { game_platform: null },
      { game_platform: 'garbage' },
      { game_platform: [] },
      { game_platform: { enabled: 'yes-please' } },
      { game_platform: { flags: 'not-an-object' } },
      { game_platform: { flags: { game_center_enabled: 'maybe' } } },
      { game_platform: { canary: { percent: 100 } } }
    ]
    for (const config of cases) {
      expect(
        resolveGameCenterFlags(config as Record<string, unknown> | null).game_center_enabled,
        `config=${JSON.stringify(config)}`
      ).toBe(false)
    }
  })

  it('显式开启链路仍可用（enabled=true + flags.game_center_enabled=true）', () => {
    const flags = resolveGameCenterFlags(enabledBlock(), { appVersion: '', studentId: '', installId: '' })
    expect(flags.game_center_enabled).toBe(true)
    expect(flags.allowed_game_origins).toEqual(['https://games.example'])
  })
})

describe('灰度接线（未纳入 ⇒ 等价块级关闭，不新增开关链路）', () => {
  it('canary 缺省（不做灰度）→ 由 enabled / flags 决定', () => {
    expect(resolveGameCenterFlags(enabledBlock()).game_center_enabled).toBe(true)
    const off = resolveGameCenterFlags({ game_platform: { enabled: true, flags: {} } })
    expect(off.game_center_enabled).toBe(false)
  })

  it('canary 未纳入（分桶外）→ 坍缩所有 V2 子 flag、清空 origin 白名单，经典入口不受影响', () => {
    vi.stubGlobal('localStorage', undefined) // 分桶键不可得 → 一律排除
    const flags = resolveGameCenterFlags(enabledBlock({ percent: 5 }))
    expect(flags.game_center_enabled).toBe(false)
    expect(flags.game_verified_session_enabled).toBe(false)
    expect(flags.game_economy_enabled).toBe(false)
    expect(flags.drift_bottle_enabled).toBe(false)
    expect(flags.game_daily_tasks_enabled).toBe(false)
    expect(flags.gomoku_competitive_enabled).toBe(false)
    expect(flags.verified_reward_enabled).toBe(false)
    expect(flags.allowed_game_origins).toEqual([])
    // 经典入口可见性不被灰度误伤（与块级回滚同语义）
    expect(flags.classic_game_entries_visible).toBe(true)
  })

  it('canary allow_students 命中 → 纳入（percent=0 也纳入）', () => {
    const flags = resolveGameCenterFlags(enabledBlock({ percent: 0, allow_students: [STUDENT] }), {
      studentId: STUDENT,
      installId: ''
    })
    expect(flags.game_center_enabled).toBe(true)
    expect(flags.allowed_game_origins).toEqual(['https://games.example'])
  })

  it('canary installId 不可得（隐私模式 / 存储不可用）→ fail closed', () => {
    const flags = resolveGameCenterFlags(enabledBlock({ percent: 100 }), { installId: '' })
    expect(flags.game_center_enabled).toBe(false)
  })

  it('canary 非法（percent 越界 / 版本串非法）→ fail closed（不回落成全量）', () => {
    for (const canary of [
      { percent: 101 },
      { percent: -1 },
      { percent: '50' },
      { percent: 5, deny_versions: ['1.*.3'] },
      { percent: 5, allow_versions: [null] }
    ]) {
      const flags = resolveGameCenterFlags(enabledBlock(canary), { installId: INSTALL_ID })
      expect(flags.game_center_enabled, `canary=${JSON.stringify(canary)}`).toBe(false)
    }
  })

  it('canary 纳入（percent=100 + 有效安装 id）→ 打开', () => {
    const flags = resolveGameCenterFlags(enabledBlock({ percent: 100 }), {
      appVersion: BETA_CLIENT,
      studentId: STUDENT,
      installId: INSTALL_ID
    })
    expect(flags.game_center_enabled).toBe(true)
  })
})

describe('合规夹紧前后「关就是关」', () => {
  const restrictedPolicy = () => {
    setAppStoreBuildOverrideForTests(true)
    return getFeaturePolicy({ isLoggedIn: false, isDemoSession: true })
  }

  it('canary 排除 + 全功能策略 → 仍为关（夹紧不会打开）', () => {
    vi.stubGlobal('localStorage', undefined)
    const fullPolicy = getFeaturePolicy()
    const flags = resolveEffectiveGameCenterFlags(enabledBlock({ percent: 5 }), fullPolicy)
    expect(flags.game_center_enabled).toBe(false)
  })

  it('canary 纳入 + 合规 guest 策略 → 被夹紧为关（不意外打开）', () => {
    const flags = resolveEffectiveGameCenterFlags(enabledBlock({ percent: 100 }), restrictedPolicy(), {
      installId: INSTALL_ID
    })
    expect(flags.game_center_enabled).toBe(false)
    expect(flags.classic_game_entries_visible).toBe(false)
  })
})

describe('安装 id 惰性生成（只在需要分桶时写存储）', () => {
  it('canary 缺省 / 命中白名单 / canary 非法 → 不写入 hbu_game_install_id', () => {
    const map = installFakeStorage()
    resolveGameCenterFlags(enabledBlock())
    resolveGameCenterFlags(enabledBlock({ percent: 0, allow_students: [STUDENT] }), {
      studentId: STUDENT
    })
    resolveGameCenterFlags(enabledBlock({ percent: 101 }))
    expect(map.has(GAME_PLATFORM_INSTALL_ID_KEY)).toBe(false)
  })

  it('需要分桶时生成并持久化（同一存储二次解析复用同值）', () => {
    const map = installFakeStorage()
    resolveGameCenterFlags(enabledBlock({ percent: 5 }))
    const stored = map.get(GAME_PLATFORM_INSTALL_ID_KEY)
    expect(stored).toMatch(/^[0-9a-f]{32}$/)
    resolveGameCenterFlags(enabledBlock({ percent: 5 }))
    expect(map.get(GAME_PLATFORM_INSTALL_ID_KEY)).toBe(stored)
  })
})

describe('默认 provider（生产链路真实读取）', () => {
  it('版本白名单命中：默认读取 import.meta.env.VITE_APP_VERSION', () => {
    vi.stubEnv('VITE_APP_VERSION', BETA_CLIENT)
    const flags = resolveGameCenterFlags(enabledBlock({ percent: 0, allow_versions: ['1.4.12-beta.*'] }))
    expect(flags.game_center_enabled).toBe(true)
  })

  it('版本不命中（默认版本为空）→ 落回 percent=0 → 关', () => {
    const flags = resolveGameCenterFlags(enabledBlock({ percent: 0, allow_versions: ['1.4.12-beta.*'] }))
    expect(flags.game_center_enabled).toBe(false)
  })

  it('学号白名单命中：默认读取 hbu_username 且仅采纳合法学号', () => {
    const map = installFakeStorage()
    map.set('hbu_username', STUDENT)
    const hit = resolveGameCenterFlags(enabledBlock({ percent: 0, allow_students: [STUDENT] }))
    expect(hit.game_center_enabled).toBe(true)

    map.set('hbu_username', 'not-a-student-id')
    const miss = resolveGameCenterFlags(enabledBlock({ percent: 0, allow_students: [STUDENT] }))
    expect(miss.game_center_enabled).toBe(false)
  })

  it('deny_versions 通过默认版本命中 → 即使 allowed 版本也排除', () => {
    vi.stubEnv('VITE_APP_VERSION', BETA_CLIENT)
    const flags = resolveGameCenterFlags(
      enabledBlock({ percent: 100, deny_versions: ['1.4.12-beta.*'], allow_versions: ['1.4.12-beta.*'] })
    )
    expect(flags.game_center_enabled).toBe(false)
  })
})

describe('包内兜底护栏（public/remote_config.json 不得开启 game_platform）', () => {
  const readPackageConfig = () =>
    JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'public/remote_config.json'), 'utf8')
    ) as Record<string, unknown>

  it('包内 game_platform 块（若存在）不得把 enabled / flags.game_center_enabled 置为真', () => {
    const pkg = readPackageConfig()
    const block = pkg.game_platform
    if (block !== undefined) {
      expect(typeof block).toBe('object')
      const record = block as Record<string, unknown>
      const flags = record.flags && typeof record.flags === 'object' ? (record.flags as Record<string, unknown>) : {}
      expect(record.enabled).not.toBe(true)
      expect(flags.game_center_enabled).not.toBe(true)
      // 平铺写法同样不得为真
      expect(record.game_center_enabled).not.toBe(true)
    }
    // 端到端护栏：包内配置解析后游乐场必须为关（未来任何人改成默认开启都会在这里失败）
    const resolved = resolveGameCenterFlags(pkg)
    expect(resolved.game_center_enabled).toBe(false)
    expect(resolved.classic_game_entries_visible).toBe(true)
  })

  it('护栏本身可失败：在内存中模拟「包内配置被开启」必须使断言不成立', () => {
    // 用与上面完全相同的断言逻辑跑一个「被开启」的配置：必须抛错（证明护栏不是永真）
    const tampered = { game_platform: { enabled: true, flags: { game_center_enabled: true } } }
    expect(() => {
      const block = tampered.game_platform as Record<string, unknown>
      const flags = block.flags as Record<string, unknown>
      expect(block.enabled).not.toBe(true)
      expect(flags.game_center_enabled).not.toBe(true)
      expect(resolveGameCenterFlags(tampered).game_center_enabled).toBe(false)
    }).toThrow()
  })
})
