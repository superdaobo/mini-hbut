/**
 * src/utils/identity_sign_canonical.ts —— P1-1 (goal-10) 身份 v2：canonical 构造 + 设备密钥签名（正式路径）。
 *
 * 背景：
 *   身份 v2（设备 Ed25519 直证）的 canonical 构造 / 签名 / 自检全部在 Rust 侧
 *   （`src-tauri/src/identity/sign_canonical.rs`），通过两条 Tauri 命令
 *   `identity_build_v2_canonical` / `identity_sign_canonical` 暴露。本文件是这两条命令
 *   在前端的**唯一**调用封装：前端安全构造 canonical，并请求设备私钥签名
 *   （私钥绝不出 Rust 进程，前端只收到公钥 JWK（本就公开）与签名材料）。
 *
 * 与 `identity_v2_dev_seam.ts`（DEV 缝）的差异：
 *   - 这是**正式路径**：任何构建都可用，无 DEV 门控、无 globalThis 开关；
 *   - 失败时不返回「失败形状」，而是以**稳定文案**的 Error 直接 reject
 *     （未登记 / 未登录 / 响应畸形时不返回任何签名材料）。
 *
 * 安全边界（必须保持）：
 *   - 本模块不持有任何密钥材料（私钥只在 Rust 进程内的 OS keyring）；
 *   - **绝不**把签名 / 公钥 / 姓名 / 学号写入 console 或任何存储；
 *   - invoke reject（未登记 / 未登录 / InvalidInput / 命令未注册等）→ 统一折叠为
 *     固定文案后重新抛出，**不透传**原始错误细节（错误文本可能携带命令名以外内容）；
 *   - 畸形响应（缺字段 / 类型不符）→ 一律折叠为失败（reject），**绝不**把畸形数据
 *     当成功透出。
 */

import { invokeNative } from '../platform/native'

/**
 * `identity_build_v2_canonical` 命令的输出形状（字段名与 Rust 侧 serde 序列化一一对应，
 * snake_case，不做映射）。device_id / 学号由 Rust 侧从本地状态与登录会话取，前端不传。
 */
export interface BuildIdentityV2CanonicalResult {
  /** canonical v1 明文：v1|device_id|student_id|name_hash|nonce|ts（无末尾换行；签名对象） */
  canonical: string
  /** 设备标识（本身即对外可见标识，不敏感） */
  device_id: string
  /** 学号掩码（前 4 位 + `***`；不回传明文完整学号） */
  student_id_masked: string
  /** sha256(student_name utf8) 的小写 hex；姓名为空 → 空串的 sha256 */
  student_name_hash: string
  /** 一次性 nonce（32 位小写 hex） */
  nonce: string
  /** unix 秒 */
  ts: number
}

/**
 * `identity_sign_canonical` 命令的输出形状（与 Rust 侧 SignedCanonicalPayload 对应，snake_case）。
 * 返回的签名可用 public_key_jwk + alg 独立验签（Rust 侧已先自检一次）。
 */
export interface SignedCanonicalResult {
  device_id: string
  /** 恒为 "Ed25519" */
  alg: 'Ed25519'
  /** base64url（无 padding；64 字节 → 86 字符） */
  signature: string
  /** 设备密钥指纹（公开、日志可用） */
  fingerprint: string
  /** 公钥 JWK JSON 字符串（{"kty":"OKP","crv":"Ed25519","x":"..."}；公钥本就公开） */
  public_key_jwk: string
  /** sha256(canonical) 小写 hex（64 字符；日志中替代明文） */
  canonical_sha256: string
  /** 学号掩码（前 4 位 + `***`） */
  student_id_masked: string
}

/** 命令名（Rust 侧 `#[tauri::command]` 的登记名） */
const BUILD_CANONICAL_COMMAND = 'identity_build_v2_canonical'
const SIGN_CANONICAL_COMMAND = 'identity_sign_canonical'

/**
 * 稳定错误文案（固定字符串：不携带任何原始错误细节，也不携带调用方入参）：
 * - invoke reject 类：折叠为「不满足前置条件 / 命令不可用」；
 * - 响应畸形类：折叠为「响应形状异常」。
 */
const ERR_BUILD_INVOKE =
  '构造身份 v2 canonical 失败：当前环境不满足构造条件（未登录或命令不可用）'
const ERR_BUILD_MALFORMED = '构造身份 v2 canonical 失败：Rust 侧响应形状异常'
const ERR_SIGN_INPUT = '签名 canonical 失败：输入缺失或不合法'
const ERR_BUILD_INPUT = '构造 canonical 失败：输入缺失或不合法'
const ERR_SIGN_INVOKE =
  '签名 canonical 失败：当前环境不满足签名条件（设备未登记、未登录或命令不可用）'
const ERR_SIGN_MALFORMED = '签名 canonical 失败：Rust 侧响应形状异常'

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0

/** 构造命令响应中的字符串字段（任一缺失 / 空 → 视为畸形） */
const BUILD_STRING_FIELDS = [
  'canonical',
  'device_id',
  'student_id_masked',
  'student_name_hash',
  'nonce'
] as const

/**
 * 防御式校验构造命令的 Rust 响应：
 * 任一字段缺失 / 类型不符 → null（畸形响应一律按失败处理，绝不原样放行）。
 */
const normalizeBuildCanonical = (raw: unknown): BuildIdentityV2CanonicalResult | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  for (const key of BUILD_STRING_FIELDS) {
    if (!isNonEmptyString(record[key])) return null
  }
  if (typeof record.ts !== 'number' || !Number.isFinite(record.ts)) return null
  return {
    canonical: record.canonical as string,
    device_id: record.device_id as string,
    student_id_masked: record.student_id_masked as string,
    student_name_hash: record.student_name_hash as string,
    nonce: record.nonce as string,
    ts: record.ts as number
  }
}

