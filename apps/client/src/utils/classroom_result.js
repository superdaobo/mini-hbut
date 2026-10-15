/**
 * 空教室结果语义与请求载荷（#1062 / #1063 前端**唯一事实源**）。
 *
 * 为什么单独成模块：
 * 1. 仓库 vitest 主配置为 node 环境、未引入 `@vue/test-utils`，组件无法真实挂载；
 *    把「结果可信度 / 展示文案 / 空态判定 / 请求载荷」抽成纯函数即可完整单测。
 * 2. 「是否空闲」这件事必须只有一处判定，避免模板里出现第二套（历史缺陷：
 *    模板无条件渲染绿色「空闲」徽标、把 `data.success && data.data=[]` 当作
 *    「0 个空教室」）。
 *
 * 后端契约（`meta.availability`）取值见
 * `src-tauri/src/http_client/academic/classroom_teacher.rs::ClassroomAvailability`：
 *   - `period_free`      服务端确实按周次/星期/节次筛选后的结果
 *   - `resource_catalog` 教室资源目录（未按时间筛选）
 *   - `unknown`          成功但无法证明筛选生效（例如条数等于全量资源目录）
 *   - `unauthorized`     学校明确未授权
 *   - `bad_response`     服务端坏响应
 */

export const CLASSROOM_AVAILABILITY = Object.freeze({
  PERIOD_FREE: 'period_free',
  RESOURCE_CATALOG: 'resource_catalog',
  UNKNOWN: 'unknown',
  UNAUTHORIZED: 'unauthorized',
  BAD_RESPONSE: 'bad_response'
})

/** 归一为有限数字；不可解析时返回 null（**不回落 0**，避免把「未知」当「0 条」）。 */
const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 归一化后端 `meta`。
 *
 * 日期/周次**只**来自后端；这里不做任何本机课表（`hbu_schedule_meta`）推算，
 * 这正是「未知日期 + 第 7 周」自相矛盾的根因所在。
 */
export const normalizeClassroomMeta = (meta = {}) => {
  const source = meta && typeof meta === 'object' ? meta : {}
  const total = toFiniteNumber(source.total)
  const loaded = toFiniteNumber(source.loaded)
  const resourceTotal = toFiniteNumber(source.resource_total)
  const week = toFiniteNumber(source.week)
  return {
    date_str: String(source.date_str || '').trim(),
    date_iso: String(source.date_iso || '').trim(),
    date_source: String(source.date_source || '').trim(),
    // 周次 0 = 预备周（服务端把 zcStr=0 当「不过滤」）→ 不展示为「第 0 周」
    week: week === null || week <= 0 ? '' : String(week),
    weekday_name: String(source.weekday_name || '').trim(),
    semester: String(source.semester || '').trim(),
    query_time: String(source.query_time || '').trim(),
    availability: String(source.availability || '').trim(),
    total,
    loaded,
    truncated: source.truncated === true,
    filters_applied: source.filters_applied === true,
    resource_total: resourceTotal,
    periods_str: String(source.periods_str || '').trim()
  }
}

/** 结果可信度状态；未知/缺失一律归为 `unknown`（保守，不宣称空闲）。 */
export const classroomAvailabilityOf = (meta) => {
  const value = String(meta?.availability || '').trim()
  const known = Object.values(CLASSROOM_AVAILABILITY)
  return known.includes(value) ? value : CLASSROOM_AVAILABILITY.UNKNOWN
}

/** 是否可把结果呈现为「所选时段空闲」。**只有** period_free 为真。 */
export const isVerifiedFree = (meta) =>
  classroomAvailabilityOf(meta) === CLASSROOM_AVAILABILITY.PERIOD_FREE

/** 是否为未按时间筛选的资源目录。 */
export const isResourceCatalog = (meta) =>
  classroomAvailabilityOf(meta) === CLASSROOM_AVAILABILITY.RESOURCE_CATALOG

