/**
 * 课表领域 - 导入导出/文件操作工具函数。
 * 原内联于 ScheduleView.vue（JSON 下载/保存/分享/解析/便携化）。
 */
import { DEFAULT_COURSE_COLOR, normalizeOptionalCourseColor } from '../../../utils/course_color'
import { invokeNative, isTauriRuntime } from '../../../platform/native'
import { isMobileLike } from '../../../platform/runtime'
import { normalizeCustomCourse } from './course'
import { normalizeWeeks } from './weeks'

/** 触发浏览器下载（Blob + a[download]） */
export const triggerTextFileDownload = (fileName: string, content: any, mimeType = 'application/json;charset=utf-8'): boolean => {
  try {
    const blob = new Blob([content], { type: mimeType })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(href)
    return true
  } catch {
    return false
  }
}

/** 内容编码为 base64（UTF-8 安全，分块避免栈溢出） */
export const encodeBase64Utf8 = (content: any): string => {
  const bytes = new TextEncoder().encode(String(content || ''))
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

/** 通过 File System Access API 保存 JSON（桌面 Web） */
export const saveJsonByFilePicker = async (fileName: string, content: string): Promise<{ ok: boolean; canceled: boolean; location: string }> => {
  if (typeof window.showSaveFilePicker !== 'function') {
    return { ok: false, canceled: false, location: '' }
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [
        {
          description: 'JSON 文件',
          accept: {
            'application/json': ['.json']
          }
        }
      ]
    })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    return {
      ok: true,
      canceled: false,
      location: handle?.name ? `已保存：${handle.name}` : '已保存到所选位置'
    }
  } catch (error) {
    if (String((error as any)?.name || '').trim() === 'AbortError') {
      return { ok: true, canceled: true, location: '已取消保存' }
    }
    return { ok: false, canceled: false, location: '' }
  }
}

/** 通过 Tauri 原生导出保存 JSON */
export const saveJsonByNativeExport = async (fileName: string, content: string): Promise<{ ok: boolean; canceled: boolean; location: string }> => {
  if (!isTauriRuntime()) {
    return { ok: false, canceled: false, location: '' }
  }
  try {
    const payload = await invokeNative('save_export_file', {
      req: {
        fileName,
        mimeType: 'application/json',
        contentBase64: encodeBase64Utf8(content),
        preferMedia: false
      }
    })
    const path = String(payload?.path || '').trim()
    return {
      ok: true,
      canceled: false,
      location: path || '已保存到本地导出目录'
    }
  } catch (error) {
    const message = String((error as any)?.message || error || '')
    if (message.includes('取消')) {
      return { ok: true, canceled: true, location: '已取消保存' }
    }
    return { ok: false, canceled: false, location: '' }
  }
}

/** 是否疑似移动端：iOS/Android 统一收敛 runtime.ts；Mobile/HarmonyOS 关键字为业务特定补充 */
export const isLikelyMobileDevice = (): boolean =>
  isMobileLike() || /Mobile|HarmonyOS/i.test(String(navigator.userAgent || ''))

/** 通过 Web Share API 分享 JSON 文件 */
export const shareCustomCoursesJson = async (fileName: string, content: string): Promise<{ ok: boolean; canceled: boolean }> => {
  try {
    if (!navigator.share || typeof File === 'undefined') return { ok: false, canceled: false }
    const file = new File([content], fileName, { type: 'application/json' })
    await navigator.share({
      title: 'Mini-HBUT 自定义课程备份',
      text: '自定义课程 JSON 备份',
      files: [file]
    })
    return { ok: true, canceled: false }
  } catch (error) {
    if (String((error as any)?.name || '').trim() === 'AbortError') {
      return { ok: true, canceled: true }
    }
    return { ok: false, canceled: false }
  }
}

/** 课程便携化：仅保留可导入字段 */
export const toPortableCustomCourse = (course: any, fallbackSemester = ''): any => {
  const normalized = normalizeCustomCourse(course, fallbackSemester)
  if (!normalized?.name) return null
  return {
    id: normalized.source_id || normalized.id || '',
    source_id: normalized.source_id || normalized.id || '',
    semester: normalized.semester || '',
    name: normalized.name || '',
    teacher: normalized.teacher || '',
    room: normalized.room || '',
    weekday: Number(normalized.weekday || 1),
    period: Number(normalized.period || 1),
    djs: Number(normalized.djs || 1),
    weeks: normalizeWeeks(normalized.weeks),
    color: normalized.color || DEFAULT_COURSE_COLOR
  }
}

/** 读取文件文本（File.text 优先，回退 FileReader） */
export const readTextFromFile = async (file: any): Promise<string> => {
  if (!file) return ''
  if (typeof file.text === 'function') {
    return await file.text()
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file, 'utf-8')
  })
}

/** 解析导入的单条课程记录；非法时抛错（错误信息含条目标记） */
export const parseImportedCustomCourse = (item: any, index: number): Record<string, any> => {
  if (!item || typeof item !== 'object') {
    throw new Error(`第 ${index + 1} 条课程数据格式错误`)
  }
  const semesterValue = String(item.semester || '').trim()
  const nameValue = String(item.name || '').trim()
  const teacherValue = String(item.teacher || '').trim()
  const roomValue = String(item.room || '').trim()
  const sourceId = String(item.source_id || item.id || '').trim()
  const weekdayValue = Number(item.weekday)
  const periodValue = Number(item.period)
  const djsValue = Number(item.djs)
  const weeksValue = normalizeWeeks(item.weeks)

  if (!semesterValue) throw new Error(`第 ${index + 1} 条课程缺少 semester`)
  if (!nameValue) throw new Error(`第 ${index + 1} 条课程缺少 name`)
  if (!Number.isFinite(weekdayValue) || weekdayValue < 1 || weekdayValue > 7) {
    throw new Error(`第 ${index + 1} 条课程 weekday 不合法`)
  }
  if (!Number.isFinite(periodValue) || periodValue < 1 || periodValue > 11) {
    throw new Error(`第 ${index + 1} 条课程 period 不合法`)
  }
  const maxSpan = Math.max(1, 12 - periodValue)
  if (!Number.isFinite(djsValue) || djsValue < 1 || djsValue > maxSpan) {
    throw new Error(`第 ${index + 1} 条课程 djs 不合法（最多 ${maxSpan}）`)
  }
  if (!weeksValue.length) throw new Error(`第 ${index + 1} 条课程 weeks 不能为空`)
  const colorNorm = normalizeOptionalCourseColor(item.color)
  // 缺 color / 非法 color：导入时按未设定处理，兼容旧 JSON
  const colorValue = colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm

  return {
    source_id: sourceId,
    semester: semesterValue,
    name: nameValue,
    teacher: teacherValue,
    room: roomValue,
    color: colorValue,
    weekday: weekdayValue,
    period: periodValue,
    djs: djsValue,
    weeks: weeksValue
  }
}
