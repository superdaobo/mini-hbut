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
 *   POST /api/v1/app/auth-requests/:id/approve        Handoff + Ed25519 签名
 */
import type Router from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { registerDeviceRoutes, type DevicesApiDeps } from './devices.js'
import { registerAuthRequestRoutes, type ApproveApiDeps } from './auth-requests.js'
import type { AppAuthDeps, ClockSkewConfig } from './auth.js'

/** registerAppRoutes 依赖（与 #620 ApiDeps 结构兼容；provider 预留） */
export interface AppRoutesDeps extends AppAuthDeps {
  sql: SqlExecutor
  /** oidc-provider 实例（#622 端点暂不使用；保留以对齐 #620 ApiDeps 签名） */
  provider: unknown
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
}
