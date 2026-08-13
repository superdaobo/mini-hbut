// src/features/identity/qr/parseIdentityQr.ts
//
// #627：跨设备二维码 Identity 授权 payload 解析（纯函数，可单测）。
//
// 与 #621 深链共用同一 AuthRequest：本模块**不重新发明解析**，核心校验全部
// 委托给 #621 冻结的 parseMiniHbutDeepLink()（minihbut:// 统一 parser），
// 解析结果与深链完全同构（{ kind: 'identity', requestId, handoff }），
// 扫码后直接把 requestId/handoff 交给 IdentityCoordinator.submitIntent ——
// 与同设备 Deep Link 进入的是同一个 intent store / Overlay / 审批签名链路。
//
// 支持两种 payload 形态：
//   1. 主形态（QR 直接编码）：
//        minihbut://identity?request_id=ar_xxx&handoff=<short-lived>&source=qr
//   2. human/browser fallback（系统相机对 custom scheme 兼容差时由网页提供）：
//        https://auth.<domain>/r/<request_id>#h=<secret>   （secret 只在 fragment）
//      解析时**绝不从 query 读取任何凭据**（防把 secret 降级放进 URL 参数）。
//
// 安全边界（与 #621/#630 一致）：
//   - QR 内容不含 student_id / 应用描述 / scopes / authorization code / token；
//   - 任何解析失败只返回通用文案，绝不回显原始 URL / request_id / handoff；
//   - 本地只做格式校验，真实过期/授权判定始终由 Core（expires_at/status）决定。

import { parseMiniHbutDeepLink } from '../../../platform/deep_link'
import {
  IDENTITY_HANDOFF_PATTERN,
  IDENTITY_REQUEST_ID_PATTERN
} from '../../../platform/deep_link'

/** QR 内容总长上限：与 #621 深链上限一致（防解析放大与日志污染） */
export const IDENTITY_QR_MAX_LENGTH = 2048

/** QR payload 的 source 标记（与深链共用同一 request，source 仅作来源标记，非安全边界） */
export const IDENTITY_QR_SOURCE = 'qr'

/** https fallback 允许的 path 前缀（接力页 /r/<request_id> 与预留 /handoff/<request_id>） */
const HTTPS_FALLBACK_PATH_RE = /^\/(?:handoff|r)\/([A-Za-z0-9_-]{3,64})\/?$/

/** https fallback fragment 中 handoff 的键名（与 #630 HANDOFF_HASH_KEY 一致） */
export const IDENTITY_QR_HASH_KEY = 'h'

/** 解析失败：统一安全文案（不区分缺哪个参数，不回显输入内容） */
export const IDENTITY_QR_INVALID_MESSAGE = '这不是有效的 Mini-HBUT 登录二维码'

/** 统一解析结果：成功时与 #621 MiniHbutDeepLink['identity'] 完全同构 */
export type IdentityQrParseResult =
  | { ok: true; link: { kind: 'identity'; requestId: string; handoff: string } }
  | { ok: false; error: { code: 'invalid_code'; message: string } }

const fail = (): IdentityQrParseResult => ({
  ok: false,
  error: { code: 'invalid_code', message: IDENTITY_QR_INVALID_MESSAGE }
})

/**
 * 构造 QR payload（与网页侧 lib/auth/qr.ts 的 buildIdentityQrPayload 保持一致；
 * 本函数主要供测试断言 payload 规则，也供未来需要生成 QR 的场景使用）。
 * 只含 request_id / handoff / source，不含任何 PII 与 OAuth 材料。
 */
export const buildIdentityQrPayload = (requestId: string, handoff: string): string =>
  `minihbut://identity?request_id=${encodeURIComponent(requestId)}&handoff=${encodeURIComponent(handoff)}&source=${IDENTITY_QR_SOURCE}`

/**
 * 解析扫码得到的文本（系统相机 / 图片解码 / 手动粘贴的 https fallback 统一入口）。
 * - minihbut://identity：委托 #621 parseMiniHbutDeepLink 严格校验；
 * - https fallback：校验 path 中的 request_id + fragment 中的高熵 handoff；
 *   query 中出现任何内容（尤其 handoff/secret）一律拒绝（fail closed）；
 * - 其余一律 invalid_code。
 */
export const parseIdentityQr = (raw: string): IdentityQrParseResult => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return fail()
  }
  const trimmed = raw.trim()
  if (trimmed.length > IDENTITY_QR_MAX_LENGTH) {
    return fail()
  }
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('minihbut:')) {
    return parseMiniHbutIdentityQr(trimmed)
  }
  if (lower.startsWith('https:') || lower.startsWith('http:')) {
    return parseHttpsFallbackQr(trimmed)
  }
  return fail()
}

/** minihbut:// 主形态：委托 #621 parser，并校验 source 标记（缺失或 =qr 均接受） */
const parseMiniHbutIdentityQr = (raw: string): IdentityQrParseResult => {
  const result = parseMiniHbutDeepLink(raw)
  if (!result.ok || result.link.kind !== 'identity') {
    return fail()
  }
  // source 仅作来源标记：与同设备 Deep Link 共用同一请求时深链可能不带 source，
  // 故缺失接受；出现但值非法则拒绝（防伪装/混淆）。
  try {
    const source = new URL(raw).searchParams.get('source')
    if (source !== null && source !== '' && source !== IDENTITY_QR_SOURCE) {
      return fail()
    }
  } catch {
    return fail()
  }
  return { ok: true, link: result.link }
}

/**
 * https fallback 形态：https://<host>/r/<request_id>#h=<secret>（或 /handoff/）。
 * 安全要点：
 *   - handoff 只从 fragment 读取（#h=），fragment 不会进入服务器日志/HTTP 请求；
 *   - query 非空一律拒绝：secret 放进 query 属于已知降级攻击，fail closed；
 *   - request_id / handoff 格式复用 #621 合同正则。
 */
const parseHttpsFallbackQr = (raw: string): IdentityQrParseResult => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail()
  }
  if (url.search !== '' || url.searchParams.size > 0) {
    return fail()
  }
  const match = HTTPS_FALLBACK_PATH_RE.exec(url.pathname)
  if (!match) {
    return fail()
  }
  const requestId = match[1]
  if (!IDENTITY_REQUEST_ID_PATTERN.test(requestId)) {
    return fail()
  }
  const params = new URLSearchParams(url.hash.slice(1))
  const handoff = params.get(IDENTITY_QR_HASH_KEY) || ''
  if (!IDENTITY_HANDOFF_PATTERN.test(handoff)) {
    return fail()
  }
  return { ok: true, link: { kind: 'identity', requestId, handoff } }
}
