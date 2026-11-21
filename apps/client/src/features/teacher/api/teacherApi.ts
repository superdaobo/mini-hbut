// src/features/teacher/api/teacherApi.ts
//
// Teacher Portal V2（#1019）：教师只读数据访问适配器（契约冻结文件）。
//
// 双通道：
//   - Tauri（桌面 / 移动原生）：`invoke('teacher_*_fetch')`
//   - Web / 浏览器：POST `/v2/teacher/*` 本地 bridge（与原生同源鉴权）
//
// 统一约定：
//   1. **只读**：仅调用 E0 预注册的 4 个只读命令 / bridge 路由，绝不触碰写型接口
//      （对照 data/teacher-api-recon/07-write-endpoints-denylist.md）。
//   2. 所有失败都归一化为 `TeacherDataError`（kind + message），
//      由调用方按 `kind` 映射 i18n 文案（**不要直接展示 message**）。
//   3. 返回 `TeacherLoadState<T>`：`empty` 用独立 status 表达，不抛异常。
//   4. stub 阶段（E0）后端返回「未实现」，归一化为 `notImplemented`，
//      UI 显示「功能建设中」空态；E2/E5/E6 替换 Rust 实现后本文件无需改动。

import {
  bridgePost,
  errorMessage,
  hasTauri,
  invoke,
  unwrapBridge,
  type JsonObject
} from '../../../utils/axios_adapter/bridge'
import type {
  TeacherDataError,
  TeacherDataErrorKind,
  TeacherExamData,
  TeacherLoadState,
  TeacherNotice,
  TeacherProfile,
  TeacherTeachingData
} from '../types'
import {
  asString,
  isEmptyTeacherCollection,
  normalizeExamData,
  normalizeNoticeList,
  normalizeTeacherProfile,
  normalizeTeachingData
} from '../utils/normalizeTeacherData'

/** 通知查询参数（分页 + 关键字；关键字是否被服务端支持需 E3 实测确认）。 */
export interface TeacherNoticeQuery {
  page?: number
  /** 每页条数（前端 camelCase；Tauri 参数名为 `pageSize`，bridge 为 `page_size`）。 */
  pageSize?: number
  keyword?: string
}

// ────────────────────────────────────────────────────────────────
// 错误归一化
// ────────────────────────────────────────────────────────────────

/** 按消息内容判定教师数据错误类别（顺序敏感：先具体后宽泛）。 */
export const classifyTeacherErrorKind = (message: string): TeacherDataErrorKind => {
  const text = String(message || '')
  if (!text) return 'unknown'
  if (/未实现|尚未实现|not\s*implemented|not_implemented|notimplemented/i.test(text)) {
    return 'notImplemented'
  }
  if (/会话已过期|登录已失效|重新登录|请重新登录|session\s*expired|expired/i.test(text)) {
    return 'expired'
  }
  if (/没有访问当前接口的权限|无权限|未授权|\b401\b|unauthorized|permission/i.test(text)) {
    return 'unauthorized'
  }
  if (/报错啦|错误原因|无法访问|<!doctype|<html/i.test(text)) {
    return 'errorHtml'
  }
  if (/超时|timeout|timed\s*out|aborted|abort/i.test(text)) {
    return 'timeout'
  }
  return 'unknown'
}

/** 把任意异常/后端错误对象归一化为 `TeacherDataError`。 */
export const toTeacherDataError = (error: unknown): TeacherDataError => {
  const message = errorMessage(error)
  return { kind: classifyTeacherErrorKind(message), message }
}

/** 构造空态错误（`status === 'empty'` 时的等价错误表示）。 */
export const teacherEmptyError = (): TeacherDataError => ({ kind: 'empty', message: '' })

// ────────────────────────────────────────────────────────────────
// 通用执行器
// ────────────────────────────────────────────────────────────────

interface TeacherFetchSpec<T> {
  /** Tauri 命令名（lib.rs 已注册）。 */
  command: string
  /** Tauri 参数（camelCase）。 */
  tauriArgs: JsonObject
  /** bridge 路径（`/v2/teacher/*`）。 */
  bridgePath: string
  /** bridge 请求体（snake_case，与 Rust 反序列化字段一致）。 */
  bridgePayload: JsonObject
  /** 原始响应 → 领域模型。 */
  normalize: (raw: unknown) => T
  /** 判定领域模型是否为空。 */
  isEmpty: (data: T) => boolean
}

/**
 * 执行一次教师只读拉取，返回统一加载状态。
 *
 * bridge 返回 `{success:false,error}` 时抛错；成功时取 `data`。
 * 原生 invoke reject 的字符串同样经 `errorMessage` 归一化。
 */