/** 是否为「无法证明筛选生效」的状态。 */
export const isAvailabilityUnknown = (meta) =>
  classroomAvailabilityOf(meta) === CLASSROOM_AVAILABILITY.UNKNOWN

/** 结果条数文案的 i18n key（**绝不**在未知状态下说「找到 N 个空教室」）。 */
export const classroomCountKey = (meta) => {
  if (isVerifiedFree(meta)) return 'classroom.result.freeCount'
  if (isAvailabilityUnknown(meta)) return 'classroom.result.unknownCount'
  return 'classroom.result.catalogCount'
}

/** 结果条数（优先后端 `total`，缺失时退回已加载条数）。 */
export const classroomResultCount = (meta, fallbackCount = 0) => {
  const total = toFiniteNumber(meta?.total)
  if (total !== null) return total
  return Number.isFinite(Number(fallbackCount)) ? Number(fallbackCount) : 0
}

/** 教室卡片徽标 key：只有 period_free 才是「空闲」。 */
export const classroomBadgeKey = (meta) => {
  if (isVerifiedFree(meta)) return 'classroom.badge.free'
  if (isAvailabilityUnknown(meta)) return 'classroom.badge.unknown'
  return 'classroom.badge.catalog'
}

/** 顶部可信度提示 key。 */
export const classroomNoticeKey = (meta) => {
  if (isResourceCatalog(meta)) return 'classroom.availability.catalog'
  if (isAvailabilityUnknown(meta)) return 'classroom.availability.unknown'
  return 'classroom.availability.other'
}

/** 是否需要展示「可信度提示」（只有已成功查询且未通过验证时才提示）。 */
export const shouldShowAvailabilityNotice = (meta, hasSuccessfulQuery) =>
  !!hasSuccessfulQuery && !isVerifiedFree(meta)

/**
 * 空态判定（#1063：**错误**与**真正的空**必须区分）。
 *
 * 返回：
 * - `verified-empty`：服务端确实按时间筛选且结果为 0 条 → 可说「没有找到空教室」
 * - `unverified-empty`：0 条但无法证明筛选生效 → 只说「未返回教室，无法确认是否空闲」
 * - `none`：不展示空态
 */
export const classroomEmptyMode = ({ meta, roomCount, loading, hasError }) => {
  if (loading || hasError) return 'none'
  if (!Number.isFinite(Number(roomCount)) || Number(roomCount) > 0) return 'none'
  return isVerifiedFree(meta) ? 'verified-empty' : 'unverified-empty'
}

/** 结果是否被截断（`results` 少于 `total`），截断时不得让用户以为这就是全部。 */
export const isClassroomResultTruncated = (meta, fallbackCount = 0) => {
  if (meta?.truncated === true) return true
  const total = toFiniteNumber(meta?.total)
  const loaded = toFiniteNumber(meta?.loaded)
  if (total === null || loaded === null) return false
  return loaded < total && total > 0
}

/** 「第 N 周」标签；后端若已给「第N周」原文则原样保留。 */
export const formatClassroomWeekLabel = (week, nthFormatter) => {
  const value = String(week ?? '').trim()
  if (!value) return ''
  if (/^第.+周$|^Week\s?\d+$/i.test(value)) return value
  return typeof nthFormatter === 'function' ? nthFormatter(value) : value
}

/** 「查询日期 · 第N周 · 周几 · 第X节」行内标签片段（日期由后端提供）。 */
export const formatClassroomCalendarLabel = (meta, nthFormatter) => {
  const parts = []
  const week = formatClassroomWeekLabel(meta?.week, nthFormatter)
  const weekday = String(meta?.weekday_name || '').trim()
  if (week) parts.push(week)
  if (weekday) parts.push(weekday)
  return parts.join(' · ')
}

/** 过滤后端返回的周次字典：只保留正整数（`0` 是预备周，服务端视为「不过滤」）。 */
export const normalizeRemoteWeeks = (weeks) => {
  if (!Array.isArray(weeks)) return []
  const out = []
  for (const item of weeks) {
    const value = Number(item)
    if (Number.isFinite(value) && value > 0 && !out.includes(value)) out.push(value)
  }
  return out.sort((a, b) => a - b)
}

