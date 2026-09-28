/**
 * 游乐场玩家摘要读取（#905）与模块上下文注入（P0 收口）。
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

/** 模块注入面的身份字段（与 MoreView 的 profile 形状一致） */
export interface ModuleContextIdentityProfile {
  student_id?: unknown
  name?: unknown
  class_name?: unknown
  major?: unknown
  school_name?: unknown
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

/** 无会话（学号为空）时的空档案：**不携带任何身份字段**，调用方据此走「未登录」展示 */
export const EMPTY_PLAYER_PROFILE: Readonly<PlayerProfileSummary> = Object.freeze({
  name: '',
  className: '',
  schoolName: ''
})

/**
 * 读取玩家摘要（本地缓存合并；全部缺失 / 无会话时返回全空对象）。
 *
 * P0（隐私 / 数据归属）：**无会话（学号为空）时一律返回空档案**，不读取、不合并任何来源。
 * 根因是 `<gameId>_rank_context_v1` 属于**设备级共享键**（不区分会话），登出后仍残留上一位
 * 用户的昵称 / 班级 / 学校；若把它当作「当前用户」展示，就会在未登录页面上把上一用户身份
 * 呈现给下一位使用者。有会话时才允许合并（此时登出清理已保证键归属当前会话）。
 */
export const readCachedPlayerProfile = (
  studentId: unknown,
  gameIds: readonly string[] = []
): PlayerProfileSummary => {
  const sid = safeText(studentId)
  if (!sid) return { ...EMPTY_PLAYER_PROFILE }

  let merged: PlayerProfileSummary = { ...EMPTY_PLAYER_PROFILE }
  merged = mergeProfile(
    merged,
    extractProfile(safeParseJson(readStorage(`${PROFILE_STORAGE_PREFIX}${sid}`)))
  )
  merged = mergeProfile(merged, extractProfile(safeParseJson(readStorage(`cache:studentinfo:${sid}`))))
  merged = mergeProfile(merged, extractProfile(safeParseJson(readStorage(`cache:student_info:${sid}`))))

  for (const gameId of gameIds) {
    const id = safeText(gameId)
    if (!id) continue
    merged = mergeProfile(merged, extractProfile(safeParseJson(readStorage(`${id}_rank_context_v1`))))
  }

  return merged
}

/** iframe URL 里的身份参数（URL 参数名 → profile 字段名），顺序即注入顺序 */
const IDENTITY_QUERY_PARAM_FIELDS = Object.freeze([
  ['student_id', 'student_id'],
  ['player_name', 'name'],
  ['class_name', 'class_name'],
  ['major', 'major'],
  ['school_name', 'school_name']
] as const)

/**
 * 把身份字段写入 iframe URL：**只有非空字段才注入**（与 #947 对 `rank_api` 的做法同口径）。
 *
 * 调用方：`MoreView.appendModuleContextQuery`（宿主唯一的模块上下文注入点）。
 * 注入空值不会阻止模块回落到自己的 localStorage 历史值，却会让「宿主明确声明了空身份」
 * 与「宿主根本没声明」两种语义混在一起；统一改为「非空才注入」，宿主侧就不再有任何
 * 上一用户字段（哪怕是空串形态）流出到模块 URL 里。
 *
 * @returns 实际注入的参数名（供诊断与测试断言）
 */
export const appendIdentityQueryParams = (
  url: URL,
  profile: ModuleContextIdentityProfile = {}
): string[] => {
  const applied: string[] = []
  for (const [param, field] of IDENTITY_QUERY_PARAM_FIELDS) {
    const text = safeText(profile?.[field])
    if (!text) continue
    url.searchParams.set(param, text)
    applied.push(param)
  }
  return applied
}