const executeTeacherFetch = async <T>(spec: TeacherFetchSpec<T>): Promise<TeacherLoadState<T>> => {
  try {
    let raw: unknown
    if (hasTauri) {
      raw = await invoke<unknown>(spec.command, spec.tauriArgs)
    } else {
      const response = await bridgePost(spec.bridgePath, spec.bridgePayload)
      if (response.success === false) {
        throw new Error(errorMessage(response.error) || '教师数据获取失败')
      }
      raw = unwrapBridge(response)
    }
    const data = spec.normalize(raw)
    if (spec.isEmpty(data)) {
      return { status: 'empty', data: null, error: teacherEmptyError() }
    }
    return { status: 'ready', data, error: null }
  } catch (error) {
    return { status: 'error', data: null, error: toTeacherDataError(error) }
  }
}

// ────────────────────────────────────────────────────────────────
// #1067：本层 in-flight singleflight（同 scope/学期/筛选的重复调用合并）
// ────────────────────────────────────────────────────────────────
//
// 说明：
//   - 只对**只读 GET** 去重；登录 / 刷新会话 / 写型请求**绝不**走本层
//     （会话状态竞争，见 #1067 边界）；
//   - key 显式纳入调用方传入的 `scope`（账号/身份令牌），
//     避免教师 A 的在途请求被教师 B 复用（切号瞬间的串号）；
//   - 请求结束（成功或失败）后立即从在途表移除，失败不缓存，允许下次重试。

/** 在途请求表：key = command|scope|args，value = 进行中的 Promise。 */
const teacherFetchInFlight = new Map<string, Promise<unknown>>()

/** 当前在途请求数（测试 / 可观测性用）。 */
export const teacherFetchInFlightCount = (): number => teacherFetchInFlight.size

/** 清空在途表（账号切换 / 登出时调用，丢弃过期请求引用）。 */
export const clearTeacherFetchInFlight = (): void => {
  teacherFetchInFlight.clear()
}

/** 同一 key 的并发调用合并为同一个 Promise；结束后自动移除。 */
const runTeacherSingleflight = <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const existing = teacherFetchInFlight.get(key) as Promise<T> | undefined
  if (existing) return existing
  const promise = task().finally(() => {
    teacherFetchInFlight.delete(key)
  })
  teacherFetchInFlight.set(key, promise as Promise<unknown>)
  return promise
}

/** 本层可选的去重作用域（账号 / 身份），不参与业务参数。 */
export interface TeacherFetchOptions {
  /**
   * 去重作用域：通常为教师工号。不同 scope 的并发请求**不会**互相复用。
   * 缺省为空串（仍按 command+args 去重）。
   */
  scope?: string
}

