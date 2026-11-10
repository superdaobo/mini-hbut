/**
 * src/features/identity/v2/rebindCode.ts —— P1-2（#1213）身份 v2：换机码（transfer code）编解码。
 *
 * 规格：goal-10 `p1-2-client-flow-spec.md` §2 / §3.0（冻结格式）。
 * 换机码格式：`HBRB1:<base32(无填充, 大写)>`，载荷为紧凑 JSON `{"r","d","k","e"}`：
 *   r = request_id（32 位小写 hex）；d = new_device_id（设备 id 形状）；
 *   k = new_pubkey_sha256（64 位小写 hex）；e = expires_at（unix 秒，须为未来时间）。
 *
 * 安全边界（必须保持）：
 *   - 换机码是**可公开**信息（不是凭据）：只含 request_id / 新设备 id / 公钥哈希 / 过期时间，
 *     **不得**把 request_id 之外的敏感值（学号、签名、完整公钥 JWK、令牌）塞进码里；
 *   - 编解码全程**不写** console / localStorage，不抛异常：非法输入一律折叠为
 *     `{ok:false, kind:'code_invalid'}`；
 *   - 时间判断使用**注入的** `now`（unix 秒）以便测试；缺省才用 `Date.now()`；
 *   - 本 codec 只在前端（TS）实现一份（规格 §3.0：Rust 侧不实现 codec，只做形状校验）。
 */

import { messageFor } from './identityV2Errors'

/** 换机码前缀（展示/生成用大写；解析时对前缀与 body 做大小写归一，容忍手工输入小写） */
export const REBIND_CODE_PREFIX = 'HBRB1:'

/** 完整码（含前缀）长度上下界（规格 §2：≥24、≤512） */
export const REBIND_CODE_MIN_LEN = 24
export const REBIND_CODE_MAX_LEN = 512

/**
 * 载荷 JSON 序列化的字节上限。
 *
 * 红队 T1：原值 256 与「设备 id 形状 8–128 + 码长上限 512」**不自洽** —— 123 位以上的
 * 合法设备 id 会让载荷 ≥256 字节，导致 encode 恒失败（换机流程死在本地），而 parse 又
 * 不查这个上限（两侧不对称）。现取 300：最坏情况（设备 id 128 位、ts 11 位）载荷 = 262
 * 字节，base32 后 424 字符 ≤ 512 ✓；且 parse 使用**同一个**上限，两侧对称。
 */
export const PAYLOAD_MAX_BYTES = 300

/** RFC4648 base32 字母表（A–Z, 2–7） */
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** request_id：32 位小写 hex */
const HEX32_RE = /^[0-9a-f]{32}$/
/** 公钥 sha256：64 位小写 hex */
const HEX64_RE = /^[0-9a-f]{64}$/
/** 设备 id 形状（与 Rust `is_valid_device_id` 同口径：8–128 位，[A-Za-z0-9._:-]） */
const DEVICE_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/

/** 换机码载荷（字段全部可公开；无其它字段） */
export interface RebindCodePayload {
  /** request_id（32 位小写 hex） */
  r: string
  /** new_device_id（设备 id 形状） */
  d: string
  /** new_pubkey_sha256（64 位小写 hex） */
  k: string
  /** expires_at（unix 秒；必须为未来时间） */
  e: number
}

export type RebindEncodeResult =
  | { ok: true; code: string }
  | { ok: false; kind: 'code_invalid'; message: string }

export type RebindParseResult =
  | { ok: true; requestId: string; newDeviceId: string; pubkeySha256: string; expiresAt: number }
  | { ok: false; kind: 'code_invalid'; message: string }

/** 缺省 now：unix 秒（仅在调用方未注入 now 时使用） */
const defaultNowSec = (): number => Math.floor(Date.now() / 1000)

/** RFC4648 base32 编码（无填充、大写） */
const base32Encode = (bytes: Uint8Array): string => {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/**
 * RFC4648 base32 解码（大小写不敏感、容忍尾部 `=` 填充；其余偏离 → null）：
 * 非法字符 / 剩余位非零（非规范编码）→ null。
 */
const base32Decode = (text: string): Uint8Array | null => {
  const clean = text.toUpperCase().replace(/=+$/g, '')
  if (clean.length === 0) return null
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch)
    if (idx < 0) return null
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  // 规范编码的剩余位必须全 0，否则视为损坏（非规范填充位）
  if (bits > 0 && (value & ((1 << bits) - 1)) !== 0) return null
  return new Uint8Array(bytes)
}

const utf8Decode = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/**
 * 载荷字段形状校验（编、解码同一口径；Rust 侧 approve 前也会做同口径形状校验）：
 * r 32 位小写 hex / d 设备 id 形状 / k 64 位小写 hex / e 有限数值且为未来时间（相对 now）。
 */
