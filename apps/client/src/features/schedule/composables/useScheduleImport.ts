/**
 * 课表领域 - AI 课表导入组合式函数（#815 / #819 / #820 Phase-1）。
 *
 * 职责：
 *   - 管理导入 Dialog 的开关、目标学期、原始文本、解析结果与预览态；
 *   - 串联 Parser(#816) → Merge/Conflict(#817) → Colors(#818) → Commit(#820)；
 *   - 只做编排，不重复实现任何解析 / 合并 / 冲突 / 配色规则。
 *
 * 关键约束：
 *   - 解析后必须先进 preview，绝不直接写库；
 *   - 目标学期只来自 UI 选择，AI payload 不得覆盖；
 *   - 提交只走现有 custom/add 链路（Phase-1），提交后统一 refresh 一次。
 */
import { computed, ref } from 'vue'
import { showToast } from '../../../utils/toast'
import { DEFAULT_COURSE_COLOR } from '../../../utils/course_color'
import { useI18n } from '../../../utils/app_i18n'
import { getWeekDays } from '../constants'
import { normalizeWeeks } from '../utils/weeks'
import { buildPreviewGridCourses, buildPreviewWeekDates, isWeekActive } from '../utils/importPreview'
import { readTextFromFile } from '../utils/io'
import { buildAiCourseImportPrompt } from '../utils/importPrompt'
import { parseAiCourseImport } from '../utils/importParser'
import { mergeImportCourses, detectImportDuplicates } from '../utils/importMerge'
import { detectImportConflicts } from '../utils/importConflict'
import {
  assignImportColors,
  setCourseGroupColor,
  resetImportColors,
  collectImportColorDiagnostics
} from '../utils/importColors'
import { commitImportCourses } from '../utils/importCommit'
import type {
  ImportCommitResult,
  ImportDiagnostic,
  ImportExistingCourse,
  ImportPreviewCourse
} from '../utils/importTypes'
import type { ScheduleData } from './useScheduleData'
import type { ScheduleEditor } from './useScheduleEditor'
import type { ScheduleSemester } from './useScheduleSemester'

export interface ScheduleImportOptions {
  props: any
  data: ScheduleData
  semester: ScheduleSemester
  editor: ScheduleEditor
}

/** 预览条目 key：由原始输入下标派生，保证稳定且可回溯 */
const previewKeyOf = (sourceIndex: number): string => `import-${sourceIndex}`