const runTeacherFetch = <T>(
  spec: TeacherFetchSpec<T>,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<T>> => {
  const key = `${spec.command}|${options.scope ?? ''}|${JSON.stringify(spec.tauriArgs)}`
  return runTeacherSingleflight(key, () => executeTeacherFetch(spec))
}

// ────────────────────────────────────────────────────────────────
// 对外 API（E2 / E5 / E6 / E3 消费）
// ────────────────────────────────────────────────────────────────

/**
 * 拉取教师个人资料（工号 / 姓名 / 角色 / 部门 ID）。
 *
 * - Tauri：`teacher_profile_fetch()`
 * - bridge：`POST /v2/teacher/profile`
 */
export const fetchTeacherProfile = (
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherProfile>> =>
  runTeacherFetch<TeacherProfile>(
    {
      command: 'teacher_profile_fetch',
      tauriArgs: {},
      bridgePath: '/v2/teacher/profile',
      bridgePayload: {},
      normalize: normalizeTeacherProfile,
      isEmpty: (profile) => !profile.accountId && !profile.name
    },
    options
  )

/**
 * 拉取教师教学数据（教学任务 + 我的教学班，供 E5 双标签消费）。
 *
 * - Tauri：`teacher_teaching_fetch(semester?)`
 * - bridge：`POST /v2/teacher/teaching`
 */
export const fetchTeacherTeaching = (
  semester?: string,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherTeachingData>> =>
  runTeacherFetch<TeacherTeachingData>(
    {
      command: 'teacher_teaching_fetch',
      tauriArgs: { semester: semester ?? null },
      bridgePath: '/v2/teacher/teaching',
      bridgePayload: { semester: semester ?? null },
      normalize: normalizeTeachingData,
      isEmpty: (data) => data.tasks.length === 0 && data.classes.length === 0
    },
    options
  )

/**
 * 拉取教师考试与监考数据（监考安排 + 任课班级考试，供 E6 双标签消费）。
 *
 * - Tauri：`teacher_exams_fetch(semester?)`
 * - bridge：`POST /v2/teacher/exams`
 */
export const fetchTeacherExams = (
  semester?: string,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherExamData>> =>
  runTeacherFetch<TeacherExamData>(
    {
      command: 'teacher_exams_fetch',
      tauriArgs: { semester: semester ?? null },
      bridgePath: '/v2/teacher/exams',
      bridgePayload: { semester: semester ?? null },
      normalize: normalizeExamData,
      isEmpty: (data) => data.invigilations.length === 0 && data.exams.length === 0
    },
    options
  )

/**
 * 拉取教务通知列表（只读；教师标记已读仅本地，**绝不**写服务端）。
 *
 * - Tauri：`teacher_notices_fetch(page?, pageSize?, keyword?)`
 * - bridge：`POST /v2/teacher/notices`
 */
export const fetchTeacherNotices = (
  params: TeacherNoticeQuery = {},
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherNotice[]>> => {
  const page = typeof params.page === 'number' && params.page > 0 ? Math.floor(params.page) : 1
  const pageSize =
    typeof params.pageSize === 'number' && params.pageSize > 0 ? Math.floor(params.pageSize) : 20
  const keyword = asString(params.keyword)
  return runTeacherFetch<TeacherNotice[]>(
    {
      command: 'teacher_notices_fetch',
      tauriArgs: { page, pageSize, keyword: keyword || null },
      bridgePath: '/v2/teacher/notices',
      bridgePayload: { page, page_size: pageSize, keyword: keyword || null },
      normalize: normalizeNoticeList,
      isEmpty: (list) => isEmptyTeacherCollection(list)
    },
    options
  )
}

// ────────────────────────────────────────────────────────────────
// goal-21：教师端新增 14 个只读查询（与后端 14 个 Tauri 命令 / bridge 路由一一对应）
//
// 约定与上面四个函数完全一致：
// - 不抛异常，错误进 `error` 字段（`executeTeacherFetch` 已统一处理）
// - 走同一份 singleflight（同 command + 同参数并发只发一次）
// - 数据形状以 `Record<string, unknown>` 承载：后端返回的是教务原始字段的归一化结果，
//   逐字段建 interface 会让前端契约比后端更脆弱（后端加字段前端就编译错）。
// ────────────────────────────────────────────────────────────────

/** 教师端只读查询的通用载荷（字段见 `data/teacher-portal-recon-1120/17-field-contract.md`）。 */
export type TeacherRawPayload = Record<string, unknown>

const emptyWhenNoKeys = (value: TeacherRawPayload): boolean =>
  Object.keys(value ?? {}).length === 0

/** 学生考勤统计（`teacher_attendance_fetch` / `/v2/teacher/attendance`）。 */
export const fetchTeacherAttendance = (
  semester?: string,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_attendance_fetch',
      tauriArgs: { semester: semester ?? null },
      bridgePath: '/v2/teacher/attendance',
      bridgePayload: { semester: semester ?? null },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 教师端工作量（`teacher_workload_fetch` / `/v2/teacher/workload`）。 */
export const fetchTeacherWorkload = (
  semester?: string,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_workload_fetch',
      tauriArgs: { semester: semester ?? null },
      bridgePath: '/v2/teacher/workload',
      bridgePayload: { semester: semester ?? null },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 只读工作流：申请 / 经办 / 待办（`teacher_workflow_fetch` / `/v2/teacher/workflow`）。 */
export const fetchTeacherWorkflow = (
  semester?: string,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_workflow_fetch',
      tauriArgs: { semester: semester ?? null },
      bridgePath: '/v2/teacher/workflow',
      bridgePayload: { semester: semester ?? null },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 考试事务：缓考 / 剩余试卷 / 评教（`teacher_exam_affairs_fetch`）。 */
export const fetchTeacherExamAffairs = (
  semester?: string,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_exam_affairs_fetch',
      tauriArgs: { semester: semester ?? null },
      bridgePath: '/v2/teacher/exam-affairs',
      bridgePayload: { semester: semester ?? null },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 学分统计（`teacher_credits_fetch` / `/v2/teacher/credits`）。 */
export const fetchTeacherCredits = (
  semester?: string,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_credits_fetch',
      tauriArgs: { semester: semester ?? null },
      bridgePath: '/v2/teacher/credits',
      bridgePayload: { semester: semester ?? null },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 调停补申请（`teacher_adjustment_fetch` / `/v2/teacher/adjustment`）。 */
export const fetchTeacherAdjustment = (
  semester?: string,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_adjustment_fetch',
      tauriArgs: { semester: semester ?? null },
      bridgePath: '/v2/teacher/adjustment',
      bridgePayload: { semester: semester ?? null },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/**
 * 学生名册（`teacher_roster_fetch` / `/v2/teacher/roster`）。
 *
 * ⚠️ `bjid` 必填：缺失时**后端直接拒绝且不发请求**（否则会拉回全校 5.7 万条）。
 */
export const fetchTeacherRoster = (
  params: { bjid: string; page?: number; pageSize?: number; keyword?: string },
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_roster_fetch',
      tauriArgs: {
        bjid: params.bjid,
        page: params.page ?? null,
        pageSize: params.pageSize ?? null,
        keyword: params.keyword ?? null
      },
      bridgePath: '/v2/teacher/roster',
      bridgePayload: {
        bjid: params.bjid,
        page: params.page ?? null,
        page_size: params.pageSize ?? null,
        keyword: params.keyword ?? null
      },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 成绩录入进度 + 教学班发布状态（`teacher_grade_entry_fetch`）。 */
export const fetchTeacherGradeEntry = (
  semester?: string,
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_grade_entry_fetch',
      tauriArgs: { semester: semester ?? null },
      bridgePath: '/v2/teacher/grade-entry',
      bridgePayload: { semester: semester ?? null },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 课表扩展：班级列表 + 教室列表 + 每班 `scheduleUrl`（`teacher_schedule_lists_fetch`）。 */
export const fetchTeacherScheduleLists = (
  params: { semester?: string; keyword?: string } = {},
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_schedule_lists_fetch',
      tauriArgs: { semester: params.semester ?? null, keyword: params.keyword ?? null },
      bridgePath: '/v2/teacher/schedule-lists',
      bridgePayload: { semester: params.semester ?? null, keyword: params.keyword ?? null },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 融合门户卡片（`teacher_portal_cards_fetch` / `/v2/teacher/portal-cards`）。 */
export const fetchTeacherPortalCards = (
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_portal_cards_fetch',
      tauriArgs: {},
      bridgePath: '/v2/teacher/portal-cards',
      bridgePayload: {},
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 学习通教师侧：课程与教学班（`teacher_chaoxing_courses_fetch`）。 */
export const fetchTeacherChaoxingCourses = (
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_chaoxing_courses_fetch',
      tauriArgs: {},
      bridgePath: '/v2/teacher/chaoxing-courses',
      bridgePayload: {},
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 学习通教师侧：学情 6 维度（`teacher_chaoxing_analytics_fetch`）。 */
export const fetchTeacherChaoxingAnalytics = (
  params: { courseid: string; clazzid: string; cpi: string },
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_chaoxing_analytics_fetch',
      tauriArgs: { courseid: params.courseid, clazzid: params.clazzid, cpi: params.cpi },
      bridgePath: '/v2/teacher/chaoxing-analytics',
      bridgePayload: { courseid: params.courseid, clazzid: params.clazzid, cpi: params.cpi },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 学习通教师侧：全班成绩明细（`teacher_chaoxing_scores_fetch`）。 */
export const fetchTeacherChaoxingScores = (
  params: { courseid: string; clazzid: string; cpi: string },
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_chaoxing_scores_fetch',
      tauriArgs: { courseid: params.courseid, clazzid: params.clazzid, cpi: params.cpi },
      bridgePath: '/v2/teacher/chaoxing-scores',
      bridgePayload: { courseid: params.courseid, clazzid: params.clazzid, cpi: params.cpi },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/** 学习通教师侧：学习监控（`teacher_chaoxing_monitor_fetch`）。 */
export const fetchTeacherChaoxingMonitor = (
  params: { courseid: string; clazzid: string; cpi: string },
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_chaoxing_monitor_fetch',
      tauriArgs: { courseid: params.courseid, clazzid: params.clazzid, cpi: params.cpi },
      bridgePath: '/v2/teacher/chaoxing-monitor',
      bridgePayload: { courseid: params.courseid, clazzid: params.clazzid, cpi: params.cpi },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )

/**
 * 班级课表结构化数据（`teacher_class_schedule_fetch` / `/v2/teacher/class-schedule`）。
 *
 * goal-22：返回 46 条量级的课程条目（kcmc/xingqi/djc/zcstr/croommc…），
 * 供课表 Tab 在**应用内**用网格渲染 —— 不再打开外部浏览器。
 *
 * `encodeId` 来自班级列表（`fetchTeacherScheduleLists` 的 `classes[].encodeId`）。
 */
export const fetchTeacherClassSchedule = (
  params: { encodeId: string; semester?: string; campusId?: string },
  options: TeacherFetchOptions = {}
): Promise<TeacherLoadState<TeacherRawPayload>> =>
  runTeacherFetch<TeacherRawPayload>(
    {
      command: 'teacher_class_schedule_fetch',
      tauriArgs: {
        encodeId: params.encodeId,
        semester: params.semester ?? null,
        campusId: params.campusId ?? null
      },
      bridgePath: '/v2/teacher/class-schedule',
      bridgePayload: {
        encodeId: params.encodeId,
        semester: params.semester ?? null,
        campusId: params.campusId ?? null
      },
      normalize: (raw) => raw as TeacherRawPayload,
      isEmpty: emptyWhenNoKeys
    },
    options
  )
