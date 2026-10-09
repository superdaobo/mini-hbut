// src/features/teacher/composables/useTeacherNotifications.ts
//
// Teacher Portal V2（E3 #1023）：教师通知只读组合函数。
//
// 安全约束（对照 data/teacher-api-recon/07-write-endpoints-denylist.md）：
//   1. **只读**：教务通知走既有 `school_inbox_fetch`（portal 只读链路），
//      绝不调用 `school_inbox_mark_read` 等任何写型命令；
//   2. **已读仅本地**：教师标记已读只写入教师作用域
//      `teacher:{accountId}:{semester}:notices-read`，**绝不** POST updateState；
//   3. **不触达学生域**：本模块不引用学生成绩 / 学生考试 / 电费等学生专属接口。

import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../../../platform/native'
import { isTeacherRoleValue } from '../../../utils/login_role.js'
import {
  looksLikeHtml,
  sanitizeSchoolInboxHtml
} from '../../../utils/school_inbox_content.js'
import {
  listTeacherReminderEvents,
  type TeacherReminderEvent
} from '../utils/teacher_reminders'
import { classifyTeacherErrorKind, toTeacherDataError } from '../api/teacherApi'
import type { TeacherDataError, TeacherDataErrorKind } from '../types'
import {
  asString,
  normalizeTeacherText,
  stripTeacherHtml
} from '../utils/normalizeTeacherData'
import { buildTeacherScopedKey } from '../utils/teacher_scope'

// ────────────────────────────────────────────────────────────────
// 只读红线：UI 决策点（可单测）
// ────────────────────────────────────────────────────────────────

/**
 * 是否允许下发「标记已读」远端请求。
 *
 * 教师身份（或显式 readOnly）一律 `false`：native `school_inbox_mark_read`
 * 在学生路径会 POST `/admin/system/tzsjx/updateState`，教师路径必须完全断掉。
 * 该函数是 UI 侧唯一的写请求开关，被契约测试直接断言。
 */
export const shouldSendRemoteMarkRead = (role: unknown, readOnly = false): boolean =>
  !readOnly && !isTeacherRoleValue(role)

/**
 * 错误 kind → i18n key（README §5：**不要**直接展示 `error.message`）。
 * 覆盖全部 `TeacherDataErrorKind`，缺失映射回落到 `teacher.error.unknown`。
 */
export const TEACHER_ERROR_I18N_KEY: Record<TeacherDataErrorKind, string> = {
  empty: 'teacher.error.empty',
  unauthorized: 'teacher.error.unauthorized',
  expired: 'teacher.error.expired',
  errorHtml: 'teacher.error.errorHtml',
  timeout: 'teacher.error.timeout',
  notImplemented: 'teacher.error.notImplemented',
  unknown: 'teacher.error.unknown'
}

// ────────────────────────────────────────────────────────────────
// 视图模型
// ────────────────────────────────────────────────────────────────

/** 教务通知列表项（来自既有 portal 只读链路，已做 HTML 清洗）。 */
export interface TeacherNoticeItem {
  id: string
  title: string
  summary: string
  body: string
  createdAt: string
  isRead: boolean
  source: string
}

/** 一次通知拉取的结果（fetcher 可注入，便于单测）。 */
export interface TeacherNoticeFetchResult {
  items: TeacherNoticeItem[]
  source: string
  fetchedAt: string
  /** 非桌面运行时：提示需在桌面客户端使用。 */
  desktopOnly?: boolean
  /** fetcher 已知的错误类别（优先于 message 推断）。 */
  errorKind?: TeacherDataErrorKind
  errorMessage?: string
}

export type TeacherNoticeFetcher = () => Promise<TeacherNoticeFetchResult>

export interface UseTeacherNotificationsOptions {
  /** 当前教师工号（作用域与本地已读隔离键）。 */
  accountId: () => string | undefined
  /** 当前学期（可选；缺失时作用域退化为占位，绝不回落学生域）。 */
  semester?: () => string | undefined
  /** 只读数据源（默认走 native `school_inbox_fetch` portal 链路）。 */
  fetcher?: TeacherNoticeFetcher
}

// ────────────────────────────────────────────────────────────────
// 本地已读（教师作用域隔离）
// ────────────────────────────────────────────────────────────────

/** 教师本地已读键：`teacher:{accountId}:{semester}:notices-read`。 */
export const teacherNoticeReadKey = (accountId: unknown, semester: unknown): string =>
  buildTeacherScopedKey('notices-read', accountId, semester)

const readReadIds = (key: string): string[] => {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((value) => String(value)).filter(Boolean) : []
  } catch {
    return []
  }
}

const writeReadIds = (key: string, ids: string[]): void => {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(ids))
  } catch {
    // 存储不可用时仅保留内存态
  }
}

// ────────────────────────────────────────────────────────────────
// 默认只读数据源（native portal 链路）
// ────────────────────────────────────────────────────────────────

/** portal 只读链路返回项 → 视图模型（标题压成纯文本；正文保留白名单安全 HTML）。 */
export const toTeacherNoticeItem = (raw: unknown): TeacherNoticeItem => {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawBody = asString(record.body ?? record.summary)
  // 富文本正文先经白名单清洗（去掉 script / 事件属性 / 非白名单标签），保留可读排版。
  const body = rawBody && looksLikeHtml(rawBody) ? sanitizeSchoolInboxHtml(rawBody) : rawBody
  const summary =
    normalizeTeacherText(record.summary) || stripTeacherHtml(record.body).slice(0, 160)
  return {
    id: asString(record.id),
    title: stripTeacherHtml(record.title),
    summary,
    body,
    createdAt: asString(record.createdAt ?? record.created_at),
    isRead: Boolean(record.isRead ?? record.is_read),
    source: asString(record.source) || 'portal'
  }
}

