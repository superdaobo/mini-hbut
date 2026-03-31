<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { formatRelativeTime } from '../utils/time.js'
import { TPageHeader, TEmptyState } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const loading = ref(false)
const loadingOptions = ref(false)
const error = ref('')
const offline = ref(false)
const syncTime = ref('')
const showAdvanced = ref(false)
const showDetail = ref(false)
const selectedRow = ref(null)

// === 教学班功能状态 ===
const activeTab = ref('courses') // 'courses' | 'classes'
const selectedClassId = ref(null) // 选中的教学班 ID（进入三级页面）
const classSearchKeyword = ref('') // 教学班搜索关键词
const allResults = ref([]) // 全量查询结果（用于教学班聚合）
const loadingAll = ref(false) // 全量加载中

// 星期映射
const WEEKDAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 }

// 解析 sksjdd: "第14-17周 星期二 9-10节【3-001】" → [{ weeks, weekday, startNode, endNode, room }]
const parseSksjdd = (raw) => {
  if (!raw || typeof raw !== 'string') return []
  const segments = []
  // 按换行或分号拆分多段
  const parts = raw.split(/[;\n]/).map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    // 匹配周次: 第X-Y周 / 第1,3,5周 / 第1-4,6-12周
    const weekMatch = part.match(/第([\d,，、\-]+)周/)
    const weeks = []
    if (weekMatch) {
      const weekExpr = String(weekMatch[1] || '')
      const chunks = weekExpr.split(/[,，、]/).map(item => item.trim()).filter(Boolean)
      for (const chunk of chunks) {
        const rangeMatch = chunk.match(/^(\d+)(?:-(\d+))?$/)
        if (!rangeMatch) continue
        const wStart = parseInt(rangeMatch[1], 10)
        const wEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : wStart
        if (!Number.isFinite(wStart) || !Number.isFinite(wEnd)) continue
        const [startWeek, endWeek] = wStart <= wEnd ? [wStart, wEnd] : [wEnd, wStart]
        for (let w = startWeek; w <= endWeek; w += 1) {
          weeks.push(w)
        }
      }
    }
    // 匹配星期
    const dayMatch = part.match(/星期([一二三四五六日天])/)
    const weekday = dayMatch ? (WEEKDAY_MAP[dayMatch[1]] || 0) : 0
    // 匹配节次: X-Y节 或 X节
    const periodMatch = part.match(/(\d+)(?:-(\d+))?节/)
    const startNode = periodMatch ? parseInt(periodMatch[1]) : 0
    const endNode = periodMatch && periodMatch[2] ? parseInt(periodMatch[2]) : startNode
    // 匹配教室: 【xxx】
    const roomMatch = part.match(/[【\[](.*?)[】\]]/)
    const room = roomMatch ? roomMatch[1] : ''
    if (weekday && startNode) {
      segments.push({ weeks, weekday, startNode, endNode, room })
    }
  }
  return segments
}

// 课表配色（复用 ScheduleView 的 courseThemes）
const courseThemes = [
  { bg: '#e7f4ff', text: '#0f5da8', border: '#72b9ff' },
  { bg: '#fff0e8', text: '#cb4f2f', border: '#ffb390' },
  { bg: '#efe9ff', text: '#5f52cf', border: '#b8aaff' },
  { bg: '#fff4db', text: '#be7a07', border: '#efc465' },
  { bg: '#ffeaf2', text: '#c33f73', border: '#f3a8c4' },
  { bg: '#e8faf5', text: '#117f67', border: '#8adcc4' },
  { bg: '#e8efff', text: '#335ccb', border: '#9eb4ff' },
  { bg: '#fff1f5', text: '#b63f58', border: '#f0acbb' },
  { bg: '#edf8ef', text: '#2f8c3d', border: '#9dd7a7' },
  { bg: '#e8f9ff', text: '#007893', border: '#84d6ec' },
  { bg: '#f4edff', text: '#7548c1', border: '#c6adf1' },
  { bg: '#fff2e2', text: '#b05c16', border: '#efb67f' },
]

const timeSchedule = [
  { p: 1, start: '08:20', end: '09:05' },
  { p: 2, start: '09:10', end: '09:55' },
  { p: 3, start: '10:15', end: '11:00' },
  { p: 4, start: '11:05', end: '11:50' },
  { p: 5, start: '14:00', end: '14:45' },
  { p: 6, start: '14:50', end: '15:35' },
  { p: 7, start: '15:55', end: '16:40' },
  { p: 8, start: '16:45', end: '17:30' },
  { p: 9, start: '18:30', end: '19:15' },
  { p: 10, start: '19:20', end: '20:05' },
  { p: 11, start: '20:10', end: '20:55' },
]

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const toPositiveInt = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const readStoredScheduleMeta = () => {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return {}
  }
  try {
    const raw = window.localStorage.getItem('hbu_schedule_meta')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const calculateWeekFromStartDate = (startDateText) => {
  const text = String(startDateText || '').trim()
  if (!text) return 0
  const start = new Date(text)
  if (Number.isNaN(start.getTime())) return 0
  const now = new Date()
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const begin = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const diff = current.getTime() - begin.getTime()
  if (diff < 0) return 1
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1
}

const getPreferredCurrentWeek = () => {
  const meta = readStoredScheduleMeta()
  const selectedSemester = String(filters.value.xnxq || '').trim()
  const metaSemester = String(meta?.semester || '').trim()
  if (selectedSemester && metaSemester && selectedSemester !== metaSemester) {
    return 1
  }
  const storedWeek = toPositiveInt(meta?.current_week, 0)
  if (storedWeek > 0) return storedWeek
  const derivedWeek = calculateWeekFromStartDate(meta?.start_date)
  return toPositiveInt(derivedWeek, 1)
}

const pickAutoWeek = (weeks) => {
  const normalized = [...new Set((Array.isArray(weeks) ? weeks : []).map(item => toPositiveInt(item, 0)).filter(Boolean))]
    .sort((a, b) => a - b)
  if (!normalized.length) return 1
  const preferredWeek = getPreferredCurrentWeek()
  if (normalized.includes(preferredWeek)) return preferredWeek
  const nextWeek = normalized.find(week => week >= preferredWeek)
  return nextWeek || normalized[normalized.length - 1]
}

const collectWeeksFromRows = (rows) => {
  const weekSet = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    const segments = parseSksjdd(row?.sksjdd || '')
    for (const seg of segments) {
      for (const week of seg.weeks || []) {
        const normalized = toPositiveInt(week, 0)
        if (normalized > 0) weekSet.add(normalized)
      }
    }
  }
  return [...weekSet].sort((a, b) => a - b)
}

