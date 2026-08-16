/**
 * 课表领域 - 导入导出组合式函数（JSON 备份 + 日历导出）。
 * 原内联于 ScheduleView.vue（导出/导入/分享/日历事件），拆分后行为一致。
 */
import { nextTick, ref } from 'vue'
import axios from 'axios'
import { showToast } from '../../../utils/toast'
import { DEFAULT_COURSE_COLOR } from '../../../utils/course_color'
import {
  copyTextWithFallback
} from '../utils/formatters'
import {
  createTimestampSuffix,
  buildExportEventsForSemester,
  buildExportEventsForWeek
} from '../utils/calendar'
import {
  isLikelyMobileDevice,
  readTextFromFile,
  saveJsonByFilePicker,
  saveJsonByNativeExport,
  shareCustomCoursesJson,
  toPortableCustomCourse,
  triggerTextFileDownload,
  parseImportedCustomCourse
} from '../utils/io'
import { normalizeCustomCourse } from '../utils/course'
import type { ScheduleConfirmDialog } from './useConfirmDialog'
import type { ScheduleData } from './useScheduleData'
import type { ScheduleEditor } from './useScheduleEditor'
import type { ScheduleSemester } from './useScheduleSemester'

export interface ScheduleIOOptions {
  props: any
  data: ScheduleData
  semester: ScheduleSemester
  editor: ScheduleEditor
  confirmDialog: ScheduleConfirmDialog
}

