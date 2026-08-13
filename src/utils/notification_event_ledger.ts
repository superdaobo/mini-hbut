/**
 * Notification Event Ledger（#614）
 *
 * 跨「后台发现（native event inbox）」与「前台检查（notify_center）」的通知去重账本，
 * 回答的唯一问题是：
 *
 * > 对业务事件 X（eventKey），用户是否已经收到过系统通知？
 *
 * 设计约束：
 * 1. 不是业务数据缓存：不存完整成绩/考试/消息内容，只存非敏感 eventKey + 时间；
 * 2. 有界：最多 LEDGER_MAX_ENTRIES 条，超出丢最旧（FIFO）；
 * 3. 清理：超过 LEDGER_ENTRY_TTL_MS 的旧条目定期剔除（清账时顺带清理）；
 * 4. schema/version：LEDGER_SCHEMA_VERSION 不兼容时安全清空（降级为空账本，不 crash）；
 * 5. 账号隔离：账本 key 按 studentId 分 scope 存储，切换账号互不串数据；
 * 6. 去重粒度是「业务变化 signature/event key」，不是「当天是否通知过」：
 *    同一账号下成绩从 S2 变为 S3 时 eventKey 不同，允许再次通知（场景 C）。
 *
 * 跨端 signature（buildCrossEndGradeSignature）：复刻 #612/#613 冻结的
 * GradeSignatureV1 算法（contract-fixtures/grades-signature-v1.json 为单一事实源），
 * 使 native 事件 payload.signature 与前台计算值对同一份成绩数据逐位一致，
 * 从而 ledger 的 eventKey 可以跨「后台已弹 / 前台已弹」两侧去重。
 * 注意：前端成绩行字段（course_name/final_score/course_credit）映射到
 * 契约标准化字段（courseName/score/credit/courseType）后参与计算。
 */
import { readJSON, toSafeText, writeJSON } from './notify_center_util.js'

/** 账本 schema 版本：不兼容布局升级时必须递增，读取时按版本安全降级。 */
export const LEDGER_SCHEMA_VERSION = 1

/** 账本容量上限（#614 要求 50~100 条，取 100）。 */
export const LEDGER_MAX_ENTRIES = 100

/** 单条 entry 最长保留时间（7 天），超过后视为过期清理。 */
export const LEDGER_ENTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 业务域（与 #609 BackgroundDetectedEventType 对应；当前首批完整闭环为 grades）。 */
export type LedgerDomain = 'grades' | 'exams' | 'school-message' | string

export interface NotificationLedgerEntry {
  /** 去重键：`${domain}:${signature}`（非敏感业务变化标识）。 */
  eventKey: string
  /** 业务域（grades / exams / school-message）。 */
  domain: string
  /** 已展示通知的时间（ISO）。 */
  notifiedAt: string
}

export interface NotificationLedgerState {
  schema: number
  /** 所属账号 scope（studentId），切换账号隔离。 */
  scope: string
  updatedAt: string
  entries: NotificationLedgerEntry[]
}

/** 账本存储 key（按账号 scope 隔离）。 */
export const ledgerStorageKeyFor = (studentId: string): string =>
  `hbu_notification_ledger:${toSafeText(studentId)}`

/** 由业务域 + 签名派生去重 eventKey；签名缺失返回空串（调用方视为无法去重）。 */
export const buildLedgerEventKey = (domain: string, signature: string): string => {
  const d = toSafeText(domain) || 'unknown'
  const sig = toSafeText(signature)
  return sig ? `${d}:${sig}` : ''
}

const emptyLedger = (studentId: string): NotificationLedgerState => ({
  schema: LEDGER_SCHEMA_VERSION,
  scope: toSafeText(studentId),
  updatedAt: '',
  entries: []
})