const formatWeekRanges = (weeks) => {
  const sorted = [...new Set((Array.isArray(weeks) ? weeks : []).map(item => toPositiveInt(item, 0)).filter(Boolean))]
    .sort((a, b) => a - b)
  if (!sorted.length) return ''
  const ranges = []
  let start = sorted[0]
  let end = sorted[0]
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]
    if (current === end + 1) {
      end = current
      continue
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`)
    start = current
    end = current
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`)
  return ranges.join(',')
}

const formatSegmentText = (seg) => {
  const weekText = formatWeekRanges(seg?.weeks || [])
  const dayText = DAY_LABELS[(toPositiveInt(seg?.weekday, 1) || 1) - 1] || ''
  const startNode = toPositiveInt(seg?.startNode, 1)
  const endNode = toPositiveInt(seg?.endNode, startNode)
  const periodText = startNode === endNode ? `${startNode}节` : `${startNode}-${endNode}节`
  const roomText = seg?.room ? `【${seg.room}】` : ''
  return `${weekText ? `第${weekText}周 ` : ''}星期${dayText} ${periodText}${roomText}`.trim()
}

const options = ref({
  xnxq: [],
  xqid: [],
  nj: [],
  yxid: [],
  zyid: [],
  kkyxid: [],
  kkjysid: [],
  kcxz: [],
  kclb: [],
  xslx: [],
  jxlid: [],
  jslx: [],
  ksxs: [],
  ksfs: [],
  zxxq: [],
  zdxq: [],
  xsqbkb: [],
  kklx: []
})

const defaults = ref({
  xnxq: '',
  xsqbkb: '0',
  kklx: []
})

const jcOptions = ref({
  jc: [],
  zc: []
})
const zyOptions = ref([])
const kkjysOptions = ref([])

const filters = ref({
  xnxq: '',
  xqid: '',
  nj: '',
  yxid: '',
  zyid: '',
  kkyxid: '',
  kkjysid: '',
  kcxz: '',
  kclb: '',
  xslx: '',
  kcmc: '',
  skjs: '',
  jxlid: '',
  jslx: '',
  ksxs: '',
  ksfs: '',
  jsmc: '',
  zxjc: '',
  zdjc: '',
  zxzc: '',
  zdzc: '',
  zxxq: '',
  zdxq: '',
  xsqbkb: '0',
  kklx: []
})

const pagination = ref({
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 0
})

const results = ref([])

const pageSizes = [20, 50, 100]

const disableWeekRange = computed(() => filters.value.xsqbkb === '1')
const kklxOptions = computed(() => (options.value.kklx || []).filter(item => item?.value !== ''))

const FIELD_LABEL_MAP = {
  kcmc: '课程名称',
  kcxz: '课程性质',
  kclb: '课程类别',
  kkyxmc: '开课学院',
  xz: '学分',
  skjs: '授课教师',
  sksjdd: '上课时间地点',
  schooltime: '上课时间',
  skdd: '上课地点',
  zongxs: '总学时',
  llxs: '理论学时',
  syxs: '实验学时',
  shijianxs: '实践学时',
  jxbmc: '教学班名称',
  jxbzc: '教学班组成',
  bjrs: '班级人数',
  zdskrnrs: '最大容量',
  zymc: '适用专业',
  rxnf: '入学年份',
  currentUserName: '当前学号',
  currentDepartmentId: '学院代码',
  xnxq: '学年学期',
  dataXnxq: '数据学期',
  jxbid: '教学班ID',
  tid: '教师ID',
  kcid: '课程ID',
  dataAuth: '数据权限',
  kkyxAuth: '开课学院权限'
}

const DETAIL_SECTIONS = [
  {
    title: '核心课程信息',
    keys: ['kcmc', 'kcxz', 'kclb', 'kkyxmc', 'xz']
  },
  {
    title: '教学安排信息',
    keys: ['skjs', 'sksjdd', 'schooltime', 'skdd', 'zongxs', 'llxs', 'syxs', 'shijianxs']
  },
  {
    title: '班级与学生信息',
    keys: ['jxbmc', 'jxbzc', 'bjrs', 'zdskrnrs', 'zymc', 'rxnf']
  },
  {
    title: '系统标识字段',
    keys: ['currentUserName', 'currentDepartmentId', 'xnxq', 'dataXnxq', 'jxbid', 'tid', 'kcid', 'dataAuth', 'kkyxAuth']
  }
]

