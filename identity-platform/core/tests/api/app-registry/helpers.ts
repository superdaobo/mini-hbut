/**
 * T12（mini-hbut#1170）应用注册审核 API 测试辅助：
 * - 组装 Koa app：service-token 中间件（与 src/app.ts:235 同一件）+ 本路由
 *   （验证「服务令牌在 router 之前」的生产装配顺序）；
 * - 预置 developer-portal 登录应用（pairwise sector 解析依赖其 redirect_uri，
 *   同 tests/api/developer.test.ts:46-72 的 seedPortalClient 手法）；
 * - 请求封装：服务令牌默认携带（伪造头测试可显式关闭/改错）。
 */
import Koa from 'koa'
import Router from '@koa/router'
import type { SqlExecutor } from '../../../src/db/types.js'
import { registerAppRegistryRoutes } from '../../../src/api/app-registry/index.js'
import { serviceTokenMiddleware } from '../../../src/security/service-token.js'
import { derivePairwiseSubject } from '../../../src/domain/subjects.js'
import { createUserWithHbutIdentity } from '../../../src/domain/users.js'
import { newUuidV7 } from '../../../src/domain/ids.js'
import { insertDeveloper } from '../../helpers/developers.js'
import {
  insertApplication,
  replaceRedirectUris,
} from '../../../src/db/repos/clients.repo.js'
import { TEST_PAIRWISE_KEY } from '../../helpers/keys.js'

/** 测试服务令牌（与生产 IDENTITY_SERVICE_TOKEN 等价注入） */
export const TEST_SERVICE_TOKEN = 'test-service-token-t12-app-registry'

/** developer-portal 登录应用的 redirect host（resolveSector 取它作 pairwise sector） */
export const PORTAL_SECTOR = 'portal.example.com'

/** 组装仅含 T12 路由的 Koa app（生产由 src/app.ts + src/api/index.ts 统一装配） */
export function buildAppRegistryApp(sql: SqlExecutor): Koa {
  const app = new Koa()
  app.use(async (ctx, next) => {
    ctx.state.requestId = 'test_req_0001'
    await next()
  })
  // 与 src/app.ts:235 一致：服务令牌在 router 之前（未配置 fail closed 的测试注入令牌）
  app.use(serviceTokenMiddleware({ token: TEST_SERVICE_TOKEN, env: { IDENTITY_ENVIRONMENT: 'test' } }))
  const router = new Router()
  registerAppRegistryRoutes(router, {
    sql,
    pairwiseKey: TEST_PAIRWISE_KEY,
    developerClientId: 'developer-portal',
    env: { IDENTITY_PAIRWISE_SUBJECT_KEY: TEST_PAIRWISE_KEY },
  })
  app.use(router.routes())
  app.use(router.allowedMethods())
  return app
}

/** 首次访问前置：插入 client_id='developer-portal' 应用（sector 解析依赖其 redirect_uri） */
export async function seedPortalClient(sql: SqlExecutor): Promise<void> {
  const { userId } = await createUserWithHbutIdentity(sql, {
    studentId: `2023${Math.floor(Math.random() * 900000) + 100000}`,
    studentName: '门户占位用户',
  })
  const ownerDevId = newUuidV7()
  await insertDeveloper(sql, { id: ownerDevId, userId, displayName: '门户占位开发者' })
  const portalAppId = newUuidV7()
  await insertApplication(sql, {
    id: portalAppId,
    client_id: 'developer-portal',
    owner_developer_id: ownerDevId,
    name: '开发者门户',
    client_type: 'web_confidential',
    token_endpoint_auth_method: 'client_secret_basic',
  })
  await replaceRedirectUris(sql, portalAppId, [
    { uri: `https://${PORTAL_SECTOR}/callback`, kind: 'web_https' },
  ])
}

/** BFF 会话 sub 的测试推导：与 subject-resolution.ts 的 sector 语义一致 */
export function developerSubjectFor(userId: string): string {
  return derivePairwiseSubject({
    pairwiseKey: TEST_PAIRWISE_KEY,
    sectorOrClientId: PORTAL_SECTOR,
    userId,
  })
}

