/**
 * 课表领域 - 数据加载组合式函数。
 * 原内联于 ScheduleView.vue（课程/学期/快照/离线横幅/管理列表），拆分后行为一致。
 * 注意：此处保留了离线横幅契约字符串（silentCachePaint/forceOfflineBanner 等），
 * 由 src/utils/schedule_offline_banner_contract.spec.ts 守护。
 */
import { computed, ref, watch } from 'vue'
import axios from 'axios'
import { fetchWithCache, DEFAULT_SWR_OPTIONS, EXTRA_LONG_TTL } from '../../../utils/api.js'
import { normalizeSemesterList, resolveCurrentSemester } from '../../../utils/semester.js'
import {
  getCachedScheduleSnapshot,
  readScheduleRenderSnapshot,
  writeScheduleRenderSnapshot,
  writeScheduleLock
} from '../../../utils/schedule_prefetch.js'
import { afterScheduleRefresh } from '../../../utils/widget_bridge'
import { hasBootMetric, markBootMetric } from '../../../utils/boot_metrics.js'
import { pushDebugLog } from '../../../utils/debug_logger'
import {
  buildEffectiveSchedule,
  buildOfficialCourseIdentityKey,
  listRemovedOfficialCourses,
  removeOfficialCourseFromSchedule,
  restoreOfficialCourseToSchedule
} from '../../../utils/schedule_visibility'
import { normalizeCustomCourse } from '../utils/course'
import { processScheduleData } from '../utils/layout'
import { deriveSemesterByDate, readStoredSemester, resolveDisplayStudentId } from '../utils/semester'
import type { ScheduleSemester } from './useScheduleSemester'

export interface ScheduleDataOptions {
  semester: ScheduleSemester
}

/** 合并教务课程与自定义课程，预处理后写入 scheduleData */
export const mergeScheduleSources = (state: {
  remoteScheduleData: { value: any[] }
  customScheduleData: { value: any[] }
  scheduleData: { value: any[] }
}, visibility: { studentId?: string; semester?: string } = {}) => {
  const merged = buildEffectiveSchedule(
    visibility.studentId || '',
    visibility.semester || '',
    state.remoteScheduleData.value,
    state.customScheduleData.value
  )
  state.scheduleData.value = processScheduleData(merged)
}

