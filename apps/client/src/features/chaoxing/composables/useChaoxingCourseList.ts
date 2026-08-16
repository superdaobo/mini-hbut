// 学习通课程列表领域（课程/学期筛选/搜索/分批渲染/会话状态）
// 描述：课程列表加载、学期 Tab、搜索过滤、分批渲染与滚动自动扩展、会话状态徽章。
import { computed, nextTick, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { pushDebugLog } from '../../../utils/debug_logger'
import { normalizeCourse } from '../utils/normalize'
import {
  COURSE_LOAD_MORE_STEP,
  INITIAL_COURSE_BATCH,
  IOS_PROGRESSIVE_FIRST_BATCH,
  MAX_COURSE_LIST_SIZE,
  type ChaoxingHubCore
} from './useChaoxingHubCore'
import type { ChaoxingCourse } from '../types'

export interface ChaoxingCourseList {
  courses: Ref<ChaoxingCourse[]>
  semesterTabs: Ref<string[]>
  activeSemester: Ref<string>
  searchQuery: Ref<string>
  statusMeta: Ref<Record<string, unknown>>
  filteredCourses: ComputedRef<ChaoxingCourse[]>
  visibleCourses: ComputedRef<ChaoxingCourse[]>
  hasMoreCourses: ComputedRef<boolean>
  totalPending: ComputedRef<number>
  badgeType: ComputedRef<'success' | 'warning' | 'muted'>
  badgeText: ComputedRef<string>
  courseRenderLimit: Ref<number>
  loadMoreSentinelRef: Ref<HTMLElement | null>
  loadList: (options?: { silent?: boolean; force?: boolean }) => Promise<void>
  loadMoreCourses: () => void
  resetCourseRenderLimit: () => void
  onIosMemoryWarning: () => void
}

export const useChaoxingCourseList = (core: ChaoxingHubCore): ChaoxingCourseList => {
  const courses = ref<ChaoxingCourse[]>([])
  const semesterTabs = ref<string[]>(['全部'])
  const activeSemester = ref('全部')
  const searchQuery = ref('')
  const statusMeta = ref<Record<string, unknown>>({})
  const courseRenderLimit = ref(core.isIOSLikeDevice ? IOS_PROGRESSIVE_FIRST_BATCH : INITIAL_COURSE_BATCH)

  const filteredCourses = computed(() => {
    let list = courses.value
    if (activeSemester.value && activeSemester.value !== '全部') {
      list = list.filter((c) => c.semester === activeSemester.value)
    }
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (c) => c.title.toLowerCase().includes(q) || c.teacher.toLowerCase().includes(q)
    )
  })

  const visibleCourses = computed(() => {
    // 所有平台分批渲染：先渲染 courseRenderLimit 门，滚动到底自动扩展
    return filteredCourses.value.slice(0, courseRenderLimit.value)
  })

  const hasMoreCourses = computed(
    () => visibleCourses.value.length < filteredCourses.value.length
  )

  const totalPending = computed(() =>
    courses.value.reduce((s, c) => s + (c.pendingCount || 0), 0)
  )

  const badgeType = computed<'success' | 'warning' | 'muted'>(() => {
    if (statusMeta.value?.connected === true) return 'success'
    if (courses.value.length) return 'warning'
    return 'muted'
  })
  const badgeText = computed(() => {
    if (statusMeta.value?.connected === true) return '会话可用'
    if (courses.value.length) return '缓存/部分'
    return '未连接'
  })

  const resetCourseRenderLimit = () => {
    if (core.mutable.progressiveRenderRaf) {
      cancelAnimationFrame(core.mutable.progressiveRenderRaf)
      core.mutable.progressiveRenderRaf = 0
    }
    courseRenderLimit.value = core.isIOSLikeDevice
      ? IOS_PROGRESSIVE_FIRST_BATCH
      : INITIAL_COURSE_BATCH
  }

  /** iOS 渐进渲染：首帧小批插入，rAF 逐批递增，平滑「列表加载完成瞬间」的渲染峰值 */
  const scheduleProgressiveCourseRender = () => {
    if (core.mutable.progressiveRenderRaf) cancelAnimationFrame(core.mutable.progressiveRenderRaf)
    const step = () => {
      if (core.mutable.disposed) return
      if (courseRenderLimit.value < INITIAL_COURSE_BATCH) {
        courseRenderLimit.value = Math.min(
          INITIAL_COURSE_BATCH,
          courseRenderLimit.value + 3
        )
        core.mutable.progressiveRenderRaf = requestAnimationFrame(step)
      } else {
        core.mutable.progressiveRenderRaf = 0
      }
    }
    core.mutable.progressiveRenderRaf = requestAnimationFrame(step)
  }

  /** 滚动自动扩展：防抖（300ms）避免快速滚到底时一次性加载全部 */
  const loadMoreCourses = () => {
    if (!hasMoreCourses.value) return
    const now = Date.now()
    if (now - core.mutable.lastCourseAutoLoadAt < 300) return
    core.mutable.lastCourseAutoLoadAt = now
    courseRenderLimit.value += COURSE_LOAD_MORE_STEP
  }

  // 滚动哨兵：列表末尾元素进入视口 → 自动加载下一批（IntersectionObserver）
  const loadMoreSentinelRef = ref<HTMLElement | null>(null)

  const ensureLoadMoreObserver = () => {
    if (core.mutable.loadMoreObserver || typeof IntersectionObserver === 'undefined') return
    core.mutable.loadMoreObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) loadMoreCourses()
        }
      },
      { rootMargin: '240px 0px' }
    )
  }

  watch(hasMoreCourses, (hasMore) => {
    if (!hasMore) return
    ensureLoadMoreObserver()
    nextTick(() => {
      const el = loadMoreSentinelRef.value
      if (!el || !core.mutable.loadMoreObserver) return
      if (core.mutable.loadMoreObserverTarget && core.mutable.loadMoreObserverTarget !== el) {
        core.mutable.loadMoreObserver.unobserve(core.mutable.loadMoreObserverTarget)
      }
      core.mutable.loadMoreObserverTarget = el
      core.mutable.loadMoreObserver.observe(el)
    })
  })

  const loadList = async ({ silent = false, force = false } = {}) => {
    if (!silent) core.loading.value = true
    else core.refreshing.value = true
    core.error.value = ''
    const t0 = Date.now()
    // 首次进入 force=false 走后端缓存；显式刷新 force=true
    const doForce = force || false
    pushDebugLog('ChaoxingHub', `加载课程列表 silent=${silent} force=${doForce}`, 'info')
    try {
      // 列表优先拉课程（可缓存）；会话状态并行，不阻塞有缓存时的首屏
      const coursePromise = core.cxInvoke('chaoxing_fetch_courses', { force: doForce })
      const statusPromise = core.cxInvoke('chaoxing_get_session_status', {}).catch((e: unknown) => ({
        success: false,
        error: String((e as Error)?.message || e)
      }))
      const [courseRes, statusRes] = await Promise.all([coursePromise, statusPromise])
      // 组件已卸载则放弃写入任何响应式状态
      if (core.mutable.disposed) return
      if (courseRes?.success === false) throw new Error(courseRes?.error || '课程列表失败')
      statusMeta.value = statusRes || {}
      let list: Array<Record<string, unknown>> = Array.isArray(courseRes?.courses) ? courseRes.courses : []
      // 数据规模防护：先记录数量摘要，超限截断，避免超大列表拖垮 iOS WebView
      pushDebugLog('ChaoxingHub', `课程原始数据 count=${list.length}`, 'info')
      if (list.length > MAX_COURSE_LIST_SIZE) {
        pushDebugLog(
          'ChaoxingHub',
          `课程数量超限 raw=${list.length}，已截断至 ${MAX_COURSE_LIST_SIZE}`,
          'warn'
        )
        list = list.slice(0, MAX_COURSE_LIST_SIZE)
      }
      courses.value = list.map(normalizeCourse).filter((c) => c.courseId && c.clazzId)
      // iOS：首帧小批渲染 + rAF 逐批递增，平滑「列表加载完成瞬间」的渲染峰值
      if (core.isIOSLikeDevice) {
        courseRenderLimit.value = Math.min(INITIAL_COURSE_BATCH, IOS_PROGRESSIVE_FIRST_BATCH)
        scheduleProgressiveCourseRender()
      }
      pushDebugLog(
        'ChaoxingHub',
        `课程列表完成 count=${courses.value.length} from_cache=${!!courseRes?.from_cache} (${Date.now() - t0}ms)`,
        'info',
        { sync_time: courseRes?.sync_time, platform_status: courseRes?.platform_status }
      )

      const fromApi = Array.isArray(courseRes?.semesters)
        ? courseRes.semesters.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
        : []
      const fromCourses = [...new Set(courses.value.map((c) => c.semester).filter(Boolean))]
      const merged: string[] = []
      for (const s of [...fromApi, ...fromCourses]) {
        if (!merged.includes(s)) merged.push(s)
      }
      // 本学期优先，未分学期靠后
      merged.sort((a, b) => {
        const rank = (s: string) => {
          if (s === '本学期') return 0
          if (String(s).includes('年') || String(s).includes('学期')) return 1
          if (s === '历史课程') return 2
          if (s === '未分学期') return 4
          return 3
        }
        const d = rank(a) - rank(b)
        if (d !== 0) return d
        return String(b).localeCompare(String(a), 'zh')
      })
      semesterTabs.value = ['全部', ...merged]
      if (!semesterTabs.value.includes(activeSemester.value)) {
        activeSemester.value = '全部'
      }
      pushDebugLog(
        'ChaoxingHub',
        `学期列表 count=${merged.length} labels=${merged.join('|') || '(空)'} folder_extra=${courseRes?.folder_extra ?? 'n/a'}`,
        merged.length <= 1 ? 'warn' : 'info',
        { semesters: merged, from_api: fromApi, from_courses: fromCourses }
      )
    } catch (e) {
      if (core.mutable.disposed) return
      core.error.value = String((e as Error)?.message || e).trim() || '加载失败'
    } finally {
      if (!core.mutable.disposed) {
        // iOS：loading 退场延后一帧，避免「列表首渲染 + 移除加载动画」同帧峰值
        if (core.isIOSLikeDevice) {
          requestAnimationFrame(() => {
            if (core.mutable.disposed) return
            core.loading.value = false
            core.refreshing.value = false
          })
        } else {
          core.loading.value = false
          core.refreshing.value = false
        }
      }
    }
  }

  /** iOS 原生层内存告警：立即收缩课程渲染批量，降低 DOM 与内存压力 */
  const onIosMemoryWarning = () => {
    if (core.mutable.progressiveRenderRaf) {
      cancelAnimationFrame(core.mutable.progressiveRenderRaf)
      core.mutable.progressiveRenderRaf = 0
    }
    courseRenderLimit.value = INITIAL_COURSE_BATCH
    pushDebugLog('ChaoxingHub', '收到 iOS 内存告警，收缩课程渲染批量', 'warn')
  }

  return {
    courses,
    semesterTabs,
    activeSemester,
    searchQuery,
    statusMeta,
    filteredCourses,
    visibleCourses,
    hasMoreCourses,
    totalPending,
    badgeType,
    badgeText,
    courseRenderLimit,
    loadMoreSentinelRef,
    loadList,
    loadMoreCourses,
    resetCourseRenderLimit,
    onIosMemoryWarning
  }
}
