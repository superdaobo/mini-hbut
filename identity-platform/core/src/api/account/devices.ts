/**
 * Account API —— 设备列表端点（#688）。
 *
 * GET /api/v1/account/devices → 本账户设备列表（listDevicesByUser，
 * 与 App API 设备自查询同款字段裁剪：不暴露公钥 JWK 全量，只给展示所需字段）。
 */
import type Router from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import { listDevicesByUser } from '../../db/repos/devices.repo.js'
import { requireAccountAuth, respondAccountError } from './common.js'

export function registerAccountDevicesRoutes(router: Router, deps: { sql: SqlExecutor }): void {
  const { sql } = deps

  router.get(`${API_PREFIX}/account/devices`, async (ctx) => {
    try {
      const { userId } = requireAccountAuth(ctx)
      const devices = await listDevicesByUser(sql, userId)
      ctx.status = 200
      ctx.body = {
        devices: devices.map((d) => ({
          id: d.id,
          device_name: d.device_name,
          platform: d.platform,
          app_version: d.app_version,
          status: d.status,
          fingerprint: d.public_key_fingerprint,
          created_at: d.created_at.toISOString(),
          activated_at: d.activated_at ? d.activated_at.toISOString() : null,
          last_seen_at: d.last_seen_at ? d.last_seen_at.toISOString() : null,
        })),
      }
    } catch (err) {
      respondAccountError(ctx, err)
    }
  })
}
