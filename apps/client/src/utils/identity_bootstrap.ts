/**
 * src/utils/identity_bootstrap.ts —— T10 身份引导（identity bootstrap）：
 * **教务登录成功后**，把 App 本地已有的身份（学号/姓名）换成身份平台令牌。
 *
 * 后端契约（ocr-service 已实现，勿改；参考 ocr-service/modules/identity_bootstrap/routes.py:116-166）：
 * - `POST {base}/identity/bootstrap`
 *   body: `{ student_id: string, student_name: string, proof: object }`
 *   200:  `{ access_token, refresh_token, id_token, token_type, expires_in, scope }`
 *   503:  `{ error: "disabled" | "assertion_not_configured" | "verifier_not_configured" }`
 *   401:  `{ error: "session_not_verified" }`
 *   400:  `{ error: "invalid_student_id" }`
 *
 * 本次启用的模式是 **`app_attestation`**（ocr-service/identity_auth/campus_session.py:356-385）：
 * 客户端**不请求校方**，把 App 内登录教务后本地已知的身份放进
 * `proof.app_identity = { student_id, student_name }`；可带 `proof.device_id`（本机设备标识）
 * 与可选的 `proof.device_signature` + `proof.timestamp`（设备签名由 Rust 侧设备密钥生成，
 * 当前尚未接线，仅在调用方提供时附带）。
 *
 * 硬约束（逐条可验证）：
 * 1. **默认关闭**：开关读远端配置 JSON 的 `identity_bootstrap` 块（键名见
 *    `IDENTITY_BOOTSTRAP_CONFIG_KEY`），仅当 `enabled === true` 时启用；
 *    缺失 / 非对象 / 非 true 一律关闭。关闭时本模块**不发起任何网络请求**，
 *    行为与本改动前完全一致（调用点见 AuthCoordinator.handleLoginSuccess）；
 * 2. **令牌落地复用既有身份域接口**：成功后经本地护栏（issuer 校验 + 主体一致性，
 *    与设备换票同一套 fail-closed 护栏）再 `swapIdentityToken`（内存驻留，
 *    `identity_access_token.ts` 的唯一写路径），**不新建任何存储**；
 * 3. **失败不落令牌**：非 2xx / 200 但缺令牌 / 护栏拒绝 / 网络异常，一律不写令牌状态
 *    （也不清空既有令牌），只产生可诊断的错误结果；
 * 4. **绝不破坏登录主流程**：本模块供登录编排 fire-and-forget 调用（`void maybe...`），
 *    自身所有异常路径都收敛为结构化结果，不向调用方抛出业务异常。
 */
import { normalizeStudentId } from './student_id.js'
import { swapIdentityToken } from './identity_access_token'
// #1171 T13：与设备换票共用同一套本地护栏（issuer 校验不验签，验签是资源服务器的职责）
import { verifyIdentityTokenIssuer } from '../features/identity/identityIssuers'
import { decodeAccessTokenStudentId } from './identity_device_token'
import { IDENTITY_DEVICE_ID_KEY } from '../features/identity/identityStore'
// 后端端点组（叶子模块）：base 解析复用既有归一化，保证与 OCR/云同步同源策略
import {
  normalizeBackendBase,
  normalizeBackendGroups,
  PRIMARY_BACKEND_ORIGIN
} from './backend_endpoints'
// 远端配置快照（无循环：remote_config 不引用本模块）
import { readRemoteConfigSnapshot } from './remote_config'

/** 远端配置 JSON 中的开关键名：`{ "identity_bootstrap": { "enabled": true, "base_url": "..." } }` */
export const IDENTITY_BOOTSTRAP_CONFIG_KEY = 'identity_bootstrap'
/** 引导端点路径（ocr-service 根路径下挂载，无额外前缀；见 entrypoint.py 的 register 调用） */
export const IDENTITY_BOOTSTRAP_PATH = '/identity/bootstrap'
/** 单次引导请求超时：引导只发生在登录成功后，10s 足以覆盖后端建号 + 换票（服务端链路 ~数秒） */
export const IDENTITY_BOOTSTRAP_TIMEOUT_MS = 10 * 1000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const safeText = (value: unknown): string => (value == null ? '' : String(value)).trim()

// ── 开关 ─────────────────────────────────────────────────────────────────

