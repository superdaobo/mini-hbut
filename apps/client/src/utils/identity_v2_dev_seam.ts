/**
 * src/utils/identity_v2_dev_seam.ts —— P0-7 (goal-10) 身份 v2：仅 DEV 可用的签名自检调用缝。
 *
 * 背景：
 *   身份 v2（设备 Ed25519 直证）的 canonical / 签名 / 自检全部在 Rust 侧
 *   （`src-tauri/src/identity/v2_signature.rs` + `v2_dev_seam.rs`），通过 Tauri 命令
 *   `identity_v2_dev_sign_selfcheck` 暴露。本文件是该命令在前端的**唯一**调用缝，
 *   用于 DEV / 真机联调时验证 App 侧签名链路（canonical 与 ocr-service 逐字节一致、
 *   自检验签通过）。
 *
 * 安全边界（与既有 `__HBUT_IDENTITY_AT_STUB__` 缝同类，必须保持）：
 *   - **只在 DEV 构建生效**：生产构建 `import.meta.env.DEV` 为 false → 永远读不到开关，
 *     且**绝不**发起 `invoke`（生产 fail closed）；
 *   - DEV 构建内仍需显式开关 `globalThis.__HBUT_IDENTITY_V2_DEV__ = true`
 *     （双门：DEV 构建 + 显式开关）；
 *   - 本模块不持有任何密钥材料：私钥只在 Rust 进程内（OS keyring），
 *     前端只收到公钥 JWK（本就公开）与自检结论；
 *   - **绝不**把签名 / 公钥 / 姓名等敏感值写入 console 或任何存储；
 *   - 畸形响应（缺字段 / 类型错 / 命令错误）一律折叠为失败形状，不向调用方抛出，
 *     也不透传原始错误细节。
 */

import { invokeNative } from '../platform/native'

/** 身份 v2 设备签名证明（字段名与 Rust 侧 V2Proof 的 serde 序列化一一对应，snake_case，不做映射） */
export interface IdentityV2DevProof {
  /** 设备标识（本身即对外可见标识，不敏感） */
  device_id: string
  /** 学号 */
  student_id: string
  /** sha256(student_name utf8) 的小写 hex；姓名为空 → 空串的 sha256 */
  student_name_hash: string
  /** 一次性 nonce（32 位小写 hex） */
  nonce: string
  /** unix 秒 */
  ts: number
  /** 恒为 "Ed25519" */
  alg: string
  /** canonical v1 明文：v1|device_id|student_id|name_hash|nonce|ts（无末尾换行） */
  canonical: string
  /** base64url（无 padding；64 字节 → 86 字符） */
  signature: string
  /** 公钥 JWK JSON 字符串（{"kty":"OKP","crv":"Ed25519","x":"..."}；公钥本就公开） */
  public_key_jwk: string
}

/** 缝开启时的自检结果（字段名与 Rust 侧 V2DevSelfcheck 对应） */
export interface IdentityV2DevSelfcheckOk {
  enabled: true
  /** Rust 侧用证明内公钥 JWK 重新验签的结论 */
  self_check_ok: boolean
  /** 人读说明（Rust 侧保证不含敏感值） */
  message: string
  /** 自检失败 / 响应畸形时为 null（不把不可信数据透传给 UI） */
  proof: IdentityV2DevProof | null
}

/** 缝关闭时的结果：读不到 DEV 全局 → 绝不调用命令，直接返回该形状 */
export interface IdentityV2DevSelfcheckDisabled {
  enabled: false
  /** 关闭原因（中文，不含敏感值，不含调用方入参） */
  reason: string
}

export type IdentityV2DevSelfcheckResult = IdentityV2DevSelfcheckOk | IdentityV2DevSelfcheckDisabled

/** 命令名（Rust 侧 `#[tauri::command]` 的登记名） */
export const IDENTITY_V2_DEV_COMMAND = 'identity_v2_dev_sign_selfcheck'

/**
 * DEV 缝开关（双门，与既有 AT 打桩缝同类）：
 *   1) 必须 DEV 构建（生产构建 `import.meta.env.DEV` 为 false → 立即 false，永远读不到全局）；
 *   2) 且 `globalThis.__HBUT_IDENTITY_V2_DEV__ === true`（调试方在 DevTools 中显式开启）。
 * 任何异常（含 globalThis 访问受限）→ false（fail closed）。
 */