const isWellFormedPayload = (payload: unknown, nowSec: number): payload is RebindCodePayload => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false
  const o = payload as Record<string, unknown>
  if (typeof o.r !== 'string' || !HEX32_RE.test(o.r)) return false
  if (typeof o.d !== 'string' || !DEVICE_ID_RE.test(o.d)) return false
  if (typeof o.k !== 'string' || !HEX64_RE.test(o.k)) return false
  // O4：必须整数秒（浮点/1e30 会让 Rust i64 反序列化失败 → 用户拿到 unknown）
  if (typeof o.e !== 'number' || !Number.isFinite(o.e) || !Number.isInteger(o.e)) return false
  // O4（红队）：必须是**安全整数**且在 i64 范围内——`1e30` 这类整数值浮点会让 Rust 侧
  // `i64` 反序列化失败，用户最后只拿到 `unknown`；这里本地就 fail-closed 成 `code_invalid`。
  if (!Number.isSafeInteger(o.e) || o.e <= 0) return false
  return o.e > nowSec
}

/**
 * 编码换机码：`HBRB1:` + base32(紧凑 JSON `{"r","d","k","e"}`，无填充大写)。
 * 载荷不合法（字段缺失/形状不符/e 非未来时间）或序列化后 ≥256 字节 → `{ok:false, kind:'code_invalid'}`。
 * 不抛异常、不写 console/存储。
 */
export const encodeRebindCode = (
  payload: RebindCodePayload,
  nowSec: number = defaultNowSec()
): RebindEncodeResult => {
  if (!isWellFormedPayload(payload, nowSec)) {
    return { ok: false, kind: 'code_invalid', message: messageFor('code_invalid') }
  }
  // 键序固定 r,d,k,e（紧凑 JSON，无空白）
  const compact = JSON.stringify({ r: payload.r, d: payload.d, k: payload.k, e: payload.e })
  const bytes = new TextEncoder().encode(compact)
  if (bytes.length > PAYLOAD_MAX_BYTES) {
    return { ok: false, kind: 'code_invalid', message: messageFor('code_invalid') }
  }
  return { ok: true, code: `${REBIND_CODE_PREFIX}${base32Encode(bytes)}` }
}

/**
 * 解析并校验换机码（本地校验，**不发请求**）：
 * 前缀 → 长度上下界 → base32 可解 → 紧凑 JSON 且字段齐全（仅 r/d/k/e 四键）→
 * 各字段形状（r 32 位小写 hex、d 设备 id 形状、k 64 位小写 hex）→ `e` 为未来时间（相对 now）。
 * 任一失败 → `{ok:false, kind:'code_invalid'}`（固定文案，不透传原始内容）。
 * 大小写/填充自洽：前缀与 body 大小写不敏感、容忍尾部 `=`，编码输出恒为大写无填充。
 */
export const parseRebindCode = (
  code: unknown,
  nowSec: number = defaultNowSec()
): RebindParseResult => {
  const invalid: RebindParseResult = { ok: false, kind: 'code_invalid', message: messageFor('code_invalid') }
  if (typeof code !== 'string') return invalid
  const trimmed = code.trim()
  if (trimmed.length < REBIND_CODE_MIN_LEN || trimmed.length > REBIND_CODE_MAX_LEN) return invalid
  if (!trimmed.toLowerCase().startsWith(REBIND_CODE_PREFIX.toLowerCase())) return invalid
  const body = trimmed.slice(REBIND_CODE_PREFIX.length)
  const bytes = base32Decode(body)
  if (bytes === null) return invalid
  // 红队 T1：与 encode 使用**同一个**载荷上限（两侧对称，避免「编不出但能解」的死胡同）
  if (bytes.length > PAYLOAD_MAX_BYTES) return invalid
  const jsonText = utf8Decode(bytes)
  if (jsonText === null) return invalid
  let json: unknown
  try {
    json = JSON.parse(jsonText)
  } catch {
    return invalid
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return invalid
  const obj = json as Record<string, unknown>
  // 字段齐全且**只有** r/d/k/e（未知键视为损坏/其它格式 → 无效）
  const keys = Object.keys(obj)
  if (
    keys.length !== 4 ||
    !('r' in obj) ||
    !('d' in obj) ||
    !('k' in obj) ||
    !('e' in obj)
  ) {
    return invalid
  }
  if (!isWellFormedPayload(obj, nowSec)) return invalid
  return {
    ok: true,
    requestId: obj.r as string,
    newDeviceId: obj.d as string,
    pubkeySha256: obj.k as string,
    expiresAt: obj.e as number
  }
}
