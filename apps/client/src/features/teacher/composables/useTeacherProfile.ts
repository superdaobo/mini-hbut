// src/features/teacher/composables/useTeacherProfile.ts
//
// Teacher Portal V2（E2 #1022）：教师个人资料加载编排。
//
// 职责边界：
//   1. 调用冻结契约 `fetchTeacherProfile()`（双通道只读适配器，**绝不**抛异常）；
//   2. 把 `TeacherLoadState<TeacherProfile>` 映射为视图可直接消费的响应式状态；
//   3. 按 README §5 把错误 `kind` 映射到 `teacher.error.*` i18n key
//      （**禁止**直接展示 `error.message`）。
//
// 本文件不引入任何学生域数据模型；教师资料字段只来自 `TeacherProfile`。

import { computed, ref } from 'vue'

import { fetchTeacherProfile } from '../api/teacherApi'
import type { TeacherDataErrorKind, TeacherLoadState, TeacherProfile } from '../types'
import { normalizeScopeAccountId } from '../utils/teacher_scope'
import {
  buildTeacherSnapshotKey,
  clearTeacherSnapshotScope,
  readTeacherSnapshot,
  writeTeacherSnapshot
} from '../cache/teacherSnapshotStore'
import {
  isTeacherOffline,
  resolveTeacherSyncStatus,
  type TeacherSyncStatus
} from '../cache/teacher_sync_status'

/**
 * 错误 kind → i18n key（与 README §5「错误 kind 语义」一一对应）。
 *
 * `empty` 不是错误：视图按 `status === 'empty'` 走空态，不走错误态；
 * 这里的映射仅为兜底（例如调用方误把空态当错误展示时仍有合理文案）。
 */
const ERROR_MESSAGE_KEYS: Record<TeacherDataErrorKind, string> = {
  empty: 'teacher.error.empty',
  unauthorized: 'teacher.error.unauthorized',
  expired: 'teacher.error.expired',
  errorHtml: 'teacher.error.errorHtml',
  timeout: 'teacher.error.timeout',
  notImplemented: 'teacher.error.notImplemented',
  unknown: 'teacher.error.unknown'
}

/** 把错误 kind 映射为 i18n key；`null`（无错误）按通用失败文案处理。 */
export const teacherProfileErrorMessageKey = (kind: TeacherDataErrorKind | null): string =>
  kind ? ERROR_MESSAGE_KEYS[kind] : 'teacher.error.unknown'

/** 教师身份标签 key：仅 `js`（recon 02 §2.1 实测）有确定语义。 */
export const TEACHER_ROLE_LABEL_KEY = 'teacher.profile.role.teacher'

/** 实测教师身份标识（教务 `#roleId` / `currentRoleId`）。 */
export const TEACHER_ROLE_ID = 'js'

export interface UseTeacherProfileOptions {
  /** 当前教师账号（工号）getter；用于作用域键隔离不同账号缓存。缺省不缓存。 */
  accountId?: () => string
  /** 当前学期（资料与学期无关，仅用于作用域键一致性；缺省占位）。 */
  semester?: () => string
}