/** 读取账本：schema 不兼容 / 结构异常时安全降级为空账本（不 crash、不误删其他 key）。 */
export const readLedgerState = (studentId: string): NotificationLedgerState => {
  const sid = toSafeText(studentId)
  const state = readJSON<NotificationLedgerState>(ledgerStorageKeyFor(sid), null)
  if (!state || typeof state !== 'object' || state.schema !== LEDGER_SCHEMA_VERSION) {
    return emptyLedger(sid)
  }
  return {
    schema: LEDGER_SCHEMA_VERSION,
    scope: toSafeText(state.scope) || sid,
    updatedAt: toSafeText(state.updatedAt),
    entries: Array.isArray(state.entries)
      ? state.entries
          .filter(
            (entry): entry is NotificationLedgerEntry =>
              !!entry &&
              typeof entry === 'object' &&
              !!toSafeText((entry as NotificationLedgerEntry).eventKey) &&
              typeof (entry as NotificationLedgerEntry).notifiedAt === 'string'
          )
          .map((entry) => ({
            eventKey: toSafeText(entry.eventKey),
            domain: toSafeText(entry.domain) || 'unknown',
            notifiedAt: toSafeText(entry.notifiedAt)
          }))
      : []
  }
}

/** 写回账本（写入前先做容量/过期清理，保证有界）。 */
export const writeLedgerState = (studentId: string, state: NotificationLedgerState): void => {
  const sid = toSafeText(studentId)
  if (!sid) return
  const pruned = pruneLedgerState(
    {
      schema: LEDGER_SCHEMA_VERSION,
      scope: sid,
      updatedAt: new Date().toISOString(),
      entries: Array.isArray(state?.entries) ? state.entries : []
    },
    new Date()
  )
  writeJSON(ledgerStorageKeyFor(sid), pruned)
}

/** 清理某账号账本（登出 / 切换账号时调用）。 */
export const clearLedgerState = (studentId: string): void => {
  try {
    localStorage.removeItem(ledgerStorageKeyFor(toSafeText(studentId)))
  } catch {
    // ignore（无存储环境时静默降级）
  }
}

/** 过期清理 + 容量裁剪（纯函数，便于单测）。 */
export const pruneLedgerState = (
  state: NotificationLedgerState,
  now: Date
): NotificationLedgerState => {
  const timestamp = now instanceof Date && !Number.isNaN(now.getTime()) ? now.getTime() : Date.now()
  const cutoff = timestamp - LEDGER_ENTRY_TTL_MS
  // 过期剔除 + 同 eventKey 保留最新一条（重复通知只更新 notifiedAt 的写路径已保证唯一，
  // 此处兜底防御旧数据/手写数据中的重复 key）。
  const byKey = new Map<string, NotificationLedgerEntry>()
  for (const entry of Array.isArray(state?.entries) ? state.entries : []) {
    const key = toSafeText(entry.eventKey)
    if (!key) continue
    const at = Date.parse(toSafeText(entry.notifiedAt))
    if (Number.isFinite(at) && at < cutoff) continue
    const current = byKey.get(key)
    if (!current || !Number.isFinite(at) || at >= Date.parse(current.notifiedAt)) {
      byKey.set(key, {
        eventKey: key,
        domain: toSafeText(entry.domain) || 'unknown',
        notifiedAt: toSafeText(entry.notifiedAt)
      })
    }
  }
  const entries = Array.from(byKey.values())
  // 容量上限：超出丢最旧（按 notifiedAt 排序，稳定 FIFO）
  if (entries.length > LEDGER_MAX_ENTRIES) {
    entries.sort(
      (a, b) => Date.parse(a.notifiedAt) - Date.parse(b.notifiedAt) || a.eventKey.localeCompare(b.eventKey)
    )
    entries.splice(0, entries.length - LEDGER_MAX_ENTRIES)
  }
  return {
    schema: LEDGER_SCHEMA_VERSION,
    scope: toSafeText(state.scope),
    updatedAt: toSafeText(state.updatedAt) || new Date(timestamp).toISOString(),
    entries
  }
}

/** 查询：该 eventKey 是否已记录「通知已展示」。 */
export const hasLedgerEntry = (studentId: string, eventKey: string): boolean => {
  const key = toSafeText(eventKey)
  if (!key) return false
  return readLedgerState(studentId).entries.some((entry) => entry.eventKey === key)
}

/**
 * 记录「通知已展示」：同 eventKey 幂等（只刷新时间，不重复入账），
 * 新 key 追加并触发过期/容量清理。返回是否新增了一条记录。
 */
