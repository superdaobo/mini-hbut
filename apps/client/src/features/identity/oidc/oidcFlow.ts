/**
 * src/features/identity/oidc/oidcFlow.ts —— P2-4（#1208）身份 OIDC：四个命令的流程封装。
 *
 * 规格：goal-10 `p2-4-client-pkce-spec.md` §4.3（冻结接口）/ §0 硬约束。
 *
 * 契约（与 v2 `identityV2Flow.ts` 同款范式）：
 *   - 走仓库既有 `invokeNative`（`../../../platform/native`），**正式路径、无 DEV 门**；
 *   - 命令名与入参（与 agent B 冻结的命令名一致）：
 *       identity_oidc_begin          ← 无入参（与仓库既有无参命令同款，**不**传空对象）
 *       identity_oidc_complete       ← { input: { callback_url } }（单 input + snake_case）
 *       identity_oidc_session_status ← 无入参
 *       identity_oidc_logout         ← 无入参
 *   - Rust 侧返回 `FlowPayload`：`{ok, kind, message, authorize_url?, state?,
 *     student_id_masked?, expires_at?}`；成功/稳定失败都走 Ok(FlowPayload)，
 *     只有内部故障才 Err(String)（→ invoke 抛错，本模块折叠为稳定 kind）；
 *   - 所有失败一律映射到 §4.1 的**固定文案**（未知 kind → `unknown`），
 *     **绝不**把 Rust/服务端原文、code / verifier / token / URL 抛给或透传给 UI；
 *   - `authorizeUrl` 只允许 `http(s)://`（`new URL()` 解析后判断 protocol；
 *     其它 scheme 一律视为失败 → `unknown`，**不**把原 URL 回传）；
 *   - 不写 console、不写 localStorage（本模块无任何存储副作用）。
 */

import { invokeNative } from '../../../platform/native'
import {
  isOidcKind,
  messageForOidc,
  OIDC_MESSAGES,
  type OidcKind
} from './oidcErrors'

// ── 结果类型（规格 §4.3 冻结形状）──────────────────────────────────────────────

export type OidcResult =
  | {
      ok: true
      kind: string
      message: string
      authorizeUrl?: string
      state?: string
      studentIdMasked?: string
      expiresAt?: number
      /** `beginLoopback` 成功：实际监听端口（0/缺失 = 未使用回退） */
      loopbackPort?: number
    }
  | { ok: false; kind: string; message: string }

// ── 内部工具 ─────────────────────────────────────────────────────────────────

const fail = (kind: OidcKind): OidcResult => ({ ok: false, kind, message: OIDC_MESSAGES[kind] })

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

/**
 * `authorizeUrl` 白名单：只允许 `http:` / `https:`。
 * 用 `new URL()` 解析后判断 `protocol`；解析失败 / 相对 URL / 其它 scheme
 * （`javascript:` / `file:` / `ftp:` 等）一律拒绝（防被诱导打开本地程序）。
 */
const isAllowedAuthorizeUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim() === '') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 读取服务端返回的学号掩码，并做**本地兜底再掩码**（与 v2 红队 O2 同款纪律）：
 * 服务端/Rust 返回是不可信输入边界——若回了明文（或任何非 `xxxx***` 形态），
 * 客户端不原样透给 UI，而是本地重新掩码（前 4 位 + `***`；不足 8 位一律 `***`）。
 */
const readStudentIdMasked = (raw: Record<string, unknown>): string | null => {
  const value = typeof raw.student_id_masked === 'string' ? raw.student_id_masked.trim() : ''
  if (value === '') return null
  if (/^\d{4}\*{3}$/.test(value)) return value // 已是标准掩码
  if (value.length >= 8) return `${value.slice(0, 4)}***` // 兜底：本地重掩
  return '***'
}

/** 有限数字（契约字段 expires_at；缺失/NaN/Infinity → null） */
const readLoopbackPort = (raw: Record<string, unknown>): number | null => {
  const value = raw.loopback_port
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 65535
    ? Math.trunc(value)
    : null
}

