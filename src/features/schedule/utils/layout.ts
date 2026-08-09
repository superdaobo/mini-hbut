/**
 * 课表领域 - 布局派生纯函数。
 * 原内联于 ScheduleView.vue（数据预处理/课程合并/冲突块/整周配色/卡片样式），
 * 拆分后保持算法与行为完全一致。
 */
import { MAX_PERIOD, courseThemes } from '../constants'
import {
  contrastTextForHex,
  mixHexWithWhite,
  normalizeOptionalCourseColor
} from '../../../utils/course_color'
import { hashText, pickBestThemeCandidate } from './colors'

/**
 * 数据预处理：按星期、节次排序后原样返回（渲染级合并由 mergeDailyCourses 完成）。
 * 与原始 processScheduleData 完全一致。
 */
export const processScheduleData = (courses: any): any[] => {
  if (!courses || courses.length === 0) return []
  courses.sort((a: any, b: any) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday
    return a.period - b.period
  })
  return courses
}

/** 节次区间重叠判断 */
export const periodsOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean => {
  return !(aEnd < bStart || bEnd < aStart)
}

/** 两课程是否在时间/空间上相邻（用于配色约束） */
export const areAdjacentCourses = (a: any, b: any): boolean => {
  if (a._day === b._day) {
    return a._end + 1 === b._start || b._end + 1 === a._start
  }
  if (Math.abs(a._day - b._day) === 1) {
    return periodsOverlap(a._start, a._end, b._start, b._end)
  }
  return false
}

/** 课程合并签名：id/名称/教师/教室/校区/教学班/是否自定义 */
export const getCourseMergeSignature = (course: any): string => {
  const id = String(course?.id || course?.source_id || '').trim()
  const name = String(course?.name || '').trim()
  const teacher = String(course?.teacher || '').trim()
  const room = String(course?.room_code || course?.room || '').trim()
  const building = String(course?.building || '').trim()
  const className = String(course?.class_name || '').trim()
  const custom = course?.is_custom ? '1' : '0'
  return `${id}|${name}|${teacher}|${room}|${building}|${className}|${custom}`
}

/** 课程结束节次（受 MAX_PERIOD 钳制） */
export const getCourseEndPeriod = (course: any): number => {
  const start = Number(course?.period) || 1
  const span = Math.max(1, Number(course?.djs) || 1)
  return Math.min(MAX_PERIOD, start + span - 1)
}

/** 合并同一天内的课程实例（连续单节同名课程合并为一段） */
export const mergeDailyCourses = (dailyCourses: any[]): any[] => {
  if (!dailyCourses.length) return []
  const signatureCount = new Map<string, number>()
  dailyCourses.forEach((course) => {
    const signature = getCourseMergeSignature(course)
    signatureCount.set(signature, (signatureCount.get(signature) || 0) + 1)
  })

  const resolveRawSpan = (course: any): number => {
    const start = Number(course?.period) || 1
    if (course?.is_custom) {
      return Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course?.djs) || 1))
    }
    const signature = getCourseMergeSignature(course)
    const count = Number(signatureCount.get(signature) || 0)
    if (count > 1) {
      return 1
    }
    const candidate = Number(course?.djs) || 1
    if (candidate >= 1 && candidate <= MAX_PERIOD && start + candidate - 1 <= MAX_PERIOD) {
      return candidate
    }
    return 1
  }

  const merged: any[] = []
  let i = 0

  while (i < dailyCourses.length) {
    const current = dailyCourses[i]
    const startPeriod = Number(current.period) || 1
    const currentSpan = resolveRawSpan(current)
    let endPeriod = Math.min(MAX_PERIOD, startPeriod + currentSpan - 1)

    let j = i + 1
    while (j < dailyCourses.length) {
      const next = dailyCourses[j]
      const nextStart = Number(next.period) || 1
      const nextSpan = resolveRawSpan(next)
      const nextEnd = Math.min(MAX_PERIOD, nextStart + nextSpan - 1)
      const sameSignature = getCourseMergeSignature(next) === getCourseMergeSignature(current)
      const canMergeSinglePeriodOnly = currentSpan === 1 && nextSpan === 1
      if (
        sameSignature &&
        canMergeSinglePeriodOnly &&
        !!next.is_custom === !!current.is_custom &&
        nextStart === endPeriod + 1
      ) {
        endPeriod = Math.max(endPeriod, nextEnd)
        j++
      } else {
        break
      }
    }

    const span = endPeriod - startPeriod + 1
    merged.push({
      ...current,
      djs: span
    })
    i = j
  }
  return merged
}