/**
 * 周次选项：优先使用后端真实字典（避免选中越界周次被服务端静默忽略），
 * 为空时回退本地 1..25 范围。
 */
export const resolveWeekOptions = (remoteWeeks, fallbackCount = 25) => {
  const remote = normalizeRemoteWeeks(remoteWeeks)
  if (remote.length) return remote
  return Array.from({ length: fallbackCount }, (_, i) => i + 1)
}

/**
 * 教学楼筛选值的语义（师生链路不同，必须按角色切换）。
 *
 * - 教师（`fromTeacherDomain=true`）：后端按 `jxldm` **id** 过滤 → 提交 `code`
 * - 学生：后端按 `jxlmc` **名称**本地过滤 → 提交 `name`
 */
export const resolveBuildingQueryValue = (building, fromTeacherDomain) => {
  const code = String(building?.code ?? '').trim()
  const name = String(building?.name ?? '').trim()
  if (fromTeacherDomain) return code || name
  return name || code
}

/**
 * 构造 `/v2/classroom/query` 请求载荷（纯函数）。
 *
 * 关键点（#1062）：
 * - 未选择周次时**不发送** `week`，交由后端按可靠学期历解析；
 *   绝不用本机 `hbu_schedule_meta` 的当前周次替代。
 * - 未选择星期/节次/楼栋时不发送对应字段，避免把空值透传成服务端的「非法值」。
 */
export const buildClassroomQueryPayload = ({ filters = {}, studentId = '' } = {}) => {
  const sid = String(studentId || '').trim()
  const week = toFiniteNumber(filters.week)
  const weekday = toFiniteNumber(filters.weekday)
  const minSeats = toFiniteNumber(filters.minSeats)
  const maxSeats = toFiniteNumber(filters.maxSeats)
  // 节次严格限制在 1..=11：越界值（含 0）会让服务端静默改变语义，
  // 必须与 Rust 侧 `format_periods_csv` 的校验保持一致。
  const periods = Array.isArray(filters.periods)
    ? filters.periods
        .map((item) => toFiniteNumber(item))
        .filter((item) => item !== null && item >= 1 && item <= 11)
    : []
  const building = String(filters.building || '').trim()

  const payload = { student_id: sid }
  if (week !== null && week > 0) payload.week = week
  if (weekday !== null && weekday >= 1 && weekday <= 7) payload.weekday = weekday
  if (periods.length) payload.periods = periods
  if (building) payload.building = building
  if (minSeats !== null) payload.min_seats = minSeats
  if (maxSeats !== null) payload.max_seats = maxSeats
  return payload
}

/**
 * 缓存 key（含账号 + 角色 + 筛选条件）。
 *
 * 角色必须进 key：教师与学生走**完全不同**的空教室数据源，
 * 混用会让学生缓存被教师结果污染（#1063 验收）。
 */
export const buildClassroomCacheKey = (studentId, payload = {}, role = '') => {
  const sid = String(studentId || '').trim()
  const roleKey = String(role || '').trim() || 'unknown'
  const week = payload.week ?? 'auto'
  const weekday = payload.weekday ?? 'auto'
  const periods = Array.isArray(payload.periods) && payload.periods.length
    ? payload.periods.join(',')
    : 'auto'
  const building = encodeURIComponent(String(payload.building || 'all')).slice(0, 48)
  const min = payload.min_seats ?? ''
  const max = payload.max_seats ?? ''
  return `classroom:${roleKey}:${sid}:w${week}:d${weekday}:p${periods}:b${building}:s${min}-${max}`
}

/** 角色标识（来自后端 meta 的 `filter_mode`，用于快照与缓存隔离）。 */
export const classroomRoleFromMeta = (meta) => {
  const mode = String(meta?.filter_mode || '').trim()
  if (mode.startsWith('teacher')) return 'teacher'
  if (mode) return 'student'
  return ''
}
