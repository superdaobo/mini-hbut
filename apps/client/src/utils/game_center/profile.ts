/**
 * 游乐场玩家摘要读取（#905）。
 *
 * 只读既有本地缓存，**不新增任何持久化写入**，也不发起请求：
 * - `hbu_more_module_student_profile:<sid>`（模块中心写入）
 * - `cache:studentinfo:<sid>` / `cache:student_info:<sid>`（学生信息缓存，可能被 {data,timestamp} 包裹）
 * - `<gameId>_rank_context_v1`（各游戏排行榜上下文，含昵称/班级/学校快照）
 *
 * 注意：本模块**绝不**读取/返回学号用于展示；学号只作为查询键在调用方使用。
 */

export interface PlayerProfileSummary {
  name: string
  className: string
  schoolName: string
}

const safeText = (value: unknown): string => String(value ?? '').trim()

const safeParseJson = (raw: unknown): unknown => {
  try {
    return JSON.parse(String(raw ?? ''))
  } catch {
    return null
  }
}

const unwrapPayload = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object') return {}
  const record = payload as Record<string, unknown>
  const data = record.data
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : record
}

const pickText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = safeText(value)
    if (text) return text
  }
  return ''
}

const readStorage = (key: string): unknown => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

const extractProfile = (payload: unknown): PlayerProfileSummary => {
  const source = unwrapPayload(payload)
  return {
    name: pickText(source.name, source.student_name, source.studentName, source.xm, source.XM, source.playerName),
    className: pickText(source.class_name, source.className, source.class, source.bjmc, source.BJMC),
    schoolName: pickText(source.school_name, source.schoolName)
  }
}

const mergeProfile = (
  target: PlayerProfileSummary,
  source: PlayerProfileSummary
): PlayerProfileSummary => ({
  name: target.name || source.name,
  className: target.className || source.className,
  schoolName: target.schoolName || source.schoolName
})

export const PROFILE_STORAGE_PREFIX = 'hbu_more_module_student_profile:'

/** 读取玩家摘要（本地缓存合并；全部缺失时返回全空对象） */
export const readCachedPlayerProfile = (
  studentId: unknown,
  gameIds: readonly string[] = []
): PlayerProfileSummary => {
  const sid = safeText(studentId)
  let merged: PlayerProfileSummary = { name: '', className: '', schoolName: '' }

  if (sid) {
    merged = mergeProfile(
      merged,
      extractProfile(safeParseJson(readStorage(`${PROFILE_STORAGE_PREFIX}${sid}`)))
    )
    merged = mergeProfile(merged, extractProfile(safeParseJson(readStorage(`cache:studentinfo:${sid}`))))
    merged = mergeProfile(merged, extractProfile(safeParseJson(readStorage(`cache:student_info:${sid}`))))
  }

  for (const gameId of gameIds) {
    const id = safeText(gameId)
    if (!id) continue
    merged = mergeProfile(merged, extractProfile(safeParseJson(readStorage(`${id}_rank_context_v1`))))
  }

  return merged
}
