/**
 * #905 湖工游乐场 feature flags 契约测试。
 *
 * 覆盖：
 * - 五个开关的默认值（未交付能力必须默认关闭，避免「可见但必然报错」）；
 * - 远程配置独立关闭（无需发版即可回滚）；
 * - 合规包 guest/demo 的策略夹紧（与 app_store_policy 对齐）；
 * - API base / origin 白名单只能 HTTPS（loopback 例外），拒绝 '*' / 'null' / 明文。
 */
import { describe, expect, it, afterEach } from 'vitest'
import {
  DEFAULT_GAME_CENTER_FLAGS,
  GAME_CENTER_FLAG_KEYS,
  applyGameCenterPolicyClamp,
  isSecureGamePlatformUrl,
  normalizeGameOrigin,
  normalizeGamePlatformConfig,
  resolveEffectiveGameCenterFlags,
  resolveGameCenterFlags
} from './game_center/flags'
import { getFeaturePolicy, setAppStoreBuildOverrideForTests } from '../config/app_store_policy'

/** 复现「合规包 + guest/demo 会话」的收紧策略（与 app_store_policy 单测同构） */
const restrictedPolicy = () => {
  setAppStoreBuildOverrideForTests(true)
  return getFeaturePolicy({ isLoggedIn: false, isDemoSession: true })
}

afterEach(() => {
  setAppStoreBuildOverrideForTests(null)
})

describe('game center feature flags', () => {
  it('定义五个独立开关，且未交付能力默认关闭', () => {
    expect([...GAME_CENTER_FLAG_KEYS]).toEqual([
      'game_center_enabled',
      'game_verified_session_enabled',
      'game_economy_enabled',
      'drift_bottle_enabled',
      'classic_game_entries_visible'
    ])
    expect(DEFAULT_GAME_CENTER_FLAGS.game_center_enabled).toBe(true)
    expect(DEFAULT_GAME_CENTER_FLAGS.classic_game_entries_visible).toBe(true)
    // #909（经济 / 赛季）与 #910（漂流瓶）未交付 → 默认关闭
    expect(DEFAULT_GAME_CENTER_FLAGS.game_verified_session_enabled).toBe(false)
    expect(DEFAULT_GAME_CENTER_FLAGS.game_economy_enabled).toBe(false)
    expect(DEFAULT_GAME_CENTER_FLAGS.drift_bottle_enabled).toBe(false)
  })

  it('远程配置缺失时回落到默认值', () => {
    const flags = resolveGameCenterFlags(null)
    for (const key of GAME_CENTER_FLAG_KEYS) {
      expect(flags[key]).toBe(DEFAULT_GAME_CENTER_FLAGS[key])
    }
    expect(flags.allowed_game_origins).toEqual([])
  })

  it('支持逐个开关独立关闭（远程改值即生效，无需发版）', () => {
    const flags = resolveGameCenterFlags({
      game_platform: {
        flags: {
          game_center_enabled: false,
          classic_game_entries_visible: false,
          drift_bottle_enabled: true
        }
      }
    })
    expect(flags.game_center_enabled).toBe(false)
    expect(flags.classic_game_entries_visible).toBe(false)
    expect(flags.drift_bottle_enabled).toBe(true)
    // 未声明的开关保持默认
    expect(flags.game_economy_enabled).toBe(false)
  })

  it('支持 flags 平铺写法与 block 级总开关回滚', () => {
    const flat = resolveGameCenterFlags({
      game_platform: { game_center_enabled: 'false', game_economy_enabled: '1' }
    })
    expect(flat.game_center_enabled).toBe(false)
    expect(flat.game_economy_enabled).toBe(true)

    const rolledBack = resolveGameCenterFlags({
      game_platform: { enabled: false, allowed_game_origins: ['https://hbut.6661111.xyz'] }
    })
    expect(rolledBack.game_center_enabled).toBe(false)
    expect(rolledBack.game_verified_session_enabled).toBe(false)
    expect(rolledBack.game_economy_enabled).toBe(false)
    expect(rolledBack.drift_bottle_enabled).toBe(false)
    // 总开关关闭时不得接受自定义 origin 白名单
    expect(rolledBack.allowed_game_origins).toEqual([])
    // 经典入口可见性不被总开关误伤
    expect(rolledBack.classic_game_entries_visible).toBe(true)
  })

  it('API base 只接受 HTTPS / loopback，明文与非法值一律丢弃', () => {
    expect(isSecureGamePlatformUrl('https://example.com/api')).toBe(true)
    expect(isSecureGamePlatformUrl('http://127.0.0.1:8000/api')).toBe(true)
    expect(isSecureGamePlatformUrl('http://example.com/api')).toBe(false)
    expect(isSecureGamePlatformUrl('not-a-url')).toBe(false)

    expect(
      resolveGameCenterFlags({ game_platform: { api_base: 'http://evil.example.com/v1' } }).api_base
    ).not.toContain('evil.example.com')
    expect(
      resolveGameCenterFlags({ game_platform: { api_base: 'https://ok.example.com/v1/' } }).api_base
    ).toBe('https://ok.example.com/v1')
  })

  it('origin 白名单只接受可解析的 http(s) origin，拒绝 * 与 null', () => {
    expect(normalizeGameOrigin('*')).toBe('')
    expect(normalizeGameOrigin('null')).toBe('')
    expect(normalizeGameOrigin('javascript:alert(1)')).toBe('')
    expect(normalizeGameOrigin('https://hbut.6661111.xyz/site/index.html')).toBe(
      'https://hbut.6661111.xyz'
    )

    const block = normalizeGamePlatformConfig({
      allowed_game_origins: ['*', 'null', 'https://a.example.com/x', 'https://a.example.com/y']
    })
    expect(block.allowed_game_origins).toEqual(['https://a.example.com'])
  })

  it('合规包 guest/demo 夹紧：游乐场、赛季、经济、UGC、经典入口全部关闭', () => {
    const flags = resolveGameCenterFlags({
      game_platform: {
        flags: {
          game_center_enabled: true,
          game_verified_session_enabled: true,
          game_economy_enabled: true,
          drift_bottle_enabled: true,
          classic_game_entries_visible: true
        }
      }
    })
    const clamped = applyGameCenterPolicyClamp(flags, restrictedPolicy())
    expect(clamped.game_center_enabled).toBe(false)
    expect(clamped.game_verified_session_enabled).toBe(false)
    expect(clamped.game_economy_enabled).toBe(false)
    expect(clamped.drift_bottle_enabled).toBe(false)
    expect(clamped.classic_game_entries_visible).toBe(false)
  })

  it('非合规构建 / 真实登录（全功能策略）不夹紧', () => {
    const flags = resolveGameCenterFlags({ game_platform: { flags: { drift_bottle_enabled: true } } })
    const fullPolicy = getFeaturePolicy()
    const clamped = applyGameCenterPolicyClamp(flags, fullPolicy)
    expect(clamped).toEqual(flags)
    expect(resolveEffectiveGameCenterFlags(null, fullPolicy).game_center_enabled).toBe(true)
  })
})
