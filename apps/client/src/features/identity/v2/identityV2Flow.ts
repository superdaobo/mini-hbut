/**
 * src/features/identity/v2/identityV2Flow.ts —— P1-2（#1213）身份 v2：三个流程的正式调用封装。
 *
 * 规格：goal-10 `p1-2-client-flow-spec.md` §3.1 / §5（冻结接口）。
 *
 * 契约（与 P1-1 `identity_sign_canonical.ts` 同款）：
 *   - 走仓库既有 `invokeNative`（`../../../platform/native`），**正式路径、无 DEV 门**；
 *   - Rust 命令是**单参结构体 `input`**，字段 snake_case（Tauri v2 不做 camelCase 自动转换）：
 *       identity_enroll_v2          ← { input: { device_id } }
 *       identity_rebind_request_v2  ← { input: { device_id } }
 *       identity_rebind_approve_v2  ← { input: { request_id, new_device_id, new_pubkey_sha256, expires_at } }
 *     签名材料（canonical/nonce/ts/signature/公钥）全部由 Rust 命令层用本机密钥构造
 *     （规格 §3.1：构建 canonical → 本机签名 → 提交服务 → 映射结果），前端**不**持有
 *     **也**不传递签名材料；
 *   - 每个流程**只调用一条** Rust 命令：客户端**不存在**「不经旧设备批准直接改绑」的
 *     调用路径（验收 ②）；
 *   - 返回值统一为 `{ok:true, ...} | {ok:false, kind, message}`，**绝不**把原始错误
 *     （服务端 body / reason 原文 / 学号 / 签名 / 公钥 / URL）抛给或透传给 UI（验收 ③）；
 *   - 不写 console、不写 localStorage（读取本机 device_id 是只读，与 #677 同源）。
 */

import { invokeNative } from '../../../platform/native'
import { IDENTITY_DEVICE_ID_KEY } from '../identityStore'
import {
  FLOW_KINDS,
  FLOW_MESSAGES,
  isFlowErrorKind,
  mapServerReason,
  messageFor,
  type FlowErrorKind
} from './identityV2Errors'
import { encodeRebindCode, parseRebindCode } from './rebindCode'

// 规格 §5：parseRebindCode 从本模块重导出（实现见 ./rebindCode，TS 唯一一份 codec）
export { parseRebindCode } from './rebindCode'

// ── 结果类型（规格 §5 冻结形状）──────────────────────────────────────────────

/** 失败结果：kind + 固定文案（无其它字段；原始错误绝不外泄） */
export type FlowFail = { ok: false; kind: FlowErrorKind; message: string }

export type FlowResult =
  | { ok: true; kind: 'first_claim_ok'; message: string; deviceId: string; studentIdMasked: string }
  | { ok: true; kind: 'already_registered'; message: string; deviceId: string; studentIdMasked: string }
  | {
      ok: true
      kind: 'request_pending'
      message: string
      deviceId: string
      studentIdMasked: string
      rebindCode: string
      expiresAt: number
    }
  | { ok: true; kind: 'approved'; message: string; deviceId: string; studentIdMasked: string }
  | FlowFail

// ── 内部工具 ─────────────────────────────────────────────────────────────────

const fail = (kind: FlowErrorKind): FlowFail => ({ ok: false, kind, message: messageFor(kind) })

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

/** 文案 → kind 反向表（用于把 Rust 已折叠的固定文案精确还原为 kind） */
const MESSAGE_TO_KIND = new Map<string, FlowErrorKind>()
for (const kind of FLOW_KINDS) MESSAGE_TO_KIND.set(FLOW_MESSAGES[kind], kind)

/** 固定 token 受控子串匹配（词界 = 非 [a-z0-9_]）：仅用于从 Rust 错误串恢复稳定 kind */
const textContainsKind = (text: string, kind: FlowErrorKind): boolean =>
  new RegExp(`(?:^|[^a-z0-9_])${kind}(?:$|[^a-z0-9_])`).test(text)

/**
 * 从任意 invoke 拒绝值恢复稳定 kind（**不透传**原文）：
 * 结构化 `{kind}` → 精确 kind → 固定文案 → 服务端 reason（整串或 `"reason":"…"` 内嵌）
 * → 固定 token 受控匹配 → `unknown`。
 */
