/**
 * #905 湖工游乐场 feature flags 契约测试。
 *
 * 覆盖：
 * - 八个开关的默认值（契约 A：游乐场 `game_center_enabled` **默认关闭**；
 *   未交付能力同样默认关闭，避免「可见但必然报错」）；
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
import { STATISTICS_SERVICE_BASE_URL } from './statistics_environment'

/** 复现「合规包 + guest/demo 会话」的收紧策略（与 app_store_policy 单测同构） */
const restrictedPolicy = () => {
  setAppStoreBuildOverrideForTests(true)
  return getFeaturePolicy({ isLoggedIn: false, isDemoSession: true })
}

afterEach(() => {
  setAppStoreBuildOverrideForTests(null)
})

describe('game center feature flags', () => {
  it('定义八个独立开关，且未交付能力默认关闭', () => {
    expect([...GAME_CENTER_FLAG_KEYS]).toEqual([
      'game_center_enabled',
      'game_verified_session_enabled',
      'game_economy_enabled',
      'drift_bottle_enabled',
      'classic_game_entries_visible',
      // W3 接线：三个新 key 追加在既有 5 个之后（顺序冻结，保证既有语义零漂移）
      'game_daily_tasks_enabled',
      'gomoku_competitive_enabled',
      'verified_reward_enabled'
    ])
    expect(DEFAULT_GAME_CENTER_FLAGS.game_center_enabled).toBe(false)
    expect(DEFAULT_GAME_CENTER_FLAGS.classic_game_entries_visible).toBe(true)
    // #909（经济 / 赛季）与 #910（漂流瓶）未交付 → 默认关闭
    expect(DEFAULT_GAME_CENTER_FLAGS.game_verified_session_enabled).toBe(false)
    expect(DEFAULT_GAME_CENTER_FLAGS.game_economy_enabled).toBe(false)
    expect(DEFAULT_GAME_CENTER_FLAGS.drift_bottle_enabled).toBe(false)
    // W3：每日任务 / 五子棋竞技 / 可信结算奖励同样 fail closed
    expect(DEFAULT_GAME_CENTER_FLAGS.game_daily_tasks_enabled).toBe(false)
    expect(DEFAULT_GAME_CENTER_FLAGS.gomoku_competitive_enabled).toBe(false)
    expect(DEFAULT_GAME_CENTER_FLAGS.verified_reward_enabled).toBe(false)
  })

  it('W3 三个新开关可由远程配置独立打开（与既有 flag 同一通道）', () => {
    const flags = resolveGameCenterFlags({
      game_platform: {
        flags: {
          game_daily_tasks_enabled: 'true',
          gomoku_competitive_enabled: 1,
          verified_reward_enabled: true
        }
      }
    })
    expect(flags.game_daily_tasks_enabled).toBe(true)
    expect(flags.gomoku_competitive_enabled).toBe(true)
    expect(flags.verified_reward_enabled).toBe(true)
    // 平铺写法同样收录（normalizeGamePlatformConfig 按 GAME_CENTER_FLAG_KEYS 遍历）
    const flat = resolveGameCenterFlags({
      game_platform: { game_daily_tasks_enabled: 'on', gomoku_competitive_enabled: 'yes' }
    })
    expect(flat.game_daily_tasks_enabled).toBe(true)
    expect(flat.gomoku_competitive_enabled).toBe(true)
    expect(flat.verified_reward_enabled).toBe(false)
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
    // W3 三个新开关同属 V2 能力面，块级回滚一并关闭
    expect(rolledBack.game_daily_tasks_enabled).toBe(false)
    expect(rolledBack.gomoku_competitive_enabled).toBe(false)
    expect(rolledBack.verified_reward_enabled).toBe(false)
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

  it('#1003：环境隔离取消后生产域被采纳为 override；已下线的测试域仍被拒', () => {
    // 2026-10-06 起所有构建档位统一走生产后端 → 主域与唯一兜底域都是「本环境域」，
    // 必须被采纳为显式 override（否则远程配置下发的 api_base 会被静默丢弃，
    // 而线上 remote_config 正是用 api_base 把游戏平台钉在兜底域上）
    const ownBases = [
      'https://mini.hbut.site/api/game-platform/v1',
      'https://mini-hbut-ocr-service.hf.space/api/game-platform/v1'
    ]
    for (const own of ownBases) {
      expect(resolveGameCenterFlags({ game_platform: { api_base: own } }).api_base).toBe(own)
    }
    // 已下线的测试域（Space 已 PAUSED）不得被采纳
    const retired = 'https://mini-hbut-testocr1.hf.space/api/game-platform/v1'
    expect(resolveGameCenterFlags({ game_platform: { api_base: retired } }).api_base).not.toBe(retired)
    // 环境默认源同样保留为显式 override
    const ownBase = `${STATISTICS_SERVICE_BASE_URL}/api/game-platform/v1`
    expect(resolveGameCenterFlags({ game_platform: { api_base: ownBase } }).api_base).toBe(ownBase)
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

  it('合规包 guest/demo 夹紧：游乐场、赛季、经济、UGC、经典入口与 W3 三个新开关全部关闭', () => {
    const flags = resolveGameCenterFlags({
      game_platform: {
        flags: {
          game_center_enabled: true,
          game_verified_session_enabled: true,
          game_economy_enabled: true,
          drift_bottle_enabled: true,
          classic_game_entries_visible: true,
          game_daily_tasks_enabled: true,
          gomoku_competitive_enabled: true,
          verified_reward_enabled: true
        }
      }
    })
    // 远程配置本身可以打开这些 flag（不做乐观默认），夹紧发生在策略层
    expect(flags.game_daily_tasks_enabled).toBe(true)
    expect(flags.gomoku_competitive_enabled).toBe(true)
    expect(flags.verified_reward_enabled).toBe(true)

    const clamped = applyGameCenterPolicyClamp(flags, restrictedPolicy())
    expect(clamped.game_center_enabled).toBe(false)
    expect(clamped.game_verified_session_enabled).toBe(false)
    expect(clamped.game_economy_enabled).toBe(false)
    expect(clamped.drift_bottle_enabled).toBe(false)
    expect(clamped.classic_game_entries_visible).toBe(false)
    expect(clamped.game_daily_tasks_enabled).toBe(false)
    expect(clamped.gomoku_competitive_enabled).toBe(false)
    expect(clamped.verified_reward_enabled).toBe(false)
  })

  it('非合规构建 / 真实登录（全功能策略）不夹紧', () => {
    const flags = resolveGameCenterFlags({ game_platform: { flags: { drift_bottle_enabled: true } } })
    const fullPolicy = getFeaturePolicy()
    const clamped = applyGameCenterPolicyClamp(flags, fullPolicy)
    expect(clamped).toEqual(flags)
    // 契约 A（第十轮 Phase 0）：无远程配置 = 无任何可用配置 → 游乐场默认关闭（安全姿态）。
    // 注意这不是夹紧的效果（全功能策略不夹紧），而是「默认值即最安全形态」的同步；
    // 开启由运维在配置仓显式下发 enabled=true + flags.game_center_enabled=true 完成。
    expect(resolveEffectiveGameCenterFlags(null, fullPolicy).game_center_enabled).toBe(false)
  })
})