export const useScheduleData = (props: any, emit: any, options: ScheduleDataOptions) => {
  const { semester } = options

  const loading = ref(false)
  const scheduleData = ref<any[]>([])
  const remoteScheduleData = ref<any[]>([])
  const customScheduleData = ref<any[]>([])
  const errorMsg = ref('')
  const offline = ref(false)
  const offlineHint = ref('')
  const syncTime = ref('')
  const initialFetchDone = ref(false)
  const semesterOptions = ref<any[]>([])
  const semesterLoading = ref(false)
  const semesterError = ref('')
  const allCustomCourses = ref<any[]>([])
  const loadingManageCourses = ref(false)
  const manageCoursesError = ref('')
  const manageExpandedSemesters = ref<Record<string, boolean>>({})
  const removedOfficialCourses = ref<any[]>([])

  const API_BASE = import.meta.env.VITE_API_BASE || '/api'

  /** 学期键排序：当前学期置顶，其余按中文数字降序 */
  const sortSemesterKeys = (a: string, b: string) => {
    const currentSemester = String(semester.semester.value || semester.semesterDraft.value || '').trim()
    if (a === currentSemester && b !== currentSemester) return -1
    if (b === currentSemester && a !== currentSemester) return 1
    return String(b).localeCompare(String(a), 'zh-CN', { numeric: true })
  }

  const getFallbackSemester = () => String(semester.semester.value || semester.semesterDraft.value || '').trim()

  const mergeCurrentScheduleSources = () => mergeScheduleSources(
    { remoteScheduleData, customScheduleData, scheduleData },
    {
      studentId: String(props.studentId || '').trim(),
      semester: getFallbackSemester()
    }
  )

  const refreshRemovedOfficialCourses = (_targetSemester = '') => {
    const sid = String(props.studentId || '').trim()
    // 管理页与自定义课程一样跨学期展示；真正的渲染过滤由 buildEffectiveSchedule
    // 按当前 semester 严格匹配，因此这里读取全部记录不会造成跨学期误隐藏。
    removedOfficialCourses.value = sid ? listRemovedOfficialCourses(sid) : []
    return removedOfficialCourses.value
  }

  const removeOfficialCourse = (course: any) => {
    const sid = String(props.studentId || '').trim()
    const sem = String(course?.semester || getFallbackSemester()).trim()
    const record = removeOfficialCourseFromSchedule(sid, sem, course, remoteScheduleData.value)
    if (!record) return false
    refreshRemovedOfficialCourses(sem)
    mergeCurrentScheduleSources()
    persistScheduleRenderSnapshot('official-course-remove')
    return true
  }

  const restoreOfficialCourse = (record: any) => {
    const sid = String(props.studentId || '').trim()
    const sem = String(record?.representative?.semester || record?.semester || getFallbackSemester()).trim()
    if (!restoreOfficialCourseToSchedule(sid, sem, record)) return false
    refreshRemovedOfficialCourses(sem)
    mergeCurrentScheduleSources()
    persistScheduleRenderSnapshot('official-course-restore')
    return true
  }

  /** 加载当前学期的自定义课程 */
  const loadCustomCourses = async (targetSemester = '') => {
    const sid = String(props.studentId || '').trim()
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || '').trim()
    if (!sid || !sem) {
      customScheduleData.value = []
      mergeCurrentScheduleSources()
      return false
    }

    try {
      const res = await axios.post(`${API_BASE}/v2/schedule/custom/list`, {
        student_id: sid,
        semester: sem
      })
      if (!res.data?.success) {
        throw new Error(res.data?.error || '加载自定义课程失败')
      }
      const list = Array.isArray(res.data?.data) ? res.data.data : []
      customScheduleData.value = list
        .map((item: any) => normalizeCustomCourse(item, sem))
        .filter(Boolean)
        .filter((course: any) => course.name && course.weekday >= 1 && course.weekday <= 7 && course.period >= 1 && course.period <= 11)
      mergeCurrentScheduleSources()
      persistScheduleRenderSnapshot('custom-load')
      return true
    } catch (e) {
      console.warn('加载自定义课程失败', e)
      customScheduleData.value = []
      mergeCurrentScheduleSources()
      return false
    }
  }

  /** 管理页：同一学期内分类展示教务课程 / 已移除课程 / 自定义课程。 */
  const managedCourseGroups = computed(() => {
    const groups = new Map<string, {
      officialMap: Map<string, any>
      removedMap: Map<string, any>
      customCourses: any[]
    }>()
    const ensureGroup = (semesterKey: string) => {
      const key = String(semesterKey || '未分配学期').trim() || '未分配学期'
      if (!groups.has(key)) {
        groups.set(key, {
          officialMap: new Map<string, any>(),
          removedMap: new Map<string, any>(),
          customCourses: []
        })
      }
      return groups.get(key)!
    }

    const currentSemester = getFallbackSemester()
    for (const course of remoteScheduleData.value || []) {
      const key = buildOfficialCourseIdentityKey(course)
      if (!key) continue
      const group = ensureGroup(String(course?.semester || currentSemester))
      if (!group.officialMap.has(key)) {
        group.officialMap.set(key, {
          ...course,
          semester: String(course?.semester || currentSemester),
          course_identity_key: key,
          is_custom: false
        })
      }
    }

    for (const record of removedOfficialCourses.value || []) {
      const representative = record?.representative
      const key = String(record?.key || buildOfficialCourseIdentityKey(representative)).trim()
      if (!key || !representative) continue
      const group = ensureGroup(String(representative.semester || currentSemester))
      group.officialMap.delete(key)
      group.removedMap.set(key, {
        ...representative,
        semester: String(representative.semester || currentSemester),
        course_identity_key: key,
        visibility_record: record,
        is_removed_official: true,
        is_custom: false
      })
    }

    for (const rawCourse of allCustomCourses.value || []) {
      const course = normalizeCustomCourse(rawCourse, currentSemester)
      if (!course?.id) continue
      ensureGroup(String(course.semester || '未分配学期')).customCourses.push(course)
    }

    const sortCourses = (courses: any[]) => courses.sort((a: any, b: any) => {
      if (a.weekday !== b.weekday) return a.weekday - b.weekday
      if (a.period !== b.period) return a.period - b.period
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    })

    return Array.from(groups.entries())
      .sort((a, b) => sortSemesterKeys(a[0], b[0]))
      .map(([semesterKey, group]) => {
        const officialCourses = sortCourses([...group.officialMap.values()])
        const removedCourses = sortCourses([...group.removedMap.values()])
        const customCourses = sortCourses(group.customCourses)
        return {
          semester: semesterKey,
          officialCourses,
          removedCourses,
          customCourses,
          // 兼容旧组件/测试中的 courses 字段；语义仍为自定义课程。
          courses: customCourses,
          totalCount: officialCourses.length + removedCourses.length + customCourses.length
        }
      })
  })

  const syncManageExpandedSemesters = () => {
    const next: Record<string, boolean> = {}
    const currentSemester = getFallbackSemester()
    for (const group of managedCourseGroups.value) {
      next[group.semester] = manageExpandedSemesters.value[group.semester] ?? (group.semester === currentSemester)
    }
    manageExpandedSemesters.value = next
  }

  /** 加载全部学期的自定义课程（管理页） */
  const loadAllCustomCourses = async () => {
    const sid = String(props.studentId || '').trim()
    if (!sid) {
      allCustomCourses.value = []
      manageCoursesError.value = '请先登录后再管理课程'
      return false
    }
    loadingManageCourses.value = true
    manageCoursesError.value = ''
    try {
      const res = await axios.post(`${API_BASE}/v2/schedule/custom/list_all`, {
        student_id: sid
      })
      if (!res.data?.success) {
        throw new Error(res.data?.error || '加载课程列表失败')
      }
      const list = Array.isArray(res.data?.data) ? res.data.data : []
      allCustomCourses.value = list
        .map((item: any) => normalizeCustomCourse(item, getFallbackSemester()))
        .filter(Boolean)
        .filter((course: any) => course.name && course.weekday >= 1 && course.weekday <= 7 && course.period >= 1 && course.period <= 11)
      refreshRemovedOfficialCourses()
      syncManageExpandedSemesters()
      return true
    } catch (e) {
      console.warn('加载全部自定义课程失败', e)
      allCustomCourses.value = []
      manageCoursesError.value = String((e as any)?.response?.data?.error || (e as any)?.message || '加载课程列表失败')
      return false
    } finally {
      loadingManageCourses.value = false
    }
  }

  /** 构建渲染快照载荷 */
  const buildScheduleRenderSnapshotPayload = () => {
    const sid = resolveDisplayStudentId(props.studentId)
    const sem = getFallbackSemester()
    if (!sid || !sem) return null
    return {
      student_id: sid,
      semester: sem,
      meta: {
        semester: sem,
        start_date: String(semester.startDateStr.value || '').trim(),
        current_week: Number(semester.currentWeek.value || 1),
        total_weeks: Number(semester.totalWeeks.value || 25),
        vacation_notice: String(semester.vacationNotice.value || '').trim()
      },
      selected_week: Number(semester.selectedWeek.value || semester.currentWeek.value || 1),
      sync_time: String(syncTime.value || '').trim(),
      offline: !!offline.value,
      remote_schedule_data: Array.isArray(remoteScheduleData.value) ? remoteScheduleData.value : [],
      custom_schedule_data: Array.isArray(customScheduleData.value) ? customScheduleData.value : [],
      merged_schedule_data: Array.isArray(scheduleData.value) ? scheduleData.value : [],
      updated_at: new Date().toISOString()
    }
  }

  const persistScheduleRenderSnapshot = (reason = 'unknown') => {
    const payload = buildScheduleRenderSnapshotPayload()
    if (!payload) return false
    const courseCount = Array.isArray(payload.merged_schedule_data) ? payload.merged_schedule_data.length : 0
    const hasRenderableData =
      courseCount > 0 ||
      (Array.isArray(payload.remote_schedule_data) && payload.remote_schedule_data.length > 0) ||
      (Array.isArray(payload.custom_schedule_data) && payload.custom_schedule_data.length > 0)
    if (!hasRenderableData) return false
    const saved = writeScheduleRenderSnapshot(payload.student_id, payload) as {
      semester?: string
    } | null
    if (!saved) return false
    pushDebugLog(
      'Schedule',
      `课表首屏快照已写入 reason=${reason} semester=${saved.semester} courses=${courseCount}`,
      'debug'
    )
    return true
  }

  /** 应用渲染快照（秒开路径） */
  const applyScheduleRenderSnapshot = (snapshot: any, snapshotOptions: any = {}) => {
    const saved = snapshot && typeof snapshot === 'object' ? snapshot : null
    if (!saved) return false
    const resolvedSemester = String(saved.semester || saved.meta?.semester || '').trim()
    if (!resolvedSemester) return false

    semester.semester.value = resolvedSemester
    semester.semesterDraft.value = resolvedSemester
    remoteScheduleData.value = Array.isArray(saved.remote_schedule_data) ? saved.remote_schedule_data : []
    customScheduleData.value = Array.isArray(saved.custom_schedule_data) ? saved.custom_schedule_data : []
    refreshRemovedOfficialCourses(resolvedSemester)
    // merged_schedule_data 是渲染缓存，可能早于用户最近一次“移除课程”操作；
    // 始终从原始教务 + 自定义课程重算有效课表，避免冷启动闪回已移除课程。
    mergeCurrentScheduleSources()

    semester.applyMeta(saved.meta, resolvedSemester)
    const nextWeek = Number(saved.selected_week || semester.currentWeek.value || 1)
    const safeWeek = Math.min(Math.max(nextWeek, 1), Math.max(Number(semester.totalWeeks.value || 1), 1))
    semester.selectedWeek.value = safeWeek
    syncTime.value = String(saved.sync_time || '').trim()
    // 秒开快照只是本地渲染缓存，不代表会话离线；默认不展示「离线/登录恢复」横幅。
    const markOffline = snapshotOptions?.markOffline === true
    offline.value = markOffline
    offlineHint.value = markOffline
      ? String(
          snapshotOptions?.offlineHint ||
            '当前为缓存课表，登录恢复后自动刷新。'
        ).trim()
      : ''
    errorMsg.value = scheduleData.value.length ? '' : '暂无可用课表'
    initialFetchDone.value = true

    if (snapshotOptions?.markBoot !== false) {
      markBootMetric('schedule_snapshot_applied', {
        semester: resolvedSemester,
        courses: scheduleData.value.length,
        updated_at: saved.updated_at || ''
      })
      requestAnimationFrame(() => {
        markBootMetric('schedule_first_paint', {
          semester: resolvedSemester,
          courses: scheduleData.value.length
        })
      })
    }
    return true
  }

  /** 应用接口载荷：合并数据源 + 应用学期元信息 + 离线横幅判定 */
  const applySchedulePayload = (payload: any, requestedSemester = '', payloadOptions: any = {}) => {
    if (!payload?.success) return false
    const rawData = Array.isArray(payload?.data) ? payload.data : []
    // #372：SWR/stale 缓存会经 withOfflineMeta 强制 offline=true，不等于教务不可用。
    // 已登录：成功 payload 默认不亮横幅；仅显式 forceOfflineBanner（真实失败回退）才展示。
    const silentCachePaint = payloadOptions?.silentCachePaint === true
    const forceOfflineBanner = payloadOptions?.forceOfflineBanner === true
    const loggedIn = !!String(props.studentId || '').trim()
    if (forceOfflineBanner || (payload.offline && !silentCachePaint && !loggedIn)) {
      offline.value = true
      offlineHint.value = String(
        payloadOptions?.offlineHint ||
          (loggedIn
            ? '当前显示为缓存课表，教务暂不可用。'
            : '当前显示为离线数据，登录恢复后自动刷新。')
      ).trim()
    } else {
      offline.value = false
      offlineHint.value = ''
    }
    syncTime.value = payload.sync_time || ''
    remoteScheduleData.value = processScheduleData(rawData)
    const resolvedSemester = String(payload?.meta?.semester || requestedSemester || getFallbackSemester()).trim()
    refreshRemovedOfficialCourses(resolvedSemester)
    mergeCurrentScheduleSources()
    semester.applyMeta(payload.meta, requestedSemester)
    errorMsg.value = rawData.length === 0 ? '暂无可用课表' : ''
    return true
  }

  /** 应用缓存快照（秒开；有学号时静默） */
  const applyCachedScheduleImmediately = (targetSemester = '', cacheOptions: any = {}) => {
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || '').trim()
    const sid = resolveDisplayStudentId(props.studentId)
    if (!sid || !sem) return false
    const snapshot = getCachedScheduleSnapshot(sid, sem) as {
      data?: any
      timestamp?: string | number
    } | null
    if (!snapshot?.data?.success) return false
    const silent =
      cacheOptions?.silentCachePaint !== false && String(props.studentId || sid || '').trim()
    const applied = applySchedulePayload(snapshot.data, sem, {
      silentCachePaint: !!silent
    })
    if (applied && silent) {
      offline.value = false
      offlineHint.value = ''
    }
    if (applied && !syncTime.value && snapshot.timestamp) {
      syncTime.value = new Date(snapshot.timestamp).toISOString()
    }
    return applied
  }

  /** 后台真源刷新：只在明确失败时亮离线条，避免 SWR offline 标记误导 */
  let onlineRevalidateToken = 0
  const revalidateScheduleOnline = async (targetSemester = '') => {
    const sid = String(props.studentId || '').trim()
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || '').trim()
    if (!sid) return false
    const token = ++onlineRevalidateToken
    const cacheKey = sem ? `schedule:${sid}:${sem}` : `schedule:${sid}`
    try {
      const { data } = await fetchWithCache(
        cacheKey,
        async () => {
          const res = await axios.post(`${API_BASE}/v2/schedule/query`, {
            student_id: sid,
            semester: sem || undefined
          })
          return res.data
        },
        undefined,
        { forceRemote: true, priority: 'background', staleWhileRevalidate: false }
      )
      if (token !== onlineRevalidateToken) return false
      if (data?.success && !data?.offline) {
        applySchedulePayload(data, sem, { silentCachePaint: false })
        offline.value = false
        offlineHint.value = ''
        persistScheduleRenderSnapshot('online-revalidate')
        return true
      }
      if (data?.need_login && (remoteScheduleData.value.length || customScheduleData.value.length)) {
        offline.value = true
        offlineHint.value = '当前为缓存课表，登录恢复后自动刷新。'
      }
      return false
    } catch {
      if (token !== onlineRevalidateToken) return false
      // 保持静默：有缓存就不恐吓；用户可手动刷新
      return false
    }
  }

  const applyStoredScheduleRenderSnapshot = (targetSemester = '', snapshotOptions: any = {}) => {
    const sid = resolveDisplayStudentId(props.studentId)
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || '').trim()
    if (!sid) return false
    const snapshot = readScheduleRenderSnapshot(sid, sem || '')
    if (!snapshot) return false
    return applyScheduleRenderSnapshot(snapshot, snapshotOptions)
  }

  /** 启动秒开快照（仅一次） */
  const initialRenderSnapshotApplied = applyStoredScheduleRenderSnapshot('', {
    markBoot: true
  })

  /** 拉取课表（主路径） */
  const fetchSchedule = async (targetSemester = '', fetchOptions: any = {}) => {
    loading.value = true
    semesterError.value = ''
    const persistLock = fetchOptions?.persistLock === true
    const lockReason = String(fetchOptions?.lockReason || 'schedule-fetch').trim() || 'schedule-fetch'
    const requestedSemester = String(targetSemester || semester.semester.value || semester.semesterDraft.value || '').trim()
    const previousSemester = String(semester.semester.value || '').trim()
    errorMsg.value = ''
    // 已有登录身份：在线刷新期间不展示「登录恢复」恐吓条，结果以接口为准
    if (String(props.studentId || '').trim() && fetchOptions?.preserveOfflineBanner !== true) {
      offline.value = false
      offlineHint.value = ''
    }
    try {
      // #633：切换学期时必须连远程课表一起清空——否则新学期请求失败/无数据时，
      // 旧学期的 remoteScheduleData 会被当成"本学期缓存"展示（误报离线横幅 + 错课表）。
      if (requestedSemester && requestedSemester !== previousSemester) {
        customScheduleData.value = []
        remoteScheduleData.value = []
        mergeCurrentScheduleSources()
      }
      if (requestedSemester) {
        semester.semester.value = requestedSemester
      }
      if (!props.studentId) {
        const fallbackSemester = String(requestedSemester || semester.semester.value || semester.semesterDraft.value || readStoredSemester() || deriveSemesterByDate()).trim()
        const hasRenderSnapshot = fallbackSemester
          ? applyStoredScheduleRenderSnapshot(fallbackSemester, { markBoot: false })
          : false
        const hasInstantCache = hasRenderSnapshot || (fallbackSemester ? applyCachedScheduleImmediately(fallbackSemester) : false)
        if (hasInstantCache) {
          initialFetchDone.value = true
          errorMsg.value = ''
        } else if (localStorage.getItem('hbu_manual_logout') === 'true') {
          scheduleData.value = []
          remoteScheduleData.value = []
          customScheduleData.value = []
          offline.value = false
          offlineHint.value = ''
          initialFetchDone.value = true
          errorMsg.value = '请先登录后查看课表'
        } else {
          // 启动阶段可能还在恢复身份，此时不显示“请登录”闪屏，等待身份恢复后自动刷新。
          errorMsg.value = ''
        }
        return false
      }
      const cacheKey = requestedSemester
        ? `schedule:${props.studentId}:${requestedSemester}`
        : `schedule:${props.studentId}`
      const { data, fromCache, stale } = await fetchWithCache(cacheKey, async () => {
        const res = await axios.post(`${API_BASE}/v2/schedule/query`, {
          student_id: props.studentId,
          semester: requestedSemester || undefined
        })
        return res.data
      }, undefined, DEFAULT_SWR_OPTIONS)

      if (data?.success) {
        // 登录态 + 缓存/SWR 命中（含 offline 标记）：静默秒开，不误报「教务暂不可用」
        const treatAsSilentCache =
          !!String(props.studentId || '').trim() &&
          (!!fromCache || !!data?.offline || !!stale)
        applySchedulePayload(data, requestedSemester, {
          silentCachePaint: treatAsSilentCache
        })
        // 若本次是陈旧/离线标记缓存，后台再拉一次真源（不阻塞、失败路径才亮条）
        if (treatAsSilentCache && data?.offline) {
          void revalidateScheduleOnline(requestedSemester || semester.semester.value)
        }
        await loadCustomCourses(requestedSemester || semester.semester.value)
        if (!remoteScheduleData.value.length && customScheduleData.value.length > 0) {
          errorMsg.value = ''
        }
        persistScheduleRenderSnapshot('fetch-success')
        // Widget 快照写入（异步，不阻塞 UI）
        if (props.studentId) {
          afterScheduleRefresh(props.studentId, data, { selectedWeek: semester.selectedWeek.value || semester.currentWeek.value || 1 }).catch(() => {})
        }
        if (!hasBootMetric('schedule_first_paint')) {
          requestAnimationFrame(() => {
            markBootMetric('schedule_first_paint', {
              semester: String(requestedSemester || semester.semester.value || '').trim(),
              courses: scheduleData.value.length,
              source: 'remote-refresh'
            })
          })
        }
        if (requestedSemester && persistLock) {
          writeScheduleLock(props.studentId, requestedSemester, lockReason)
        }
        return true
      } else {
        if (data?.need_login) {
          const method = String(localStorage.getItem('hbu_login_method') || '').trim()
          const isTemp = localStorage.getItem('hbu_login_temp') === '1' || method.endsWith('_temp')
          if (isTemp) {
            emit('logout')
            return false
          }
          if (remoteScheduleData.value.length || customScheduleData.value.length) {
            offline.value = true
            offlineHint.value = '当前为缓存课表，登录恢复后自动刷新。'
            errorMsg.value = ''
            return false
          }
          const hasRenderSnapshot = requestedSemester
            ? applyStoredScheduleRenderSnapshot(requestedSemester, { markBoot: false })
            : false
          const hasCached = hasRenderSnapshot || (requestedSemester ? applyCachedScheduleImmediately(requestedSemester) : false)
          if (hasCached) {
            offline.value = true
            offlineHint.value = '当前为缓存课表，登录恢复后自动刷新。'
            errorMsg.value = ''
            return false
          }
          errorMsg.value = data?.error || '会话已过期，请重新登录'
          return false
        }
        if (!(remoteScheduleData.value.length || customScheduleData.value.length)) {
          remoteScheduleData.value = []
          mergeCurrentScheduleSources()
          offline.value = false
          semester.vacationNotice.value = ''
          semester.startDateStr.value = ''
          semester.currentWeek.value = 1
          semester.selectedWeek.value = 1
          semester.totalWeeks.value = 25
        } else {
          offline.value = true
          offlineHint.value = '当前为缓存课表，登录恢复后自动刷新。'
        }
        await loadCustomCourses(requestedSemester || semester.semester.value)
        const message = String(data?.error || '获取课表失败')
        errorMsg.value = (remoteScheduleData.value.length || customScheduleData.value.length)
          ? ''
          : (/无课表|暂无/.test(message) ? '暂无可用课表' : message)
        if (customScheduleData.value.length > 0) {
          errorMsg.value = ''
        }
        return false
      }
    } catch (e) {
      console.error('获取课表异常', e)
      if (!(remoteScheduleData.value.length || customScheduleData.value.length)) {
        remoteScheduleData.value = []
        mergeCurrentScheduleSources()
        offline.value = false
        semester.vacationNotice.value = ''
        semester.startDateStr.value = ''
        semester.currentWeek.value = 1
        semester.selectedWeek.value = 1
        semester.totalWeeks.value = 25
      } else {
        offline.value = true
        offlineHint.value = '当前为缓存课表，连接恢复后自动刷新。'
      }
      await loadCustomCourses(requestedSemester || semester.semester.value)
      const message = String((e as any)?.message || '获取课表失败')
      errorMsg.value = (remoteScheduleData.value.length || customScheduleData.value.length)
        ? ''
        : (/无课表|暂无/.test(message) ? '暂无可用课表' : message)
      if (customScheduleData.value.length > 0) {
        errorMsg.value = ''
      }
      return false
    } finally {
      loading.value = false
      initialFetchDone.value = true
      if (!hasBootMetric('schedule_snapshot_applied')) {
        markBootMetric('schedule_snapshot_applied', {
          semester: String(requestedSemester || semester.semester.value || '').trim(),
          courses: scheduleData.value.length,
          applied: false,
          reason: 'snapshot-missing'
        })
      }
      markBootMetric('schedule_remote_refresh_finished', {
        semester: String(requestedSemester || semester.semester.value || '').trim(),
        courses: scheduleData.value.length,
        offline: !!offline.value
      })
    }
  }

  /** 拉取学期列表 */
  const fetchSemesterOptions = async () => {
    semesterLoading.value = true
    semesterError.value = ''
    try {
      const { data } = await fetchWithCache('semesters', async () => {
        const res = await axios.get(`${API_BASE}/v2/semesters`)
        return res.data
      }, EXTRA_LONG_TTL, DEFAULT_SWR_OPTIONS)
      if (!data?.success) {
        throw new Error(data?.error || '获取学期列表失败')
      }
      const list = normalizeSemesterList(data?.semesters || [])
      semesterOptions.value = list
      const resolved = resolveCurrentSemester(list, semester.semester.value || data?.current)
      if (resolved) {
        semester.semesterDraft.value = resolved
        if (!semester.semester.value) semester.semester.value = resolved
      }
    } catch (e) {
      semesterError.value = (e as any)?.message || '获取学期列表失败'
    } finally {
      semesterLoading.value = false
    }
  }

  /** 应用学期查询（重置周次元信息后拉取） */
  const applySemesterQuery = async () => {
    const selected = String(semester.semesterDraft.value || '').trim()
    if (!selected) {
      semesterError.value = '请选择学期'
      return
    }
    semester.currentWeek.value = 1
    semester.selectedWeek.value = 1
    semester.totalWeeks.value = 25
    semester.startDateStr.value = ''
    semester.vacationNotice.value = ''
    await fetchSchedule(selected, { persistLock: true, lockReason: 'manual-select' })
  }

  const onSemesterChange = async () => {
    const selected = String(semester.semesterDraft.value || '').trim()
    if (!selected || selected === semester.semester.value) return
    await applySemesterQuery()
  }

  /** 会话登出：清空课表数据 */
  const handleSessionLogout = () => {
    scheduleData.value = []
    remoteScheduleData.value = []
    customScheduleData.value = []
    offline.value = false
    offlineHint.value = ''
    errorMsg.value = '请先登录后查看课表'
    initialFetchDone.value = true
  }

  /** 会话恢复在线：自动刷新课表 */
  const handleSessionOnline = () => {
    const sid = String(props.studentId || '').trim()
    if (!sid) return
    offline.value = false
    offlineHint.value = ''
    const targetSemester = String(semester.semester.value || semester.semesterDraft.value || readStoredSemester() || deriveSemesterByDate()).trim()
    void fetchSchedule(targetSemester)
  }

  // 周次切换后持久化快照（秒开缓存）
  watch(semester.selectedWeek, (next, prev) => {
    if (next === prev) return
    if (!initialFetchDone.value) return
    persistScheduleRenderSnapshot('selected-week')
  })

  return {
    loading,
    scheduleData,
    remoteScheduleData,
    customScheduleData,
    errorMsg,
    offline,
    offlineHint,
    syncTime,
    initialFetchDone,
    semesterOptions,
    semesterLoading,
    semesterError,
    allCustomCourses,
    removedOfficialCourses,
    loadingManageCourses,
    manageCoursesError,
    manageExpandedSemesters,
    managedCourseGroups,
    loadCustomCourses,
    loadAllCustomCourses,
    refreshRemovedOfficialCourses,
    removeOfficialCourse,
    restoreOfficialCourse,
    syncManageExpandedSemesters,
    persistScheduleRenderSnapshot,
    applyScheduleRenderSnapshot,
    applySchedulePayload,
    applyCachedScheduleImmediately,
    revalidateScheduleOnline,
    applyStoredScheduleRenderSnapshot,
    initialRenderSnapshotApplied,
    fetchSchedule,
    fetchSemesterOptions,
    applySemesterQuery,
    onSemesterChange,
    handleSessionLogout,
    handleSessionOnline,
    mergeScheduleSources: mergeCurrentScheduleSources
  }
}

export type ScheduleData = ReturnType<typeof useScheduleData>