/**
 * 构建冲突块：将同一节次上多门课折叠为一张「课程冲突」卡片。
 * 与原 buildConflictBlocks 一致；fallbackSemester 用于补全冲突课程的学期字段。
 */
export const buildConflictBlocks = (day: number, mergedCourses: any[], weekNumber: number, fallbackSemester = ''): any[] => {
  if (!Array.isArray(mergedCourses) || mergedCourses.length < 2) return []
  const periodConflicts: any[] = []

  for (let period = 1; period <= 11; period += 1) {
    const activeRaw = mergedCourses.filter((course) => {
      const start = Number(course._start || course.period || 1)
      const span = Math.max(1, Number(course.djs || 1))
      const end = Number(course._end || (start + span - 1))
      return period >= start && period <= end && !course.is_conflict
    })
    const active: any[] = []
    const signatureSet = new Set<string>()
    activeRaw.forEach((course) => {
      const signature = `${getCourseMergeSignature(course)}|${course.period}|${course.djs}`
      if (signatureSet.has(signature)) return
      signatureSet.add(signature)
      active.push(course)
    })
    if (active.length > 1) {
      const ids = active
        .map((course) => String(course._uid || course.id || course.name))
        .sort()
      periodConflicts.push({
        period,
        key: ids.join('|'),
        active
      })
    }
  }

  if (!periodConflicts.length) return []

  const blocks: any[] = []
  let i = 0
  while (i < periodConflicts.length) {
    const current = periodConflicts[i]
    let end = current.period
    let j = i + 1
    while (
      j < periodConflicts.length &&
      periodConflicts[j].period === end + 1 &&
      periodConflicts[j].key === current.key
    ) {
      end = periodConflicts[j].period
      j += 1
    }
    const conflictCourses = current.active
    const title = `课程冲突（${conflictCourses.length}门）`
    blocks.push({
      id: `conflict:${day}:${current.period}:${end}:${current.key}`,
      name: title,
      teacher: '',
      room: '点击查看冲突详情',
      room_code: `${conflictCourses.length}门冲突`,
      building: '冲突提示',
      weekday: day,
      period: current.period,
      djs: end - current.period + 1,
      weeks: [weekNumber],
      weeks_text: String(weekNumber),
      credit: '',
      class_name: '冲突课程',
      is_conflict: true,
      conflict_courses: conflictCourses.map((course: any) => ({
        id: course.id,
        source_id: course.source_id || course.id,
        name: course.name,
        teacher: course.teacher,
        room: course.room,
        room_code: course.room_code,
        building: course.building,
        weekday: course.weekday,
        period: course.period,
        djs: course.djs,
        weeks: Array.isArray(course.weeks) ? [...course.weeks] : [],
        weeks_text: course.weeks_text,
        credit: course.credit,
        class_name: course.class_name,
        semester: course.semester || fallbackSemester || '',
        is_custom: !!course.is_custom
      }))
    })
    i = j
  }

  return blocks
}

/**
 * 构建某一周所有天的课程（含合并与冲突块），并完成整周配色分配。
 * 与原 buildWeekCoursesWithColors 一致。
 */