export const useScheduleImport = (options: ScheduleImportOptions) => {
  const { props, data, semester, editor } = options
  const { t } = useI18n()

  const API_BASE = import.meta.env.VITE_API_BASE || '/api'

  // ============ 状态 ============
  /** Dialog 是否打开 */
  const showImportDialog = ref(false)
  /** 当前阶段：input 输入 | preview 预览 | result 结果汇总 */
  const stage = ref<'input' | 'preview' | 'result'>('input')
  /** 目标学期（由 UI 决定，AI 无法覆盖） */
  const targetSemester = ref('')
  /** 原始粘贴文本 */
  const rawText = ref('')
  /** 是否展示格式示例 */
  const showExample = ref(false)
  /** 解析中 / 提交中 */
  const parsing = ref(false)
  const committing = ref(false)
  /** 解析级错误（无法进入预览） */
  const parseError = ref('')
  /** 全局诊断（无法定位到单条） */
  const globalDiagnostics = ref<ImportDiagnostic[]>([])
  /** 预览课程列表 */
  const previewCourses = ref<ImportPreviewCourse[]>([])
  /** 原始识别条目数 */
  const rawCount = ref(0)
  /** 自动合并掉的条数 */
  const mergedCount = ref(0)
  /** 提交结果 */
  const importResult = ref<ImportCommitResult | null>(null)

  // ============ 课表预览态（#821） ============
  /** 预览视图模式：list 列表 | grid 课表 */
  const previewMode = ref<'list' | 'grid'>('list')
  /** 课表预览的目标周（仅预览，不改变目标学期 / 主课表选中周） */
  const previewWeek = ref(1)

  // ============ 既有课程视图 ============
  /** 当前学期教务课表（official） */
  const officialCourses = computed<ImportExistingCourse[]>(() => {
    const list = Array.isArray(data.remoteScheduleData?.value) ? data.remoteScheduleData.value : []
    return list.map((item: any) => toExistingCourse(item, 'official'))
  })

  /** 当前学期自定义课表（custom） */
  const customCourses = computed<ImportExistingCourse[]>(() => {
    const list = Array.isArray(data.customScheduleData?.value) ? data.customScheduleData.value : []
    return list.map((item: any) => toExistingCourse(item, 'custom'))
  })

  const allExistingCourses = computed<ImportExistingCourse[]>(() => [
    ...officialCourses.value,
    ...customCourses.value
  ])

  /** 既有课程已使用的颜色，供均衡配色参考 */
  const existingColors = computed<string[]>(() => {
    const list = Array.isArray(data.scheduleData?.value) ? data.scheduleData.value : []
    return list
      .map((item: any) => String(item?.color || '').trim())
      .filter((color: string) => /^#[0-9a-fA-F]{6}$/.test(color))
  })

  // ============ 统计 ============
  const summary = computed(() => {
    const items = previewCourses.value
    return {
      raw: rawCount.value,
      merged: mergedCount.value,
      importable: items.filter((item) => item.selected).length,
      total: items.length,
      duplicate: items.filter((item) => item.duplicateKind === 'exact').length,
      conflict: items.filter((item) => item.conflicts.length > 0).length,
      warning: items.reduce((count, item) => count + item.diagnostics.length, 0),
      error: Math.max(0, rawCount.value - items.length)
    }
  })

  // ============ 内部工具 ============

  /** 把任意课表记录收敛成重复/冲突判定所需的最小视图 */
  function toExistingCourse(raw: any, source: 'official' | 'custom'): ImportExistingCourse {
    return {
      id: String(raw?.id || raw?.source_id || '').trim(),
      name: String(raw?.name || '').trim(),
      teacher: String(raw?.teacher || '').trim(),
      room: String(raw?.room || raw?.room_code || '').trim(),
      weekday: Number(raw?.weekday || 0),
      period: Number(raw?.period || 0),
      djs: Number(raw?.djs || 0),
      weeks: normalizeWeeks(raw?.weeks),
      source
    }
  }

  /** 重置全部预览态（不影响 rawText，便于用户返回修改） */
  const resetPreviewState = () => {
    stage.value = 'input'
    parseError.value = ''
    globalDiagnostics.value = []
    previewCourses.value = []
    importResult.value = null
    rawCount.value = 0
    mergedCount.value = 0
    // #821：预览模式与预览周一并复位，避免残留上一次的状态
    previewMode.value = 'list'
    previewWeek.value = 1
  }

  /** 把 sourceIndex → hex 的颜色映射写回预览条目 */
  const applyColorMap = (colorMap: Map<number, string>) => {
    previewCourses.value = previewCourses.value.map((item) => {
      const next = colorMap.get(item.course.sourceIndex)
      return next ? { ...item, colorOverride: next } : item
    })
  }

  /** 当前预览的 sourceIndex → 生效颜色 */
  const currentColorMap = (): Map<number, string> => {
    const map = new Map<number, string>()
    for (const item of previewCourses.value) {
      map.set(item.course.sourceIndex, item.colorOverride || DEFAULT_COURSE_COLOR)
    }
    return map
  }

  // ============ 课表预览派生（#821） ============

  /** 预览周总数（用于周切换边界） */
  const previewTotalWeeks = computed(() => Math.max(1, Number(semester.totalWeeks.value || 1)))

  /** 把任意输入钳制到 [1, totalWeeks] 的合法预览周 */
  const clampPreviewWeek = (week: number): number => {
    const parsed = Number(week)
    if (!Number.isFinite(parsed)) return 1
    return Math.min(previewTotalWeeks.value, Math.max(1, Math.round(parsed)))
  }

  /** 预览周对应的 7 天日期头（结构与主课表 weekDates 一致，不修改主课表状态） */
  const previewWeekDates = computed(() =>
    buildPreviewWeekDates(semester.startDateStr.value, previewWeek.value, {
      dayLabels: getWeekDays()
    })
  )

  /**
   * 预览网格某一列的课程：既有课表（该预览周生效）+ 本次预览课程。
   * 纯内存计算，绝不写数据库；既有课程点击在 Dialog 内会被忽略。
   */
  const previewGetCoursesForDay = (dayIndex: number): any[] => {
    const day = Number(dayIndex)
    if (!Number.isFinite(day) || day < 1 || day > 7) return []

    const week = previewWeek.value
    const existingList = Array.isArray(data.scheduleData?.value) ? data.scheduleData.value : []
    const existing = existingList.filter(
      (course: any) => Number(course?.weekday) === day && isWeekActive(course?.weeks, week)
    )
    const preview = buildPreviewGridCourses(previewCourses.value).filter(
      (node) => node.weekday === day
    )
    return [...existing, ...preview]
  }

  /** 按预览课程 key（即网格节点 `_uid`）取回其冲突详情，供点击预览课程时展示 */
  const previewConflictsOf = (courseKey: string): ImportPreviewCourse | null => {
    const key = String(courseKey || '').trim()
    if (!key) return null
    return previewCourses.value.find((item) => item.key === key) || null
  }

  // ============ 动作 ============

  /** 打开导入 Dialog：重置状态并把目标学期默认设为当前学期 */
  const openImportDialog = () => {
    rawText.value = ''
    showExample.value = false
    resetPreviewState()
    // #821：课表预览周从主课表当前选中周起步（仅预览，不改变主课表）
    previewWeek.value = clampPreviewWeek(Number(semester.selectedWeek.value || 1))
    targetSemester.value = String(semester.semester.value || semester.semesterDraft.value || '').trim()
    showImportDialog.value = true
  }

  /** 关闭 Dialog 并清空全部状态 */
  const closeImportDialog = () => {
    showImportDialog.value = false
    rawText.value = ''
    showExample.value = false
    resetPreviewState()
  }

  /** 返回输入阶段：保留原始文本，不丢用户输入 */
  const backToInput = () => {
    stage.value = 'input'
    parseError.value = ''
    importResult.value = null
  }

  /** 切换预览视图模式（列表 / 课表） */
  const setPreviewMode = (mode: 'list' | 'grid') => {
    previewMode.value = mode === 'grid' ? 'grid' : 'list'
  }

  /** 直接跳转到指定预览周（自动钳制到 1..totalWeeks） */
  const setPreviewWeek = (week: number) => {
    previewWeek.value = clampPreviewWeek(week)
  }

  /** 预览周 -1（不越界） */
  const prevPreviewWeek = () => {
    setPreviewWeek(previewWeek.value - 1)
  }

  /** 预览周 +1（不越界） */
  const nextPreviewWeek = () => {
    setPreviewWeek(previewWeek.value + 1)
  }

  /** 复制 AI 提示词到剪贴板（提示词由色板动态生成） */
  const copyPrompt = async () => {
    const promptText = buildAiCourseImportPrompt()
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = promptText
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      showToast(t('schedule.import.toast.promptCopied'), 'success')
    } catch {
      showToast(t('schedule.import.toast.promptCopyFailed'), 'error')
    }
  }

  /** 触发隐藏文件选择器（.json / .txt 走同一解析管线） */
  /**
   * 文件导入：内容进入与 textarea 相同的 pipeline。
   * 文件选择器由 Dialog 组件持有，此处只处理选中的文件。
   */
  const handleFileChange = async (event: Event) => {
    const input = event?.target as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) return
    try {
      rawText.value = await readTextFromFile(file)
      parseText()
    } catch {
      showToast(t('schedule.import.toast.fileFailed'), 'error')
    } finally {
      if (input) input.value = ''
    }
  }

  /**
   * 解析课表：Parser → Merge → Duplicate → Conflict → Colors。
   * 任何一步都不写数据库；产出纯预览态。
   */
  const parseText = () => {
    parseError.value = ''
    importResult.value = null
    const parsed = parseAiCourseImport(rawText.value)
    globalDiagnostics.value = parsed.diagnostics
    rawCount.value = parsed.rawCount

    if (!parsed.courses.length) {
      const firstError = parsed.diagnostics.find((item) => item.level === 'error')
      parseError.value = firstError?.message || t('schedule.import.error.noCourses')
      stage.value = 'input'
      return
    }

    // 1) 合并被 AI 按周拆散的同一课程
    const merged = mergeImportCourses(parsed.courses)
    mergedCount.value = merged.mergedCount

    // 2) 重复检测（batch 内 + 既有 official/custom）
    const duplicates = detectImportDuplicates(merged.courses, allExistingCourses.value)

    // 3) 冲突检测（batch 内 + 既有 official/custom）
    const conflicts = detectImportConflicts(merged.courses, allExistingCourses.value)

    // 4) 配色：AI 推荐优先，非法/缺失走均衡兜底
    const colorMap = assignImportColors(merged.courses, existingColors.value)
    const colorDiagnostics = collectImportColorDiagnostics(merged.courses)

    // 5) 组装预览态（诊断与持久化 payload 严格分离）
    previewCourses.value = merged.courses.map((course, index) => {
      const duplicateKind = duplicates[index] || 'none'
      const courseColorWarnings = colorDiagnostics.filter((item) => item.sourceIndex === course.sourceIndex)
      return {
        key: previewKeyOf(course.sourceIndex),
        course,
        // 精确重复默认不勾选，其余默认勾选
        selected: duplicateKind !== 'exact',
        duplicateKind,
        conflicts: conflicts[index] || [],
        diagnostics: [...course.diagnostics, ...courseColorWarnings],
        colorOverride: colorMap.get(course.sourceIndex) || DEFAULT_COURSE_COLOR
      }
    })

    stage.value = 'preview'
  }

  /** 勾选 / 取消勾选单条课程 */
  const toggleSelected = (key: string) => {
    previewCourses.value = previewCourses.value.map((item) =>
      item.key === key ? { ...item, selected: !item.selected } : item
    )
  }

  /** 全选 / 全不选（精确重复不参与全选） */
  const setAllSelected = (selected: boolean) => {
    previewCourses.value = previewCourses.value.map((item) => {
      if (item.duplicateKind === 'exact') return { ...item, selected: false }
      return { ...item, selected }
    })
  }

  /**
   * 修改某条课程颜色。
   * 按 #818 规则：同课程名的所有条目同步更新（用户 override 优先级最高）。
   */
  const changeCourseColor = (item: ImportPreviewCourse, color: string) => {
    const courses = previewCourses.value.map((entry) => entry.course)
    const next = setCourseGroupColor(courses, currentColorMap(), item.course.name, color)
    applyColorMap(next)
  }

  /** 使用 AI 推荐配色（AI 合法色优先，缺失走均衡兜底） */
  const useAiRecommendedColors = () => {
    const courses = previewCourses.value.map((entry) => entry.course)
    applyColorMap(resetImportColors(courses, existingColors.value))
  }

  /** 强制均衡配色（忽略 AI 候选色，全部由算法分配） */
  const useBalancedColors = () => {
    const courses = previewCourses.value.map((entry) => ({ ...entry.course, requestedColor: undefined }))
    applyColorMap(assignImportColors(courses, existingColors.value))
  }

  /** 重置配色：回到本批次初始策略 */
  const resetColors = () => {
    useAiRecommendedColors()
  }

  /** 当前是否存在可提交条目 */
  const hasImportable = computed(() =>
    previewCourses.value.some((item) => item.selected && item.duplicateKind !== 'exact')
  )

  /**
   * 确认导入：提交勾选项 → 统一 refresh 一次 → 展示 added/skipped/failed 汇总。
   * 失败时保留预览态，允许用户修正后重试。
   */
  const commitImport = async () => {
    const sid = String(props.studentId || '').trim()
    if (!sid) {
      showToast(t('schedule.import.toast.needLogin'), 'error')
      return
    }
    const target = String(targetSemester.value || '').trim()
    if (!target) {
      showToast(t('schedule.import.toast.needSemester'), 'error')
      return
    }
    if (!hasImportable.value) {
      showToast(t('schedule.import.toast.nothingToImport'), 'warning')
      return
    }
    if (committing.value) return
    committing.value = true
    try {
      const result = await commitImportCourses(previewCourses.value, {
        apiBase: API_BASE,
        studentId: sid,
        semester: target
      })
      importResult.value = result
      // 统一刷新一次课表视图（不在循环内逐条刷新）
      await editor.refreshCustomCourseViews(target)
      stage.value = 'result'
      if (result.failed > 0) {
        showToast(
          t('schedule.import.toast.partial').replace('{a}', String(result.added)).replace('{f}', String(result.failed)),
          'warning',
          4500
        )
      } else {
        showToast(t('schedule.import.toast.success').replace('{n}', String(result.added)), 'success')
      }
    } catch (error) {
      showToast(String((error as any)?.message || t('schedule.import.toast.commitFailed')), 'error')
    } finally {
      committing.value = false
    }
  }

  return {
    // 状态
    showImportDialog,
    stage,
    targetSemester,
    rawText,
    showExample,
    parsing,
    committing,
    parseError,
    globalDiagnostics,
    previewCourses,
    importResult,
    summary,
    hasImportable,
    // 课表预览（#821）
    previewMode,
    previewWeek,
    previewTotalWeeks,
    previewWeekDates,
    previewGetCoursesForDay,
    previewConflictsOf,
    // 动作
    openImportDialog,
    closeImportDialog,
    backToInput,
    copyPrompt,
    handleFileChange,
    parseText,
    toggleSelected,
    setAllSelected,
    changeCourseColor,
    useAiRecommendedColors,
    useBalancedColors,
    resetColors,
    setPreviewMode,
    setPreviewWeek,
    prevPreviewWeek,
    nextPreviewWeek,
    commitImport
  }
}

export type ScheduleImport = ReturnType<typeof useScheduleImport>
