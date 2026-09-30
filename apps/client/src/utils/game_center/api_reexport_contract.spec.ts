/**
 * `api.ts` 域入口转接契约（#909 Integration 门禁）。
 *
 * 三个不可回退的约束：
 * 1. **转接导出存在且同一函数**：`points.ts` 的入口函数必须能从
 *    `utils/game_center/api.ts` 取到（「API 只经 api.ts」惯例），且与域文件里的
 *    是**同一个函数对象**（不是复制实现）；
 * 2. **既有导出零破坏**：转接导出不得挤掉任何既有导出（传输层、能力表、钱包 / 榜单端点）；
 * 3. **模块初始化顺序无关**：本文件**第一行 import 就是 `./api`**（最危险的求值顺序：
 *    api.ts 先求值 → api.ts ↔ points.ts 循环 → points.ts 顶层先于 api.ts 体执行）。
 *    这就是实测出问题的那条路径（`TypeError: Cannot access 'authMissing'`），
 *    因此把「跨层常量必须放在叶子模块」固化为回归门禁：
 *    `LOCAL_ERROR_CODES` 定义在 `base.ts`，`points.ts` 从叶子取。
 */
import { describe, expect, it } from 'vitest'
import * as api from './api'
import * as points from './points'
import { LOCAL_ERROR_CODES } from './base'

describe('api.ts 域入口转接（#909）', () => {
  it('积分中心入口已转接，且与 points.ts 是同一函数', () => {
    expect(api.fetchPointsWallet).toBe(points.fetchPointsWallet)
    expect(api.fetchPointsDailyTasks).toBe(points.fetchPointsDailyTasks)
    expect(api.fetchPointsLedger).toBe(points.fetchPointsLedger)
    expect(api.fetchGlobalXpLeaderboard).toBe(points.fetchGlobalXpLeaderboard)
  })

  it('模块初始化顺序无关：顶层常量在 api.ts 先求值时也已初始化', () => {
    // api.ts 先求值（本文件第一行 import）时，points.ts 顶层读的是叶子 base.ts 的绑定
    expect(points.POINTS_AUTH_ERROR_CODES).toEqual([
      LOCAL_ERROR_CODES.authMissing,
      'AUTH_REQUIRED',
      'GAME_SESSION_EXPIRED',
      'UNAUTHORIZED'
    ])
    // 本作用域内 from './api' 取得的本地错误码与叶子定义是同一对象（转接而非复制）
    expect(api.LOCAL_ERROR_CODES).toBe(LOCAL_ERROR_CODES)
    expect(api.LOCAL_ERROR_CODES.authMissing).toBe('LOCAL_AUTH_MISSING')
  })

  it('既有导出零破坏（抽样看守传输层 / 能力表 / 端点）', () => {
    for (const [name, type] of [
      ['GamePlatformError', 'function'],
      ['requestGamePlatformJson', 'function'],
      ['pickEnvironmentCompatibleBase', 'function'],
      ['resolveGamePlatformApiBase', 'function'],
      ['resolveGameRankApiBase', 'function'],
      ['createIdempotencyKey', 'function'],
      ['readGamePlatformCapabilities', 'function'],
      ['fetchGamePlatformMeta', 'function'],
      ['fetchGamePlayerWallet', 'function'],
      ['fetchGamePlayerProfile', 'function'],
      ['fetchGameLeaderboards', 'function'],
      ['fetchClassicLeaderboard', 'function'],
      ['fetchGameLaunchTicket', 'function'],
      ['deriveLegacyRankBaseFromCloudSync', 'function']
    ] as const) {
      expect(typeof (api as unknown as Record<string, unknown>)[name], `api.ts 丢失导出 ${name}`).toBe(
        type
      )
    }
    expect(api.DEFAULT_GAME_PLATFORM_API_BASE).toContain('/api/game-platform/v1')
    expect(api.GAME_PLATFORM_PROTOCOL_VERSION).toBe(1)
    expect(api.EMPTY_GAME_PLATFORM_CAPABILITIES.wallet).toBe(false)
    expect([...api.GAME_PLATFORM_CAPABILITY_KEYS]).toContain('leaderboards')
  })
})