/**
 * 默认 fetcher：复用 `SchoolInboxView` 同款 portal 只读链路。
 *
 * 只发 `school_inbox_fetch`（loginMode=portal，服务端 GET ajaxList），
 * 不触碰任何写型命令；教师会话由原生层持有。
 */
export const fetchTeacherNoticesReadOnly: TeacherNoticeFetcher = async () => {
  if (!isTauriRuntime()) {
    return { items: [], source: '', fetchedAt: '', desktopOnly: true }
  }
  const response = (await invokeNative('school_inbox_fetch', { loginMode: 'portal' })) as {
    items?: unknown[]
    source?: unknown
    fetchedAt?: unknown
    error?: unknown
  } | null
  const rawItems = Array.isArray(response?.items) ? response.items : []
  const items = rawItems.map(toTeacherNoticeItem).filter((item) => item.id)
  const errorMessage = asString(response?.error)
  return {
    items,
    source: asString(response?.source) || 'portal',
    fetchedAt: asString(response?.fetchedAt),
    ...(errorMessage ? { errorKind: classifyInboxError(errorMessage), errorMessage } : {})
  }
}

/**
 * 通知错误分类：先处理「HTTP 200 错误 HTML / 非 JSON 响应」，
 * 再回落到 E0 的 `classifyTeacherErrorKind`（401 / 会话过期 / 超时等）。
 */
export const classifyInboxError = (message: string): TeacherDataErrorKind => {
  const text = String(message || '')
  if (/JSON\s*解析失败|expected value|unexpected token|invalid json/i.test(text)) {
    return 'errorHtml'
  }
  return classifyTeacherErrorKind(text)
}

// ────────────────────────────────────────────────────────────────
// 组合函数
// ────────────────────────────────────────────────────────────────

export interface UseTeacherNotificationsReturn {
  notices: Ref<TeacherNoticeItem[]>
  reminders: Ref<TeacherReminderEvent[]>
  loading: Ref<boolean>
  remindersLoading: Ref<boolean>
  error: Ref<TeacherDataError | null>
  desktopOnly: Ref<boolean>
  fetchedAt: Ref<string>
  source: Ref<string>
  unreadCount: ComputedRef<number>
  academicNotices: ComputedRef<TeacherNoticeItem[]>
  loadNotices: () => Promise<void>
  loadReminders: () => Promise<void>
  markLocalRead: (itemId: string) => void
  isLocallyRead: (itemId: string) => boolean
}

export const useTeacherNotifications = (
  options: UseTeacherNotificationsOptions
): UseTeacherNotificationsReturn => {
  const fetcher = options.fetcher ?? fetchTeacherNoticesReadOnly

  const notices = ref<TeacherNoticeItem[]>([])
  const reminders = ref<TeacherReminderEvent[]>([])
  const loading = ref(false)
  const remindersLoading = ref(false)
  const error = ref<TeacherDataError | null>(null)
  const desktopOnly = ref(false)
  const fetchedAt = ref('')
  const source = ref('portal')
  const localReadIds = ref<Set<string>>(new Set())

  const readKey = (): string =>
    teacherNoticeReadKey(options.accountId(), options.semester ? options.semester() : '')

  const loadReadIds = (): void => {
    localReadIds.value = new Set(readReadIds(readKey()))
  }

  const isLocallyRead = (itemId: string): boolean => localReadIds.value.has(itemId)

  const academicNotices = computed(() =>
    notices.value.map((item) => ({
      ...item,
      isRead: item.isRead || localReadIds.value.has(item.id)
    }))
  )

  const unreadCount = computed(
    () => academicNotices.value.filter((item) => !item.isRead).length
  )

  const loadNotices = async (): Promise<void> => {
    loading.value = true
    error.value = null
    desktopOnly.value = false
    loadReadIds()
    try {
      const result = await fetcher()
      notices.value = result.items
      fetchedAt.value = result.fetchedAt
      source.value = result.source || 'portal'
      desktopOnly.value = result.desktopOnly === true
      if (result.errorMessage) {
        error.value = {
          kind: result.errorKind ?? classifyInboxError(result.errorMessage),
          message: result.errorMessage
        }
      }
    } catch (caught) {
      const normalized = toTeacherDataError(caught)
      error.value = { kind: classifyInboxError(normalized.message), message: normalized.message }
    } finally {
      loading.value = false
    }
  }

  const loadReminders = async (): Promise<void> => {
    remindersLoading.value = true
    try {
      // 教学提醒只读本地教师作用域快照；数据源未就绪时为空数组（绝不伪造数据）。
      reminders.value = listTeacherReminderEvents(options.accountId(), options.semester ? options.semester() : '')
    } finally {
      remindersLoading.value = false
    }
  }

  /**
   * 标记本地已读：仅更新内存 + 教师作用域本地存储，**绝不**发网络请求。
   */
  const markLocalRead = (itemId: string): void => {
    const id = asString(itemId)
    if (!id) return
    const next = new Set(localReadIds.value)
    next.add(id)
    localReadIds.value = next
    writeReadIds(readKey(), [...next])
  }

  return {
    notices,
    reminders,
    loading,
    remindersLoading,
    error,
    desktopOnly,
    fetchedAt,
    source,
    unreadCount,
    academicNotices,
    loadNotices,
    loadReminders,
    markLocalRead,
    isLocallyRead
  }
}