/**
 * 读取远端配置对象里的 `identity_bootstrap` 块（非对象返回 null）。
 * 入参可以是归一化后的 RemoteConfig、原始远端 payload 或任意对象 —— 本函数只做读取，
 * 不做归一化（归一化由 remote_config.normalizeRemoteConfig 负责，见其 identity_bootstrap 保留行）。
 */
const readIdentityBootstrapBlock = (config: unknown): Record<string, unknown> | null => {
  const root = isRecord(config) ? config : null
  if (!root) return null
  const block = root[IDENTITY_BOOTSTRAP_CONFIG_KEY]
  return isRecord(block) ? block : null
}

/**
 * 身份引导开关：**默认 false**。
 * 仅当远端配置 `identity_bootstrap.enabled === true` 时返回 true；
 * 其余一切形态（config 缺失 / 块缺失 / 块非对象 / enabled 非 true）一律 false（fail closed）。
 */
export const isIdentityBootstrapEnabled = (config: unknown): boolean => {
  const block = readIdentityBootstrapBlock(config)
  if (!block) return false
  return block.enabled === true
}

/**
 * 解析引导请求基址（origin，不含路径），优先级：
 * 1. `identity_bootstrap.base_url`（显式覆盖，HTTPS / loopback 校验）；
 * 2. 后端端点组（`backend.groups`）第一个启用组的 base（与 OCR/云同步同源策略）；
 * 3. 内置主域 `PRIMARY_BACKEND_ORIGIN`（契约 §9 生产域白名单）。
 */
export const resolveIdentityBootstrapBaseUrl = (config: unknown): string => {
  const block = readIdentityBootstrapBlock(config)
  const explicit = normalizeBackendBase(block ? block.base_url ?? block.baseUrl : '')
  if (explicit) return explicit
  const root = isRecord(config) ? config : {}
  const backend = isRecord(root.backend) ? root.backend : {}
  const groups = normalizeBackendGroups(backend.groups).groups
  for (const group of groups) {
    if (group.enabled) return group.base
  }
  return PRIMARY_BACKEND_ORIGIN
}

// ── 请求构造 ─────────────────────────────────────────────────────────────

export interface IdentityBootstrapRequest {
  student_id: string
  student_name: string
  proof: {
    /** App 自证身份（app_attestation 模式唯一必需字段；后端只认 10 位学号） */
    app_identity: {
      student_id: string
      student_name: string
    }
    /** 本机设备标识（有则带上；用于后端设备维度审计/验签扩展） */
    device_id?: string
    /** 设备签名（Rust 侧设备密钥产出，当前未接线，仅调用方提供时附带） */
    device_signature?: string
    /** 签名对应时间戳（Unix 秒），与 device_signature 成对出现 */
    timestamp?: number
  }
}

export interface BuildBootstrapPayloadInput {
  studentId: string
  studentName?: string
  deviceId?: string
  deviceSignature?: string
  timestamp?: number
}

/**
 * 构造 `POST /identity/bootstrap` 请求体（app_attestation 形状）。
 * - `proof.app_identity` 恒存在（学号/姓名取 trim 后值；空姓名允许，后端 name 可选）；
 * - `device_id` 有则带上；`device_signature` 有则连同 `timestamp` 一并带上。
 */
export const buildBootstrapPayload = (
  input: BuildBootstrapPayloadInput
): IdentityBootstrapRequest => {
  const studentId = safeText(input.studentId)
  const studentName = safeText(input.studentName)
  const proof: IdentityBootstrapRequest['proof'] = {
    app_identity: {
      student_id: studentId,
      student_name: studentName
    }
  }
  const deviceId = safeText(input.deviceId)
  if (deviceId) proof.device_id = deviceId
  const signature = safeText(input.deviceSignature)
  if (signature) {
    proof.device_signature = signature
    const ts = Number(input.timestamp)
    proof.timestamp = Number.isFinite(ts) && ts > 0 ? Math.round(ts) : Math.floor(Date.now() / 1000)
  }
  return {
    student_id: studentId,
    student_name: studentName,
    proof
  }
}

// ── 交换（POST + 严格解析） ──────────────────────────────────────────────

/** 200 返回的令牌（字段与后端契约逐字对应） */
export interface IdentityBootstrapTokens {
  access_token: string
  refresh_token: string
  id_token: string
  token_type: string
  expires_in: number
  scope: string
}

