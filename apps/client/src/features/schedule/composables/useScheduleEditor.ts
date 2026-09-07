/**
 * 课表领域 - 自定义课程编辑组合式函数（添加/编辑/删除/管理弹层/周选择器）。
 * 原内联于 ScheduleView.vue（表单/提交/删除/管理弹窗），拆分后行为一致。
 */
import { computed, nextTick, ref, watch } from 'vue'
import axios from 'axios'
import { DEFAULT_COURSE_COLOR, normalizeOptionalCourseColor } from '../../../utils/course_color'
import { t } from '../../../utils/app_i18n'
import { formatWeeksText, normalizeWeeks } from '../utils/weeks'
import { normalizeCustomCourse } from '../utils/course'
import { LOGIN_SESSION_TOKEN_KEY, periodOptions, getWeekDayLabels } from '../constants'
import type { ScheduleConfirmDialog } from './useConfirmDialog'
import type { ScheduleData } from './useScheduleData'
import type { ScheduleDetail } from './useScheduleDetail'
import type { ScheduleMenu } from './useScheduleMenu'
import type { ScheduleSemester } from './useScheduleSemester'

export interface ScheduleEditorOptions {
  props: any
  data: ScheduleData
  semester: ScheduleSemester
  detail: ScheduleDetail
  menu: ScheduleMenu
  confirmDialog: ScheduleConfirmDialog
}