const readExpiresAt = (raw: Record<string, unknown>): number | null =>
  typeof raw.expires_at === 'number' && Number.isFinite(raw.expires_at) ? raw.expires_at : null

/**
 * 成功 payload 归一化（畸形一律折叠为 `unknown`，**绝不**按成功透出）：
 * - `oidc_begin_ok`：authorize_url（http/https）+ state + expires_at 缺一不可；
 * - `oidc_login_ok`：student_id_masked 缺 → 畸形；
 * - `oidc_session_active`：student_id_masked + expires_at 缺一不可；
 * - `oidc_session_absent` / `oidc_logout_ok`：无附加字段；
 * - 其它 kind 以 `ok:true` 到达（形状与契约不符）→ 一律 `unknown`。
 */
const normalizeSuccess = (kind: OidcKind, raw: Record<string, unknown>): OidcResult => {
  if (kind === 'oidc_begin_ok') {
    const authorizeUrl = raw.authorize_url
    if (!isAllowedAuthorizeUrl(authorizeUrl)) return fail('unknown')
    if (!isNonEmptyString(raw.state)) return fail('unknown')
    const expiresAt = readExpiresAt(raw)
    if (expiresAt === null) return fail('unknown')
    // 回退路径会带 loopback_port；深链路径没有该字段（或 0）→ 省略
    const loopbackPort = readLoopbackPort(raw)
    return {
      ok: true,
      kind,
      message: OIDC_MESSAGES.oidc_begin_ok,
      authorizeUrl,
      state: raw.state,
      expiresAt,
      ...(loopbackPort === null ? {} : { loopbackPort })
    }
  }
  if (kind === 'oidc_login_ok' || kind === 'oidc_session_active') {
    const studentIdMasked = readStudentIdMasked(raw)
    if (studentIdMasked === null) return fail('unknown')
    if (kind === 'oidc_session_active') {
      const expiresAt = readExpiresAt(raw)
      if (expiresAt === null) return fail('unknown')
      return { ok: true, kind, message: OIDC_MESSAGES.oidc_session_active, studentIdMasked, expiresAt }
    }
    return { ok: true, kind, message: OIDC_MESSAGES.oidc_login_ok, studentIdMasked }
  }
  if (kind === 'oidc_session_absent' || kind === 'oidc_logout_ok') {
    return { ok: true, kind, message: OIDC_MESSAGES[kind] }
  }
  // 成功集合外的 kind 以 ok:true 到达：形状与契约不符 → unknown
  return fail('unknown')
}

/** 任意 FlowPayload 归一化（非对象/未知 kind/ok 非 true 一律折叠） */
const normalizePayload = (raw: unknown): OidcResult => {
  if (typeof raw !== 'object' || raw === null) return fail('unknown')
  const o = raw as Record<string, unknown>
  if (!isOidcKind(o.kind)) return fail('unknown')
  if (o.ok !== true) return fail(o.kind)
  return normalizeSuccess(o.kind, o)
}

/**
 * 从任意 invoke 拒绝值恢复稳定 kind（**不透传**原文；与 v2 同款受控匹配）：
 * 结构化 `{kind}` → 整串即稳定 kind → 固定 token 受控子串匹配 → `unknown`。
 */
const kindFromRejectedError = (err: unknown): OidcKind => {
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    if (isOidcKind(obj.kind)) return obj.kind
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
  const trimmed = text.trim()
  if (isOidcKind(trimmed)) return trimmed
  const lower = trimmed.toLowerCase()
  // 固定 token 受控匹配（词界 = 非 [a-z0-9_]；按 OIDC kind 表序，确定性）
  for (const kind of Object.keys(OIDC_MESSAGES) as OidcKind[]) {
    if (kind === 'unknown') continue
    if (new RegExp(`(?:^|[^a-z0-9_])${kind}(?:$|[^a-z0-9_])`).test(lower)) return kind
  }
  return 'unknown'
}

