/**
 * 授权数据快照上传 API（#700，父 #697）。
 *
 * 端点：
 *   POST /api/v1/app/data-snapshots —— Device 签名认证（MINI-HBUT-DEVICE-API-V1）
 *
 * 契约：
 * - Body `{ handoff, scopes: [...], payload: { grades?, timetable?, fetched_at } }`；
 * - handoff 绑定当前活跃的 AuthRequest：client_id 取自该请求（服务端权威），
 *   scopes 必须 ⊆ 该请求的批准范围（requested_scopes），防止越权写入；
 * - 快照按 (user_id, client_id) upsert 单行，expires_at = now + 7 天；
 * - payload 整体 AES-256-GCM 加密入库，明文绝不落库/日志/审计；
 * - 响应 201 `{ snapshot_id, expires_at }`。
 *
 * 安全模型：
 * - Device 签名认证证明「本设备属于该用户」（user_id 来源）；
 * - Handoff 证明「该用户刚完成对此 client 的 scope 批准」（client_id 来源）；
 *   双因子缺一不可，共同锚定 (user_id, client_id) 强绑定。
 */
import type { RouterContext } from '@koa/router'
import type Router from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import {
  authenticateDeviceRequest,
  findRequestByHandoffSecret,
  type AppAuthDeps,
  type ClockSkewConfig,
} from './auth.js'
import { readJsonBody } from './body.js'
import { upsertLatest } from '../../db/repos/data-snapshots.repo.js'
import { writeAuditEvent } from '../../observability/audit/index.js'
import { encryptSnapshot } from '../../security/snapshot-crypto.js'
import { DATA_SCOPE_TO_CLAIM, type SnapshotPayload } from '../../domain/data-scopes.js'
import { DomainError } from '../../domain/errors.js'
import {
  InvalidHandoffError,
  InvalidRequestError,
  AppInternalError,
  respondError,
} from './errors.js'

/** 快照有效期：7 天 */
export const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 快照明文大小上限（256KB）：成绩+课表 JSON 足够，防滥用存储 */
const MAX_PAYLOAD_BYTES = 256 * 1024

/** 快照上传请求非法（scope/payload 校验失败等） */
export class SnapshotInvalidScopeError extends DomainError {
  constructor(detail: string) {
    super('SNAPSHOT_INVALID_SCOPE', detail, 400)
  }
}

/** handoff 未处于已批准状态（CREATED/WAITING_APP/DENIED 等）：尚未获得用户授权 */
export class SnapshotNotApprovedError extends DomainError {
  constructor() {
    super('SNAPSHOT_NOT_APPROVED', '该接力会话尚未完成对此应用的授权批准', 403)
  }
}

export interface SnapshotApiDeps extends AppAuthDeps, ClockSkewConfig {
  sql: SqlExecutor
}

/** 已进入批准链路的 auth_request 状态（与授权历史过滤口径一致） */
const APPROVED_REQUEST_STATUSES = new Set(['APPROVED', 'INTERACTION_FINISHED', 'CODE_ISSUED', 'CONSUMED'])

/**
 * 校验并规范化快照 payload（strict）：
 * - 必须是 JSON 对象；字段白名单 grades / timetable / fetched_at；
 * - 每个已授权 scope 必须提供对应数据（grades/timetable 不得为 null/缺失）；
 * - 不允许上传未授权 scope 对应的数据字段（最小化原则）。
 */
function normalizeSnapshotPayload(
  raw: unknown,
  grantedScopes: readonly string[],
): SnapshotPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InvalidRequestError('payload 必须是 JSON 对象')
  }
  const b = raw as Record<string, unknown>
  const allowed = new Set(['grades', 'timetable', 'fetched_at'])
  for (const key of Object.keys(b)) {
    if (!allowed.has(key)) {
      throw new InvalidRequestError(`payload 含未知字段 ${key}`)
    }
  }
  const out: SnapshotPayload = {}
  if (grantedScopes.includes('student.grades.read')) {
    if (b.grades === undefined || b.grades === null) {
      throw new InvalidRequestError('缺少 grades 数据')
    }
    out.grades = b.grades
  } else if (b.grades !== undefined) {
    throw new SnapshotInvalidScopeError('未授权 student.grades.read 却上传了 grades')
  }
  if (grantedScopes.includes('student.timetable.read')) {
    if (b.timetable === undefined || b.timetable === null) {
      throw new InvalidRequestError('缺少 timetable 数据')
    }
    out.timetable = b.timetable
  } else if (b.timetable !== undefined) {
    throw new SnapshotInvalidScopeError('未授权 student.timetable.read 却上传了 timetable')
  }
  if (b.fetched_at !== undefined) {
    if (typeof b.fetched_at !== 'string' || Number.isNaN(new Date(b.fetched_at).getTime())) {
      throw new InvalidRequestError('fetched_at 必须是 ISO 8601 时间字符串')
    }
    out.fetched_at = b.fetched_at
  }
  return out
}

