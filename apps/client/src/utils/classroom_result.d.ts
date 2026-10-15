/**
 * classroom_result.js 的类型声明（供 spec / 业务 TS 引用）。
 *
 * 模块职责：空教室结果的**可信度语义**与请求载荷构造（#1062 / #1063）。
 * 实现与注释见 `classroom_result.js`；此处只声明对外契约。
 */

/** 后端 `meta.availability` 取值（与 Rust `ClassroomAvailability` 一致）。 */
export declare const CLASSROOM_AVAILABILITY: Readonly<{
  PERIOD_FREE: 'period_free'
  RESOURCE_CATALOG: 'resource_catalog'
  UNKNOWN: 'unknown'
  UNAUTHORIZED: 'unauthorized'
  BAD_RESPONSE: 'bad_response'
}>

export type ClassroomAvailabilityValue =
  (typeof CLASSROOM_AVAILABILITY)[keyof typeof CLASSROOM_AVAILABILITY]

/**
 * 归一化后的结果元数据（`week` 已转为字符串，`0` 已归空）。
 *
 * 用 `type`（而非 `interface`）声明：这样它带有隐式索引签名，
 * 可直接作为 `ClassroomMetaInput` 传入读取类函数。
 */
export type ClassroomMeta = {
  date_str: string
  date_iso: string
  date_source: string
  week: string
  weekday_name: string
  semester: string
  query_time: string
  availability: string
  total: number | null
  loaded: number | null
  truncated: boolean
  filters_applied: boolean
  resource_total: number | null
  periods_str: string
}

/**
 * 读取类函数的入参：既接受**归一化后**的 `ClassroomMeta`，也接受**后端原始 meta**
 * （字段类型可能是字符串/数值混用，且可能缺字段），因此放宽为宽松对象。
 */
export type ClassroomMetaInput = Record<string, unknown>

/** 空教室筛选条件（组件内部形态）。 */
export interface ClassroomFilters {
  week?: string | number | null
  weekday?: string | number | null
  periods?: Array<string | number | null> | null
  building?: string | null
  minSeats?: string | number | null
  maxSeats?: string | number | null
}

/** `/v2/classroom/query` 请求载荷。 */
export interface ClassroomQueryPayload {
  student_id: string
  week?: number
  weekday?: number
  periods?: number[]
  building?: string
  min_seats?: number
  max_seats?: number
}

/** 教学楼候选项。 */
export interface ClassroomBuildingOption {
  code?: string
  name?: string
  campus?: string
}

export type ClassroomEmptyMode = 'verified-empty' | 'unverified-empty' | 'none'

export declare function normalizeClassroomMeta(meta?: Record<string, unknown> | null): ClassroomMeta

export declare function classroomAvailabilityOf(meta?: ClassroomMetaInput | null): ClassroomAvailabilityValue

export declare function isVerifiedFree(meta?: ClassroomMetaInput | null): boolean

export declare function isResourceCatalog(meta?: ClassroomMetaInput | null): boolean

export declare function isAvailabilityUnknown(meta?: ClassroomMetaInput | null): boolean

export declare function classroomCountKey(meta?: ClassroomMetaInput | null): string

export declare function classroomResultCount(
  meta?: ClassroomMetaInput | null,
  fallbackCount?: number
): number

export declare function classroomBadgeKey(meta?: ClassroomMetaInput | null): string

export declare function classroomNoticeKey(meta?: ClassroomMetaInput | null): string

export declare function shouldShowAvailabilityNotice(
  meta?: ClassroomMetaInput | null,
  hasSuccessfulQuery?: boolean
): boolean

export declare function classroomEmptyMode(input: {
  meta?: ClassroomMetaInput | null
  roomCount?: number
  loading?: boolean
  hasError?: boolean
}): ClassroomEmptyMode

export declare function isClassroomResultTruncated(
  meta?: ClassroomMetaInput | null,
  fallbackCount?: number
): boolean

export declare function formatClassroomWeekLabel(
  week?: string | number | null,
  nthFormatter?: (value: string) => string
): string

export declare function formatClassroomCalendarLabel(
  meta?: ClassroomMetaInput | null,
  nthFormatter?: (value: string) => string
): string

export declare function normalizeRemoteWeeks(weeks?: unknown): number[]

export declare function resolveWeekOptions(remoteWeeks?: unknown, fallbackCount?: number): number[]

export declare function resolveBuildingQueryValue(
  building?: ClassroomBuildingOption | null,
  fromTeacherDomain?: boolean
): string

export declare function buildClassroomQueryPayload(input?: {
  filters?: ClassroomFilters
  studentId?: string
}): ClassroomQueryPayload

export declare function buildClassroomCacheKey(
  studentId?: string,
  payload?: Partial<ClassroomQueryPayload>,
  role?: string
): string

export declare function classroomRoleFromMeta(meta?: Record<string, unknown> | null): string