export const recordLedgerEntry = (
  studentId: string,
  eventKey: string,
  domain: string,
  notifiedAt?: string
): boolean => {
  const sid = toSafeText(studentId)
  const key = toSafeText(eventKey)
  if (!sid || !key) return false
  const now = toSafeText(notifiedAt) || new Date().toISOString()
  const state = readLedgerState(sid)
  const existing = state.entries.find((entry) => entry.eventKey === key)
  if (existing) {
    existing.notifiedAt = now
    existing.domain = toSafeText(domain) || existing.domain
    writeLedgerState(sid, state)
    return false
  }
  state.entries.push({ eventKey: key, domain: toSafeText(domain) || 'unknown', notifiedAt: now })
  writeLedgerState(sid, state)
  return true
}

// ============================================================
// 跨端 GradeSignatureV1 复刻（#614）
// ------------------------------------------------------------
// 算法契约（contract-fixtures/grades-signature-v1.json，冻结方 #612）：
//   normalize: 字符串 trim；courseType/score 空串与 nil 等价；
//              credit 固定 %.6f（IEEE double + printf 语义）；
//              数字型 score：整数 -> 整数字符串（92），小数 -> 十进制字符串（92.5）；
//              courseName trim 后为空则整条记录不参与签名；
//   line:      "courseName|courseType|credit|score"（nil/空 -> 空串）；
//   sort:      UTF-8 字节序（与 Kotlin UTF8_COMPARATOR / Swift utf8 比较一致）；
//   join:      "\n"；
//   hash:      SHA-256 hex 小写。
// ============================================================

const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/** UTF-8 字节序比较（与 Kotlin UTF8_COMPARATOR / Node Buffer.compare 语义一致）。 */
const compareUtf8Bytes = (a: Uint8Array, b: Uint8Array): number => {
  const common = Math.min(a.length, b.length)
  for (let i = 0; i < common; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return a.length - b.length
}

/** 学分固定 %.6f（printf 语义；null/非有限值 -> 空串）。 */
const formatCreditV1 = (value: unknown): string => {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return ''
  return number.toFixed(6)
}

/** 数字型成绩转字符串：整数保留原样（92 -> "92"），小数 -> 十进制字符串（92.5）。 */
const scoreToTextV1 = (value: unknown): string => {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return toSafeText(value)
}

/**
 * 前端成绩行 -> 契约标准化字段映射（courseName/courseType/credit/score）。
 * 兼容两套字段命名（前端 API 与契约结构），保证同一份成绩数据跨端签名一致。
 */
const toContractGradeRecord = (item: unknown): { courseName: string; courseType: string; credit: string; score: string } => {
  const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
  return {
    courseName: toSafeText(raw.course_name ?? raw.courseName),
    courseType: toSafeText(raw.course_type ?? raw.courseType),
    credit: formatCreditV1(raw.course_credit ?? raw.courseCredit ?? raw.credit),
    score: scoreToTextV1(raw.final_score ?? raw.score)
  }
}

/**
 * 计算跨端成绩变化 signature（GradeSignatureV1 复刻，异步：依赖 Web Crypto SHA-256）。
 * 返回空串表示无有效成绩数据（与 native compute 空记录语义一致）。
 */
export const buildCrossEndGradeSignature = async (grades: unknown): Promise<string> => {
  const list = Array.isArray(grades) ? grades : []
  const lines: string[] = []
  for (const item of list) {
    const record = toContractGradeRecord(item)
    if (!record.courseName) continue // 无课程名的记录跳过（与 native 一致）
    lines.push(`${record.courseName}|${record.courseType}|${record.credit}|${record.score}`)
  }
  if (lines.length === 0) return ''
  // UTF-8 字节序排序（跨端稳定）
  const encoded = lines.map((line) => encodeUtf8(line))
  encoded.sort((a, b) => compareUtf8Bytes(a, b))
  const payload = encoded.map((bytes) => new TextDecoder().decode(bytes)).join('\n')
  // slice() 复制为独立 ArrayBuffer：满足 crypto.subtle 的 BufferSource 约束（TS 5.7 泛型）
  const digest = await crypto.subtle.digest('SHA-256', encodeUtf8(payload).slice())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
