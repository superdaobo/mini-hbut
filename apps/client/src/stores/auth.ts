import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  clearLoginRole,
  normalizeLoginRole,
  writeLoginRole
} from '../utils/login_role.js'

/** 登录身份：学生端 / 教师端。 */
export type IdentityRole = 'student' | 'teacher'

export interface AuthSessionSnapshot {
  studentId?: string | null
  userUuid?: string | null
  /** 身份类型；缺省为学生（历史调用方不需要改动）。 */
  role?: IdentityRole | string | null
}

/**
 * 在线会话状态（GitHub #659：区分「缓存本地身份」与「教务在线会话恢复」）
 *
 * - unknown：初始未知（未尝试恢复 / 已登出）
 * - cached_offline：仅恢复了本地缓存身份（studentId 非空可展示缓存），
 *   教务在线会话未恢复
 * - recovering：后台正在恢复在线会话（自动重登 / cookie 恢复进行中）
 * - online：在线会话已建立（cookie 桥接 / 自动重登 / 手动登录成功）
 * - needs_login：明确需要重新登录（无可用凭据，等待用户手动登录）
 *
 * isLoggedIn 语义保持不变（studentId 非空即视为「已恢复本地身份」）；
 * onlineSessionState 仅在 studentId 非空时有意义，用于向 UI 表达
 * 「在线会话是否已恢复」。
 *
 * 契约 D（第十轮 Phase 0）：「当前会话是否已确认（verified）」以本模块的
 * `sessionVerified`（及其投影 `verifiedStudentId`）为**可被游戏侧读取的单一事实源**：
 * 游乐场展示 / 模块 URL 注入 / 打开模块前收口都只从这里读取，**禁止**用「studentId 非空」
 * 代替。（启动恢复链在 `.finally` 收口时使用其启动期结果 `sessionRestoreVerified`，
 * 它与 `sessionVerified` 同源、只是把「恢复流程内部赋值」这一 P0 语义固定在恢复链内。）
 */
export type OnlineSessionState =
  | 'unknown'
  | 'cached_offline'
  | 'recovering'
  | 'online'
  | 'needs_login'

export const normalizeIdentifier = (value: unknown): string => String(value ?? '').trim()

export const useAuthStore = defineStore('auth', () => {
  const studentId = ref('')
  const userUuid = ref('')
  const hydrated = ref(false)
  const onlineSessionState = ref<OnlineSessionState>('unknown')
  const isLoggedIn = computed(() => studentId.value.length > 0)

  /** 仅后端成功的登录/会话恢复可建立教师身份；入口选择只是表单偏好。 */
  const role = ref<IdentityRole>('student')
  const isTeacher = computed(() => role.value === 'teacher')

  /**
   * 契约 D 身份收紧：**当前会话是否已确认（verified）** —— 游戏身份的单一事实源。
   *
   * 只有在线会话真正建立（cookie 桥接 / 自动重登 / 手动登录 / 测试账号）才为 true；
   * `unknown`（未尝试 / 已登出）、`cached_offline`（离线冷启）、`recovering`（恢复中）、
   * `needs_login` 一律 false —— 此时即**游客态**（离线冷启无法确认当前用户）。
   *
   * 与 `studentId`（isLoggedIn）的区别：`studentId` 可能是 #355 的**离线缓存身份**
   * （冷启动仅从 localStorage 恢复了「上次是谁」，会话尚未确认），只代表「上次是谁」，
   * **不得**作为游戏身份（游乐场展示 / 模块 URL 注入 / Legacy Rank 提交）。
   */
  const sessionVerified = computed(() => onlineSessionState.value === 'online')

  /**
   * 可承认的游戏身份学号：**只有会话已确认时**才是当前 `studentId`，否则恒为空串。
   * 游戏侧（游乐场展示 / 模块注入 / 启动收口）只允许读取本字段，不要直接读 `studentId`
   * （后者可能是缓存身份，不得用于游戏身份）。
   */
  const verifiedStudentId = computed(() => (sessionVerified.value ? studentId.value : ''))

  const hydrate = (snapshot: AuthSessionSnapshot = {}) => {
    studentId.value = normalizeIdentifier(snapshot.studentId)
    userUuid.value = normalizeIdentifier(snapshot.userUuid)
    if (snapshot.role !== undefined && snapshot.role !== null && snapshot.role !== '') {
      role.value = normalizeLoginRole(snapshot.role)
      writeLoginRole(role.value)
    }
    hydrated.value = true
  }

  const establishSession = (snapshot: AuthSessionSnapshot) => {
    const nextStudentId = normalizeIdentifier(snapshot.studentId)
    if (!nextStudentId) throw new Error('studentId is required to establish a session')
    studentId.value = nextStudentId
    userUuid.value = normalizeIdentifier(snapshot.userUuid)
    if (snapshot.role !== undefined && snapshot.role !== null && snapshot.role !== '') {
      role.value = normalizeLoginRole(snapshot.role)
      writeLoginRole(role.value)
    }
    hydrated.value = true
  }

  /**
   * 单独更新身份类型（登录成功 / 会话恢复时由后端 `UserInfo.role` 驱动）。
   * 与 hydrate/establishSession 分开，便于在不改变 studentId 的前提下修正身份
   * —— 例如用户从「教师端入口」登录了学生账号时，以服务端返回为准纠正。
   */
  const setRole = (value: unknown) => {
    role.value = normalizeLoginRole(value)
    writeLoginRole(role.value)
  }

  const clearSession = () => {
    studentId.value = ''
    userUuid.value = ''
    onlineSessionState.value = 'unknown'
    // 登出回到学生端默认形态，避免下次打开以教师身份渲染学生账号
    role.value = 'student'
    clearLoginRole()
    hydrated.value = true
  }

  return {
    studentId,
    userUuid,
    hydrated,
    onlineSessionState,
    isLoggedIn,
    sessionVerified,
    verifiedStudentId,
    role,
    isTeacher,
    hydrate,
    establishSession,
    setRole,
    clearSession
  }
})
