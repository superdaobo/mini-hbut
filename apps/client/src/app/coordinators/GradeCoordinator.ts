/**
 * 成绩 Coordinator（Phase 5：#574）
 *
 * 从 App.vue 迁出的成绩拉取 / 学期分片缓存 / 任课教师缓存合并 /
 * 实时重试调度逻辑。成绩状态以 GradeStore 为生产状态源，
 * 通过 state（storeToRefs 映射）读写，模板变量名保持不变。
 */
import axios from 'axios'
import type { AppRuntime, GradeCoordinator } from '../contracts/runtime'
import { API_BASE, GRADE_CACHE_REFRESH_RETRY_MS } from '../state/constants'
import {
  fetchWithCache,
  getStaleCachedData,
  setCachedData,
  clearCacheByPrefix
} from '../../utils/api.js'
import { showToast } from '../../utils/toast'
import { invokeNative, isTauriRuntime } from '../../platform/native'

type GradePayload = Record<string, any>

export const createGradeCoordinator = (runtime: AppRuntime): GradeCoordinator => {
  const { state } = runtime
  const hasTauri = isTauriRuntime()
  const invoke = <T = Record<string, any>>(command: string, args?: Record<string, unknown>) =>
    invokeNative<T>(command, args)

  const fetchGradesRemote = async (sid: string, { teacherCurrentOnly = false } = {}) => {
    const res = await axios.post<Record<string, any>>(`${API_BASE}/v2/quick_fetch`, {
      student_id: sid,
      teacher_current_only: teacherCurrentOnly
    })
    return res.data
  }

  const normalizeGradeTeacherKey = (value: unknown) => String(value ?? '').trim()

  const gradeTeacherKeys = (grade: Record<string, unknown> = {}) => {
    const keys = [
      normalizeGradeTeacherKey(grade.kcbh),
      normalizeGradeTeacherKey(grade.course_code),
      normalizeGradeTeacherKey(grade.courseCode),
      normalizeGradeTeacherKey(grade.grade_id),
      normalizeGradeTeacherKey(grade.gradeId)
    ].filter(Boolean)
    return [...new Set(keys)]
  }

  const mergeGradeTeacherCache = (
    grades: unknown[] = [],
    cachePayload: unknown = state.gradeTeacherCache.value
  ) => {
    if (!Array.isArray(grades) || !cachePayload || typeof cachePayload !== 'object') {
      return Array.isArray(grades) ? grades : []
    }
    const byKcbh =
      (cachePayload as Record<string, any>).by_kcbh &&
      typeof (cachePayload as Record<string, any>).by_kcbh === 'object'
        ? (cachePayload as Record<string, any>).by_kcbh
        : {}
    if (!Object.keys(byKcbh).length) return grades
    let changed = false
    const merged = grades.map((grade) => {
      if (!grade || typeof grade !== 'object') return grade
      const record = grade as Record<string, unknown>
      const currentTeacher = String(record.course_teacher ?? record.courseTeacher ?? '').trim()
      if (currentTeacher) return grade
      for (const key of gradeTeacherKeys(record)) {
        const teacher = String(byKcbh[key] ?? '').trim()
        if (teacher) {
          changed = true
          return { ...record, course_teacher: teacher }
        }
      }
      return grade
    })
    return changed ? merged : grades
  }

  const refreshGradeTeacherCache = async ({ currentOnly = false } = {}) => {
    const sid = String(state.studentId.value || '').trim()
    if (!sid || !hasTauri) return null
    try {
      const payload = currentOnly
        ? await invoke('sync_grade_teachers_current_semester')
        : await invoke('get_grade_teacher_cache')
      if (payload?.success !== false) {
        state.gradeTeacherCache.value = payload
        state.gradeTeacherCacheSid.value = sid
        if (Array.isArray(state.gradeData.value) && state.gradeData.value.length > 0) {
          state.gradeData.value = mergeGradeTeacherCache(state.gradeData.value, payload)
        }
      }
      return payload
    } catch (error) {
      console.warn('[Grades] 任课教师缓存刷新失败:', error)
      return null
    }
  }

  const scheduleGradeTeacherCacheRefresh = () => {
    if (state.mutable.gradeTeacherRefreshTimer) {
      clearTimeout(state.mutable.gradeTeacherRefreshTimer)
      state.mutable.gradeTeacherRefreshTimer = null
    }
    const delays = [1800, 4200, 8000]
    let index = 0
    const run = () => {
      state.mutable.gradeTeacherRefreshTimer = null
      if (!state.studentId.value || state.currentView.value !== 'grades') return
      void refreshGradeTeacherCache({ currentOnly: false }).finally(() => {
        index += 1
        if (index < delays.length && state.currentView.value === 'grades') {
          state.mutable.gradeTeacherRefreshTimer = window.setTimeout(run, delays[index])
        }
      })
    }
    state.mutable.gradeTeacherRefreshTimer = window.setTimeout(run, delays[index])
  }

  const clearGradeRealtimeRetry = () => {
    if (state.mutable.gradeRealtimeRetryTimer) {
      clearTimeout(state.mutable.gradeRealtimeRetryTimer)
      state.mutable.gradeRealtimeRetryTimer = null
    }
  }

  const scheduleGradeRealtimeRetry = () => {
    clearGradeRealtimeRetry()
    state.mutable.gradeRealtimeRetryTimer = window.setTimeout(() => {
      state.mutable.gradeRealtimeRetryTimer = null
      if (state.currentView.value === 'grades' && state.gradesOffline.value && state.studentId.value) {
        void fetchGradesFromAPI(state.studentId.value, {
          force: true,
          teacherCurrentOnly: true,
          silent: true
        })
      }
    }, GRADE_CACHE_REFRESH_RETRY_MS)
  }

  const resolveGradeSyncTime = (data: GradePayload) => {
    const explicit = String(data?.sync_time || data?.updated_at || data?.timestamp || '').trim()
    if (explicit) return explicit
    if (data?.offline) return state.gradesSyncTime.value || ''
    return new Date().toISOString()
  }

  const applyStaleGradesSnapshot = (sid: string) => {
    const stale = getStaleCachedData<GradePayload>(`grades:${sid}`)
    const data = stale?.data
    if (!data?.success || !Array.isArray(data.data) || data.data.length === 0) {
      return false
    }
    return applyGradesPayload(data)
  }

  const applyGradesPayload = (data: GradePayload) => {
    if (data?.success && data?.data) {
      if (state.gradeTeacherCacheSid.value !== String(state.studentId.value || '').trim()) {
        state.gradeTeacherCache.value = null
      }
      state.gradeData.value = mergeGradeTeacherCache(data.data)
      state.gradesOffline.value = !!data.offline
      state.gradesSyncTime.value = resolveGradeSyncTime(data)
      if (!data.offline) {
        clearGradeRealtimeRetry()
        void refreshGradeTeacherCache({ currentOnly: false })
        if (data.teacher_enrichment_pending) {
          scheduleGradeTeacherCacheRefresh()
        }
      } else if (state.currentView.value === 'grades') {
        scheduleGradeRealtimeRetry()
      }
      return true
    }
    return false
  }

  // 从 API 获取成绩数据
  const fetchGradesFromAPI = async (
    sid: string,
    { force = false, teacherCurrentOnly = false, silent = false } = {}
  ) => {
    if (!sid) return false
    state.lastGradeRefreshUsedOffline.value = false
    clearGradeRealtimeRetry()
    const showedStaleSnapshot = !force ? applyStaleGradesSnapshot(sid) : false
    if (!silent || showedStaleSnapshot) {
      state.isLoading.value = true
    }
    try {
      // 成绩必须以教务完整列表为权威源：始终 forceRemote，避免 SWR/TTL 命中
      // 把已删除成绩（如故障 0 分）从本地缓存复活到 UI（对齐 v1.4.2）。
      const { data } = await fetchWithCache<Record<string, any>>(
        `grades:${sid}`,
        () => fetchGradesRemote(sid, { teacherCurrentOnly }),
        undefined,
        { forceRemote: true, priority: 'foreground' }
      )
      state.lastGradeRefreshUsedOffline.value = !!data?.offline
      if (data?.success && !data.offline) {
        // 整表替换：先清 grades:{sid}* 学期分片，再写主缓存，避免已删除成绩残留分片被云同步并回。
        clearCacheByPrefix(`grades:${sid}`)
        setCachedData(`grades:${sid}`, data)
        if (Array.isArray(data.data)) {
          const bySem: Record<string, unknown[]> = {}
          ;(data.data as Record<string, unknown>[]).forEach((item) => {
            const sem = String(item?.term || item?.xnxq || item?.semester || '').trim()
            if (!sem) return
            if (!Array.isArray(bySem[sem])) bySem[sem] = []
            bySem[sem].push(item)
          })
          Object.entries(bySem).forEach(([sem, list]) => {
            if (!list.length) return
            setCachedData(`grades:${sid}:${sem}`, { success: true, data: list })
          })
        }
      }
      return applyGradesPayload(data)
    } catch (e) {
      console.error('获取成绩失败:', e)
    } finally {
      if (!silent || showedStaleSnapshot) {
        state.isLoading.value = false
      }
    }
    return false
  }

  const loadGradesForCurrentView = async (options: Record<string, unknown> = {}) => {
    const token = ++state.mutable.gradeNavigationToken
    const sid = String(state.studentId.value || '').trim()
    if (!sid || state.currentView.value !== 'grades') return false

    const ok = await fetchGradesFromAPI(sid, options as Record<string, boolean>)
    if (token !== state.mutable.gradeNavigationToken || state.currentView.value !== 'grades') {
      return ok
    }
    if (!ok) {
      showToast('成绩加载失败，请稍后重试', 'error')
    }
    return ok
  }

  const handleRefreshGrades = async () => {
    const ok = await fetchGradesFromAPI(state.studentId.value, {
      force: true,
      teacherCurrentOnly: true
    })
    if (ok && !state.lastGradeRefreshUsedOffline.value) {
      void refreshGradeTeacherCache({ currentOnly: true })
    }
    if (ok && state.lastGradeRefreshUsedOffline.value) {
      showToast('教务系统暂不可用，已显示缓存', 'warning')
    } else if (ok) {
      showToast('成绩已刷新', 'success')
    } else {
      showToast('成绩刷新失败', 'error')
    }
  }

  return {
    loadGradesForCurrentView,
    fetchGradesFromAPI,
    handleRefreshGrades,
    refreshGradeTeacherCache,
    scheduleGradeRealtimeRetry,
    clearGradeRealtimeRetry
  }
}