/** 签名命令响应中的字符串字段（任一缺失 / 空 → 视为畸形） */
const SIGN_STRING_FIELDS = [
  'device_id',
  'alg',
  'signature',
  'fingerprint',
  'public_key_jwk',
  'canonical_sha256',
  'student_id_masked'
] as const

/**
 * 防御式校验签名命令的 Rust 响应：
 * 任一字段缺失 / 类型不符，或 alg 不是 "Ed25519" → null
 * （畸形签名材料绝不按成功透出）。
 */
const normalizeSignedCanonical = (raw: unknown): SignedCanonicalResult | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  for (const key of SIGN_STRING_FIELDS) {
    if (!isNonEmptyString(record[key])) return null
  }
  if (record.alg !== 'Ed25519') return null
  return {
    device_id: record.device_id as string,
    alg: 'Ed25519',
    signature: record.signature as string,
    fingerprint: record.fingerprint as string,
    public_key_jwk: record.public_key_jwk as string,
    canonical_sha256: record.canonical_sha256 as string,
    student_id_masked: record.student_id_masked as string
  }
}

/**
 * 构造 v2 canonical（device_id / 学号由 Rust 侧从本地状态与登录会话取，前端不传）。
 *
 * - 参数键按 camelCase 传入（Tauri v2 约定：Rust 侧 snake_case 由框架自动转换）；
 * - 缺省的可选字段**不传**（`studentName` 未给就不传该键，避免 Rust 侧把空串当姓名）；
 * - invoke reject / 响应畸形 → 以稳定文案 reject，不透传原始细节；不写日志、不写存储。
 */
export const buildIdentityV2Canonical = async (input: {
  /** 本机已登记 device_id（Rust 侧 `input.device_id`，必填） */
  deviceId: string
  studentName?: string
  nonce?: string
  ts?: number
}): Promise<BuildIdentityV2CanonicalResult> => {
  // 本地守卫：device_id 必须是非空（含去掉首尾空白后仍非空）字符串
  if (typeof input?.deviceId !== 'string' || input.deviceId.trim() === '') {
    throw new Error(ERR_BUILD_INPUT)
  }
  // **契约**（复核 R1）：Rust 侧是单参结构体 `input`，Tauri v2 按 `args["input"]` 取参，
  // 且 serde 字段名是 snake_case（Tauri 不做 camelCase 自动转换）。
  // 同仓正确姿势见 `src/app/coordinators/IdentityCoordinator.ts` 的 `identity_sign_auth_request`。
  const payload: Record<string, unknown> = { device_id: input.deviceId }
  if (input.studentName !== undefined) payload.student_name = input.studentName
  if (input.nonce !== undefined) payload.nonce = input.nonce
  if (input.ts !== undefined) payload.ts = input.ts

  let raw: unknown
  try {
    raw = await invokeNative<unknown>(BUILD_CANONICAL_COMMAND, { input: payload })
  } catch {
    // invoke 失败（未登录 / 命令未注册 / 当前运行时不支持 invoke 等）：
    // 统一折叠为固定文案重新抛出，不透传原始错误细节（错误文本可能携带命令名以外内容）
    throw new Error(ERR_BUILD_INVOKE)
  }

  const normalized = normalizeBuildCanonical(raw)
  if (normalized === null) {
    // 畸形响应（缺字段 / 类型不符）：绝不按成功处理，折叠为失败
    throw new Error(ERR_BUILD_MALFORMED)
  }
  return normalized
}

/**
 * 对 canonical 签名（P1-1 主命令；未登记 / 未登录时 Rust 返回 Err → 前端折叠为
 * 稳定文案 reject，不返回任何签名材料）。
 *
 * - 入参 camelCase：deviceId / studentId / canonical（对应 Rust 侧 device_id / student_id / canonical）；
 * - invoke reject / 响应畸形 → 以稳定文案 reject；不透传原始细节；不写日志、不写存储。
 */
export const signIdentityV2Canonical = async (input: {
  /** 设备标识（Rust 侧 `device_id`） */
  deviceId: string
  /** 学号（Rust 侧 `student_id`） */
  studentId: string
  /** canonical v1 明文（签名对象） */
  canonical: string
}): Promise<SignedCanonicalResult> => {
  // 本地守卫：三个入参必须是非空字符串（运行时防御，含 input 本身为 null/undefined），
  // 否则直接以稳定文案 reject，不触达原生命令
  if (
    !isNonEmptyString(input?.deviceId) ||
    !isNonEmptyString(input?.studentId) ||
    !isNonEmptyString(input?.canonical)
  ) {
    throw new Error(ERR_SIGN_INPUT)
  }

  let raw: unknown
  try {
    raw = await invokeNative<unknown>(SIGN_CANONICAL_COMMAND, {
      input: {
        device_id: input.deviceId,
        student_id: input.studentId,
        canonical: input.canonical
      }
    })
  } catch {
    // invoke 失败（设备未登记 / 未登录 / canonical 与设备或学号不匹配 / 命令未注册 等）：
    // 统一折叠为固定文案重新抛出，不透传原始错误细节
    throw new Error(ERR_SIGN_INVOKE)
  }

  const normalized = normalizeSignedCanonical(raw)
  if (normalized === null) {
    // 畸形响应（缺字段 / 类型不符 / alg 不符）：绝不把签名材料当成功透出，折叠为失败
    throw new Error(ERR_SIGN_MALFORMED)
  }
  return normalized
}