const decodeHtmlEntities = (text) => {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

const stripHtml = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (!/[<>]|&[a-z#0-9]+;/i.test(raw)) return raw
  if (typeof window !== 'undefined' && window?.document) {
    try {
      const div = window.document.createElement('div')
      div.innerHTML = raw
      return String(div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim()
    } catch {
      // noop
    }
  }
  return decodeHtmlEntities(raw.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

const normalizeFieldValue = (value) => {
  if (value == null) return ''
  if (Array.isArray(value)) {
    return value
      .map(item => stripHtml(item))
      .filter(Boolean)
      .join('、')
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return stripHtml(value)
}

const hasValue = (value) => String(value ?? '').trim() !== ''
const getFieldLabel = (key) => FIELD_LABEL_MAP[key] || key

const getFieldValue = (row, key) => {
  if (!row || typeof row !== 'object') return ''
  return normalizeFieldValue(row[key])
}

const getCourseName = (row) => {
  const value = getFieldValue(row, 'kcmc') || getFieldValue(row, 'kcname') || getFieldValue(row, 'courseName')
  return value || '未知课程'
}

const getCredit = (row) => getFieldValue(row, 'xz') || getFieldValue(row, 'xf') || '-'
const getTeacher = (row) => getFieldValue(row, 'skjs') || getFieldValue(row, 'jsmc') || '-'
const getClassComposition = (row) => getFieldValue(row, 'jxbzc') || '-'

// === 行政班级聚合 computed ===
// 从 jxbzc 中提取各行政班级名称，按班级分组聚合全部课程
const adminClasses = computed(() => {
  const map = new Map()
  for (const row of allResults.value) {
    const rawZc = stripHtml(row.jxbzc || '')
    if (!rawZc) continue
    // jxbzc 格式: "25汉语1,25运动2,25运动1,25电气6"
    const classNames = rawZc.split(/[,，、;；\s]+/).map(s => s.trim()).filter(Boolean)
    for (const cn of classNames) {
      if (!map.has(cn)) {
        map.set(cn, { name: cn, courses: [], teachers: new Set() })
      }
      const cls = map.get(cn)
      cls.courses.push(row)
      const teacher = stripHtml(row.skjs || '')
      if (teacher) cls.teachers.add(teacher)
    }
  }
  return [...map.values()]
    .map(c => ({
      ...c,
      teachers: [...c.teachers].join('、'),
      courseCount: c.courses.length,
    }))
    .sort((a, b) => {
      const countDiff = Number(b.courseCount || 0) - Number(a.courseCount || 0)
      if (countDiff !== 0) return countDiff
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    })
})

// 搜索过滤后的班级列表
const filteredClasses = computed(() => {
  const kw = classSearchKeyword.value.trim().toLowerCase()
  if (!kw) return adminClasses.value
  return adminClasses.value.filter(c =>
    c.name.toLowerCase().includes(kw) ||
    c.teachers.toLowerCase().includes(kw)
  )
})

// 当前选中班级对象
const selectedClass = computed(() => {
  if (!selectedClassId.value) return null
  return adminClasses.value.find(c => c.name === selectedClassId.value) || null
})

// 班级课表的所有周次（从 sksjdd 解析）
const classAllWeeks = computed(() => {
  const cls = selectedClass.value
  if (!cls) return []
  return collectWeeksFromRows(cls.courses)
})

// 当前选择的周次
const selectedWeek = ref(1)

// 班级课表数据: 按选中周次过滤，构建 byDay[1..7]
const classScheduleData = computed(() => {
  const cls = selectedClass.value
  if (!cls) return {}
  const week = selectedWeek.value
  const byDay = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }

  const nameColorMap = new Map()
  let colorIdx = 0

  for (const row of cls.courses) {
    const kcmc = stripHtml(row.kcmc || '未知课程')
    const skjs = stripHtml(row.skjs || '')
    const segments = parseSksjdd(row.sksjdd || '')

    if (!nameColorMap.has(kcmc)) {
      nameColorMap.set(kcmc, colorIdx++ % courseThemes.length)
    }
    const ci = nameColorMap.get(kcmc)

    for (const seg of segments) {
      // 按周次过滤
      if (seg.weeks.length > 0 && !seg.weeks.includes(week)) continue
      const span = seg.endNode - seg.startNode + 1
      const detailRow = {
        ...row,
        kcmc,
        skjs,
        skdd: seg.room || row.skdd,
        schooltime: formatSegmentText(seg),
        sksjdd: formatSegmentText(seg)
      }
      byDay[seg.weekday]?.push({
        name: kcmc,
        teacher: skjs,
        room: seg.room,
        period: seg.startNode,
        djs: span,
        weeks: seg.weeks,
        colorIndex: ci,
        _detailRow: detailRow,
        _uid: `${kcmc}-${seg.weekday}-${seg.startNode}-${seg.endNode}`,
      })
    }
  }

  for (let day = 1; day <= 7; day++) {
    byDay[day].sort((a, b) => a.period - b.period)
    const seen = new Set()
    byDay[day] = byDay[day].filter(c => {
      const key = `${c.name}|${c.teacher}|${c.period}|${c.djs}|${c.room}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return byDay
})

// 课表格子样式
const getClassCourseStyle = (course) => {
  const start = Number(course.period) || 1
  const span = Math.max(1, Number(course.djs) || 1)
  const theme = courseThemes[course.colorIndex || 0]
  return {
    '--course-bg': 'rgba(255, 255, 255, 0.92)',
    '--course-text': theme.text,
    '--course-border': theme.border,
    '--course-shadow': '0 6px 14px rgba(71, 85, 105, 0.16)',
    '--course-radius': '14px',
    gridRow: `${start} / span ${span}`,
    gridColumn: '1',
    zIndex: 1,
  }
}

// 全量查询（用于班级功能，pageSize=9999）
const fetchAllForClasses = async () => {
  loadingAll.value = true
  try {
    const payload = {
      ...filters.value,
      kklx: Array.isArray(filters.value.kklx) ? filters.value.kklx : [],
      page: 1,
      page_size: 9999
    }
    const res = await axios.post(`${API_BASE}/v2/qxzkb/query`, payload)
    const data = res.data
    if (data?.success === false) return
    const rootCandidate = data.data
    const root = rootCandidate && (
      Array.isArray(rootCandidate) || Array.isArray(rootCandidate.rows) ||
      Array.isArray(rootCandidate.results) || Array.isArray(rootCandidate.list) ||
      Array.isArray(rootCandidate.data)
    ) ? rootCandidate : data
    const rowCandidates = [root.rows, root.results, root.data, root.list, root.resultData]
    allResults.value = rowCandidates.find(item => Array.isArray(item)) || (Array.isArray(root) ? root : [])
  } catch (err) {
    // 静默失败
  } finally {
    loadingAll.value = false
  }
}

// 选中班级
const selectClass = (cls) => {
  selectedClassId.value = cls.name
  const weeks = collectWeeksFromRows(cls?.courses || [])
  selectedWeek.value = pickAutoWeek(weeks)
}

// 返回班级列表
const backToClassList = () => {
  selectedClassId.value = null
}

// 周次切换
const prevWeek = () => {
  const weeks = classAllWeeks.value
  const idx = weeks.indexOf(selectedWeek.value)
  if (idx > 0) selectedWeek.value = weeks[idx - 1]
}

const nextWeek = () => {
  const weeks = classAllWeeks.value
  const idx = weeks.indexOf(selectedWeek.value)
  if (idx < weeks.length - 1) selectedWeek.value = weeks[idx + 1]
}

// 触摸滑动
const touchStartX = ref(0)
const handleTouchStart = (e) => {
  touchStartX.value = e.touches[0].clientX
}
const handleTouchEnd = (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX.value
  if (Math.abs(dx) > 50) {
    if (dx > 0) prevWeek()
    else nextWeek()
  }
}

const openClassCourseDetail = (course) => {
  if (!course) return
  openDetail(course._detailRow || course)
}

const normalizeOptions = (list) => {
  if (!Array.isArray(list)) return []
  const mapped = list.map((item) => {
    if (item == null) return null
    if (typeof item === 'string' || typeof item === 'number') {
      return { value: String(item), label: String(item) }
    }
    const value = item.value ?? item.id ?? item.dm ?? item.code ?? item.key ?? item.yxid ?? item.zyid ?? item.kkyxid ?? item.kkjysid ?? item.jc ?? item.zc ?? item.bh ?? ''
    const label = item.label ?? item.name ?? item.mc ?? item.text ?? item.jc ?? item.zc ?? item.zymc ?? item.kkjysmc ?? value
    if (value === '' && label === '') return null
    return { value: String(value), label: String(label || value) }
  }).filter(Boolean)

  const seen = new Set()
  return mapped.filter((item) => {
    const key = String(item.value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const pickList = (payload, keys) => {
  if (!payload) return []
  const root = payload.data ?? payload.resultData ?? payload
  for (const key of keys) {
    const candidate = root?.[key] ?? payload?.[key]
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

const fetchOptions = async () => {
  loadingOptions.value = true
  try {
    const res = await axios.get(`${API_BASE}/v2/qxzkb/options`)
    const payload = res.data
    if (payload?.success === false) {
      error.value = payload?.error || '获取选项失败'
      return
    }
    options.value = {
      ...options.value,
      ...(payload.options || {})
    }
    defaults.value = payload.defaults || defaults.value
    filters.value.xnxq = defaults.value.xnxq || filters.value.xnxq
    filters.value.xsqbkb = defaults.value.xsqbkb ?? filters.value.xsqbkb
    filters.value.kklx = Array.isArray(defaults.value.kklx) ? [...defaults.value.kklx] : []
  } catch (err) {
    error.value = err.toString()
  } finally {
    loadingOptions.value = false
  }
}

const applyProfileToFilters = (profile) => {
  if (!profile) return
  const college = profile.college || profile.college_name || ''
  const grade = profile.grade || profile.grade_name || ''

  if (!filters.value.nj && grade) {
    const match = (options.value.nj || []).find(opt => opt.value === grade || opt.label === grade || opt.label.includes(grade))
    if (match) {
      filters.value.nj = match.value
    }
  }

  if (!filters.value.yxid && college) {
    const match = (options.value.yxid || []).find(opt => {
      if (!opt?.label) return false
      return opt.label === college || opt.label.includes(college) || college.includes(opt.label)
    })
    if (match) {
      filters.value.yxid = match.value
    }
  }
}

const fetchUserProfile = async () => {
  if (!props.studentId) return
  try {
    const res = await axios.post(`${API_BASE}/v2/student_info`, {
      student_id: props.studentId
    })
    const payload = res.data
    if (payload?.success) {
      const profile = payload.data || payload.user || payload.info || {}
      applyProfileToFilters(profile)
    }
  } catch (err) {
    // ignore
  }
}

const fetchJcinfo = async () => {
  if (!filters.value.xnxq) return
  try {
    const res = await axios.post(`${API_BASE}/v2/qxzkb/jcinfo`, { xnxq: filters.value.xnxq })
    const payload = res.data
    if (payload?.success === false) return
    const jcList = normalizeOptions(pickList(payload, ['jcList', 'jc', 'jcs', 'jcInfo', 'jcxx']))
    const zcList = normalizeOptions(pickList(payload, ['zcList', 'zc', 'zcs', 'zcInfo', 'zcxx']))
    jcOptions.value = { jc: jcList, zc: zcList }
  } catch (err) {
    // ignore
  }
}

const fetchZyxx = async () => {
  if (!filters.value.yxid || !filters.value.nj) {
    zyOptions.value = []
    filters.value.zyid = ''
    return
  }
  try {
    const res = await axios.post(`${API_BASE}/v2/qxzkb/zyxx`, {
      yxid: filters.value.yxid,
      nj: filters.value.nj
    })
    const payload = res.data
    if (payload?.success === false) return
    const root = payload.data ?? payload.resultData ?? payload
    const list = Array.isArray(root) ? root : (root.list || root.rows || root.data || [])
    zyOptions.value = normalizeOptions(list)
    if (zyOptions.value.length === 0) {
      filters.value.zyid = ''
    }
  } catch (err) {
    zyOptions.value = []
  }
}

const fetchKkjys = async () => {
  if (!filters.value.kkyxid) {
    kkjysOptions.value = []
    filters.value.kkjysid = ''
    return
  }
  try {
    const res = await axios.post(`${API_BASE}/v2/qxzkb/kkjys`, {
      kkyxid: filters.value.kkyxid
    })
    const payload = res.data
    if (payload?.success === false) return
    const root = payload.data ?? payload.resultData ?? payload
    const list = Array.isArray(root) ? root : (root.list || root.rows || root.data || [])
    kkjysOptions.value = normalizeOptions(list)
    if (kkjysOptions.value.length === 0) {
      filters.value.kkjysid = ''
    }
  } catch (err) {
    kkjysOptions.value = []
  }
}

const buildQueryPayload = (page) => ({
  ...filters.value,
  kklx: Array.isArray(filters.value.kklx) ? filters.value.kklx : [],
  page: toPositiveInt(page, 1),
  page_size: toPositiveInt(pagination.value.pageSize, 50)
})

const fetchList = async (page = 1) => {
  loading.value = true
  error.value = ''
  try {
    const payload = buildQueryPayload(page)
    const res = await axios.post(`${API_BASE}/v2/qxzkb/query`, payload)
    const data = res.data
    if (data?.success === false) {
      error.value = data.error || '查询失败'
      return
    }
    offline.value = !!data.offline
    syncTime.value = data.sync_time || ''

    const rootCandidate = data.data
    const root = rootCandidate && (
      Array.isArray(rootCandidate)
      || Array.isArray(rootCandidate.rows)
      || Array.isArray(rootCandidate.results)
      || Array.isArray(rootCandidate.list)
      || Array.isArray(rootCandidate.data)
    ) ? rootCandidate : data
    const rowCandidates = [root.rows, root.results, root.data, root.list, root.resultData]
    const rowList = rowCandidates.find(item => Array.isArray(item)) || (Array.isArray(root) ? root : [])
    results.value = rowList

    const totalRecords = root.records
      || root.totalRecords
      || (root.totalPages ? root.total : null)
      || results.value.length
    const totalPages = root.totalPages
      || (root.total && !root.totalPages ? root.total : Math.ceil(totalRecords / pagination.value.pageSize))
    pagination.value.page = root.page || page
    pagination.value.total = totalRecords
    pagination.value.totalPages = totalPages || 1
  } catch (err) {
    error.value = err.toString()
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  if (!filters.value.xnxq) {
    error.value = '请选择学年学期'
    return
  }
  selectedClassId.value = null
  activeTab.value = 'courses'
  allResults.value = []
  fetchList(1)
  // 默认模式下同时发起全量查询用于教学班
  if (!showAdvanced.value) {
    fetchAllForClasses()
  }
}

const handleReset = () => {
  filters.value = {
    ...filters.value,
    xnxq: defaults.value.xnxq || '',
    xqid: '',
    nj: '',
    yxid: '',
    zyid: '',
    kkyxid: '',
    kkjysid: '',
    kcxz: '',
    kclb: '',
    xslx: '',
    kcmc: '',
    skjs: '',
    jxlid: '',
    jslx: '',
    ksxs: '',
    ksfs: '',
    jsmc: '',
    zxjc: '',
    zdjc: '',
    zxzc: '',
    zdzc: '',
    zxxq: '',
    zdxq: '',
    xsqbkb: defaults.value.xsqbkb ?? '0',
    kklx: Array.isArray(defaults.value.kklx) ? [...defaults.value.kklx] : []
  }
  zyOptions.value = []
  kkjysOptions.value = []
}

const changePage = (next) => {
  if (next < 1 || next > pagination.value.totalPages) return
  fetchList(next)
}

const handlePageSizeChange = () => {
  pagination.value.pageSize = toPositiveInt(pagination.value.pageSize, 50)
  pagination.value.page = 1
  fetchList(1)
}

const openDetail = (row) => {
  selectedRow.value = row
  showDetail.value = true
}

const closeDetail = () => {
  showDetail.value = false
  selectedRow.value = null
}

const detailTitle = computed(() => getCourseName(selectedRow.value))

const selectedSections = computed(() => {
  const row = selectedRow.value
  if (!row || typeof row !== 'object') return []
  return DETAIL_SECTIONS
    .map((section) => {
      const items = section.keys
        .map((key) => ({
          key,
          label: getFieldLabel(key),
          value: getFieldValue(row, key)
        }))
        .filter(item => hasValue(item.value))
      return { title: section.title, items }
    })
    .filter(section => section.items.length > 0)
})

watch(() => filters.value.xnxq, () => fetchJcinfo())
watch([() => filters.value.yxid, () => filters.value.nj], () => fetchZyxx())
watch(() => filters.value.kkyxid, () => fetchKkjys())
watch(classAllWeeks, (weeks) => {
  if (!selectedClassId.value) return
  const normalizedWeeks = Array.isArray(weeks) ? weeks : []
  const current = toPositiveInt(selectedWeek.value, 0)
  if (!normalizedWeeks.length) {
    selectedWeek.value = 1
    return
  }
  if (!normalizedWeeks.includes(current)) {
    selectedWeek.value = pickAutoWeek(normalizedWeeks)
  }
})

onMounted(async () => {
  await fetchOptions()
  await fetchUserProfile()
  await fetchJcinfo()
  if (filters.value.yxid && filters.value.nj) {
    await fetchZyxx()
  }
  if (filters.value.kkyxid) {
    await fetchKkjys()
  }
  if (filters.value.xnxq) {
    await fetchList(1)
    if (!showAdvanced.value) {
      fetchAllForClasses()
    }
  }
})
</script>

<template>
  <div class="qxzkb-view">
    <TPageHeader icon="🏫" title="全校课表" @back="emit('back')" />

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <div class="content">
      <div class="filter-card glass-card">
        <div class="filter-header">
          <div class="filter-title">查询条件</div>
          <div class="filter-actions">
            <button class="ghost-btn" @click="handleReset">重置</button>
            <button class="ghost-btn" @click="showAdvanced = !showAdvanced">
              {{ showAdvanced ? '收起高级' : '展开高级' }}
            </button>
            <button class="primary-btn" @click="handleSearch" :disabled="loading">
              {{ loading ? '查询中...' : '查询课表' }}
            </button>
          </div>
        </div>

        <div class="filter-grid compact-grid">
          <div class="field">
            <label>学年学期 *</label>
            <IOSSelect v-model="filters.xnxq" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in options.xnxq" :key="item.value" :value="item.value">{{ item.label }}</option>
            </IOSSelect>
          </div>
          <div class="field">
            <label>年级</label>
            <IOSSelect v-model="filters.nj" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in options.nj" :key="item.value" :value="item.value">{{ item.label }}</option>
            </IOSSelect>
          </div>
          <div class="field">
            <label>学院</label>
            <IOSSelect v-model="filters.yxid" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in options.yxid" :key="item.value" :value="item.value">{{ item.label }}</option>
            </IOSSelect>
          </div>
          <div class="field">
            <label>专业</label>
            <IOSSelect v-model="filters.zyid" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in zyOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </IOSSelect>
          </div>
          <div class="field">
            <label>课程名称</label>
            <input v-model="filters.kcmc" class="text-input" placeholder="支持模糊匹配" />
          </div>
          <div class="field">
            <label>授课教师</label>
            <input v-model="filters.skjs" class="text-input" placeholder="教师姓名" />
          </div>
        </div>

        <div v-if="showAdvanced" class="advanced-section">
          <div class="filter-grid">
            <div class="field">
              <label>校区</label>
              <IOSSelect v-model="filters.xqid" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.xqid" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>开课单位</label>
              <IOSSelect v-model="filters.kkyxid" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.kkyxid" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>教研室</label>
              <IOSSelect v-model="filters.kkjysid" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in kkjysOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>课程性质</label>
              <IOSSelect v-model="filters.kcxz" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.kcxz" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>课程类别</label>
              <IOSSelect v-model="filters.kclb" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.kclb" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>学时类型</label>
              <IOSSelect v-model="filters.xslx" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.xslx" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>教学楼</label>
              <IOSSelect v-model="filters.jxlid" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.jxlid" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>教室类型</label>
              <IOSSelect v-model="filters.jslx" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.jslx" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>考试形式</label>
              <IOSSelect v-model="filters.ksxs" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.ksxs" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>考试方式</label>
              <IOSSelect v-model="filters.ksfs" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.ksfs" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>教室名称</label>
              <input v-model="filters.jsmc" class="text-input" placeholder="教室名称" />
            </div>
          </div>

          <div class="filter-grid">
            <div class="field">
              <label>最小节次</label>
              <IOSSelect v-model="filters.zxjc" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in jcOptions.jc" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>最大节次</label>
              <IOSSelect v-model="filters.zdjc" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in jcOptions.jc" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>起始周</label>
              <IOSSelect v-model="filters.zxzc" class="modern-select" :disabled="disableWeekRange">
                <option value="">请选择</option>
                <option v-for="item in jcOptions.zc" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>截止周</label>
              <IOSSelect v-model="filters.zdzc" class="modern-select" :disabled="disableWeekRange">
                <option value="">请选择</option>
                <option v-for="item in jcOptions.zc" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>起始星期</label>
              <IOSSelect v-model="filters.zxxq" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.zxxq" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>截止星期</label>
              <IOSSelect v-model="filters.zdxq" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.zdxq" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
            <div class="field">
              <label>显示无排课</label>
              <IOSSelect v-model="filters.xsqbkb" class="modern-select">
                <option v-for="item in options.xsqbkb" :key="item.value" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
          </div>

          <div class="kklx-section">
            <div class="kklx-title">开课类型</div>
            <div class="kklx-options">
              <label v-for="item in kklxOptions" :key="item.value" class="kklx-chip">
                <input type="checkbox" :value="item.value" v-model="filters.kklx" />
                <span>{{ item.label }}</span>
              </label>
            </div>
          </div>
        </div>

        <div class="pagination-bar">
          <div class="page-info">
            共 {{ pagination.total || 0 }} 条 / 第 {{ pagination.page }} 页
          </div>
          <div class="page-actions">
            <button class="ghost-btn" @click="changePage(pagination.page - 1)" :disabled="pagination.page <= 1">上一页</button>
            <button class="ghost-btn" @click="changePage(pagination.page + 1)" :disabled="pagination.page >= pagination.totalPages">下一页</button>
            <IOSSelect v-model="pagination.pageSize" class="modern-select compact-select" @change="handlePageSizeChange">
              <option v-for="size in pageSizes" :key="size" :value="size">{{ size }} / 页</option>
            </IOSSelect>
          </div>
        </div>
      </div>

      <div v-if="error" class="error-banner">{{ error }}</div>

      <!-- Tab 切换 (仅默认模式且有结果时显示) -->
      <div v-if="!showAdvanced && results.length > 0 && !loading" class="tab-bar">
        <button
          class="tab-btn" :class="{ active: activeTab === 'courses' }"
          @click="activeTab = 'courses'; selectedClassId = null"
        >课程列表</button>
        <button
          class="tab-btn" :class="{ active: activeTab === 'classes' }"
          @click="activeTab = 'classes'; selectedClassId = null"
        >
          班级课表
          <span v-if="loadingAll" class="tab-loading">⏳</span>
          <span v-else-if="adminClasses.length" class="tab-badge">{{ adminClasses.length }}</span>
        </button>
      </div>

      <TEmptyState v-if="loading" type="loading" />

      <!-- ===== 课程列表 Tab ===== -->
      <div v-else-if="activeTab === 'courses' || showAdvanced" class="result-list">
        <TEmptyState v-if="results.length === 0" message="暂无课表数据" />
        <button
          v-for="(row, idx) in results"
          :key="row.jxbid || row.jxbmc || idx"
          class="result-card"
          type="button"
          @click="openDetail(row)"
        >
          <div class="result-title">{{ getCourseName(row) }}</div>
          <div class="result-brief">
            <div class="brief-item">
              <span class="brief-label">学分</span>
              <span class="brief-value">{{ getCredit(row) }}</span>
            </div>
            <div class="brief-item">
              <span class="brief-label">授课教师</span>
              <span class="brief-value">{{ getTeacher(row) }}</span>
            </div>
            <div class="brief-item full-row">
              <span class="brief-label">教学班组成</span>
              <span class="brief-value multiline">{{ getClassComposition(row) }}</span>
            </div>
          </div>
        </button>
      </div>

      <!-- ===== 班级列表（二级页面） ===== -->
      <div v-else-if="activeTab === 'classes' && !selectedClassId">
        <TEmptyState v-if="loadingAll" type="loading" />
        <template v-else>
          <div class="class-search">
            <input v-model="classSearchKeyword" class="text-input" placeholder="搜索班级名称、教师..." />
          </div>
          <TEmptyState v-if="filteredClasses.length === 0" message="未找到匹配的班级" />
          <div class="class-list">
            <button
              v-for="cls in filteredClasses"
              :key="cls.name"
              class="class-card"
              type="button"
              @click="selectClass(cls)"
            >
              <div class="class-name">{{ cls.name }}</div>
              <div class="class-meta">
                <span>{{ cls.courseCount }} 门课程</span>
              </div>
              <div v-if="cls.teachers" class="class-teacher">{{ cls.teachers }}</div>
            </button>
          </div>
        </template>
      </div>

      <!-- ===== 班级课表视图（三级页面） ===== -->
      <div v-else-if="activeTab === 'classes' && selectedClassId && selectedClass" class="class-schedule-view">
        <div class="class-schedule-header">
          <button class="ghost-btn" @click="backToClassList">← 返回列表</button>
          <div class="class-schedule-title">{{ selectedClass.name }}</div>
        </div>

        <!-- 周次选择器 -->
        <div v-if="classAllWeeks.length > 0" class="week-selector">
          <button class="week-btn" :disabled="classAllWeeks.indexOf(selectedWeek) <= 0" @click="prevWeek">‹</button>
          <div class="week-label">第 {{ selectedWeek }} 周</div>
          <button class="week-btn" :disabled="classAllWeeks.indexOf(selectedWeek) >= classAllWeeks.length - 1" @click="nextWeek">›</button>
        </div>

        <div
          class="schedule-grid-wrapper"
          @touchstart="handleTouchStart"
          @touchend="handleTouchEnd"
        >
          <!-- 表头 -->
          <div class="schedule-date-header">
            <div class="schedule-corner"></div>
            <div class="schedule-day-labels">
              <div v-for="d in ['一','二','三','四','五','六','日']" :key="d" class="schedule-day-label">周{{ d }}</div>
            </div>
          </div>

          <!-- 课程网格 -->
          <div class="schedule-grid-body">
            <div class="schedule-time-axis">
              <div v-for="t in timeSchedule" :key="t.p" class="schedule-time-slot">
                <span class="schedule-time-start">{{ t.start }}</span>
                <span class="schedule-period-num">{{ t.p }}</span>
                <span class="schedule-time-end">{{ t.end }}</span>
              </div>
            </div>
            <div class="schedule-courses-grid">
              <div class="schedule-grid-lines">
                <div v-for="i in 11" :key="i" class="schedule-line-row"></div>
              </div>
              <div v-for="day in 7" :key="day" class="schedule-day-column">
                <div
                  v-for="course in (classScheduleData[day] || [])"
                  :key="course._uid"
                  class="schedule-course-card"
                  :style="getClassCourseStyle(course)"
                  @click="openClassCourseDetail(course)"
                >
                  <div class="schedule-course-name">{{ course.name }}</div>
                  <div class="schedule-course-room">{{ course.room || '' }}</div>
                  <div v-if="course.teacher" class="schedule-course-teacher">{{ course.teacher }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showDetail && selectedRow" class="modal-overlay" @click="closeDetail">
        <div class="modal-content" @click.stop>
          <button class="modal-close" @click="closeDetail">×</button>
          <div class="modal-title">{{ detailTitle }}</div>

          <TEmptyState v-if="selectedSections.length === 0" message="当前记录无可展示详情字段" />

          <div v-for="section in selectedSections" :key="section.title" class="detail-section">
            <h3>{{ section.title }}</h3>
            <div class="detail-grid">
              <div v-for="item in section.items" :key="`${section.title}-${item.key}`" class="detail-item">
                <span class="detail-label">{{ item.label }}</span>
                <span class="detail-value">{{ item.value }}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.qxzkb-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient, #f5f7fa);
  color: var(--ui-text);
}

.qxzkb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-surface-border);
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: var(--ui-shadow-soft);
}

.qxzkb-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 19px;
  font-weight: 800;
}

.back-btn {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 26%, transparent);
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-weight: 700;
  cursor: pointer;
}

.offline-banner {
  margin: 12px 16px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in oklab, var(--ui-danger) 14%, #ffffff 86%);
  border: 1px solid color-mix(in oklab, var(--ui-danger) 36%, transparent);
  color: var(--ui-danger);
  font-weight: 600;
  font-size: 13px;
}

.content {
  padding: 12px 14px 120px;
}

.filter-card {
  padding: 14px;
  border-radius: 16px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
}

.filter-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.filter-title {
  font-size: 16px;
  font-weight: 800;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ghost-btn,
.primary-btn {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}

.ghost-btn {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
}

.primary-btn {
  border: none;
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  color: #fff;
  font-weight: 700;
}

.ghost-btn:disabled,
.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px 12px;
}

.compact-grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 12px;
  color: var(--ui-muted);
  font-weight: 600;
}

.text-input {
  min-height: 36px;
  border-radius: 12px;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 0 10px;
  font-size: 13px;
}

.modern-select :deep(.ios26-select-trigger) {
  min-height: 36px;
  border-radius: 12px;
}

.compact-select {
  min-width: 104px;
}

.advanced-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed color-mix(in oklab, var(--ui-primary) 26%, var(--ui-surface-border));
}

.kklx-section {
  margin-top: 10px;
}

.kklx-title {
  font-size: 12px;
  color: var(--ui-muted);
  margin-bottom: 8px;
  font-weight: 600;
}

.kklx-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kklx-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 28%, transparent);
  font-size: 12px;
}

.pagination-bar {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed color-mix(in oklab, var(--ui-primary) 20%, var(--ui-surface-border));
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.page-info {
  font-size: 12px;
  color: var(--ui-muted);
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-banner {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in oklab, var(--ui-danger) 12%, #ffffff 88%);
  border: 1px solid color-mix(in oklab, var(--ui-danger) 30%, transparent);
  color: var(--ui-danger);
}

.loading,
.empty-state {
  text-align: center;
  padding: 36px 12px;
  color: var(--ui-muted);
}

.empty-state.compact {
  padding: 16px 8px;
}

.result-list {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 10px;
}

.result-card {
  text-align: left;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
  border-radius: 14px;
  padding: 12px;
  box-shadow: var(--ui-shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
}

.result-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--ui-shadow-strong);
}

.result-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
}

.result-brief {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.brief-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.brief-item.full-row {
  grid-column: 1 / -1;
}

.brief-label {
  font-size: 11px;
  color: var(--ui-muted);
}

.brief-value {
  font-size: 13px;
  color: var(--ui-text);
  font-weight: 600;
}

.brief-value.multiline {
  font-weight: 500;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.48);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
}

.modal-content {
  width: min(920px, 100%);
  max-height: min(86vh, 860px);
  overflow: auto;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 18px;
  box-shadow: var(--ui-shadow-strong);
  padding: 16px;
  position: relative;
}

.modal-close {
  position: sticky;
  top: 0;
  margin-left: auto;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, transparent);
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-title {
  margin: 8px 0 10px;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.3;
}

.detail-section + .detail-section {
  margin-top: 12px;
}

.detail-section h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--ui-primary);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 8px;
}

.detail-item {
  border: 1px solid var(--ui-surface-border);
  border-radius: 10px;
  padding: 8px 10px;
  background: color-mix(in oklab, var(--ui-primary-soft) 62%, #fff 38%);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 11px;
  color: var(--ui-muted);
}

.detail-value {
  font-size: 13px;
  color: var(--ui-text);
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
}

/* === Tab 切换 === */
.tab-bar {
  margin-top: 14px;
  display: flex;
  gap: 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
}

.tab-btn {
  flex: 1;
  min-height: 40px;
  border: none;
  background: transparent;
  color: var(--ui-muted);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.tab-btn.active {
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  color: #fff;
}

.tab-badge {
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary) 18%, transparent);
  color: var(--ui-primary);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
}

.tab-btn.active .tab-badge {
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.tab-loading {
  font-size: 12px;
}

/* === 教学班搜索 === */
.class-search {
  margin-top: 14px;
  margin-bottom: 10px;
}

.class-search .text-input {
  width: 100%;
  box-sizing: border-box;
}

/* === 教学班卡片列表 === */
.class-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.class-card {
  text-align: left;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
  border-radius: 14px;
  padding: 12px;
  box-shadow: var(--ui-shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.class-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--ui-shadow-strong);
}

.class-name {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
}

.class-meta {
  font-size: 12px;
  color: var(--ui-muted);
  display: flex;
  gap: 4px;
}

.class-teacher {
  font-size: 13px;
  color: var(--ui-text);
  font-weight: 600;
}

.class-composition {
  font-size: 12px;
  color: var(--ui-muted);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* === 教学班课表三级页 === */
.class-schedule-view {
  margin-top: 14px;
}

.class-schedule-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.class-schedule-title {
  font-size: 17px;
  font-weight: 800;
}

.class-schedule-sub {
  width: 100%;
  font-size: 12px;
  color: var(--ui-muted);
  line-height: 1.4;
}

/* === 周次选择器 === */
.week-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 12px;
}

.week-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 26%, transparent);
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.week-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.week-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
  min-width: 80px;
  text-align: center;
}

/* === 课表网格（复用 ScheduleView 布局） === */
.schedule-grid-wrapper {
  --slot-height: 72px;
  --time-axis-width: 44px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--ui-shadow-soft);
}

.schedule-date-header {
  display: flex;
  border-bottom: 1px solid color-mix(in oklab, var(--ui-primary) 18%, var(--ui-surface-border));
}

.schedule-corner {
  width: var(--time-axis-width);
  flex-shrink: 0;
}

.schedule-day-labels {
  flex: 1;
  display: flex;
}

.schedule-day-label {
  flex: 1;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  padding: 10px 0;
  color: var(--ui-text);
}

.schedule-grid-body {
  display: flex;
  overflow-y: auto;
  max-height: calc(var(--slot-height) * 11 + 12px);
}

.schedule-time-axis {
  width: var(--time-axis-width);
  flex-shrink: 0;
  border-right: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.35));
  display: flex;
  flex-direction: column;
}

.schedule-time-slot {
  flex: 0 0 var(--slot-height);
  height: var(--slot-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--ui-muted);
}

.schedule-period-num {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 1px 0;
}

.schedule-time-start,
.schedule-time-end {
  font-size: 9px;
}

.schedule-courses-grid {
  flex: 1;
  display: flex;
  position: relative;
  min-height: calc(var(--slot-height) * 11);
}

.schedule-grid-lines {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}

.schedule-line-row {
  height: var(--slot-height);
  border-bottom: 1px dashed color-mix(in oklab, var(--ui-primary) 16%, rgba(226, 232, 240, 0.78));
  box-sizing: border-box;
}

.schedule-day-column {
  flex: 1;
  display: grid;
  grid-template-rows: repeat(11, var(--slot-height));
  grid-template-columns: 1fr;
  padding: 0 1px;
  position: relative;
}

.schedule-course-card {
  background: var(--course-bg, rgba(255, 255, 255, 0.92));
  color: var(--course-text, #334155);
  border-left: 3px solid var(--course-border, #cbd5e1);
  border-radius: var(--course-radius, 14px);
  box-shadow: var(--course-shadow, 0 4px 10px rgba(0,0,0,0.08));
  padding: 4px 6px;
  margin: 1px 1px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  min-height: 0;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.schedule-course-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(71, 85, 105, 0.18);
}

.schedule-course-name {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.schedule-course-room {
  font-size: 9px;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-course-teacher {
  font-size: 9px;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .filter-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .result-list {
    grid-template-columns: 1fr;
  }

  .class-list {
    grid-template-columns: 1fr;
  }

  .modal-content {
    padding: 12px;
  }

  .schedule-grid-wrapper {
    --slot-height: 60px;
    --time-axis-width: 38px;
  }
}
</style>
