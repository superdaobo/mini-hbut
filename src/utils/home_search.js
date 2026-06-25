const SERVICE_ALIASES = Object.freeze({
  grades: ['成绩', '分数', '绩点', '绩点查询', '成绩查询'],
  classroom: ['空教室', '教室', '自习室'],
  electricity: ['电费', '宿舍电费', '余额'],
  transactions: ['交易', '消费', '一卡通', '一码通'],
  exams: ['考试', '考试安排', '考场'],
  ranking: ['排名', '绩点排名', '专业排名'],
  campus_code: ['校园码', '二维码', '一码通'],
  calendar: ['校历', '日历', '学期'],
  school_inbox: ['消息', '通知', '公告', '收件箱', '学习通消息', '教务消息'],
  academic: ['学业', '学分', '完成度'],
  qxzkb: ['全校课表', '课程', '排课'],
  course_selection: ['选课', '退课', '通识课'],
  training: ['培养方案', '方案', '课程设置'],
  library: ['图书', '图书馆', '馆藏'],
  campus_map: ['地图', '校园地图', '导航'],
  resource_share: ['资料', '文件', '分享', '下载'],
  towergo: ['小塔', '小塔出行', '出行', '电动车', '电单车', '骑行', '骑车', '单车', '扫码用车'],
  ai: ['AI', '助手', '校园助手']
})

const safeText = (value) => String(value ?? '').trim()
const normalizeText = (value) => safeText(value).toLowerCase().replace(/\s+/g, '')
const includesQuery = (value, query) => normalizeText(value).includes(query)
const toPositiveInt = (value, fallback = 0) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return fallback
  return Math.floor(num)
}

const WEEKDAY_LABELS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
const isOrderedCharMatch = (value, query) => {
  const normalized = normalizeText(value)
  if (!normalized || !query) return false
  let cursor = 0
  for (const char of query) {
    cursor = normalized.indexOf(char, cursor)
    if (cursor < 0) return false
    cursor += 1
  }
  return true
}

const scoreText = (value, query, weight) => {
  const normalized = normalizeText(value)
  if (!normalized || !query) return 0
  if (normalized === query) return weight + 40
  if (normalized.startsWith(query)) return weight + 20
  if (normalized.includes(query)) return weight
  if (isOrderedCharMatch(normalized, query)) return Math.max(1, weight - 18)
  return 0
}

const scoreService = (module, query) => {
  const aliases = [
    ...(Array.isArray(module?.aliases) ? module.aliases : []),
    ...(SERVICE_ALIASES[module?.id] || [])
  ]
  return Math.max(
    scoreText(module?.name, query, 120),
    scoreText(module?.desc || module?.description, query, 70),
    scoreText(module?.id, query, 45),
    ...aliases.map((alias) => scoreText(alias, query, 95))
  )
}

const normalizeNoticeSummary = (notice) =>
  safeText(notice?.summary || notice?.description || notice?.content || '')

const byScoreThenTitle = (a, b) => {
  if (b.score !== a.score) return b.score - a.score
  return safeText(a.title).localeCompare(safeText(b.title), 'zh-Hans-CN')
}

const normalizeWeeks = (weeks) => {
  if (!Array.isArray(weeks)) return []
  return weeks.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
}

const getCoursePeriodRange = (course) => {
  const startPeriod = toPositiveInt(course?.period ?? course?.start_period, 0)
  if (startPeriod < 1 || startPeriod > 99) return null
  const endByField = toPositiveInt(course?.end_period, 0)
  const span = Math.max(1, toPositiveInt(course?.djs ?? course?.duration, 1))
  const computedEnd = endByField > 0 ? endByField : startPeriod + span - 1
  const endPeriod = Math.max(startPeriod, computedEnd)
  return { startPeriod, endPeriod }
}

const resolvePeriodTime = (periodTimeMap, period, field, fallback) =>
  safeText(periodTimeMap?.[period]?.[field] || fallback)

const getWeeklyCourseSignature = (course, room, teacher, weekday) => {
  const name = safeText(course?.name)
  const className = safeText(course?.class_name)
  const building = safeText(course?.building)
  const custom = course?.is_custom ? '1' : '0'
  return normalizeText(`${weekday}|${name}|${teacher}|${room}|${className}|${building}|${custom}`)
}