/** 解析并校验上传请求体（strict：未知字段一律拒绝） */
function parseUploadBody(body: unknown): {
  handoff: string
  scopes: string[]
  payload: SnapshotPayload
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidRequestError('请求体必须是 JSON 对象')
  }
  const b = body as Record<string, unknown>
  const allowed = new Set(['handoff', 'scopes', 'payload'])
  for (const key of Object.keys(b)) {
    if (!allowed.has(key)) {
      throw new InvalidRequestError(`未知字段 ${key}`)
    }
  }
  const handoff = typeof b.handoff === 'string' ? b.handoff.trim() : ''
  if (!handoff || handoff.length > 512) {
    throw new InvalidHandoffError()
  }
  if (!Array.isArray(b.scopes) || b.scopes.length === 0 || b.scopes.length > 4) {
    throw new SnapshotInvalidScopeError('scopes 必须是非空数组')
  }
  const scopes: string[] = []
  for (const s of b.scopes) {
    if (typeof s !== 'string' || !(s in DATA_SCOPE_TO_CLAIM)) {
      throw new SnapshotInvalidScopeError(`非法的数据域 scope：${String(s).slice(0, 64)}`)
    }
    if (!scopes.includes(s)) {
      scopes.push(s)
    }
  }
  const payload = normalizeSnapshotPayload(b.payload, scopes)
  return { handoff, scopes, payload }
}

/** 注册数据快照路由（由 registerAppRoutes 调用） */
export function registerDataSnapshotRoutes(router: Router, deps: SnapshotApiDeps): void {
  // POST /api/v1/app/data-snapshots —— 上传/覆盖最新快照（Device + Handoff 双因子）
  router.post('/api/v1/app/data-snapshots', async (ctx: RouterContext) => {
    try {
      // 1) Device 签名认证 → user_id（设备必须 active 且属于某用户）
      const device = await authenticateDeviceRequest(ctx, deps)
      // 2) Body 校验（strict）
      const input = parseUploadBody(await readJsonBody(ctx))
      // 3) Handoff → 活跃 AuthRequest（client_id / 批准范围的权威来源）
      const request = await findRequestByHandoffSecret(deps.sql, deps.handoffHmacKey, input.handoff)
      if (!request) {
        throw new InvalidHandoffError()
      }
      if (!APPROVED_REQUEST_STATUSES.has(request.status)) {
        throw new SnapshotNotApprovedError()
      }
      // 4) scopes ⊆ 本次授权批准范围（防跨 client 越权写入）
      const approvedScopes = Array.isArray(request.requested_scopes) ? request.requested_scopes : []
      for (const s of input.scopes) {
        if (!approvedScopes.includes(s)) {
          throw new SnapshotInvalidScopeError(`scope ${s} 不在该应用本次获准的授权范围内`)
        }
      }
      // 5) 加密 → upsert 单行（同 user+client 重传即覆盖）
      const plaintext = JSON.stringify(input.payload)
      if (Buffer.byteLength(plaintext, 'utf8') > MAX_PAYLOAD_BYTES) {
        throw new SnapshotInvalidScopeError(`payload 超过 ${MAX_PAYLOAD_BYTES} 字节上限`)
      }
      const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MS)
      const row = await upsertLatest(deps.sql, {
        userId: device.user_id,
        clientId: request.client_id,
        scopeSet: input.scopes,
        payloadEnc: encryptSnapshot(plaintext),
        // fetched_at 已在 normalizeSnapshotPayload 中校验为 ISO 字符串
        fetchedAt: input.payload.fetched_at ? new Date(input.payload.fetched_at) : null,
        expiresAt,
      })
      // 6) 审计：只记 id/client/scope，不含任何业务数据明文
      await writeAuditEvent(deps.sql, {
        eventType: 'snapshot_uploaded',
        actorType: 'device',
        actorId: device.id,
        targetType: 'data_snapshot',
        targetId: row.id,
        result: 'success',
        metadata: { client_id: request.client_id, scopes: input.scopes },
      })
      ctx.status = 201
      ctx.body = { snapshot_id: row.id, expires_at: row.expires_at.toISOString() }
    } catch (err) {
      if (err instanceof DomainError) {
        respondError(ctx, err)
        return
      }
      ctx.app.emit('error', err as Error, ctx)
      respondError(ctx, new AppInternalError())
    }
  })
}