export interface IdentityBootstrapSuccess {
  ok: true
  tokens: IdentityBootstrapTokens
}

/** 后端明确拒绝（非 2xx，error 字段已映射为可读文案；`malformed_response` = 200 但形状不对） */
export interface IdentityBootstrapRejected {
  ok: false
  kind: 'rejected'
  /** 后端 error 字段原文（如 session_not_verified）；非 2xx 无 error 字段时为 `unknown_status` */
  error: string
  /** 用户/诊断可读的中文文案（不含令牌） */
  message: string
  status: number
}

/** 网络层异常（fetch 抛错 / 超时 / 响应非 JSON 且非 2xx 等传输层问题） */
export interface IdentityBootstrapNetworkError {
  ok: false
  kind: 'network'
  error: 'network'
  message: string
  /** 原始异常（供日志；不进入用户文案，绝不含令牌） */
  cause?: unknown
}

export type IdentityBootstrapExchangeResult =
  | IdentityBootstrapSuccess
  | IdentityBootstrapRejected
  | IdentityBootstrapNetworkError

/** 可注入的 fetch（缺省用全局 fetch；签名与 DOM fetch 的 url 形式一致） */
export type IdentityBootstrapFetch = (url: string, init?: RequestInit) => Promise<Response>

/** 后端 error kind → 可读文案（kind 脱敏映射，与后端 _KIND_STATUS 对齐） */
const ERROR_MESSAGES: Record<string, string> = {
  disabled: '身份平台引导功能未开启',
  assertion_not_configured: '身份平台断言未配置，请稍后重试',
  verifier_not_configured: '身份平台校验器未配置，请稍后重试',
  session_not_verified: '教务会话身份校验未通过，请重新登录后再试',
  invalid_student_id: '学号无效，请重新登录'
}

const readableError = (error: string, status: number): string =>
  ERROR_MESSAGES[error] || `身份引导失败（${error}，状态 ${status}）`

const readFetchImpl = (fetchImpl?: IdentityBootstrapFetch): IdentityBootstrapFetch | null => {
  if (fetchImpl) return fetchImpl
  const globalFetch = (globalThis as { fetch?: unknown }).fetch
  return typeof globalFetch === 'function'
    ? (globalFetch as IdentityBootstrapFetch)
    : null
}

/**
 * 执行一次身份引导交换：POST {base}/identity/bootstrap 并**严格解析**返回。
 *
 * 结果语义（绝不把失败吞成成功）：
 * - 200 且 `access_token` 为非空字符串 → `{ ok: true, tokens }`（其余字段按契约归一化）；
 * - 200 但缺 access_token / 非对象 → `{ ok: false, kind: 'rejected', error: 'malformed_response' }`；
 * - 非 2xx → 读取 body 的 `error` 字段映射为可读错误；无 error 字段时按 `unknown_status`；
 * - fetch 抛错 / 超时 → `{ ok: false, kind: 'network', cause }`（原样上抛为结构化 cause）。
 */