/** invoke 抛错（内部故障）→ 折叠为稳定 kind + 固定文案（**绝不**透传原始错误） */
const foldInvokeError = (err: unknown): OidcResult => fail(kindFromRejectedError(err))

// ── 四个流程（规格 §4.3 冻结签名）─────────────────────────────────────────────

/**
 * ① 发起授权：Rust 生成 PKCE/state/nonce → 存 pending → 返回授权 URL。
 * 成功：`{ok:true, kind:'oidc_begin_ok', authorizeUrl, state, expiresAt}`；
 * `authorizeUrl` 非 http(s) → 折叠为 `unknown`（不把原 URL 回传）。
 */
export const oidcBegin = async (): Promise<OidcResult> => {
  try {
    const raw = await invokeNative<unknown>('identity_oidc_begin')
    return normalizePayload(raw)
  } catch (err) {
    return foldInvokeError(err)
  }
}

/**
 * ② 完成授权：把回调 URL 交给 Rust（解析 → state 一次性匹配 → 换令牌 →
 * 验 id_token → 写 keyring 会话）。成功：`kind:'oidc_login_ok'` + 学号掩码；
 * 任何失败（state 不匹配/过期/重复、令牌无效等）→ 对应固定 kind 文案。
 */
export const oidcComplete = async (callbackUrl: string): Promise<OidcResult> => {
  if (typeof callbackUrl !== 'string') return fail('unknown')
  try {
    const raw = await invokeNative<unknown>('identity_oidc_complete', {
      input: { callback_url: callbackUrl }
    })
    return normalizePayload(raw)
  } catch (err) {
    return foldInvokeError(err)
  }
}

/** ③ 会话状态（只读本地，不联网）：active → 学号掩码 + 过期时间；absent → 无附加字段。 */
export const oidcSessionStatus = async (): Promise<OidcResult> => {
  try {
    const raw = await invokeNative<unknown>('identity_oidc_session_status')
    return normalizePayload(raw)
  } catch (err) {
    return foldInvokeError(err)
  }
}

/** ④ 退出登录：清本地会话（**不清**设备密钥）。成功：`kind:'oidc_logout_ok'`。 */
export const oidcLogout = async (): Promise<OidcResult> => {
  try {
    const raw = await invokeNative<unknown>('identity_oidc_logout')
    return normalizePayload(raw)
  } catch (err) {
    return foldInvokeError(err)
  }
}

/**
 * ⑤（回退路径）发起 OIDC 登录并在**本机回环**上等回调。
 *
 * 何时用：自定义 scheme（`minihbut://`）未被 Casdoor/OS 接受时。需要后端配置
 * `HBUT_IDENTITY_OIDC_LOOPBACK_REDIRECT_URI`（否则 `kind:'oidc_misconfigured'`）。
 * 成功时 `loopbackPort` 为实际监听端口。
 */
export const oidcBeginLoopback = async (): Promise<OidcResult> => {
  try {
    const raw = await invokeNative<unknown>('identity_oidc_begin_loopback')
    return normalizePayload(raw)
  } catch (err) {
    return foldInvokeError(err)
  }
}

/**
 * ⑥（回退路径）等待回环回调并完成登录。
 *
 * `timeoutMs` 由后端 clamp 到 1..600000；超时 → `kind:'oidc_timeout'`，
 * 没有进行中的 loopback → `kind:'oidc_no_pending'`。
 */
export const oidcAwaitCallback = async (timeoutMs: number): Promise<OidcResult> => {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) return fail('unknown')
  try {
    const raw = await invokeNative<unknown>('identity_oidc_await_callback', {
      input: { timeout_ms: Math.trunc(timeoutMs) }
    })
    return normalizePayload(raw)
  } catch (err) {
    return foldInvokeError(err)
  }
}

// 规格 §4.3 文案表重导出（供 UI 层直接引用同一份冻结文案）
export { OIDC_MESSAGES, messageForOidc }