const kindFromRejectedError = (err: unknown): FlowErrorKind => {
  // 1) 结构化：{kind} 对象或 JSON 字符串
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    if (isFlowErrorKind(obj.kind)) return obj.kind
  }
  let text = ''
  if (typeof err === 'string') {
    text = err
  } else if (err instanceof Error && typeof err.message === 'string') {
    text = err.message
  } else if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') text = obj.message
  }
  if (text === '') return 'unknown'
  const trimmed = text.trim()

  // 2) 整串即稳定 kind
  if (isFlowErrorKind(trimmed)) return trimmed
  // 3) 整串即固定文案（Rust 已折叠）
  const byMessage = MESSAGE_TO_KIND.get(trimmed)
  if (byMessage !== undefined) return byMessage
  // 4) 整串即服务端 reason（已知才映射，未知继续兜底）
  const byReason = mapServerReason(trimmed)
  if (byReason !== 'unknown') return byReason
  // 5) 内嵌 "reason":"…"（服务端 body 被原样塞进错误串时）
  const m = /"reason"\s*:\s*"([^"]+)"/.exec(trimmed)
  if (m !== null) {
    const byEmbedded = mapServerReason(m[1])
    if (byEmbedded !== 'unknown') return byEmbedded
  }
  // 6) 固定 token 受控匹配（按 FLOW_KINDS 固定顺序，确定性）
  const lower = trimmed.toLowerCase()
  for (const kind of FLOW_KINDS) {
    if (kind === 'unknown') continue
    if (textContainsKind(lower, kind)) return kind
  }
  return 'unknown'
}

/** invoke 抛错 → 折叠为稳定 kind + 固定文案（**绝不**透传原始错误） */
const foldInvokeError = (err: unknown): FlowFail => fail(kindFromRejectedError(err))

/** 本机已登记 device_id（只读 localStorage 的设备元数据；未登记 → null） */
const readLocalDeviceId = (): string | null => {
  try {
    const raw = globalThis.localStorage?.getItem(IDENTITY_DEVICE_ID_KEY)
    const value = typeof raw === 'string' ? raw.trim() : ''
    return value === '' ? null : value
  } catch {
    return null
  }
}

/** 成功 payload 的 device_id（契约字段 snake_case；缺失/空 → null） */
const readDeviceId = (raw: Record<string, unknown>): string | null =>
  isNonEmptyString(raw.device_id) ? raw.device_id.trim() : null

/** 成功 payload 的学号掩码（契约字段；缺失 → 空串，绝不回退为明文） */
const readStudentIdMasked = (raw: Record<string, unknown>): string =>
  typeof raw.student_id_masked === 'string' ? raw.student_id_masked : ''

const readKind = (raw: Record<string, unknown>): FlowErrorKind | null =>
  isFlowErrorKind(raw.kind) ? raw.kind : null

/** ① 首次登记成功响应 → FlowResult（畸形一律折叠为 unknown，绝不按成功透出） */
const normalizeEnrollSuccess = (raw: unknown): FlowResult => {
  if (typeof raw !== 'object' || raw === null) return fail('unknown')
  const o = raw as Record<string, unknown>
  let kind = readKind(o)
  if (kind === null) {
    // 兜底：Rust 已映射时带 kind；否则按服务端形状推断（action/idempotent → 重复登记）
    const status = typeof o.status === 'string' ? o.status : ''
    const action = typeof o.action === 'string' ? o.action : ''
    if (action === 'idempotent') kind = 'already_registered'
    else if (status === 'active') kind = 'first_claim_ok'
  }
  if (kind !== 'first_claim_ok' && kind !== 'already_registered') return fail('unknown')
  const deviceId = readDeviceId(o)
  if (deviceId === null) return fail('unknown')
  return {
    ok: true,
    kind,
    message: messageFor(kind),
    deviceId,
    studentIdMasked: readStudentIdMasked(o)
  }
}

