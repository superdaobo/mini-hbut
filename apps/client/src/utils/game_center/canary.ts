/**
 * 湖工游乐场灰度（canary）判定层 —— 第十轮 Phase 0「契约 A」的客户端实现。
 *
 * 本模块是**纯函数叶子模块**（无 IO、无 storage、无其他 game_center 模块依赖），
 * 供 `base.ts`（配置归一化）与 `flags.ts`（生效链路）复用，测试可直接驱动。
 *
 * 远程配置形态（契约 A）：
 * ```jsonc
 * "game_platform": {
 *   "enabled": false,
 *   "flags": { "game_center_enabled": false },
 *   "canary": {
 *     "percent": 5,
 *     "allow_versions": ["1.4.12-beta.*"],
 *     "deny_versions": [],
 *     "allow_students": []
 *   }
 * }
 * ```
 *
 * 判定顺序（**不可调换**，契约 A）：
 * 1. `deny_versions` 命中 → 排除；
 * 2. `allow_students` 命中 → 纳入；
 * 3. `allow_versions` 命中 → 纳入；
 * 4. `percent` 稳定分桶（键 = 持久化安装 id `hbu_game_install_id`，见 install_id.ts）。
 *
 * fail closed：canary 缺省 = 不做灰度（与 enabled 同义全量）；canary 存在但字段缺失 /
 * 类型非法 / 越界 → 等价全关（`INVALID_GAME_PLATFORM_CANARY`）；分桶键不可得 → 一律排除。
 */

import { isValidStudentId } from '../student_id.js'

/** 版本通配允许出现的位置：仅末尾（后缀匹配）；`*` 不得作为空前缀的全匹配 */
const VERSION_WILDCARD = '*'

/**
 * 归一化安装 id：必须是 32 位 hex（128bit）字符串，大小写不敏感，统一小写输出。
 * 非法（缺失 / 类型错误 / 长度或字符不符）→ `''`（调用方按「分桶键不可得」处理）。
 */
export const normalizeGameInstallId = (value: unknown): string => {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
  return /^[0-9a-f]{32}$/.test(text) ? text : ''
}

/**
 * 校验版本模式串（契约 A 客户端与契约 B 服务端**同构**规则，改一处必须同步另一端）：
 * - 必须是字符串且非空、无首尾空白、无可打印 ASCII 之外的字符；
 * - `*` 至多出现一次，且**只能出现在末尾**（后缀通配），前缀必须非空；
 * - 禁止单独的 `*`（空前缀全匹配）——需要全量时请直接去掉 canary 或用块级开关。
 */
export const isValidGameVersionPattern = (pattern: unknown): pattern is string => {
  if (typeof pattern !== 'string' || !pattern) return false
  if (pattern !== pattern.trim()) return false
  // 版本串按可打印 ASCII 约定（含 `*`），任何空白 / 控制字符 / 非 ASCII 一律非法
  if (/[^\x21-\x7e]/.test(pattern)) return false
  const starAt = pattern.indexOf(VERSION_WILDCARD)
  if (starAt === -1) return true
  return starAt === pattern.length - 1 && starAt > 0
}

/**
 * 版本模式匹配（与 `isValidGameVersionPattern` 同一套语义）：
 * - 无 `*` → 精确相等；
 * - 末尾 `*` → 前缀匹配（`version.startsWith(prefix)`）；
 * - 区分大小写；版本串为空或模式非法 → 不匹配。
 *
 * 契约 B（服务端 `GAME_PLATFORM_WRITE_DENY_CLIENT_VERSIONS`）使用同一语义：
 * 逗号分隔的「字面前缀 + 末尾 `*`」模式，如 `1.4.11-beta.*`。
 */
export const matchGameVersionPattern = (pattern: string, version: string): boolean => {
  const target = String(version ?? '').trim()
  if (!target || !isValidGameVersionPattern(pattern)) return false
  if (pattern.endsWith(VERSION_WILDCARD)) return target.startsWith(pattern.slice(0, -1))
  return target === pattern
}

/** 校验学号白名单条目：必须是合法学号（9/10 位数字，复用仓库权威 `student_id` 契约） */
export const isValidCanaryStudentEntry = (value: unknown): value is string =>
  typeof value === 'string' && isValidStudentId(value)

export interface GamePlatformCanary {
  /** 0..100；缺省按 0（宁可关，不得默认全量） */
  percent: number
  allow_versions: readonly string[]
  deny_versions: readonly string[]
  allow_students: readonly string[]
}

/**
 * 非法 canary 的哨兵（引用相等判断）：等价「全关」。
 *
 * 与 `null`（canary 字段缺省 = 不做灰度）严格区分 —— 这正是契约 fail closed 的关键：
 * 「没配」是正常全量路径，「配错」必须关，不得因为解析失败而回落成全量。
 */