export const buildWeeklyCourseSearchEntries = ({
  courses = [],
  currentWeek = 1,
  periodTimeMap = {}
} = {}) => {
  const safeWeek = toPositiveInt(currentWeek, 1)
  const normalized = (Array.isArray(courses) ? courses : [])
    .filter((course) => {
      const name = safeText(course?.name)
      const weekday = toPositiveInt(course?.weekday, 0)
      const weeks = normalizeWeeks(course?.weeks)
      return name && weekday >= 1 && weekday <= 7 && (weeks.length === 0 || weeks.includes(safeWeek))
    })
    .map((course) => {
      const range = getCoursePeriodRange(course)
      if (!range) return null
      const weekday = toPositiveInt(course?.weekday, 0)
      const room = safeText(course?.room_code || course?.room || '-')
      const teacher = safeText(course?.teacher || '-')
      return {
        ...course,
        weekday,
        weekdayLabel: WEEKDAY_LABELS[weekday] || `周${weekday}`,
        startPeriod: range.startPeriod,
        endPeriod: range.endPeriod,
        room,
        teacher,
        signature: getWeeklyCourseSignature(course, room, teacher, weekday)
      }
    })
    .filter(Boolean)
    .sort((a, b) =>
      a.weekday - b.weekday ||
      a.startPeriod - b.startPeriod ||
      a.endPeriod - b.endPeriod ||
      safeText(a.name).localeCompare(safeText(b.name), 'zh-Hans-CN')
    )

  const merged = []
  let index = 0
  while (index < normalized.length) {
    const current = normalized[index]
    let endPeriod = current.endPeriod
    let nextIndex = index + 1
    while (nextIndex < normalized.length) {
      const next = normalized[nextIndex]
      if (next.signature === current.signature && next.startPeriod <= endPeriod + 1) {
        endPeriod = Math.max(endPeriod, next.endPeriod)
        nextIndex += 1
        continue
      }
      break
    }

    const startText = resolvePeriodTime(periodTimeMap, current.startPeriod, 'start', safeText(current.start))
    const endText = resolvePeriodTime(periodTimeMap, endPeriod, 'end', safeText(current.end))
    const dedupeKey = normalizeText([
      safeWeek,
      current.weekday,
      current.name,
      current.teacher,
      current.room,
      current.startPeriod,
      endPeriod
    ].join('|'))
    merged.push({
      key: `week-${safeWeek}-${current.weekday}-${current.startPeriod}-${endPeriod}-${current.name}-${current.room}-${current.teacher}`,
      dedupeKey,
      name: current.name,
      room: current.room,
      teacher: current.teacher,
      weekday: current.weekday,
      weekdayLabel: current.weekdayLabel,
      startPeriod: current.startPeriod,
      endPeriod,
      start: startText,
      end: endText
    })
    index = nextIndex
  }
  return merged
}

const dedupeSearchItems = (items) => {
  const map = new Map()
  for (const item of items) {
    const key = safeText(item?.dedupeKey || item?.id)
    if (!key) continue
    const existing = map.get(key)
    if (!existing || item.score > existing.score) map.set(key, item)
  }
  return [...map.values()]
}

export const buildHomeSearchSections = ({
  query = '',
  modules = [],
  courses = [],
  notices = [],
  limitPerSection = 6
} = {}) => {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return []

  // 搜索结果统一转成可点击条目，页面层只负责导航与展示。
  const serviceItems = (Array.isArray(modules) ? modules : [])
    .map((module) => ({
      type: 'service',
      id: safeText(module?.id),
      title: safeText(module?.name),
      subtitle: safeText(module?.desc || module?.description),
      target: safeText(module?.id),
      iconKey: safeText(module?.iconKey || module?.id),
      color: safeText(module?.color),
      requiresLogin: module?.requiresLogin === true,
      score: scoreService(module, normalizedQuery)
    }))
    .filter((item) => item.id && item.title && item.score > 0)
    .sort(byScoreThenTitle)
    .slice(0, limitPerSection)

  const courseItems = (Array.isArray(courses) ? courses : [])
    .map((course, index) => {
      const title = safeText(course?.name)
      const room = safeText(course?.room)
      const teacher = safeText(course?.teacher)
      const weekday = safeText(course?.weekdayLabel)
      const time = [safeText(course?.start), safeText(course?.end)].filter(Boolean).join(' - ')
      const score = Math.max(
        scoreText(title, normalizedQuery, 110),
        scoreText(room, normalizedQuery, 80),
        scoreText(teacher, normalizedQuery, 65),
        scoreText(weekday, normalizedQuery, 45)
      )
      return {
        type: 'course',
        id: safeText(course?.key || `course-${index}`),
        dedupeKey: safeText(course?.dedupeKey || course?.key || `course-${index}`),
        title,
        subtitle: [weekday, time, room, teacher].filter(Boolean).join(' · '),
        target: 'schedule',
        score
      }
    })
    .filter((item) => item.title && item.score > 0)
  const dedupedCourseItems = dedupeSearchItems(courseItems)
    .sort(byScoreThenTitle)
    .slice(0, limitPerSection)

  const noticeItems = (Array.isArray(notices) ? notices : [])
    .map((notice, index) => {
      const title = safeText(notice?.title)
      const summary = normalizeNoticeSummary(notice)
      const score = Math.max(
        scoreText(title, normalizedQuery, 100),
        scoreText(summary, normalizedQuery, 65)
      )
      return {
        type: 'notice',
        id: safeText(notice?.id || notice?.title || `notice-${index}`),
        title,
        subtitle: summary,
        target: 'notice',
        raw: notice,
        score
      }
    })
    .filter((item) => item.title && item.score > 0)
    .sort(byScoreThenTitle)
    .slice(0, limitPerSection)

  return [
    { title: '服务', items: serviceItems },
    { title: '课程', items: dedupedCourseItems },
    { title: '资讯', items: noticeItems }
  ].filter((section) => section.items.length > 0)
}
