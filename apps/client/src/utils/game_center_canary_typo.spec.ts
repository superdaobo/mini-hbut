/**
 * #958 canary 配置手误防御 + #970 toFlagBoolean 非标量拒绝 —— 测试锁定。
 *
 * 背景（#958）：canary 配置由运维手写 JSON，三类手误会**静默失效**：
 * 1. `canary` 键名写错（`canaries` / `canary_percent` …）→ 归一化得 null →
 *    `no_canary` 语义 = 不做灰度，`enabled=true` 即**全量**（既有契约语义，测试锁定防止被误改）；
 *    防御 = 归一化时检测近邻拼写键，经 `GameCenterFlags.canary_typo_keys` 诊断字段暴露
 *    （项目禁 console，走数据字段；**只诊断、不参与判定**）。
 * 2. 通配尾点写错（`1.4.11-beta.*` 匹配不到裸 `1.4.11-beta`）→ 匹配语义测试在
 *    `game_center_canary.spec.ts`，文档口径修正见 `canary-release-control.md` §5/§10。
 * 3. `enabled` 缺省 = **true**（显式约定）→ 本文锁定该缺省值与文档一致。
 *
 * 背景（#970）：`toFlagBoolean` 旧实现 `String(['true'])` → `'true'` 会把数组误放行为 true，
 * 现收紧为「非标量（string / number / boolean 之外）一律回落 fallback」。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GAME_CENTER_FLAGS,
  detectSuspectedCanaryTypoKeys,
  normalizeGamePlatformConfig,
  toFlagBoolean
} from './game_center/base'
import { resolveGameCenterFlags } from './game_center/flags'

// resolveGamePlatformApiBase 依赖云同步运行时配置（模块顶层读取）：mock 掉 I/O，
// 与 game_center_service_origin.spec.ts 同一手法。
vi.mock('./cloud_sync.js', () => ({
  getCloudSyncRuntimeConfig: () => ({ proxyEndpoint: '' })
}))

describe('#958 canary 键名手误检测（detectSuspectedCanaryTypoKeys，纯诊断）', () => {
  it('canaries / canary_percent / canaryy / Canary 等近邻拼写 → 检出（原样返回键名）', () => {
    expect(detectSuspectedCanaryTypoKeys({ canaries: { percent: 1 } })).toEqual(['canaries'])
    expect(detectSuspectedCanaryTypoKeys({ canary_percent: 1 })).toEqual(['canary_percent'])
    expect(detectSuspectedCanaryTypoKeys({ canaryy: { percent: 1 } })).toEqual(['canaryy'])
    expect(detectSuspectedCanaryTypoKeys({ Canary: { percent: 1 } })).toEqual(['Canary'])
  })

  it('gray / grayscale 等灰度别名键 → 检出（运维语境常见写法）', () => {
    expect(detectSuspectedCanaryTypoKeys({ gray: { percent: 1 } })).toEqual(['gray'])
    expect(detectSuspectedCanaryTypoKeys({ grayscale: { percent: 1 } })).toEqual(['grayscale'])
  })

  it('已知键（canary 本身等）与普通无关键不误报', () => {
    expect(
      detectSuspectedCanaryTypoKeys({
        enabled: true,
        flags: {},
        canary: { percent: 1 },
        api_base: '',
        allowed_game_origins: [],
        unrelated_key: 1
      })
    ).toEqual([])
  })

  it('诊断字段自身（canary_typo_keys）永不自举误报（快照 round-trip 回归）', () => {
    // normalize 的输出含 canary_typo_keys 诊断字段；写快照 → 读回 → 二次 normalize 时
    // 该字段会作为输入键出现（以 canary 开头），必须排除，否则污染指纹与快照内容。
    const first = normalizeGamePlatformConfig({ enabled: true, canary: { percent: 5 } })
    expect(first.canary_typo_keys).toEqual([])
    const second = normalizeGamePlatformConfig({
      ...first,
      canary_typo_keys: ['canary_typo_keys']
    } as unknown as Record<string, unknown>)
    expect(second.canary_typo_keys).toEqual([])
    expect(detectSuspectedCanaryTypoKeys({ canary_typo_keys: [] })).toEqual([])
  })

  it('非对象输入（null / 数组 / 标量）→ 空数组', () => {
    expect(detectSuspectedCanaryTypoKeys(null)).toEqual([])
    expect(detectSuspectedCanaryTypoKeys([1, 2])).toEqual([])
    expect(detectSuspectedCanaryTypoKeys('canaries')).toEqual([])
    expect(detectSuspectedCanaryTypoKeys(undefined)).toEqual([])
  })
})

describe('#958 手误诊断端到端（normalize → flags 透传，判定语义不变）', () => {
  it('键名写错 → canary 归一为 null（等价 no_canary），typo 键暴露在归一结果上', () => {
    const normalized = normalizeGamePlatformConfig({
      enabled: true,
      flags: { game_center_enabled: true },
      canaries: { percent: 1 }
    })
    expect(normalized.canary).toBeNull()
    expect(normalized.canary_typo_keys).toEqual(['canaries'])
  })

  it('#958 验收锁定：canary 键缺失 = no_canary = 不做灰度（enabled=true 即全量纳入，防止被误改成「缺失 = 关」）', () => {
    const flags = resolveGameCenterFlags({
      game_platform: { enabled: true, flags: { game_center_enabled: true } }
    })
    expect(flags.game_center_enabled).toBe(true)
  })

  it('键名写错时判定语义不变：仍按 no_canary 全量纳入 + typo 诊断字段可见', () => {
    const flags = resolveGameCenterFlags({
      game_platform: {
        enabled: true,
        flags: { game_center_enabled: true },
        canaries: { percent: 1 }
      }
    })
    // 键写错的 canary 不参与判定：本意 1% 灰度，实际等价全量（既有语义）
    expect(flags.game_center_enabled).toBe(true)
    // 手误在诊断面可见（原样罗列键名），排障时能发现"以为配了灰度"
    expect(flags.canary_typo_keys).toEqual(['canaries'])
  })

  it('无手误时不设置 canary_typo_keys 字段（消费方按「未诊断出手误」处理）', () => {
    const flags = resolveGameCenterFlags({
      game_platform: { enabled: true, flags: { game_center_enabled: true } }
    })
    expect(flags.canary_typo_keys).toBeUndefined()
  })

  it('块缺失（远程无 game_platform）→ 无 typo 诊断、flag 落默认（默认关）', () => {
    expect(resolveGameCenterFlags(undefined).game_center_enabled).toBe(
      DEFAULT_GAME_CENTER_FLAGS.game_center_enabled
    )
    expect(normalizeGamePlatformConfig(undefined).canary_typo_keys).toEqual([])
  })
})

describe('#958 enabled 缺省语义（显式约定：缺省 = true，与文档口径一致）', () => {
  it('缺省 enabled → true（canary-release-control.md §10 与 base.ts 实现一致）', () => {
    expect(normalizeGamePlatformConfig({}).enabled).toBe(true)
    expect(normalizeGamePlatformConfig({ flags: {} }).enabled).toBe(true)
  })

  it('紧急关闭必须显式写 "enabled": false（只删 enabled 不会关闭）', () => {
    expect(normalizeGamePlatformConfig({ enabled: false }).enabled).toBe(false)
    // 只删 enabled、留 flags → 块仍开启（§10 表第 3 行的失效形态）
    const flags = resolveGameCenterFlags({
      game_platform: { flags: { game_center_enabled: true } }
    })
    expect(flags.game_center_enabled).toBe(true)
  })

  it("enabled 宽松标量字面量仍被解析（'false' / '0' / 0 → false；'true' / 1 → true）", () => {
    expect(normalizeGamePlatformConfig({ enabled: 'false' }).enabled).toBe(false)
    expect(normalizeGamePlatformConfig({ enabled: '0' }).enabled).toBe(false)
    expect(normalizeGamePlatformConfig({ enabled: 0 }).enabled).toBe(false)
    expect(normalizeGamePlatformConfig({ enabled: 'true' }).enabled).toBe(true)
    expect(normalizeGamePlatformConfig({ enabled: 1 }).enabled).toBe(true)
  })
})

describe('#970 toFlagBoolean 只接受标量（数组 / 对象不再被 String 化放行）', () => {
  it("数组 ['true'] → fallback（旧实现会返回 true，回归锁定）", () => {
    expect(toFlagBoolean(['true'], false)).toBe(false)
    expect(toFlagBoolean(['false'], true)).toBe(true)
    expect(toFlagBoolean(['1'], false)).toBe(false)
  })

  it('对象 / null / undefined / 数组对象 → 一律 fallback', () => {
    expect(toFlagBoolean({ value: 'true' }, false)).toBe(false)
    expect(toFlagBoolean({}, true)).toBe(true)
    expect(toFlagBoolean(null, false)).toBe(false)
    expect(toFlagBoolean(undefined, true)).toBe(true)
    expect(toFlagBoolean([true], false)).toBe(false)
  })

  it('标量路径不回归：boolean / number / string 字面量语义不变', () => {
    expect(toFlagBoolean(true, false)).toBe(true)
    expect(toFlagBoolean(false, true)).toBe(false)
    expect(toFlagBoolean(1, false)).toBe(true)
    expect(toFlagBoolean(0, true)).toBe(false)
    expect(toFlagBoolean('true', false)).toBe(true)
    expect(toFlagBoolean('OFF', true)).toBe(false)
    expect(toFlagBoolean('enabled', false)).toBe(true)
    expect(toFlagBoolean('garbage', false)).toBe(false)
  })

  it("端到端：flags 数组值不再被放行（game_center_enabled: ['true'] → 默认 false）", () => {
    const flags = resolveGameCenterFlags({
      game_platform: { enabled: true, flags: { game_center_enabled: ['true'] } }
    })
    // 旧实现 String(['true']) → 'true' 会放行为 true；现回落默认 false（fail closed）
    expect(flags.game_center_enabled).toBe(DEFAULT_GAME_CENTER_FLAGS.game_center_enabled)
  })
})
