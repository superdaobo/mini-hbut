/**
 * App API 路由注册（#622）。
 *
 * 挂载约定（与 #620 对齐，见 src/api/index.ts 尾部注释）：
 * - 本目录导出 `registerAppRoutes(router, deps)`，由主 Agent 在 Wave Gate 统一
 *   merge 到 src/api/index.ts 的 registerApiRoutes 中（本目录不 import api/index.ts）；
 * - deps 形状与 #620 ApiDeps 结构兼容：{ sql, provider, handoffHmacKey }（provider 目前未使用，
 *   保留以对齐签名；后续 #620 的 resume/interaction 编排可能复用）；
 * - 时间窗/TTL 配置化：IDENTITY_CLOCK_SKEW_SECONDS（approve/device 签名 issued_at 偏差，
 *   默认 60）、IDENTITY_ENROLL_CHALLENGE_TTL_SECONDS（enrollment challenge TTL，默认 300）。
 *
 * 端点清单（#622）：
 *   POST /api/v1/app/devices/enrollment-challenges    Handoff
 *   POST /api/v1/app/devices/enroll                   Handoff
 *   GET  /api/v1/app/devices/me                       Device 签名（MINI-HBUT-DEVICE-API-V1）
 *   POST /api/v1/app/devices/:id/revoke               Device 签名（自撤销，V1 仅本机）
 *   GET  /api/v1/app/devices/me/auth-history          Device 签名（本机授权记录）
 *   POST /api/v1/app/auth-requests/:id/approve        Handoff + Ed25519 签名
 *   POST /api/v1/app/data-snapshots                   Device + Handoff（#700 快照上传）
 *   POST /api/v1/app/device-token/challenge           Device 签名（#902 一次性 challenge）
 *   POST /api/v1/app/device-token/exchange            Device 签名（#902 换 resource-scoped JWT AT）
 */
import type Router from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import type { ResolvedGameResourceConfig } from '../../oidc/resource-indicators.js'
import { registerDeviceRoutes, type DevicesApiDeps } from './devices.js'
import { registerAuthRequestRoutes, type ApproveApiDeps } from './auth-requests.js'
import { registerAuthHistoryRoutes } from './auth-history.js'
import { registerDataSnapshotRoutes, type SnapshotApiDeps } from './data-snapshots.js'
import { registerDeviceTokenRoutes, type DeviceTokenApiDeps } from './device-token.js'
import { DEVICE_TOKEN_ACCESS_TTL_SECONDS } from '../../oidc/device-access-token.js'
import type { AppAuthDeps, ClockSkewConfig } from './auth.js'

/** registerAppRoutes 依赖（与 #620 ApiDeps 结构兼容；provider 预留） */
export interface AppRoutesDeps extends AppAuthDeps {
  sql: SqlExecutor
  /** oidc-provider 实例（#902 设备换票用它的 AccessToken 模型签发 JWT AT） */
  provider: unknown
  /** #902a 游戏 resource 配置（resolved；#902 设备换票复用同一份，不二次硬编码） */
  gameResource?: ResolvedGameResourceConfig
}

/** 读取正整数配置（秒）；非法/缺失返回默认值 */
function readSecondsConfig(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (!raw) {
    return defaultValue
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    return defaultValue
  }
  return value
}

/** 注册 #622 App API 路由（由主 Agent 在 api/index.ts 调用） */
export function registerAppRoutes(router: Router, deps: AppRoutesDeps): void {
  const clockSkew: ClockSkewConfig = {
    skewSeconds: readSecondsConfig('IDENTITY_CLOCK_SKEW_SECONDS', 60),
  }
  const deviceDeps: DevicesApiDeps = {
    sql: deps.sql,
    handoffHmacKey: deps.handoffHmacKey,
    ...clockSkew,
    challengeTtlSeconds: readSecondsConfig('IDENTITY_ENROLL_CHALLENGE_TTL_SECONDS', 300),
  }
  const approveDeps: ApproveApiDeps = {
    sql: deps.sql,
    handoffHmacKey: deps.handoffHmacKey,
    ...clockSkew,
  }
  registerDeviceRoutes(router, deviceDeps)
  registerAuthRequestRoutes(router, approveDeps)
  registerAuthHistoryRoutes(router, approveDeps)

  // #700 数据快照上传：Device 签名 + Handoff 双因子（复用同一时钟偏差配置）
  const snapshotDeps: SnapshotApiDeps = {
    sql: deps.sql,
    handoffHmacKey: deps.handoffHmacKey,
    ...clockSkew,
  }
  registerDataSnapshotRoutes(router, snapshotDeps)

  // #902 设备换票（Device 签名 → resource-scoped JWT AT）：
  // - 复用 #902a 已解析的 gameResource（audience/scope/第一方 client 白名单唯一来源）；
  // - TTL 配置化：IDENTITY_DEVICE_TOKEN_CHALLENGE_TTL_SECONDS（默认 120）、
  //   IDENTITY_DEVICE_ACCESS_TOKEN_TTL_SECONDS（默认 900，见 oidc/device-access-token.ts）；
  // - provider 由 registerAppRoutes 透传（main Agent 在 Wave Gate 传入真实实例）。
  const deviceTokenDeps: DeviceTokenApiDeps = {
    sql: deps.sql,
    handoffHmacKey: deps.handoffHmacKey,
    provider: deps.provider,
    gameResource: deps.gameResource,
    ...clockSkew,
    challengeTtlSeconds: readSecondsConfig('IDENTITY_DEVICE_TOKEN_CHALLENGE_TTL_SECONDS', 120),
    accessTokenTtlSeconds: readSecondsConfig(
      'IDENTITY_DEVICE_ACCESS_TOKEN_TTL_SECONDS',
      DEVICE_TOKEN_ACCESS_TTL_SECONDS,
    ),
  }
  registerDeviceTokenRoutes(router, deviceTokenDeps)
}
