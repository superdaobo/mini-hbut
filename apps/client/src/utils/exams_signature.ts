/**
 * #615 跨端 ExamSignatureV1 复刻 + per-feature 开关（纯逻辑，无 axios 依赖链）。
 *
 * contract-fixtures/exams-signature-v1.json 为单一事实源（Android/iOS/前端三端一致）：
 *   normalize: 字符串 trim；nil/空串等价；courseName trim 后为空则整条记录不参与签名；
 *   line:      "courseName|examDate|examTime|location|seatNo|examType"（nil/空 -> 空串）；
 *   sort:      UTF-8 字节序；
 *   join:      "\n"；
 *   hash:      SHA-256 hex 小写。
 * 不参与签名字段：courseId/semester（仅 native 侧可得，前端 /v2/exams 不返回，
 * 纳入会破坏跨端 ledger 去重）与 updatedAt/rawId 等无关字段。
 */
import { buildLedgerEventKey } from './notification_event_ledger'

// ---- per-feature 后台检测开关（设置页三个独立开关；与 #609 BackgroundCheckConfig 对应） ----

export const BG_FEATURE_KEY_GRADES = 'hbu_bg_feature_grades'
export const BG_FEATURE_KEY_EXAMS = 'hbu_bg_feature_exams'
export const BG_FEATURE_KEY_SCHOOL = 'hbu_bg_feature_school'

/** 读取 per-feature 开关（默认开启；'false' 视为关闭）。 */
export const readBgFeatureEnabled = (key: string, fallback = true): boolean => {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return raw === 'true'
  } catch {
    return fallback
  }
}

// ---- 跨端 ExamSignatureV1 复刻 ----

const toSafeText = (value: unknown): string => String(value ?? '').trim()

const encodeUtf8Bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

/** UTF-8 字节序比较（与 Kotlin UTF8_COMPARATOR / Swift utf8 比较 / Node Buffer.compare 语义一致）。 */
const compareUtf8Bytes = (a: Uint8Array, b: Uint8Array): number => {
  const common = Math.min(a.length, b.length)
  for (let i = 0; i < common; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return a.length - b.length
}

/**
 * 计算跨端考试变化 signature（ExamSignatureV1 复刻，异步：依赖 Web Crypto SHA-256）。
 * 返回空串表示无有效考试数据（与 native compute 空记录语义一致）。
 */
export const buildCrossEndExamSignature = async (exams: unknown): Promise<string> => {
  const list = Array.isArray(exams) ? exams : []
  const lines: string[] = []
  for (const item of list) {
    const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const courseName = toSafeText(raw.course_name ?? raw.courseName)
    if (!courseName) continue // 无课程名的记录跳过（与 native 一致）
    const examDate = toSafeText(raw.exam_date ?? raw.examDate)
    const examTime = toSafeText(raw.exam_time ?? raw.examTime)
    const location = toSafeText(raw.location)
    const seatNo = toSafeText(raw.seat_no ?? raw.seatNo ?? raw.seat_number)
    const examType = toSafeText(raw.exam_type ?? raw.examType)
    lines.push(`${courseName}|${examDate}|${examTime}|${location}|${seatNo}|${examType}`)
  }
  if (lines.length === 0) return ''
  // UTF-8 字节序排序（跨端稳定）
  const encoded = lines.map((line) => encodeUtf8Bytes(line))
  encoded.sort((a, b) => compareUtf8Bytes(a, b))
  const payload = encoded.map((bytes) => new TextDecoder().decode(bytes)).join('\n')
  // slice() 复制为独立 ArrayBuffer：满足 crypto.subtle 的 BufferSource 约束（TS 5.7 泛型）
  const digest = await crypto.subtle.digest('SHA-256', encodeUtf8Bytes(payload).slice())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** #615：考试全量变化 baseline 存储 key（与"明日考试"key 分离，互不干扰）。 */
export const examsChangeBaselineKeyFor = (studentId: string): string =>
  `hbu_notify_exams_change_baseline:${toSafeText(studentId)}`

/** #615：由考试数据派生统一 ledger 去重 key（跨端 ExamSignatureV1 语义）。 */
export const buildExamLedgerEventKey = async (exams: unknown): Promise<string> => {
  const signature = await buildCrossEndExamSignature(exams)
  return signature ? buildLedgerEventKey('exams', signature) : ''
}