export const isIdentityV2DevSeamEnabled = (): boolean => {
  if (!import.meta.env?.DEV) return false
  try {
    const flag = (globalThis as unknown as Record<string, unknown>)['__HBUT_IDENTITY_V2_DEV__']
    return flag === true
  } catch {
    return false
  }
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0

/** 证明体的字符串字段（任一缺失 / 空 → 视为畸形） */
const PROOF_STRING_FIELDS = [
  'device_id',
  'student_id',
  'student_name_hash',
  'nonce',
  'alg',
  'canonical',
  'signature',
  'public_key_jwk'
] as const

/**
 * 防御式校验 Rust 返回的 proof 体：
 * 任一字段缺失 / 类型不符 → null（畸形响应一律按失败处理，绝不原样放行）。
 */
const normalizeProof = (raw: unknown): IdentityV2DevProof | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  for (const key of PROOF_STRING_FIELDS) {
    if (!isNonEmptyString(record[key])) return null
  }
  if (typeof record.ts !== 'number' || !Number.isFinite(record.ts)) return null
  return {
    device_id: record.device_id as string,
    student_id: record.student_id as string,
    student_name_hash: record.student_name_hash as string,
    nonce: record.nonce as string,
    ts: record.ts as number,
    alg: record.alg as string,
    canonical: record.canonical as string,
    signature: record.signature as string,
    public_key_jwk: record.public_key_jwk as string
  }
}

/**
 * DEV 专用：触发 Rust 侧身份 v2 签名自检（生产构建绝不调用命令）。
 *
 * 流程：
 *   1) 读 DEV 缝开关（双门）——读不到 → 直接返回 `{ enabled: false, reason }`，
 *      **绝不**调用 `invoke`（生产 fail closed）；
 *   2) 缝开启 → `invokeNative('identity_v2_dev_sign_selfcheck', { deviceId, studentId, studentName? })`
 *      （Tauri v2 前端传 camelCase，Rust 侧 snake_case 由框架自动转换）；
 *   3) 归一化响应为 `IdentityV2DevSelfcheckResult`：
 *      - Rust 返回 enabled=true 且证明体合法 → 原样透出（self_check_ok 以 Rust 为准）；
 *      - Rust 返回 enabled=true 但自检失败 / 证明体畸形 → 折叠为失败形状（丢弃证明）；
 *      - Rust 返回 enabled=false / 响应结构异常 → 折叠为禁用形状（reason 仅用 Rust 人读 message）；
 *      - invoke 抛错（非 Tauri 运行时 / 命令未注册 / Rust 门禁 Err 等）→ 折叠为失败形状，不抛出。
 *
 * 注意：本函数不写日志、不写存储、不缓存；调用方拿到结果后自行决定如何展示。
 */
export const identityV2DevSignSelfcheck = async (args: {
  /** 设备标识（Rust 侧 `device_id`） */
  deviceId: string
  /** 学号（Rust 侧 `student_id`） */
  studentId: string
  /** 姓名（Rust 侧 `student_name?`；缺省时 Rust 侧按空串计算 sha256） */
  studentName?: string
}): Promise<IdentityV2DevSelfcheckResult> => {
  // 双门判定必须前置：读不到开关时绝不允许触达下面的原生命令（生产 fail closed）
  if (!isIdentityV2DevSeamEnabled()) {
    return {
      enabled: false,
      reason:
        '身份 v2 DEV 自检缝未开启：生产构建不可用；DEV 构建需在 DevTools 中设置 globalThis.__HBUT_IDENTITY_V2_DEV__ = true'
    }
  }

  // Tauri v2 约定：前端传 camelCase，Rust 侧 snake_case 由框架自动转换
  const payload: Record<string, unknown> = { deviceId: args.deviceId, studentId: args.studentId }
  if (args.studentName !== undefined) payload.studentName = args.studentName

  let raw: unknown
  try {
    raw = await invokeNative<unknown>(IDENTITY_V2_DEV_COMMAND, payload)
  } catch {
    // invoke 失败（非 Tauri 运行时 / 命令未注册 / Rust 门禁返回 Err 等）：
    // 不向调用方抛出，也不透传原始错误细节（错误文本可能携带命令名以外内容），统一折叠为失败形状
    return {
      enabled: true,
      self_check_ok: false,
      message: 'Rust 自检命令调用失败：命令可能未注册或当前运行时不支持 invoke（身份 v2 DEV 命令需 Tauri 侧可用）',
      proof: null
    }
  }

  // Rust 返回 enabled=true：证明体必须通过防御式校验才透出；畸形 / 自检失败一律按失败处理（丢弃证明）
  if (raw !== null && typeof raw === 'object' && (raw as Record<string, unknown>).enabled === true) {
    const record = raw as Record<string, unknown>
    const proof = normalizeProof(record.proof)
    const selfCheckOk =
      proof !== null && (typeof record.self_check_ok === 'boolean' ? record.self_check_ok : false)
    return {
      enabled: true,
      self_check_ok: selfCheckOk,
      message: isNonEmptyString(record.message)
        ? record.message
        : selfCheckOk
          ? '签名自检通过'
          : '签名自检未通过',
      proof: selfCheckOk ? proof : null
    }
  }

  // Rust 侧门禁关闭（结构上 enabled=false）或响应结构异常：折叠为禁用形状；
  // reason 仅采用 Rust 的人读 message（若可读），不含任何敏感值
  const rustMessage =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>).message : undefined
  return {
    enabled: false,
    reason: isNonEmptyString(rustMessage)
      ? `Rust 侧身份 v2 DEV 缝不可用：${rustMessage}`
      : 'Rust 侧身份 v2 DEV 缝不可用（生产构建或未开启）'
  }
}
