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

export const useTeacherProfile = () => {
  const state = ref<TeacherLoadState<TeacherProfile>>({
    status: 'idle',
    data: null,
    error: null
  })

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

  /**
   * 重新拉取教师资料。
   *
   * 刷新期间保留上次资料（避免整页闪空，页头刷新图标转圈表示进行中）；
   * 最终结果按接口返回覆盖 —— 失败时清空资料并进入错误态，**不展示过期内容**。
   * 失败不抛出：`fetchTeacherProfile` 已把错误归一化进 `error` 字段。
   */
  const reload = async (): Promise<void> => {
    const previous = state.value.data
    state.value = { status: 'loading', data: previous, error: null }
    state.value = await fetchTeacherProfile()
  }

  return {
    state,
    profile,
    status,
    loading,
    isEmpty,
    hasError,
    errorMessageKey,
    reload
  }
}
