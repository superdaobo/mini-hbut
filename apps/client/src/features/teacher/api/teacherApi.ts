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
const runTeacherFetch = async <T>(spec: TeacherFetchSpec<T>): Promise<TeacherLoadState<T>> => {
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
// 对外 API（E2 / E5 / E6 / E3 消费）
// ────────────────────────────────────────────────────────────────

/**
 * 拉取教师个人资料（工号 / 姓名 / 角色 / 部门 ID）。
 *
 * - Tauri：`teacher_profile_fetch()`
 * - bridge：`POST /v2/teacher/profile`
 */
export const fetchTeacherProfile = (): Promise<TeacherLoadState<TeacherProfile>> =>
  runTeacherFetch<TeacherProfile>({
    command: 'teacher_profile_fetch',
    tauriArgs: {},
    bridgePath: '/v2/teacher/profile',
    bridgePayload: {},
    normalize: normalizeTeacherProfile,
    isEmpty: (profile) => !profile.accountId && !profile.name
  })

/**
 * 拉取教师教学数据（教学任务 + 我的教学班，供 E5 双标签消费）。
 *
 * - Tauri：`teacher_teaching_fetch(semester?)`
 * - bridge：`POST /v2/teacher/teaching`
 */
export const fetchTeacherTeaching = (
  semester?: string
): Promise<TeacherLoadState<TeacherTeachingData>> =>
  runTeacherFetch<TeacherTeachingData>({
    command: 'teacher_teaching_fetch',
    tauriArgs: { semester: semester ?? null },
    bridgePath: '/v2/teacher/teaching',
    bridgePayload: { semester: semester ?? null },
    normalize: normalizeTeachingData,
    isEmpty: (data) => data.tasks.length === 0 && data.classes.length === 0
  })

/**
 * 拉取教师考试与监考数据（监考安排 + 任课班级考试，供 E6 双标签消费）。
 *
 * - Tauri：`teacher_exams_fetch(semester?)`
 * - bridge：`POST /v2/teacher/exams`
 */
export const fetchTeacherExams = (
  semester?: string
): Promise<TeacherLoadState<TeacherExamData>> =>
  runTeacherFetch<TeacherExamData>({
    command: 'teacher_exams_fetch',
    tauriArgs: { semester: semester ?? null },
    bridgePath: '/v2/teacher/exams',
    bridgePayload: { semester: semester ?? null },
    normalize: normalizeExamData,
    isEmpty: (data) => data.invigilations.length === 0 && data.exams.length === 0
  })

/**
 * 拉取教务通知列表（只读；教师标记已读仅本地，**绝不**写服务端）。
 *
 * - Tauri：`teacher_notices_fetch(page?, pageSize?, keyword?)`
 * - bridge：`POST /v2/teacher/notices`
 */
export const fetchTeacherNotices = (
  params: TeacherNoticeQuery = {}
): Promise<TeacherLoadState<TeacherNotice[]>> => {
  const page = typeof params.page === 'number' && params.page > 0 ? Math.floor(params.page) : 1
  const pageSize =
    typeof params.pageSize === 'number' && params.pageSize > 0 ? Math.floor(params.pageSize) : 20
  const keyword = asString(params.keyword)
  return runTeacherFetch<TeacherNotice[]>({
    command: 'teacher_notices_fetch',
    tauriArgs: { page, pageSize, keyword: keyword || null },
    bridgePath: '/v2/teacher/notices',
    bridgePayload: { page, page_size: pageSize, keyword: keyword || null },
    normalize: normalizeNoticeList,
    isEmpty: (list) => isEmptyTeacherCollection(list)
  })
}
