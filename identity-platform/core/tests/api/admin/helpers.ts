/**
 * #625 Admin API 测试辅助：
 * - 组装只含 admin 路由的 Koa app（registerAdminRoutes 直挂）；
 * - 创建带角色的管理员用户 fixture；
 * - HTTP 请求封装（带 x-admin-subject / x-admin-auth-time 头）。
 */
import Koa from 'koa'
import Router from '@koa/router'
import type { SqlExecutor } from '../../../src/db/types.js'
import { registerAdminRoutes } from '../../../src/api/admin/index.js'
import { createUserWithHbutIdentity } from '../../../src/domain/users.js'
import { insertDeveloper } from '../../helpers/developers.js'
import { newUuidV7 } from '../../../src/domain/ids.js'
import type { AdminRole } from '../../../src/api/admin/rbac.js'

/** 组装仅含 admin 路由的 Koa app（测试用；生产由 app.ts + api/index.ts 组装） */
export function buildAdminApp(
  sql: SqlExecutor,
  env: Record<string, string | undefined> = {},
): Koa {
  const app = new Koa()
  app.use(async (ctx, next) => {
    ctx.state.requestId = 'test_req_0001'
    await next()
  })
  const router = new Router()
  registerAdminRoutes(router, { sql, env })
  app.use(router.routes())
  app.use(router.allowedMethods())
  return app
}

export interface AdminUserFixture {
  userId: string
  developerId?: string
}

/** 创建带管理员角色的用户（可选同时创建 developer，用于 self-review 测试） */
export async function createAdminUser(
  sql: SqlExecutor,
  opts: {
    role: AdminRole
    studentId?: string
    /** 同时创建 developer（owner 语义） */
    asDeveloper?: boolean
  },
): Promise<AdminUserFixture> {
  const studentId = opts.studentId ?? `2023${Math.floor(Math.random() * 900000) + 100000}`
  const { userId } = await createUserWithHbutIdentity(sql, {
    studentId,
    studentName: '管理员用户',
  })
  await sql.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, opts.role])
  let developerId: string | undefined
  if (opts.asDeveloper) {
    developerId = newUuidV7()
    await insertDeveloper(sql, { id: developerId, userId, displayName: '管理员（兼开发者）' })
  }
  return { userId, developerId }
}

/** 创建无角色的普通用户（developer） */
export async function createPlainUser(
  sql: SqlExecutor,
  opts: { studentId?: string } = {},
): Promise<{ userId: string; developerId: string }> {
  const studentId = opts.studentId ?? `2023${Math.floor(Math.random() * 900000) + 100000}`
  const { userId } = await createUserWithHbutIdentity(sql, { studentId, studentName: '普通用户' })
  const developerId = newUuidV7()
  await insertDeveloper(sql, { id: developerId, userId, displayName: '普通开发者' })
  return { userId, developerId }
}

export interface RequestOptions {
  subject?: string
  authTime?: number
  body?: unknown
}

/** GET 请求（带 admin subject 头） */
export async function adminGet(
  baseUrl: string,
  path: string,
  opts: RequestOptions = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, { headers: adminHeaders(opts) })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, body }
}

/** POST 请求（mutation；body 自动 JSON） */
export async function adminPost(
  baseUrl: string,
  path: string,
  opts: RequestOptions = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminHeaders(opts) },
    body: JSON.stringify(opts.body ?? {}),
  })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, body }
}

function adminHeaders(opts: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {}
  if (opts.subject) {
    headers['x-admin-subject'] = opts.subject
  }
  if (opts.authTime !== undefined) {
    headers['x-admin-auth-time'] = String(opts.authTime)
  }
  return headers
}

/**
 * 模拟开发者 mutation（测试用）：直接更新应用基本字段并刷新 updated_at。
 * 对应未来 #624 开发者 API 的 PATCH 语义（内容变化 → revision 变化）。
 */
export async function updateAppBasic(
  sql: SqlExecutor,
  applicationId: string,
  patch: { name?: string; description?: string },
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = [applicationId]
  if (patch.name !== undefined) {
    values.push(patch.name)
    sets.push(`name = $${values.length}`)
  }
  if (patch.description !== undefined) {
    values.push(patch.description)
    sets.push(`description = $${values.length}`)
  }
  if (sets.length === 0) {
    return
  }
  sets.push('updated_at = NOW()')
  await sql.query(`UPDATE oauth_applications SET ${sets.join(', ')} WHERE id = $1`, values)
}