/** 创建一个开发者用户（user + developer 行 + pairwise subject） */
export async function createDeveloperUser(
  sql: SqlExecutor,
  displayName = '注册开发者',
): Promise<{ userId: string; developerId: string; subject: string }> {
  const studentId = `2023${Math.floor(Math.random() * 900000) + 100000}`
  const { userId } = await createUserWithHbutIdentity(sql, { studentId, studentName: displayName })
  const developerId = `dev_${newUuidV7()}`
  await insertDeveloper(sql, { id: developerId, userId, displayName })
  return { userId, developerId, subject: developerSubjectFor(userId) }
}

/** 注册应用的 app_id（[a-z0-9_-]{2,48}） */
export function newAppId(): string {
  return `reg_${Math.random().toString(36).slice(2, 10)}`
}

export interface RegistryFixture {
  appId: string
  developer: { userId: string; developerId: string; subject: string }
  /** 提交 body（内容寻址；改任一字段 → revision 变化） */
  baseBody: Record<string, unknown>
}

/** 创建开发者 + 一份标准 embedded 提交 body */
export async function createRegistryFixture(
  sql: SqlExecutor,
  opts: { appId?: string } = {},
): Promise<RegistryFixture> {
  const appId = opts.appId ?? newAppId()
  const developer = await createDeveloperUser(sql)
  const baseBody: Record<string, unknown> = {
    form: 'embedded',
    entry: `more://${appId}`,
    redirect_uris: [{ uri: 'https://cb.example.com/oauth', kind: 'web_https' }],
    allowed_groups: ['hbut-students'],
    data_domains: [{ domain: 'school.grades', operations: ['read'], purpose: '查询成绩' }],
    compat: { min_host: '1.0.0', platforms: ['android', 'ios'], store_policy: 'allowed' },
    module: null,
    casdoor: {
      application_name: appId,
      client_id: `cid-${appId}`,
      expire_in_hours: 24,
      refresh_expire_in_hours: 168,
      token_format: 'JWT-Custom',
      token_fields: ['hbut_student_id'],
    },
  }
  return { appId, developer, baseBody }
}

export interface RegistryRequestOpts {
  adminSubject?: string
  devSubject?: string
  /** epoch 秒；缺省不携带 x-admin-auth-time */
  authTime?: number
  /** 服务令牌：true=正确（缺省）；false=不携带；string=伪造错误值 */
  serviceToken?: boolean | string
  body?: unknown
}

function registryHeaders(opts: RegistryRequestOpts): Record<string, string> {
  const headers: Record<string, string> = {}
  if (opts.serviceToken !== false) {
    headers['x-identity-service-token'] =
      typeof opts.serviceToken === 'string' ? opts.serviceToken : TEST_SERVICE_TOKEN
  }
  if (opts.adminSubject) {
    headers['x-admin-subject'] = opts.adminSubject
  }
  if (opts.devSubject) {
    headers['x-developer-subject'] = opts.devSubject
  }
  if (opts.authTime !== undefined) {
    headers['x-admin-auth-time'] = String(opts.authTime)
  }
  return headers
}

async function registryFetch(
  baseUrl: string,
  method: 'GET' | 'POST',
  path: string,
  opts: RegistryRequestOpts = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const init: RequestInit = { headers: registryHeaders(opts) }
  if (method === 'POST') {
    init.method = 'POST'
    ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
    init.body = JSON.stringify(opts.body ?? {})
  }
  const res = await fetch(`${baseUrl}${path}`, init)
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, body }
}

export function regGet(baseUrl: string, path: string, opts: RegistryRequestOpts = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  return registryFetch(baseUrl, 'GET', path, opts)
}

export function regPost(
  baseUrl: string,
  path: string,
  opts: RegistryRequestOpts = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return registryFetch(baseUrl, 'POST', path, opts)
}

/** 深拷贝提交 body（内容变更后重复提交测试用） */
export function cloneBody(body: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(body)) as Record<string, unknown>
}
