/**
 * App 设备授权历史 API（「授权记录」页数据源）。
 *
 * 端点：
 *   GET /api/v1/app/devices/me/auth-history   Device 签名认证（本机批准过的授权记录）
 *
 * 信任模型（与 devices.ts GET /devices/me 一致）：
 * - 设备签名认证（MINI-HBUT-DEVICE-API-V1），method/path 由服务端取请求自身值；
 * - 只返回本设备（approved_device_id）批准过的记录，不泄露其他设备/用户数据；
 * - 响应只含展示字段（应用名/域名/scope 标签/时间），绝不含 handoff/code/学号内部字段。
 */
import Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import { authenticateDeviceRequest, type AppAuthDeps, type ClockSkewConfig } from './auth.js'
import { listAuthRequestsByDevice } from '../../db/repos/auth-requests.repo.js'
import { SCOPE_META, TEST_CLIENT_IDS } from '../requests.js'
import { APP_API_PREFIX } from './devices.js'
import { DomainError } from '../../domain/errors.js'
import { respondError, AppInternalError } from './errors.js'

/** 授权历史端点依赖（与 device 端点相同形状） */
export interface AuthHistoryApiDeps extends AppAuthDeps, ClockSkewConfig {}

/** 注册授权历史路由（由 registerAppRoutes 调用） */
export function registerAuthHistoryRoutes(router: Router, deps: AuthHistoryApiDeps): void {
  // GET /api/v1/app/devices/me/auth-history —— 本机授权记录（Device 签名认证）
  router.get(`${APP_API_PREFIX}/devices/me/auth-history`, async (ctx) => {
    try {
      const device = await authenticateDeviceRequest(ctx, deps)
      const rows = await listAuthRequestsByDevice(deps.sql, device.id)
      ctx.status = 200
      ctx.body = {
        items: rows.map((row) => {
          let homepageHost = ''
          if (row.homepage_url) {
            try {
              homepageHost = new URL(row.homepage_url).hostname
            } catch {
              homepageHost = ''
            }
          }
          return {
            request_id: row.request_id,
            approved_at: row.approved_at.toISOString(),
            status: row.status,
            client: {
              name: row.app_name ?? '',
              homepage_host: homepageHost,
              developer_display_name: row.developer_display_name ?? '',
              review_status: row.app_status ?? '',
              is_test: TEST_CLIENT_IDS.has(row.client_id),
            },
            scopes: row.requested_scopes.map((scope) => {
              const meta = SCOPE_META[scope] ?? { label: scope, risk: 'basic' as const }
              return { id: scope, label: meta.label, risk: meta.risk }
            }),
          }
        }),
      }
    } catch (err) {
      handleError(ctx, err)
    }
  })
}

/** DomainError → HTTP；未知错误 → 500（不泄露细节） */
function handleError(ctx: RouterContext, err: unknown): void {
  if (err instanceof DomainError) {
    respondError(ctx, err)
    return
  }
  respondError(ctx, new AppInternalError())
}