export const buildWeekCoursesWithColors = (
  weekNumber: number,
  options: { scheduleData: any[]; fallbackSemester?: string }
): Record<number, any[]> => {
  const { scheduleData, fallbackSemester = '' } = options || {}
  const source = Array.isArray(scheduleData) ? scheduleData : []
  const byDay: Record<number, any[]> = {}
  const nodes: any[] = []
  const nameBuckets = new Map<string, any[]>()

  for (let day = 1; day <= 7; day += 1) {
    const dailyCourses = source
      .filter((course) => course.weekday === day && course.weeks.includes(weekNumber))
      .sort((a, b) => a.period - b.period)

    const merged = mergeDailyCourses(dailyCourses).map((course, index) => {
      const span = Math.max(1, Number(course.djs) || 1)
      const start = Number(course.period)
      const end = Math.min(MAX_PERIOD, start + span - 1)
      return {
        ...course,
        _day: day,
        _start: start,
        _end: end,
        _uid: `${day}-${start}-${end}-${course.name}-${index}`
      }
    })

    const conflicts = buildConflictBlocks(day, merged, weekNumber, fallbackSemester)
    byDay[day] = [...merged, ...conflicts]
    merged.forEach((node) => {
      nodes.push(node)
      const nameKey = String(node.name || '')
      if (!nameBuckets.has(nameKey)) {
        nameBuckets.set(nameKey, [])
      }
      nameBuckets.get(nameKey)!.push(node)
    })
  }

  if (!nodes.length) return byDay

  // 颜色规则：
  // 1) 同名课程在整周内使用同一配色。
  // 2) 仅当课程名称不同且在时间/空间上相邻时，配色必须不同。
  const nameNeighbors = new Map([...nameBuckets.keys()].map((name) => [name, new Set<string>()]))
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]
      const b = nodes[j]
      const nameA = String(a.name || '')
      const nameB = String(b.name || '')
      if (nameA !== nameB && areAdjacentCourses(a, b)) {
        nameNeighbors.get(nameA)?.add(nameB)
        nameNeighbors.get(nameB)?.add(nameA)
      }
    }
  }

  const orderedNames = [...nameBuckets.keys()].sort((a, b) => {
    const degreeDiff = (nameNeighbors.get(b)?.size || 0) - (nameNeighbors.get(a)?.size || 0)
    if (degreeDiff !== 0) return degreeDiff
    return hashText(a) - hashText(b)
  })

  const colorByName = new Map<string, number>()
  const globallyUsedColors = new Set<number>()
  const allCandidates = Array.from({ length: courseThemes.length }, (_, i) => i)
  orderedNames.forEach((name) => {
    const neighborColorSet = new Set<number>()
    nameNeighbors.get(name)?.forEach((neighborName) => {
      if (!colorByName.has(neighborName)) return
      const neighborColor = colorByName.get(neighborName)!
      neighborColorSet.add(neighborColor)
    })
    const neighborColors = [...neighborColorSet]
    const globalColors = [...globallyUsedColors]

    const seed = hashText(name) % courseThemes.length
    const uniqueCandidates = allCandidates.filter(
      (candidate) => !globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
    )
    const reusableCandidates = allCandidates.filter(
      (candidate) => globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
    )
    const noNeighborConflictCandidates = allCandidates.filter(
      (candidate) => !neighborColorSet.has(candidate)
    )

    let chosen = pickBestThemeCandidate(uniqueCandidates, seed, neighborColors, globalColors)
    if (chosen === null) {
      chosen = pickBestThemeCandidate(reusableCandidates, seed, neighborColors, globalColors)
    }
    if (chosen === null) {
      chosen = pickBestThemeCandidate(noNeighborConflictCandidates, seed, neighborColors, globalColors)
    }
    if (chosen === null) {
      chosen = pickBestThemeCandidate(allCandidates, seed, neighborColors, globalColors)
    }
    if (chosen === null) chosen = seed
    colorByName.set(name, chosen)
    globallyUsedColors.add(chosen)
  })

  for (let day = 1; day <= 7; day += 1) {
    byDay[day] = (byDay[day] || []).map((course) => ({
      ...course,
      colorIndex: course.is_conflict
        ? 0
        : (colorByName.get(String(course.name || '')) ?? 0)
    }))
  }

  return byDay
}

/**
 * 计算课程卡片的内联样式（CSS 变量 + grid 定位）。
 * 与原 getCourseStyle 一致；cardStyle 取 modern/traditional/class。
 */