export const useScheduleEditor = (options: ScheduleEditorOptions) => {
  const { props, data, semester, detail, menu, confirmDialog } = options
  const { askConfirm } = confirmDialog

  const showAddCourse = ref(false)
  const courseDialogMode = ref('add')
  const editingCourseId = ref('')
  const editingCourseSemester = ref('')
  const showWeekPicker = ref(false)
  const addingCourse = ref(false)
  const addCourseError = ref('')
  const showManageCourses = ref(false)
  const returnToManageAfterCourseSubmit = ref(false)
  const returnToDetailAfterCourseSubmit = ref(false)

  const addCourseForm = ref({
    name: '',
    teacher: '',
    room: '',
    weekday: 1,
    period: 1,
    djs: 1,
    weeks: [] as number[],
    color: DEFAULT_COURSE_COLOR
  })

  const API_BASE = import.meta.env.VITE_API_BASE || '/api'

  const courseDialogSemester = computed(() => {
    if (courseDialogMode.value === 'edit') {
      return String(editingCourseSemester.value || semester.semester.value || semester.semesterDraft.value || '').trim()
    }
    return String(semester.semester.value || semester.semesterDraft.value || '').trim()
  })

  const courseSpanOptions = computed(() => {
    const start = Number(addCourseForm.value.period) || 1
    const maxSpan = Math.max(1, 12 - start)
    return Array.from({ length: maxSpan }, (_, i) => i + 1)
  })

  // #788：周次计数文案经 t() 取词（computed 内取词，语言切换重算时即时生效）
  const addWeeksCountText = computed(() => {
    const weeks = Array.isArray(addCourseForm.value.weeks) ? addCourseForm.value.weeks.length : 0
    return weeks > 0
      ? t('schedule.weeks.selectedCount').replace('{n}', String(weeks))
      : t('schedule.weeks.noneSelected')
  })

  // 开始节次变化时钳制节数
  watch(
    () => addCourseForm.value.period,
    () => {
      const start = Number(addCourseForm.value.period) || 1
      const maxSpan = Math.max(1, 12 - start)
      if (Number(addCourseForm.value.djs) > maxSpan) {
        addCourseForm.value.djs = maxSpan
      }
    }
  )

  const resetAddCourseForm = () => {
    addCourseForm.value = {
      name: '',
      teacher: '',
      room: '',
      weekday: 1,
      period: 1,
      djs: 1,
      weeks: semester.semesterWeekOptions.value.slice(),
      color: DEFAULT_COURSE_COLOR
    }
    addCourseError.value = ''
    showWeekPicker.value = false
  }

  const populateCourseForm = (course: any) => {
    const normalized = normalizeCustomCourse(course, courseDialogSemester.value)
    if (!normalized) return
    const colorNorm = normalizeOptionalCourseColor(normalized.color)
    addCourseForm.value = {
      name: String(normalized.name || '').trim(),
      teacher: String(normalized.teacher || '').trim(),
      room: String(normalized.room || '').trim(),
      weekday: Number(normalized.weekday || 1),
      period: Number(normalized.period || 1),
      djs: Math.max(1, Number(normalized.djs || 1)),
      weeks: normalizeWeeks(normalized.weeks),
      // #469：回显已有 color；后端未下发时保持空（本地态）
      color: colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm
    }
    addCourseError.value = ''
    showWeekPicker.value = false
  }

  const hasValidLoginSession = (): boolean => {
    const sid = String(props.studentId || '').trim()
    const sessionToken = String(localStorage.getItem(LOGIN_SESSION_TOKEN_KEY) || '').trim()
    return !!sid && !!sessionToken
  }

  const promptLoginRequired = async () => {
    // #788：错误提示与确认弹窗文案经 t() 取词（事件回调内取词时机天然正确）
    data.errorMsg.value = t('schedule.editor.loginRequiredError')
    menu.showMenu.value = false
    await askConfirm({
      title: t('schedule.editor.loginRequiredTitle'),
      lines: [t('schedule.editor.loginRequiredLine')],
      confirmText: t('schedule.editor.loginRequiredConfirm'),
      cancelText: t('schedule.editor.loginRequiredCancel'),
      danger: false
    })
  }

  const openAddCourseDialog = () => {
    if (!hasValidLoginSession()) {
      void promptLoginRequired()
      return
    }
    const sem = String(semester.semester.value || semester.semesterDraft.value || '').trim()
    if (!sem) {
      data.semesterError.value = t('schedule.editor.semesterRequired')
      return
    }
    courseDialogMode.value = 'add'
    editingCourseId.value = ''
    editingCourseSemester.value = sem
    returnToDetailAfterCourseSubmit.value = false
    returnToManageAfterCourseSubmit.value = false
    resetAddCourseForm()
    showAddCourse.value = true
  }

  const closeAddCourseDialog = () => {
    const reopenManage = returnToManageAfterCourseSubmit.value
    showAddCourse.value = false
    showWeekPicker.value = false
    addCourseError.value = ''
    courseDialogMode.value = 'add'
    editingCourseId.value = ''
    editingCourseSemester.value = ''
    returnToDetailAfterCourseSubmit.value = false
    returnToManageAfterCourseSubmit.value = false
    if (reopenManage) {
      showManageCourses.value = true
      void data.loadAllCustomCourses()
    }
  }

  const openEditCourseDialog = (course: any, dialogOptions: { reopenDetail?: boolean; reopenManage?: boolean } = {}) => {
    const normalized = normalizeCustomCourse(course, courseDialogSemester.value)
    if (!normalized?.is_custom) return
    courseDialogMode.value = 'edit'
    editingCourseId.value = String(normalized.source_id || normalized.id || '').trim()
    editingCourseSemester.value = String(normalized.semester || semester.semester.value || semester.semesterDraft.value || '').trim()
    returnToDetailAfterCourseSubmit.value = !!dialogOptions.reopenDetail
    returnToManageAfterCourseSubmit.value = !!dialogOptions.reopenManage || showManageCourses.value
    populateCourseForm(normalized)
    detail.showDetail.value = false
    showManageCourses.value = false
    menu.showMenu.value = false
    showAddCourse.value = false
    nextTick(() => {
      showAddCourse.value = true
    })
  }

  const toggleManageSemester = (semesterKey: string) => {
    data.manageExpandedSemesters.value = {
      ...data.manageExpandedSemesters.value,
      [semesterKey]: !data.manageExpandedSemesters.value[semesterKey]
    }
  }

  const openManageCoursesDialog = async () => {
    if (!hasValidLoginSession()) {
      await promptLoginRequired()
      return
    }
    menu.showMenu.value = false
    showManageCourses.value = true
    await data.loadAllCustomCourses()
  }

  const closeManageCoursesDialog = () => {
    showManageCourses.value = false
    data.loadingManageCourses.value = false
    data.manageCoursesError.value = ''
  }

  const toggleAddCourseWeek = (week: number) => {
    const current = normalizeWeeks(addCourseForm.value.weeks)
    if (current.includes(week)) {
      addCourseForm.value.weeks = current.filter((w) => w !== week)
      return
    }
    addCourseForm.value.weeks = normalizeWeeks([...current, week])
  }

  const selectAllAddCourseWeeks = () => {
    addCourseForm.value.weeks = semester.semesterWeekOptions.value.slice()
  }

  const clearAddCourseWeeks = () => {
    addCourseForm.value.weeks = []
  }

  const validateAddCourse = (): string => {
    // #788：校验错误文案经 t() 取词
    const name = String(addCourseForm.value.name || '').trim()
    if (!name) return t('schedule.editor.nameRequired')
    const weeks = normalizeWeeks(addCourseForm.value.weeks)
    if (!weeks.length) return t('schedule.editor.weeksRequired')
    const weekday = Number(addCourseForm.value.weekday)
    if (!Number.isFinite(weekday) || weekday < 1 || weekday > 7) return t('schedule.editor.weekdayRequired')
    const period = Number(addCourseForm.value.period)
    if (!Number.isFinite(period) || period < 1 || period > 11) return t('schedule.editor.periodRange')
    const span = Number(addCourseForm.value.djs)
    const maxSpan = Math.max(1, 12 - period)
    if (!Number.isFinite(span) || span < 1 || span > maxSpan) {
      return t('schedule.editor.spanRange').replace('{max}', String(maxSpan))
    }
    return ''
  }

  /** 自定义课程变更后刷新视图（课表 + 管理列表） */
  const refreshCustomCourseViews = async (targetSemester = '') => {
    const normalizedSemester = String(targetSemester || '').trim()
    const currentSemester = String(semester.semester.value || semester.semesterDraft.value || '').trim()
    if (normalizedSemester && normalizedSemester === currentSemester) {
      await data.loadCustomCourses(normalizedSemester)
    } else {
      data.mergeScheduleSources()
    }
    if (showManageCourses.value) {
      await data.loadAllCustomCourses()
    }
  }

  const submitAddCourse = async () => {
    if (!hasValidLoginSession()) {
      await promptLoginRequired()
      return
    }
    const sem = String(courseDialogSemester.value || '').trim()
    if (!sem) {
      addCourseError.value = t('schedule.editor.semesterInvalid')
      return
    }
    const sid = String(props.studentId || '').trim()
    if (!sid) {
      addCourseError.value = t('schedule.editor.loginRequiredToAdd')
      return
    }
    const validationError = validateAddCourse()
    if (validationError) {
      addCourseError.value = validationError
      return
    }

    const weeks = normalizeWeeks(addCourseForm.value.weeks)
    const colorNorm = normalizeOptionalCourseColor(addCourseForm.value.color)
    const payload = {
      student_id: sid,
      semester: sem,
      name: String(addCourseForm.value.name || '').trim(),
      teacher: String(addCourseForm.value.teacher || '').trim(),
      room: String(addCourseForm.value.room || '').trim(),
      weekday: Number(addCourseForm.value.weekday),
      period: Number(addCourseForm.value.period),
      djs: Number(addCourseForm.value.djs),
      weeks,
      // #470：可选用户色；空字符串表示未设定
      color: colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm
    }

    const isEditing = courseDialogMode.value === 'edit'
    // #788：确认弹窗标题/行文经 t() 取词（事件回调内取词时机天然正确）
    const actionWord = isEditing ? t('schedule.editor.actionEdit') : t('schedule.editor.actionAdd')
    const confirmText = [
      t('schedule.editor.confirmToSemester').replace('{action}', actionWord).replace('{t}', sem),
      t('schedule.editor.confirmCourse').replace('{t}', payload.name),
      t('schedule.editor.confirmTime')
        .replace('{day}', getWeekDayLabels()[payload.weekday - 1])
        .replace('{s}', String(payload.period))
        .replace('{e}', String(payload.period + payload.djs - 1)),
      t('schedule.editor.confirmWeeks').replace('{t}', formatWeeksText(weeks))
    ]
    const confirmed = await askConfirm({
      title: isEditing ? t('schedule.editor.confirmEditTitle') : t('schedule.editor.confirmAddTitle'),
      lines: confirmText,
      confirmText: isEditing ? t('schedule.editor.confirmEdit') : t('schedule.editor.confirmAdd'),
      cancelText: t('schedule.confirm.cancel'),
      danger: false
    })
    if (!confirmed) {
      return
    }

    addingCourse.value = true
    addCourseError.value = ''
    try {
      const requestPayload = isEditing
        ? {
            ...payload,
            course_id: String(editingCourseId.value || '').trim()
          }
        : payload
      const res = await axios.post(
        `${API_BASE}${isEditing ? '/v2/schedule/custom/update' : '/v2/schedule/custom/add'}`,
        requestPayload
      )
      if (!res.data?.success) {
        throw new Error(res.data?.error || t('schedule.editor.submitFailed').replace('{action}', actionWord))
      }
      await refreshCustomCourseViews(sem)
      showAddCourse.value = false
      showWeekPicker.value = false
      if (isEditing && returnToManageAfterCourseSubmit.value) {
        showManageCourses.value = true
        await data.loadAllCustomCourses()
      }
      if (isEditing && editingCourseId.value && returnToDetailAfterCourseSubmit.value) {
        detail.syncSelectedCustomCourse(editingCourseId.value, sem)
        detail.showDetail.value = !!detail.selectedCourse.value
      }
      courseDialogMode.value = 'add'
      editingCourseId.value = ''
      editingCourseSemester.value = ''
      returnToDetailAfterCourseSubmit.value = false
      returnToManageAfterCourseSubmit.value = false
    } catch (e) {
      addCourseError.value = String((e as any)?.response?.data?.error || (e as any)?.message || t('schedule.editor.submitFailed').replace('{action}', actionWord))
    } finally {
      addingCourse.value = false
    }
  }

  const deleteCustomCourseRecord = async (course: any, mode = 'all', recordOptions: { reopenDetail?: boolean } = {}) => {
    const normalized = normalizeCustomCourse(course, courseDialogSemester.value)
    if (!normalized?.is_custom) return false
    const sem = String(normalized.semester || semester.semester.value || semester.semesterDraft.value || '').trim()
    const sid = String(props.studentId || '').trim()
    if (!sem || !sid) return false
    const courseId = String(normalized.source_id || normalized.id || '').trim()
    if (!courseId) return false

    const isCurrentWeek = mode === 'current_week'
    const week = Number(semester.selectedWeek.value || 0)
    // #788：删除确认文案经 t() 取词（事件回调内取词时机天然正确）
    const message = isCurrentWeek
      ? t('schedule.editor.deleteCurrentWeekLine').replace('{name}', normalized.name).replace('{w}', String(week))
      : t('schedule.editor.deleteAllLine').replace('{name}', normalized.name)
    const confirmed = await askConfirm({
      title: t('schedule.editor.deleteConfirmTitle'),
      lines: [message],
      confirmText: t('schedule.editor.confirmDelete'),
      cancelText: t('schedule.confirm.cancel'),
      danger: true
    })
    if (!confirmed) return false

    try {
      const payload = {
        student_id: sid,
        semester: sem,
        course_id: courseId,
        mode: isCurrentWeek ? 'current_week' : 'all',
        current_week: isCurrentWeek ? week : undefined
      }
      const res = await axios.post(`${API_BASE}/v2/schedule/custom/delete`, payload)
      if (!res.data?.success) {
        throw new Error(res.data?.error || t('schedule.editor.deleteFailed'))
      }
      await refreshCustomCourseViews(sem)
      if (recordOptions.reopenDetail && !isCurrentWeek) {
        detail.syncSelectedCustomCourse(courseId, sem)
        detail.showDetail.value = !!detail.selectedCourse.value
      } else {
        detail.showDetail.value = false
        detail.selectedCourse.value = null
      }
      detail.detailActionError.value = ''
      return true
    } catch (e) {
      detail.detailActionError.value = String((e as any)?.response?.data?.error || (e as any)?.message || t('schedule.editor.deleteFailed'))
      return false
    }
  }

  const deleteCustomCourse = async (mode: string) => {
    const course = detail.selectedCourse.value
    if (!course?.is_custom) return
    await deleteCustomCourseRecord(course, mode, { reopenDetail: mode === 'current_week' })
  }

  const deleteManagedCourse = async (course: any) => {
    const ok = await deleteCustomCourseRecord(course, 'all', { reopenDetail: false })
    if (!ok && detail.detailActionError.value) {
      data.manageCoursesError.value = detail.detailActionError.value
    }
  }

  return {
    showAddCourse,
    courseDialogMode,
    editingCourseId,
    editingCourseSemester,
    showWeekPicker,
    addingCourse,
    addCourseError,
    showManageCourses,
    returnToManageAfterCourseSubmit,
    returnToDetailAfterCourseSubmit,
    addCourseForm,
    courseDialogSemester,
    courseSpanOptions,
    addWeeksCountText,
    periodOptions,
    resetAddCourseForm,
    populateCourseForm,
    hasValidLoginSession,
    promptLoginRequired,
    openAddCourseDialog,
    closeAddCourseDialog,
    openEditCourseDialog,
    toggleManageSemester,
    openManageCoursesDialog,
    closeManageCoursesDialog,
    toggleAddCourseWeek,
    selectAllAddCourseWeeks,
    clearAddCourseWeeks,
    validateAddCourse,
    refreshCustomCourseViews,
    submitAddCourse,
    deleteCustomCourseRecord,
    deleteCustomCourse,
    deleteManagedCourse
  }
}

export type ScheduleEditor = ReturnType<typeof useScheduleEditor>