export const exchangeIdentityBootstrap = async (input: {
  baseUrl: string
  payload: IdentityBootstrapRequest
  fetchImpl?: IdentityBootstrapFetch
  timeoutMs?: number
}): Promise<IdentityBootstrapExchangeResult> => {
  const base = safeText(input.baseUrl)
  const fetchImpl = readFetchImpl(input.fetchImpl)
  if (!base || !fetchImpl) {
    return {
      ok: false,
      kind: 'network',
      error: 'network',
      message: '无可用的网络请求能力（fetch 未注入且环境无全局 fetch）'
    }
  }
  const url = `${base.replace(/\/+$/, '')}${IDENTITY_BOOTSTRAP_PATH}`
  const timeoutMs = input.timeoutMs ?? IDENTITY_BOOTSTRAP_TIMEOUT_MS
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timer: ReturnType<typeof setTimeout> | null = null
  if (controller && timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input.payload),
      signal: controller?.signal
    })
    const status = response.status
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    if (status >= 200 && status < 300) {
      if (!isRecord(body) || typeof body.access_token !== 'string' || !body.access_token.trim()) {
        return {
          ok: false,
          kind: 'rejected',
          error: 'malformed_response',
          message: '身份引导返回形状异常（缺少 access_token），已丢弃',
          status
        }
      }
      const tokens: IdentityBootstrapTokens = {
        access_token: body.access_token.trim(),
        refresh_token: typeof body.refresh_token === 'string' ? body.refresh_token : '',
        id_token: typeof body.id_token === 'string' ? body.id_token : '',
        token_type: typeof body.token_type === 'string' && body.token_type.trim()
          ? body.token_type
          : 'Bearer',
        expires_in: Number(body.expires_in) || 0,
        scope: typeof body.scope === 'string' ? body.scope : ''
      }
      return { ok: true, tokens }
    }
    const kind = isRecord(body) && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : 'unknown_status'
    return {
      ok: false,
      kind: 'rejected',
      error: kind,
      message: readableError(kind, status),
      status
    }
  } catch (cause) {
    const raw = String((cause as Error)?.message || cause || '')
    return {
      ok: false,
      kind: 'network',
      error: 'network',
      message: `身份引导网络异常：${raw.slice(0, 160) || '请求失败'}`,
      cause
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ── 本地身份来源（复用既有存储，不新建） ─────────────────────────────────

const readStorageString = (key: string): string => {
  try {
    return String(globalThis.localStorage?.getItem(key) || '').trim()
  } catch {
    return ''
  }
}

const parseStoredJson = (raw: string): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** 拆包 `setCachedData` 的 `{ data, timestamp }` 结构（与 MoreView 的 unwrap 语义一致） */
const unwrapCachedPayload = (payload: unknown): Record<string, unknown> => {
  if (!isRecord(payload)) return {}
  const inner = payload.data
  return isRecord(inner) ? inner : payload
}

/**
 * 从**既有**本地存储读取学生姓名（复用 MoreView 已写入的键，不新建存储）：
 * 1. `hbu_more_module_student_profile:<sid>`（MoreView 学生画像，`.name`）；
 * 2. `cache:studentinfo:<sid>` / `cache:student_info:<sid>`（学生信息缓存，
 *    `.name | .student_name | .studentName | .xm | .XM`，与 MoreView 候选键一致）。
 * 读不到返回空串（姓名在后端是可选字段，空值不影响换票）。
 */
export const readStoredStudentName = (studentId: string): string => {
  const sid = normalizeStudentId(studentId)
  if (!sid) return ''
  const profile = parseStoredJson(readStorageString(`hbu_more_module_student_profile:${sid}`))
  const fromProfile = isRecord(profile) ? safeText(profile.name) : ''
  if (fromProfile) return fromProfile
  for (const key of [`cache:studentinfo:${sid}`, `cache:student_info:${sid}`]) {
    const unwrapped = unwrapCachedPayload(parseStoredJson(readStorageString(key)))
    const name = safeText(
      unwrapped.name || unwrapped.student_name || unwrapped.studentName || unwrapped.xm || unwrapped.XM
    )
    if (name) return name
  }
  return ''
}

/** 读取本机设备标识（复用 identity 设备元数据的既有键；未注册设备时为空） */
const readStoredDeviceId = (): string => readStorageString(IDENTITY_DEVICE_ID_KEY)

// ── 登录成功后的引导包装（接线点用） ────────────────────────────────────

export type MaybeBootstrapOutcome =
  /** 开关关闭（默认）：未发起任何请求 */
  | { status: 'disabled' }
  /** 学号缺失/非法（非 9-10 位数字）：未发起请求 */
  | { status: 'invalid_student_id' }
  /** 无法解析基址：未发起请求 */
  | { status: 'no_base_url' }
  /** 后端明确拒绝（含 200 但形状异常 / 本地护栏拒绝）：不落令牌 */
  | { status: 'rejected'; error: string; message: string; httpStatus?: number }
  /** 网络异常等：不落令牌 */
  | { status: 'failed'; error: string; message: string }
  /** 成功：令牌已经 swapIdentityToken 落进身份域内存 */
  | { status: 'ok' }

export interface MaybeBootstrapIdentityInput {
  /** 当前登录成功的学号（AuthCoordinator 登录收口处传入） */
  studentId: string
  /** 学姓名；缺省时自动从既有学生画像/缓存读取（readStudentName 注入可覆盖） */
  studentName?: string
  /** 远端配置对象；缺省经 readConfig（默认 readRemoteConfigSnapshot）读取 */
  config?: unknown
  /** 读取远端配置（测试注入点；缺省读已落盘快照） */
  readConfig?: () => unknown
  /** 显式基址（测试注入优先于 config 解析） */
  baseUrl?: string
  /** 注入 fetch（测试用假实现）；缺省用全局 fetch */
  fetchImpl?: IdentityBootstrapFetch
  /** 注入设备标识读取（缺省读 IDENTITY_DEVICE_ID_KEY） */
  readDeviceId?: () => string
  /** 注入姓名读取（缺省 readStoredStudentName） */
  readStudentName?: () => string
  /** 诊断上报（缺省 console.warn；文案已脱敏，绝不含令牌） */
  report?: (message: string) => void
}

/**
 * 身份引导总入口（登录成功后调用；开关默认关闭 → 直接返回 disabled，零请求零副作用）。
 *
 * 内部顺序（任一前置不满足即停，绝不发无谓请求）：
 * 1. 开关（`identity_bootstrap.enabled === true`）；
 * 2. 学号校验（9-10 位数字，复用 student_id 契约）；
 * 3. 基址解析（显式 > identity_bootstrap.base_url > backend 组 > 内置主域）；
 * 4. 交换（POST + 严格解析）；
 * 5. 本地护栏：issuer 校验（fail closed）+ 主体一致性（令牌含 hbut_student_id 且
 *    与本次学号不一致 → 丢弃，防跨账号错配）；
 * 6. 落地：`swapIdentityToken`（身份域唯一写路径，内存驻留，不新建存储）。
 */
export const maybeBootstrapIdentity = async (
  input: MaybeBootstrapIdentityInput
): Promise<MaybeBootstrapOutcome> => {
  const report = input.report ?? ((message: string) => console.warn('[IdentityBootstrap]', message))

  const config = input.config ?? (input.readConfig ?? readRemoteConfigSnapshot)()
  // 1. 开关：默认 false —— 关闭时不发起任何请求（与改动前行为完全一致）
  if (!isIdentityBootstrapEnabled(config)) {
    return { status: 'disabled' }
  }
  // 2. 学号：缺失/非法不发请求（后端只认 10 位学号；9 位研究生号本地先放行交由后端判定）
  const studentId = normalizeStudentId(input.studentId)
  if (!studentId) {
    return { status: 'invalid_student_id' }
  }
  const studentName = safeText(input.studentName) || (input.readStudentName ?? (() => readStoredStudentName(studentId)))()
  const deviceId = (input.readDeviceId ?? readStoredDeviceId)()

  const explicitBase = safeText(input.baseUrl)
  // 3. 基址：显式覆盖优先；解析失败（空）时不发请求
  const base = explicitBase
    ? normalizeBackendBase(explicitBase)
    : resolveIdentityBootstrapBaseUrl(config)
  if (!base) {
    return { status: 'no_base_url' }
  }

  // 4. 交换
  const payload = buildBootstrapPayload({ studentId, studentName, deviceId })
  const result = await exchangeIdentityBootstrap({
    baseUrl: base,
    payload,
    fetchImpl: input.fetchImpl
  })
  if (!result.ok) {
    if (result.kind === 'network') {
      report(result.message)
      return { status: 'failed', error: result.error, message: result.message }
    }
    report(`${result.message}（${result.error}）`)
    return { status: 'rejected', error: result.error, message: result.message, httpStatus: result.status }
  }

  const token = result.tokens.access_token
  // 5. 本地护栏（与设备换票同一套；fail closed，拒绝时不落令牌）
  const issuerCheck = verifyIdentityTokenIssuer(token)
  if (!issuerCheck.ok) {
    report(issuerCheck.message)
    return { status: 'rejected', error: 'issuer_check_failed', message: issuerCheck.message }
  }
  const tokenStudentId = decodeAccessTokenStudentId(token)
  // fail closed：**缺失** `hbut_student_id` 也必须拒绝（与 identity_device_token.ts:133 对齐）——
  // 否则一个合法签发但缺该 claim 的令牌（如被替换的响应）会跳过主体一致性检查而落地。
  if (!tokenStudentId || tokenStudentId !== studentId) {
    report('身份引导令牌缺少主体或与本地会话学号不一致，已丢弃')
    return { status: 'rejected', error: 'subject_mismatch', message: '身份引导令牌缺少主体或与本地会话学号不一致，已丢弃' }
  }
  // 6. 落地：既有身份域唯一写路径（内存；登出/切号由既有事件监听统一清理）
  swapIdentityToken(token)
  return { status: 'ok' }
}
