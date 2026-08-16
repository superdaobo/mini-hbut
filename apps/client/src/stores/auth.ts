import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface AuthSessionSnapshot {
  studentId?: string | null
  userUuid?: string | null
}

export const normalizeIdentifier = (value: unknown): string => String(value ?? '').trim()

export const useAuthStore = defineStore('auth', () => {
  const studentId = ref('')
  const userUuid = ref('')
  const hydrated = ref(false)
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
    hydrated.value = true
  }

  return { studentId, userUuid, hydrated, isLoggedIn, hydrate, establishSession, clearSession }
})