/** ② 发起换绑成功响应 → FlowResult（pending 时用 Rust 返回的材料在**本模块**组装换机码） */
const normalizeStartRebindSuccess = (raw: unknown): FlowResult => {
  if (typeof raw !== 'object' || raw === null) return fail('unknown')
  const o = raw as Record<string, unknown>
  let kind = readKind(o)
  if (kind === null) {
    const status = typeof o.status === 'string' ? o.status : ''
    const requestId = typeof o.request_id === 'string' ? o.request_id : ''
    if (status === 'pending' && isNonEmptyString(requestId)) kind = 'request_pending'
    else if (status === 'active') kind = 'already_registered'
  }
  if (kind === null) return fail('unknown')
  const deviceId = readDeviceId(o)
  if (deviceId === null) return fail('unknown')
  const studentIdMasked = readStudentIdMasked(o)

  if (kind === 'request_pending') {
    // 换机码材料（全部可公开；缺任一 → 不当成功处理）
    const requestId = typeof o.request_id === 'string' ? o.request_id : ''
    const pubkeySha256 = typeof o.new_pubkey_sha256 === 'string' ? o.new_pubkey_sha256 : ''
    const expiresAt =
      typeof o.expires_at === 'number' && Number.isFinite(o.expires_at) ? o.expires_at : null
    if (requestId === '' || pubkeySha256 === '' || expiresAt === null) return fail('unknown')
    const encoded = encodeRebindCode({ r: requestId, d: deviceId, k: pubkeySha256, e: expiresAt })
    if (!encoded.ok) return fail('unknown')
    return {
      ok: true,
      kind: 'request_pending',
      message: messageFor('request_pending'),
      deviceId,
      studentIdMasked,
      rebindCode: encoded.code,
      expiresAt
    }
  }
  // already_registered（本机已是活跃设备；无 request_id）
  if (kind === 'already_registered') {
    return { ok: true, kind, message: messageFor(kind), deviceId, studentIdMasked }
  }
  return fail('unknown')
}

/** ③ 批准换绑成功响应 → FlowResult */
const normalizeApproveSuccess = (raw: unknown): FlowResult => {
  if (typeof raw !== 'object' || raw === null) return fail('unknown')
  const o = raw as Record<string, unknown>
  let kind = readKind(o)
  if (kind === null) {
    // 兜底：按服务端形状推断（status active + device_id）
    const status = typeof o.status === 'string' ? o.status : ''
    if (status === 'active') kind = 'approved'
  }
  if (kind !== 'approved') return fail('unknown')
  const deviceId = readDeviceId(o)
  if (deviceId === null) return fail('unknown')
  return {
    ok: true,
    kind: 'approved',
    message: messageFor('approved'),
    deviceId,
    studentIdMasked: readStudentIdMasked(o)
  }
}

// ── 三个流程（规格 §5 冻结签名）───────────────────────────────────────────────

/**
 * ① 首次登记（v2）：本机为新设备。
 * 无本机 device_id → 直接 `not_enrolled`（不发请求）；
 * 成功：`{ok:true, kind:'first_claim_ok'|'already_registered', deviceId, studentIdMasked}`。
 */
export const enrollV2 = async (): Promise<FlowResult> => {
  const deviceId = readLocalDeviceId()
  if (deviceId === null) return fail('not_enrolled')
  try {
    const raw = await invokeNative<unknown>('identity_enroll_v2', { input: { device_id: deviceId } })
    return normalizeEnrollSuccess(raw)
  } catch (err) {
    return foldInvokeError(err)
  }
}

/**
 * ② 发起换绑（新设备侧）：成功时返回 `rebindCode`（HBRB1:…）与 `expiresAt`；
 * 本机已是该学号活跃设备 → `already_registered`（无 request_id / 换机码）。
 * **本函数只调用 `identity_rebind_request_v2`**——客户端不存在「直接接管」路径（验收 ②）。
 */
export const startRebind = async (): Promise<FlowResult> => {
  const deviceId = readLocalDeviceId()
  if (deviceId === null) return fail('not_enrolled')
  try {
    const raw = await invokeNative<unknown>('identity_rebind_request_v2', {
      input: { device_id: deviceId }
    })
    return normalizeStartRebindSuccess(raw)
  } catch (err) {
    return foldInvokeError(err)
  }
}

/**
 * ③ 批准换绑（旧设备侧）：先**本地**解析校验换机码（失败 → `code_invalid`，**不发请求**），
 * 再把码里的 4 个可公开字段交给 Rust（规格 §3.0）；Rust 用**本机当前活跃设备**密钥
 * 签 approve canonical 并校验 approver_device_id == 本机（换机需旧设备批准，验收 ②）。
 */
export const approveRebind = async (code: string): Promise<FlowResult> => {
  const parsed = parseRebindCode(code)
  if (!parsed.ok) return fail('code_invalid')
  const localDeviceId = readLocalDeviceId()
  if (localDeviceId === null) return fail('not_enrolled')
  try {
    const raw = await invokeNative<unknown>('identity_rebind_approve_v2', {
      input: {
        request_id: parsed.requestId,
        new_device_id: parsed.newDeviceId,
        new_pubkey_sha256: parsed.pubkeySha256,
        expires_at: parsed.expiresAt,
        // 批准方 = 本机（Rust 命令会校验它必须等于 canonical 的 approver 段）
        approver_device_id: localDeviceId
      }
    })
    return normalizeApproveSuccess(raw)
  } catch (err) {
    return foldInvokeError(err)
  }
}
