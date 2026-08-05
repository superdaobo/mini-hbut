/**
 * 课表领域 - 课程详情弹层组合式函数。
 * 原内联于 ScheduleView.vue（openDetail/复制详情/冲突跳转/选中课程同步）。
 */
import { nextTick, ref } from 'vue'
import { showToast } from '../../../utils/toast'
import { buildCourseDetailText, copyTextWithFallback } from '../utils/formatters'
import { normalizeCustomCourse } from '../utils/course'
import type { ScheduleData } from './useScheduleData'
import type { ScheduleSemester } from './useScheduleSemester'

export interface ScheduleDetailOptions {
  data: ScheduleData
  semester: ScheduleSemester
}

export const useScheduleDetail = (options: ScheduleDetailOptions) => {
  const { data, semester } = options

  const showDetail = ref(false)
  const selectedCourse = ref<any>(null)
  const detailActionError = ref('')

  const openDetail = (course: any) => {
    detailActionError.value = ''
    selectedCourse.value = course
    showDetail.value = true
  }

  const copySelectedCourseDetail = async () => {
    const course = selectedCourse.value
    if (!course) return
    const copied = await copyTextWithFallback(buildCourseDetailText(course))
    if (copied) {
      showToast(course.is_conflict ? '冲突课程详情已复制' : '课程详情已复制', 'success')
      return
    }
    showToast('复制失败，请稍后重试', 'error')
  }

  /** 在本地课程数据中查找自定义课程记录 */
  const findCustomCourseRecord = (courseId: any, targetSemester = '') => {
    if (!courseId) return null
    const id = String(courseId).trim()
    const sem = String(targetSemester || semester.semester.value || semester.semesterDraft.value || '').trim()
    const fallbackSemester = sem
    const candidates = [
      ...(Array.isArray(data.customScheduleData.value) ? data.customScheduleData.value : []),
      ...(Array.isArray(data.allCustomCourses.value) ? data.allCustomCourses.value : [])
    ]
    const matches = candidates
      .map((item) => normalizeCustomCourse(item, fallbackSemester))
      .filter(Boolean)
      .filter((course: any) => {
        if (!course) return false
        const courseIdValue = String(course.source_id || course.id || '').trim()
        if (!courseIdValue) return false
        if (courseIdValue !== id) return false
        if (sem && course.semester && course.semester !== sem) return false
        return true
      })
    return matches[0] || null
  }

  /** 编辑/删除后同步详情弹层中的选中课程 */
  const syncSelectedCustomCourse = (courseId: any, targetSemester = '') => {
    const nextCourse = findCustomCourseRecord(courseId, targetSemester)
    if (!nextCourse) {
      if (showDetail.value) {
        showDetail.value = false
      }
      selectedCourse.value = null
      return
    }
    selectedCourse.value = nextCourse
  }

  /** 从冲突卡片打开单门课程详情 */
  const openConflictCourseDetail = (course: any) => {
    const nextCourse = course?.is_custom
      ? (findCustomCourseRecord(course.source_id || course.id, course.semester) || normalizeCustomCourse(course, semester.semester.value || ''))
      : {
          ...course,
          is_conflict: false
        }
    if (!nextCourse) return
    showDetail.value = false
    // 延迟一帧打开，避免与冲突卡片的关闭动画冲突
    nextTick(() => {
      openDetail({
        ...nextCourse,
        is_conflict: false
      })
    })
  }

  return {
    showDetail,
    selectedCourse,
    detailActionError,
    openDetail,
    copySelectedCourseDetail,
    findCustomCourseRecord,
    syncSelectedCustomCourse,
    openConflictCourseDetail
  }
}

export type ScheduleDetail = ReturnType<typeof useScheduleDetail>