export const useScheduleIO = (options: ScheduleIOOptions) => {
  const { props, data, semester, editor, confirmDialog } = options
  const { askConfirm } = confirmDialog

  const exporting = ref(false)
  const exportingMode = ref('')
  const exportUrl = ref('')
  const exportError = ref('')
  const exportCopied = ref(false)
  const customCourseExporting = ref(false)
  const customCourseImporting = ref(false)
  const customCourseExportLocation = ref('')
  const customCourseFileInput = ref<any>(null)

  const API_BASE = import.meta.env.VITE_API_BASE || '/api'

  /** 导出全部自定义课程为 JSON 文件（Picker → 分享 → 原生导出 → 下载 → 剪贴板） */
  const exportCustomCoursesJson = async () => {
    const sid = String(props.studentId || '').trim()
    if (!sid) {
      showToast('请先登录后再导出自定义课程', 'error')
      return
    }
    if (customCourseExporting.value) return
    customCourseExporting.value = true
    customCourseExportLocation.value = ''
    try {
      const res = await axios.post(`${API_BASE}/v2/schedule/custom/list_all`, {
        student_id: sid
      })
      if (!res.data?.success) {
        throw new Error(res.data?.error || '导出自定义课程失败')
      }
      const list = Array.isArray(res.data?.data) ? res.data.data : []
      const courses = list.map((item: any) => toPortableCustomCourse(item, semester.semester.value || '')).filter(Boolean)
      const payload = {
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        student_id: sid,
        courses
      }
      const content = JSON.stringify(payload, null, 2)
      const fileName = `mini-hbut-custom-courses-${createTimestampSuffix()}.json`

      const pickerResult = await saveJsonByFilePicker(fileName, content)
      if (pickerResult.ok) {
        customCourseExportLocation.value = pickerResult.location
        if (!pickerResult.canceled) {
          showToast(`已导出 ${courses.length} 门自定义课程`, 'success')
        }
        return
      }

      const preferShare = isLikelyMobileDevice()
      const shareResult = preferShare
        ? await shareCustomCoursesJson(fileName, content)
        : { ok: false, canceled: false }
      if (shareResult.ok) {
        customCourseExportLocation.value = shareResult.canceled ? '已取消保存' : '系统文件保存器/分享面板'
        if (!shareResult.canceled) {
          showToast(`已导出 ${courses.length} 门自定义课程`, 'success')
        }
        return
      }

      const nativeResult = await saveJsonByNativeExport(fileName, content)
      if (nativeResult.ok) {
        customCourseExportLocation.value = nativeResult.location
        if (!nativeResult.canceled) {
          showToast(`已导出 ${courses.length} 门自定义课程`, 'success')
        }
        return
      }

      const fallbackShareResult = preferShare
        ? { ok: false, canceled: false }
        : await shareCustomCoursesJson(fileName, content)
      if (fallbackShareResult.ok) {
        customCourseExportLocation.value = fallbackShareResult.canceled ? '已取消保存' : '系统文件保存器/分享面板'
        if (!fallbackShareResult.canceled) {
          showToast(`已导出 ${courses.length} 门自定义课程`, 'success')
        }
        return
      }

      if (triggerTextFileDownload(fileName, content)) {
        customCourseExportLocation.value = '浏览器默认下载目录'
        showToast(`已导出 ${courses.length} 门自定义课程`, 'success')
        return
      }

      const copied = await copyTextWithFallback(content)
      if (copied) {
        customCourseExportLocation.value = '未生成文件，已复制 JSON 到剪贴板'
        showToast('文件导出失败，已复制 JSON 到剪贴板', 'warning')
        return
      }
      throw new Error('导出失败，请稍后重试')
    } catch (error) {
      showToast(String((error as any)?.message || '导出自定义课程失败'), 'error')
    } finally {
      customCourseExporting.value = false
    }
  }

  /** 触发隐藏文件选择器 */
  const triggerImportCustomCourses = () => {
    if (customCourseImporting.value) return
    customCourseFileInput.value?.click()
  }

  /** 导入自定义课程（合并：同学期同 source_id 更新，否则新增） */
  const importCustomCoursesFromText = async (content = '') => {
    const sid = String(props.studentId || '').trim()
    if (!sid) {
      throw new Error('请先登录后再导入自定义课程')
    }

    let parsed: any
    try {
      parsed = JSON.parse(String(content || ''))
    } catch {
      throw new Error('JSON 解析失败，请检查文件格式')
    }

    const importStudentId = String(parsed?.student_id || '').trim()
    const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.courses) ? parsed.courses : [])
    if (!rows.length) {
      throw new Error('导入文件中没有可用课程数据')
    }

    if (importStudentId && importStudentId !== sid) {
      const confirmed = await askConfirm({
        title: '学号不一致，是否继续导入？',
        lines: [
          `当前登录学号：${sid}`,
          `导入文件学号：${importStudentId}`,
          '继续导入会写入当前登录账号的本地自定义课表。'
        ],
        confirmText: '继续导入',
        cancelText: '取消',
        danger: false
      })
      if (!confirmed) {
        throw new Error('已取消导入')
      }
    }

    const listRes = await axios.post(`${API_BASE}/v2/schedule/custom/list_all`, {
      student_id: sid
    })
    if (!listRes.data?.success) {
      throw new Error(listRes.data?.error || '读取本地课程失败，无法导入')
    }

    const existingList = Array.isArray(listRes.data?.data) ? listRes.data.data : []
    const existingMap = new Map<string, any>()
    existingList.forEach((item: any) => {
      const normalized = normalizeCustomCourse(item, semester.semester.value || '')
      if (!normalized) return
      const sourceId = String(normalized.source_id || normalized.id || '').trim()
      if (!sourceId) return
      existingMap.set(sourceId, normalized)
    })

    let added = 0
    let updated = 0
    let failed = 0

    for (let index = 0; index < rows.length; index += 1) {
      try {
        const course = parseImportedCustomCourse(rows[index], index)
        const existing = course.source_id ? existingMap.get(course.source_id) : null
        if (existing && String(existing.semester || '').trim() === course.semester) {
          const updateRes = await axios.post(`${API_BASE}/v2/schedule/custom/update`, {
            student_id: sid,
            semester: course.semester,
            course_id: course.source_id,
            name: course.name,
            teacher: course.teacher,
            room: course.room,
            weekday: course.weekday,
            period: course.period,
            djs: course.djs,
            weeks: course.weeks,
            color: course.color || DEFAULT_COURSE_COLOR
          })
          if (!updateRes.data?.success) {
            throw new Error(updateRes.data?.error || '更新失败')
          }
          updated += 1
          continue
        }

        const addRes = await axios.post(`${API_BASE}/v2/schedule/custom/add`, {
          student_id: sid,
          semester: course.semester,
          name: course.name,
          teacher: course.teacher,
          room: course.room,
          weekday: course.weekday,
          period: course.period,
          djs: course.djs,
          weeks: course.weeks,
          color: course.color || DEFAULT_COURSE_COLOR
        })
        if (!addRes.data?.success) {
          throw new Error(addRes.data?.error || '新增失败')
        }
        added += 1
      } catch (error) {
        failed += 1
        console.warn('[Schedule] 自定义课程导入失败：', error)
      }
    }

    await editor.refreshCustomCourseViews(String(semester.semester.value || semester.semesterDraft.value || '').trim())
    if (failed > 0) {
      showToast(`导入完成：新增 ${added}，更新 ${updated}，失败 ${failed}`, 'warning', 4500)
    } else {
      showToast(`导入完成：新增 ${added}，更新 ${updated}`, 'success')
    }
  }

  const handleCustomCourseFileChange = async (event: any) => {
    const input = event?.target
    const file = input?.files?.[0]
    if (!file) return
    customCourseImporting.value = true
    try {
      const content = await readTextFromFile(file)
      await importCustomCoursesFromText(content)
    } catch (error) {
      const message = String((error as any)?.message || '导入失败')
      if (message !== '已取消导入') {
        showToast(message, 'error')
      }
    } finally {
      customCourseImporting.value = false
      if (input) input.value = ''
    }
  }

  /** 导出日历（week/semester）到服务端生成 ICS 链接 */
  const exportCalendar = async (mode = 'week') => {
    exportError.value = ''
    exportUrl.value = ''
    exportCopied.value = false
    if (exporting.value) return
    if (!props.studentId) {
      exportError.value = '请先登录后再导出'
      return
    }
    if (!semester.startDateStr.value) {
      exportError.value = '缺少学期开始日期，暂无法导出'
      return
    }
    exportingMode.value = mode
    const events = mode === 'semester'
      ? buildExportEventsForSemester({ startDateStr: semester.startDateStr.value, scheduleData: data.scheduleData.value })
      : buildExportEventsForWeek(Number(semester.selectedWeek.value || 1), { startDateStr: semester.startDateStr.value, scheduleData: data.scheduleData.value })
    if (!events.length) {
      exportError.value = '当前周暂无可导出的课表数据'
      return
    }
    exporting.value = true
    try {
      const uploadEndpoint = String(localStorage.getItem('hbu_temp_upload_endpoint') || '').trim()
      const payload: any = {
        student_id: props.studentId,
        semester: semester.semester.value,
        week: semester.selectedWeek.value,
        events
      }
      if (uploadEndpoint) {
        payload.upload_endpoint = uploadEndpoint
      }
      const res = await axios.post(`${API_BASE}/v2/schedule/export_calendar`, payload)
      if (res.data?.success) {
        exportUrl.value = res.data.url || ''
        if (!exportUrl.value) {
          exportError.value = '导出成功但未返回链接'
        } else {
          showToast('日历导出成功，复制链接用浏览器打开即可导入', 'success', 3000)
          // 自动滚动 Drawer 到底部，保证导出结果可见
          nextTick(() => {
            const panel = document.querySelector('.drawer-panel')
            if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: 'smooth' })
          })
        }
      } else {
        exportError.value = res.data?.error || '导出失败'
      }
    } catch (e) {
      exportError.value = (e as any)?.response?.data?.error || (e as any)?.message || '导出失败'
    } finally {
      exporting.value = false
      exportingMode.value = ''
    }
  }

  const copyExportUrl = async () => {
    if (!exportUrl.value) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportUrl.value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = exportUrl.value
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      exportCopied.value = true
      setTimeout(() => { exportCopied.value = false }, 2000)
    } catch (e) {
      exportError.value = '复制失败，请手动复制'
    }
  }

  return {
    exporting,
    exportingMode,
    exportUrl,
    exportError,
    exportCopied,
    customCourseExporting,
    customCourseImporting,
    customCourseExportLocation,
    customCourseFileInput,
    exportCustomCoursesJson,
    triggerImportCustomCourses,
    importCustomCoursesFromText,
    handleCustomCourseFileChange,
    exportCalendar,
    copyExportUrl
  }
}

export type ScheduleIO = ReturnType<typeof useScheduleIO>