export const INVALID_GAME_PLATFORM_CANARY: GamePlatformCanary = Object.freeze({
  percent: 0,
  allow_versions: Object.freeze([] as string[]),
  deny_versions: Object.freeze([] as string[]),
  allow_students: Object.freeze([] as string[])
})

const parsePercent = (value: unknown): number | null => {
  // canary 存在但 percent 缺省 → 0%（契约：宁可关，不得默认全量）
  if (value === undefined || value === null) return 0
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > 100) return null
  return value
}

const parsePatternList = (value: unknown): string[] | null => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  const result: string[] = []
  for (const item of value) {
    if (!isValidGameVersionPattern(item)) return null
    result.push(item)
  }
  return result
}

const parseStudentList = (value: unknown): string[] | null => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  const result: string[] = []
  for (const item of value) {
    if (!isValidCanaryStudentEntry(item)) return null
    result.push(item)
  }
  return result
}

/**
 * 严格归一化远程 `canary` 块。
 *
 * - `undefined` / `null`（字段缺省）→ `null`：不做灰度（enabled 为真即全量）；
 * - 存在但非法 → {@link INVALID_GAME_PLATFORM_CANARY}：等价全关（fail closed）。
 */
export const normalizeGamePlatformCanary = (raw: unknown): GamePlatformCanary | null => {
  if (raw === undefined || raw === null) return null
  // 幂等：全关哨兵再次归一化仍指向同一哨兵（二次归一化不丢 reason 语义）
  if (raw === INVALID_GAME_PLATFORM_CANARY) return INVALID_GAME_PLATFORM_CANARY
  if (typeof raw !== 'object' || Array.isArray(raw)) return INVALID_GAME_PLATFORM_CANARY
  const block = raw as Record<string, unknown>
  const percent = parsePercent(block.percent)
  const allowVersions = parsePatternList(block.allow_versions)
  const denyVersions = parsePatternList(block.deny_versions)
  const allowStudents = parseStudentList(block.allow_students)
  if (percent === null || allowVersions === null || denyVersions === null || allowStudents === null) {
    return INVALID_GAME_PLATFORM_CANARY
  }
  return {
    percent,
    allow_versions: allowVersions,
    deny_versions: denyVersions,
    allow_students: allowStudents
  }
}

export type GamePlatformCanaryReason =
  | 'no_canary'
  | 'canary_invalid'
  | 'deny_version'
  | 'allow_student'
  | 'allow_version'
  | 'percent_zero'
  | 'percent_full'
  | 'percent_bucket'
  | 'bucket_unavailable'

export interface GamePlatformCanaryDecision {
  /** 是否纳入灰度 */
  included: boolean
  /** 判定分支（诊断用；契约顺序见模块头注释） */
  reason: GamePlatformCanaryReason
  /** 命中的分桶值（0..99）；未走到分桶或键不可得为 null */
  bucket: number | null
}

/** 百分位之前的三段显式名单判定结果（deny → allow_students → allow_versions → percent） */
type CanaryPrePercentOutcome = 'deny_version' | 'allow_student' | 'allow_version' | 'percent'

const classifyCanaryBeforePercent = (
  canary: GamePlatformCanary,
  version: string,
  studentId: string
): CanaryPrePercentOutcome => {
  if (version && canary.deny_versions.some((pattern) => matchGameVersionPattern(pattern, version))) {
    return 'deny_version'
  }
  if (studentId && canary.allow_students.includes(studentId)) return 'allow_student'
  if (version && canary.allow_versions.some((pattern) => matchGameVersionPattern(pattern, version))) {
    return 'allow_version'
  }
  return 'percent'
}

/**
 * 判断该用户在该 canary 下是否**需要分桶键**（决定是否生成 / 读取安装 id）。
 * 命中黑白名单或 percent<=0（恒不纳入）时无需键；其余情况一律需要（含 percent=100，
 * 保持「分桶键不可得 → 一律排除」的字面语义，fail closed）。
 */
export const canaryRequiresBucket = (
  canary: GamePlatformCanary | null,
  appVersion?: unknown,
  studentId?: unknown
): boolean => {
  if (canary === null || canary === INVALID_GAME_PLATFORM_CANARY) return false
  const version = String(appVersion ?? '').trim()
  const sid = isValidCanaryStudentEntry(studentId) ? studentId : ''
  if (classifyCanaryBeforePercent(canary, version, sid) !== 'percent') return false
  return canary.percent > 0
}

export interface GamePlatformCanaryEvaluation {
  canary: GamePlatformCanary | null
  appVersion?: unknown
  studentId?: unknown
  installId?: unknown
}