export const useTeacherProfile = (options: UseTeacherProfileOptions = {}) => {
  const state = ref<TeacherLoadState<TeacherProfile>>({
    status: 'idle',
    data: null,
    error: null
  })

  // #1065：快照元信息（供 #1066 同步时间栏消费）
  /** 最后一次**成功**同步时间（ISO）；空串 = 尚未成功同步。 */
  const lastSuccessfulSyncAt = ref('')
  /** 当前展示数据是否来自本地快照。 */
  const fromCache = ref(false)
  /** 当前快照是否已过期（可能过期）。 */
  const snapshotStale = ref(false)

  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ''))
  /** 统一快照键：`teacher:{accountId}:{semester}:profile`（身份隔离）。 */
  const snapshotKey = computed(() =>
    buildTeacherSnapshotKey({
      resource: 'profile',
      accountId: accountId.value,
      semester: options.semester ? options.semester() : ''
    })
  )

  /** 已加载资料（`null` 表示尚未成功加载）。 */
  const profile = computed(() => state.value.data)
  const status = computed(() => state.value.status)
  /** 尚未拿到资料（`idle` 首帧 + `loading` 刷新中），保留上次资料避免整页闪空。 */
  const loading = computed(
    () => state.value.status === 'idle' || state.value.status === 'loading'
  )
  /** 接口可用但无资料（空态，非错误）。 */
  const isEmpty = computed(() => state.value.status === 'empty')
  const hasError = computed(() => state.value.status === 'error')
  /** 错误态对应的 i18n key（供视图 `t()` 消费）。 */
  const errorMessageKey = computed(() =>
    teacherProfileErrorMessageKey(state.value.error?.kind ?? null)
  )

  /** #1066：诚实同步状态（已同步/正在更新/已缓存/尚未同步/更新失败）。 */
  const syncStatus = computed<TeacherSyncStatus>(() =>
    resolveTeacherSyncStatus({
      phase: state.value.status,
      hasData: state.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: state.value.error?.kind ?? null
    })
  )

  /**
   * 后台再验证：保留旧资料（避免闪空），成功写入快照；失败保留旧资料并标记错误。
   */
  const revalidate = async (): Promise<void> => {
    const key = snapshotKey.value
    const account = accountId.value
    const previous = state.value.data
    state.value = { status: 'loading', data: previous, error: null }
    const result = await fetchTeacherProfile({ scope: account })
    // #1061/#1065：等待期间账号/学期可能已切换，迟到的旧作用域结果一律丢弃，
    // 与 useTeacherTeaching / useTeacherExams 的守卫保持一致（避免旧账号资料覆盖新账号）。
    if (snapshotKey.value !== key || accountId.value !== account) return
    if (result.status === 'ready' && result.data) {
      const syncedAt = new Date().toISOString()
      lastSuccessfulSyncAt.value = syncedAt
      fromCache.value = false
      snapshotStale.value = false
      if (key) {
        writeTeacherSnapshot({
          scopeKey: key,
          accountId: account,
          semester: options.semester ? options.semester() : '',
          resource: 'profile',
          queryKey: '',
          data: result.data,
          lastSuccessfulSyncAt: syncedAt
        })
      }
      state.value = result
      return
    }
    if (result.status === 'empty') {
      state.value = result
      return
    }
    // 失败：保留上次成功资料（若有），由 syncStatus 标记「已缓存/更新失败」。
    state.value = { status: 'error', data: previous, error: result.error }
  }

  /**
   * 页面进入加载（#1065 缓存优先）：先渲染当前账号 scope 的快照，
   * 新鲜则直接返回；过期/无缓存则后台再验证（失败保留旧数据）。
   */
  const load = async (): Promise<void> => {
    const key = snapshotKey.value
    if (key) {
      const snapshot = readTeacherSnapshot<TeacherProfile>(key)
      if (snapshot) {
        lastSuccessfulSyncAt.value = snapshot.meta.lastSuccessfulSyncAt
        fromCache.value = true
        snapshotStale.value = snapshot.meta.stale
        state.value = { status: 'ready', data: snapshot.data, error: null }
        if (!snapshot.meta.stale) return
      }
    }
    await revalidate()
  }

  /**
   * 手动重新拉取（显式刷新，绕过缓存）。
   *
   * 刷新期间保留上次资料（避免整页闪空，页头刷新图标转圈表示进行中）；
   * 最终结果按接口返回覆盖 —— 失败时进入错误态且不展示过期内容（显式刷新语义）。
   * 失败不抛出：`fetchTeacherProfile` 已把错误归一化进 `error` 字段。
   */
  const reload = async (): Promise<void> => {
    const previous = state.value.data
    state.value = { status: 'loading', data: previous, error: null }
    state.value = await fetchTeacherProfile({ scope: accountId.value })
  }

  /** 清理当前账号作用域快照（登出 / 账号切换时调用）。 */
  const clearCache = (): void => {
    clearTeacherSnapshotScope(accountId.value)
  }

  return {
    state,
    profile,
    status,
    loading,
    isEmpty,
    hasError,
    errorMessageKey,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    load,
    reload,
    clearCache
  }
}
