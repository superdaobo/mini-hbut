/**
 * Account API Bearer 认证中间件（#688）。
 *
 * 认证头契约（冻结 v1）：`Authorization: Bearer <整串Key>`。
 *
 * 严谨度对齐 src/api/app/auth.ts:authenticateDeviceRequest：
 * - 头缺失 / scheme 非法 / 格式偏差 → 统一 API_KEY_INVALID(401)，不泄露细节；
 * - hash 比对 constant-time（security/api-key.ts 内部 timingSafeEqual）；
 * - 校验成功后才把 user_id 与 key 元信息写入 ctx.state
 *   （accountUserId / accountKey，绝不含 secret/hash），并 touch last_used_at。
 */
import type { Middleware } from 'koa'
import type { SqlExecutor } from '../../db/types.js'
import { verifyApiKey } from '../../security/api-key.js'
import { parseApiKeyScopes, touchApiKeyLastUsed } from '../../db/repos/api-keys.repo.js'
import { ApiKeyInvalidError } from '../../domain/errors.js'
import type { AccountKeyState } from './common.js'
import { respondAccountError } from './common.js'

/** 解析 `Bearer <token>` 形式的 Authorization 头；非 Bearer/缺失返回 null */
export function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null
  }
  const space = headerValue.indexOf(' ')
  if (space <= 0 || space === headerValue.length - 1) {
    return null
  }
  const scheme = headerValue.slice(0, space).trim()
  if (scheme.toLowerCase() !== 'bearer') {
    return null
  }
  return headerValue.slice(space + 1).trim()
}

/** 构造 Bearer 认证中间件（挂在 /api/v1/account 前缀上） */
export function requireAccountKey(sql: SqlExecutor, pepper: string): Middleware {
  return async (ctx, next) => {
    // 中间件先于路由 handler 执行，认证失败必须在此处自答
    // （否则异常冒泡到框架默认 handler，响应退化为纯文本状态行）
    let row
    try {
      const token = extractBearerToken(ctx.get('authorization'))
      if (!token) {
        throw new ApiKeyInvalidError()
      }
      // verifyApiKey：格式 → prefix 定位行 → constant-time hash → 状态校验，
      // 失败细分 API_KEY_INVALID / API_KEY_REVOKED / API_KEY_EXPIRED
      row = await verifyApiKey(sql, pepper, token)
    } catch (err) {
      respondAccountError(ctx, err)
      return
    }
    const key: AccountKeyState = {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: parseApiKeyScopes(row.scopes),
      createdAt: row.created_at,
    }
    ctx.state.accountUserId = row.user_id
    ctx.state.accountKey = key
    // 最后使用时间尽力而为更新（失败不影响请求）
    try {
      await touchApiKeyLastUsed(sql, row.id)
    } catch {
      // 忽略 touch 失败
    }
    await next()
  }
}