/**
 * 灰度判定（纯函数）。
 *
 * - `canary === null`（未配置）→ 纳入（reason `no_canary`），由块级 enabled / flags 决定；
 * - `canary` 为非法哨兵 → 排除（reason `canary_invalid`）；
 * - 否则按契约顺序判定：deny_versions → allow_students → allow_versions → percent 分桶；
 * - percent <= 0 → 排除；percent > 0 时**必须先拿到合法安装 id**（不可得 → 排除，fail closed）。
 */
export const evaluateGamePlatformCanary = ({
  canary,
  appVersion,
  studentId,
  installId
}: GamePlatformCanaryEvaluation): GamePlatformCanaryDecision => {
  if (canary === null) return { included: true, reason: 'no_canary', bucket: null }
  if (canary === INVALID_GAME_PLATFORM_CANARY) {
    return { included: false, reason: 'canary_invalid', bucket: null }
  }
  const version = String(appVersion ?? '').trim()
  const sid = isValidCanaryStudentEntry(studentId) ? studentId : ''
  const outcome = classifyCanaryBeforePercent(canary, version, sid)
  if (outcome === 'deny_version') return { included: false, reason: outcome, bucket: null }
  if (outcome === 'allow_student') return { included: true, reason: outcome, bucket: null }
  if (outcome === 'allow_version') return { included: true, reason: outcome, bucket: null }

  if (canary.percent <= 0) return { included: false, reason: 'percent_zero', bucket: null }
  const bucket = gameCanaryBucket(installId)
  if (bucket === null) return { included: false, reason: 'bucket_unavailable', bucket: null }
  if (canary.percent >= 100) return { included: true, reason: 'percent_full', bucket }
  return { included: bucket < canary.percent, reason: 'percent_bucket', bucket }
}

// ---------------------------------------------------------------------------
// SHA-256（同步，FIPS 180-4）：`bucket = sha256(installId) % 100` 需要同步可用的摘要。
//
// 项目既有 sha256 都走 Web Crypto（异步），而 flags 生效链路是同步的（组件同步读取），
// 因此这里内置一份纯 JS 实现；正确性由测试里的 FIPS 标准向量锁定：
//   sha256('') === 'e3b0c442...'，sha256('abc') === 'ba7816bf...'。
// ---------------------------------------------------------------------------

/** SHA-256 初始哈希值（FIPS 180-4 §5.3.3） */
const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
])

/** SHA-256 轮常量（FIPS 180-4 §4.2.2） */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

/** 循环右移（32 位无符号） */
const rotr = (value: number, shift: number): number => ((value >>> shift) | (value << (32 - shift))) >>> 0

/** UTF-8 编码（含代理对；不依赖 TextEncoder，原生外壳 / 测试环境一致） */
const utf8Bytes = (text: string): Uint8Array => {
  const out: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
        i += 1
      }
    }
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    }
  }
  return Uint8Array.from(out)
}

/** 同步 SHA-256（hex 小写） */
export const sha256Hex = (text: string): string => {
  const bytes = utf8Bytes(text)
  const bitLength = bytes.length * 8
  // 消息 + 0x80 + k 个 0 + 64bit 长度，总长为 64 的倍数
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6
  const buffer = new Uint8Array(paddedLength)
  buffer.set(bytes)
  buffer[bytes.length] = 0x80
  const view = new DataView(buffer.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)

  const state = SHA256_INIT.slice()
  const schedule = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) schedule[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(schedule[i - 15], 7) ^ rotr(schedule[i - 15], 18) ^ (schedule[i - 15] >>> 3)
      const s1 = rotr(schedule[i - 2], 17) ^ rotr(schedule[i - 2], 19) ^ (schedule[i - 2] >>> 10)
      schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) >>> 0
    }
    let a = state[0]
    let b = state[1]
    let c = state[2]
    let d = state[3]
    let e = state[4]
    let f = state[5]
    let g = state[6]
    let h = state[7]
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[i] + schedule[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }
  return [...state].map((word) => word.toString(16).padStart(8, '0')).join('')
}

/**
 * 稳定分桶：`bucket = sha256(installId) % 100`（0..99）。
 * 安装 id 非法 / 不可得 → `null`（调用方一律排除，fail closed）。
 *
 * 实现说明：逐字节 Horner 取模，严格等价于 128bit 十六进制大整数 `% 100`
 * （`(acc * 256 + byte) % 100`），避免 BigInt 兼容性依赖。
 */
export const gameCanaryBucket = (installId: unknown): number | null => {
  const id = normalizeGameInstallId(installId)
  if (!id) return null
  const digest = sha256Hex(id)
  let bucket = 0
  for (let i = 0; i < digest.length; i += 2) {
    bucket = (bucket * 256 + Number.parseInt(digest.slice(i, i + 2), 16)) % 100
  }
  return bucket
}