export const getCourseStyle = (course: any, cardStyle: string): Record<string, any> => {
  if (!course) return {}
  const start = Number(course.period) || 1
  const span = Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course.djs) || 1))
  const isTraditionalCard = cardStyle === 'traditional'
  const isClassCard = cardStyle === 'class'
  const modernRadius = '14px'
  const traditionalRadius = '12px'
  const classRadius = '12px'
  if (course.is_conflict) {
    return {
      '--course-bg': isTraditionalCard
        ? '#fef2f2'
        : (isClassCard
          ? 'rgba(254, 242, 242, 0.96)'
          : 'repeating-linear-gradient(135deg, #fff1f2 0, #fff1f2 8px, #ffe4e6 8px, #ffe4e6 16px)'),
      '--course-text': isTraditionalCard ? '#b91c1c' : '#b91c1c',
      '--course-border': isTraditionalCard ? '#fecaca' : '#dc2626',
      '--course-shadow': isTraditionalCard
        ? '0 2px 8px rgba(220, 38, 38, 0.08)'
        : (isClassCard
          ? '0 6px 14px rgba(220, 38, 38, 0.16)'
          : '0 8px 18px rgba(220, 38, 38, 0.2)'),
      '--course-span': String(span),
      '--course-radius': isTraditionalCard ? traditionalRadius : (isClassCard ? classRadius : modernRadius),
      '--course-border-width': isClassCard ? '1px' : '2px',
      gridRow: `${start} / span ${span}`,
      gridColumn: '1',
      zIndex: 4
    }
  }

  let index = 0
  if (course.colorIndex !== undefined) {
    index = course.colorIndex
  } else {
    let hash = 0
    for (let i = 0; i < course.name.length; i++) {
      hash = course.name.charCodeAt(i) + ((hash << 5) - hash)
    }
    index = Math.abs(hash) % courseThemes.length
  }

  const theme = courseThemes[index]
  const isCustom = !!course.is_custom
  // #470：自定义课若有用户色则优先使用，不再强制纯黑
  const userColor = isCustom ? normalizeOptionalCourseColor(course.color) : null
  const hasUserColor = !!(userColor && userColor.length)
  const borderColor = hasUserColor
    ? userColor
    : (isCustom ? '#111111' : (theme.border || '#cbd5e1'))
  const traditionalBackground = hasUserColor
    ? mixHexWithWhite(userColor, 0.22)
    : (isCustom ? '#111111' : theme.bg)
  const traditionalText = hasUserColor
    ? contrastTextForHex(traditionalBackground)
    : (isCustom ? '#ffffff' : theme.text)
  const modernText = hasUserColor ? userColor : theme.text
  const modernBackground = 'rgba(255, 255, 255, 0.92)'
  const classBackground = 'rgba(255, 255, 255, 0.94)'
  const normalShadow = isCustom
    ? '0 7px 16px rgba(15, 23, 42, 0.24)'
    : '0 6px 14px rgba(71, 85, 105, 0.16)'
  const traditionalShadow = '0 2px 8px rgba(0, 0, 0, 0.04)'
  const classShadow = isCustom
    ? '0 6px 14px rgba(15, 23, 42, 0.2)'
    : '0 4px 10px rgba(71, 85, 105, 0.14)'

  return {
    '--course-bg': isTraditionalCard ? traditionalBackground : (isClassCard ? classBackground : modernBackground),
    '--course-text': isTraditionalCard ? traditionalText : modernText,
    '--course-border': borderColor,
    '--course-shadow': isTraditionalCard ? traditionalShadow : (isClassCard ? classShadow : normalShadow),
    '--course-span': String(span),
    '--course-radius': isTraditionalCard ? traditionalRadius : (isClassCard ? classRadius : modernRadius),
    '--course-border-width': isClassCard ? '1px' : (isCustom ? '2px' : '1px'),
    gridRow: `${start} / span ${span}`,
    gridColumn: '1',
    zIndex: 1
  }
}
