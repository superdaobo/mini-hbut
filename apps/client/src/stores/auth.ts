import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface AuthSessionSnapshot {
  studentId?: string | null
  userUuid?: string | null
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

  const hydrate = (snapshot: AuthSessionSnapshot = {}) => {
    studentId.value = normalizeIdentifier(snapshot.studentId)
    userUuid.value = normalizeIdentifier(snapshot.userUuid)
    hydrated.value = true
  }

  const establishSession = (snapshot: AuthSessionSnapshot) => {
    const nextStudentId = normalizeIdentifier(snapshot.studentId)
    if (!nextStudentId) throw new Error('studentId is required to establish a session')
    studentId.value = nextStudentId
    userUuid.value = normalizeIdentifier(snapshot.userUuid)
    hydrated.value = true
  }

  const clearSession = () => {
    studentId.value = ''
    userUuid.value = ''
    onlineSessionState.value = 'unknown'
    hydrated.value = true
  }

  return {
    studentId,
    userUuid,
    hydrated,
    onlineSessionState,
    isLoggedIn,
    hydrate,
    establishSession,
    clearSession
  }
})
