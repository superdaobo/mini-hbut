<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'
import { TEmptyState } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const DEFAULT_FROM = 'ggxxk'
const KKLX_FROM_MAP = Object.freeze({
  '1': 'jhxk',
  '2': 'ggxxk',
  '3': 'fjjx',
  '5': 'cxxk',
  '6': 'jhxk',
  '7': 'jhxk',
  '8': 'jhxk',
  '16': 'ggxxk',
  '18': 'cxxk',
  '22': 'jhxk'
})
const ENTRY_MODE_MENU = 'menu'
const ENTRY_MODE_SELECTION = 'selection'
const ENTRY_MODE_INFO = 'info'

const KCXZ_LABEL_MAP = Object.freeze({
  '11': '通识必修',
  '12': '通识选修',
  '16': '限定选修',
  '31': '学科基础',
  '32': '工程基础',
  '40': '专业核心',
  '41': '专业方向组',
  '42': '专业任选',
  '43': '专业基础',
  '44': '专业必修',
  '45': '专业选修',
  '50': '基础实践',
  '51': '专业实践',
  '52': '综合实践',
  '53': '其他实践',
  '54': '短学期实践',
  '70': '辅修理论',
  '71': '辅修实践',
  '90': '必修',
  '98': '重修',
  '99': '公共选修'
})

const EMPTY_LIST_FILTERS = Object.freeze({
  kcmc: '',
  kcxz: '',
  kcgs: '',
  jxms: '',
  teacher: '',
  kkxq: '',
  kclb: '',
  kclx: ''
})

const loadingOverview = ref(false)
const loadingList = ref(false)
const loadingInfo = ref(false)
const refreshing = ref(false)
const overviewError = ref('')
const infoError = ref('')
const offline = ref(false)
const syncTime = ref('')

const overview = ref(null)
const tabs = ref([])
const activeTabId = ref('')
const listConditions = ref({})
const pcencMap = ref({})
const courses = ref([])
const listMessage = ref('')
const occupiedSlots = ref([])
const availableRatio = ref('100')
const count = ref(0)
const remainingSeconds = ref(null)
const countdownText = ref('')
const isPreview = ref(false)

const showAdvanced = ref(false)
const infoShowAdvanced = ref(false)
const centerMode = ref(ENTRY_MODE_MENU)
const infoSourceMessage = ref('')
const infoLoaded = ref(false)
const infoCourses = ref([])
const infoShowOtherModes = ref(false)

const filters = ref({
  kcmc: '',
  kcxz: '',
  kcgs: '',
  jxms: '',
  teacher: '',
  kkxq: '',
  kclb: '',
  kclx: ''
})

const infoFilters = ref({
  term: '',
  kcmc: '',
  teacher: '',
  kcxz: '',
  kclx: '',
  xkfs: '选课'
})

const infoOptions = ref({
  term: [{ value: '', label: '全部学期' }],
  kcxz: [{ value: '', label: '全部性质' }],
  kclx: [{ value: '', label: '全部类型' }],
  xkfs: [{ value: '', label: '全部方式' }]
})

const showDetail = ref(false)
const selectedCourse = ref(null)
const detailLoading = ref(false)
const detailIntro = ref('')
const detailTeachers = ref([])

const showChildClassDialog = ref(false)
const childClasses = ref([])
const pendingSelectCourse = ref(null)
const selectedChildClassId = ref('')
const selectingCourseId = ref('')

const showActionConfirmDialog = ref(false)
const confirmActionType = ref('')
const confirmTargetCourse = ref(null)
const confirmTargetChildClassId = ref('')
const withdrawingCourseId = ref('')

const toastState = ref({
  visible: false,
  message: '',
  type: 'info'
})

let toastTimer = null
let countdownTimer = null
let endTimeRefreshTimer = null

const safeText = (value) => String(value ?? '').trim()

const isEnabledValue = (value) => {
  const text = safeText(value).toLowerCase()
  return text === '1' || text === 'true' || text === 'yes' || text === 'y'
}

const isPickedValue = (value) => {
  const text = safeText(value)
  if (!text) return false
  if (isEnabledValue(text)) return true
  if (text.includes('已选') || text.includes('已修') || text.includes('已报名')) return true
  const num = Number(text)
  return Number.isFinite(num) && num > 0
}

const resolveTabFrom = (tab) => {
  const kklx = safeText(tab?.kklx)
  return KKLX_FROM_MAP[kklx] || DEFAULT_FROM
}

const stripHtml = (value) => {
  const raw = safeText(value)
  if (!raw) return ''
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  return safeText(doc.body?.textContent || raw)
}

const looksLikeEncodedSchedule = (value) => {
  const text = safeText(value)
  if (!text) return false
  return /^\d+(,\d+)+$/.test(text) || /^\d{4,}$/.test(text)
}

const normalizeScheduleText = (item) => {
  const sksjdd = stripHtml(item.sksjdd)
  if (sksjdd && !looksLikeEncodedSchedule(sksjdd)) return sksjdd
  const sksjddstr = stripHtml(item.sksjddstr)
  if (sksjddstr && !looksLikeEncodedSchedule(sksjddstr)) return sksjddstr
  return ''
}

const compactTeachingClassName = (value) => {
  let text = stripHtml(value)
  if (!text) return ''
  text = text
    .replace(/([\-—_]?)(?:理论|实践|实验|混合|线上|线下)?\s*\d{3,}\s*$/u, '$1')
    .replace(/[\-—_]\s*$/u, '')
    .trim()
  return text || stripHtml(value)
}

const hasConflictHint = (value) => {
  const text = stripHtml(value)
  if (!text) return false
  return /(冲突课程|冲突上课时间地点|conflictingCourse|冲突状态|冲突课程编号|冲突课程名称)/i.test(text)
}

const looksLikeCodeLine = (line) => {
  const text = safeText(line)
  if (!text) return false
  const lower = text.toLowerCase()
  if (/^(\/\/|\/\*|\*\/)/.test(lower)) return true
  if (/^(var|let|const|function|if|else|for|while|try|catch|return)\b/.test(lower)) return true
  if (/^(\$\(.*\)|document\.|window\.)/.test(lower)) return true
  if (/[{};$<>]/.test(text) && /(ajax|validform|jquery|document|window|ready|tiptype|cssctl|openDialog|submit|callback)/i.test(text)) return true
  if (/^\s*[\w$]+\s*=/.test(text) && /[;{}()]/.test(text)) return true
  return false
}

const normalizeDetailIntro = (value, options = {}) => {
  const allowConflictText = options.allowConflictText === true
  const raw = safeText(value)
  if (!raw) return ''
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  doc.querySelectorAll('script,style,noscript,iframe,svg,canvas').forEach((node) => node.remove())
  const text = safeText((doc.body?.innerText || doc.body?.textContent || raw).replace(/\u00a0/g, ' '))
  if (!text) return ''
  const lines = text
    .split(/\r?\n+/)
    .map((line) => safeText(line.replace(/^[\s*•-]+/, '')))
    .filter(Boolean)
  const filtered = lines.filter((line) => {
    if (looksLikeCodeLine(line)) return false
    if (!allowConflictText && /(冲突课程|冲突上课时间地点|冲突状态|conflictingCourse|detailsForm)/i.test(line)) {
      return false
    }
    return true
  })
  const source = filtered.length >= 2 ? filtered : lines
  const merged = []
  source.forEach((line) => {
    if (!line) return
    if (merged[merged.length - 1] === line) return
    merged.push(line)
  })
  return merged.join('\n')
}

const cleanMessage = (value) => {
  const text = safeText(value)
  const normalized = text.toLowerCase()
  if (!text) return ''
  if (normalized === 'success' || normalized === 'ok' || text === '获取成功') return ''
  return text
}

const resolveErrorMessage = (error, fallback = '请求失败') => {
  const responseData = error?.response?.data
  const messageCandidates = [
    responseData?.error,
    responseData?.message,
    responseData?.msg,
    responseData?.data?.msg,
    responseData?.data?.message,
    error?.message
  ]
  const matched = messageCandidates.map((item) => safeText(item)).find(Boolean)
  return matched || fallback
}

const normalizeOptionList = (source, placeholder = '全部') => {
  const options = [{ value: '', label: placeholder }]
  const pushOption = (value, label) => {
    const nextValue = safeText(value)
    const nextLabel = safeText(label || value)
    if (!nextLabel) return
    if (options.some((item) => item.value === nextValue && item.label === nextLabel)) return
    options.push({ value: nextValue, label: nextLabel })
  }

  if (Array.isArray(source)) {
    source.forEach((item) => {
      if (item && typeof item === 'object') {
        pushOption(
          item.value ?? item.dm ?? item.code ?? item.id ?? item.key ?? item.mc,
          item.label ?? item.mc ?? item.name ?? item.text ?? item.value ?? item.dm
        )
      } else {
        pushOption(item, item)
      }
    })
  } else if (source && typeof source === 'object') {
    Object.entries(source).forEach(([key, value]) => {
      if (value && typeof value === 'object') {
        pushOption(value.value ?? value.dm ?? value.id ?? key, value.label ?? value.mc ?? value.name ?? key)
      } else {
        pushOption(key, value)
      }
    })
  }

  return options
}

const findOptionLabel = (options, value, fallback = '') => {
  const matched = (options || []).find((item) => safeText(item.value) === safeText(value))
  return matched?.label || safeText(fallback || value)
}

const formatRatioText = (value) => {
  const num = Number.parseFloat(safeText(value))
  if (!Number.isFinite(num)) return '--'
  return `${Math.max(0, Math.min(100, num)).toFixed(num % 1 === 0 ? 0 : 1)}%`
}

const parseCapacityInfo = (raw, ratioText) => {
  const text = safeText(raw)
  const ratio = Number.parseFloat(safeText(ratioText))
  const normalizedRatio = Number.isFinite(ratio) ? ratio : null
  let selected = null
  let total = null

  const slashMatch = text.match(/(\d+)\s*[\/／]\s*(\d+)/)
  if (slashMatch) {
    selected = Number.parseInt(slashMatch[1], 10)
    total = Number.parseInt(slashMatch[2], 10)
  } else {
    const numberMatch = text.match(/\d+/g)
    if (numberMatch?.length >= 2) {
      selected = Number.parseInt(numberMatch[0], 10)
      total = Number.parseInt(numberMatch[1], 10)
    } else if (numberMatch?.length === 1 && normalizedRatio === 0) {
      total = Number.parseInt(numberMatch[0], 10)
      selected = total
    }
  }

  const isFullByText = /已满|满额/.test(text)
  const isFullByRatio = normalizedRatio !== null && normalizedRatio <= 0
  const isFullByCount = Number.isFinite(selected) && Number.isFinite(total) && total > 0 && selected >= total
  const display = text || (normalizedRatio !== null ? `容量开放率 ${formatRatioText(ratioText)}` : '--')

  return {
    display,
    selected,
    total,
    ratio: normalizedRatio,
    isFull: isFullByText || isFullByRatio || isFullByCount
  }
}

const normalizeTeacherContent = (content) => {
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item && typeof item === 'object') {
          return stripHtml(item.jsxm || item.teacher || item.name || item.jsmc || item.content || JSON.stringify(item))
        }
        return stripHtml(item)
      })
      .filter(Boolean)
  }
  if (content && typeof content === 'object') {
    if (Array.isArray(content.list)) return normalizeTeacherContent(content.list)
    if (Array.isArray(content.data)) return normalizeTeacherContent(content.data)
    return Object.values(content)
      .map((item) => {
        if (item && typeof item === 'object') {
          return stripHtml(item.jsxm || item.teacher || item.name || item.jsmc || item.content || JSON.stringify(item))
        }
        return stripHtml(item)
      })
      .filter(Boolean)
  }
  const text = stripHtml(content)
  if (!text) return []
  return text.split(/[\n,，、]/).map((item) => safeText(item)).filter(Boolean)
}

const currentTab = computed(() => tabs.value.find((item) => safeText(item.xkgzid) === safeText(activeTabId.value)) || null)
const currentPcid = computed(() => safeText(currentTab.value?.xkgzid))
const currentPcenc = computed(() => {
  const pcid = currentPcid.value
  if (!pcid) return ''
  const map = pcencMap.value || {}
  return safeText(map[pcid] || map[String(pcid)] || currentTab.value?.pcenc)
})

const summaryStudent = computed(() => overview.value?.student || {})

const optionMaps = computed(() => {
  const overviewConditions = overview.value?.conditions || {}
  const condition = listConditions.value || {}
  return {
    kcxz: normalizeOptionList(condition.kcxzList || overviewConditions.kcxzList, '全部性质'),
    kcgs: normalizeOptionList(condition.kcgsList || overviewConditions.kcgsList, '全部归属'),
    jxms: normalizeOptionList(condition.jxmsList || overviewConditions.jxmsList, '全部模式'),
    kkxq: normalizeOptionList(condition.kkxqList || overviewConditions.kkxqList, '全部校区'),
    kclb: normalizeOptionList(condition.kclbList || overviewConditions.kclbList, '全部类别'),
    kclx: normalizeOptionList(condition.kclxList || overviewConditions.kclxList, '全部类型')
  }
})

const detailFields = computed(() => {
  const course = selectedCourse.value
  if (!course) return []
  const rows = [
    { label: '课程名称', value: course.kcmc },
    { label: '教学班名称', value: course.jxbmc },
    { label: '学分', value: course.xf },
    { label: '课程性质', value: findOptionLabel(optionMaps.value.kcxz, course.kcxz, KCXZ_LABEL_MAP[course.kcxz] || course.kcxz) },
    { label: '课程类别', value: course.kclbname || findOptionLabel(optionMaps.value.kclb, course.kclb, course.kclb) },
    { label: '课程类型', value: findOptionLabel(optionMaps.value.kclx, course.kclx, course.kclx) },
    { label: '教学模式', value: findOptionLabel(optionMaps.value.jxms, course.jxms, course.jxms) },
    { label: '授课教师', value: course.teacher },
    { label: '上课时间地点', value: course.isOnline ? '未提供线下上课时间与地点，按网课展示' : (course.scheduleText || course.sksjdd || '未公布时间地点') },
    { label: '上课校区', value: course.kkxqmc || findOptionLabel(optionMaps.value.kkxq, course.kkxq, course.kkxqmc || course.kkxq) },
    { label: '教学班组成', value: course.jxbzc },
    { label: '容量情况', value: course.capacity.display },
    { label: '冲突状态', value: course.isConflict ? '与当前课表冲突' : '无冲突' },
    { label: '标签', value: course.label },
    { label: '考试形式', value: course.ksxs }
  ]
  return rows.filter((item) => safeText(item.value))
})

const detailTeacherText = computed(() => detailTeachers.value.join('、'))

const formatCountdown = (seconds) => {
  if (!Number.isFinite(seconds)) return '--'
  if (seconds <= 0) return '已结束'
  const day = Math.floor(seconds / 86400)
  const hour = Math.floor((seconds % 86400) / 3600)
  const minute = Math.floor((seconds % 3600) / 60)
  const second = Math.floor(seconds % 60)
  const chunks = []
  if (day > 0) chunks.push(`${day}天`)
  if (hour > 0) chunks.push(`${hour}小时`)
  if (minute > 0) chunks.push(`${minute}分钟`)
  if (second > 0 || chunks.length === 0) chunks.push(`${second}秒`)
  return chunks.join('')
}

const reconcileFilterSelection = () => {
  Object.entries(optionMaps.value).forEach(([key, options]) => {
    const current = safeText(filters.value[key])
    if (!current) return
    const valid = options.some((item) => safeText(item.value) === current)
    if (!valid) {
      filters.value[key] = ''
    }
  })
}

const resolveCourseStatus = ({ picked, selectable, full, conflict }) => {
  if (picked) return { statusLabel: '已选', statusClass: 'picked' }
  if (!selectable) return { statusLabel: '不可选', statusClass: 'disabled' }
  if (full) return { statusLabel: '已满', statusClass: 'full' }
  if (conflict) return { statusLabel: '冲突', statusClass: 'conflict' }
  return { statusLabel: '可选', statusClass: 'ready' }
}

const normalizeCourse = (item) => {
  const capacity = parseCapacityInfo(item.yxrl, availableRatio.value)
  const picked = isPickedValue(item.status) || safeText(item.zt) === '已选' || safeText(item.statusLabel).includes('已选')
  const conflict = !picked && (safeText(item.sfct) === '1' || hasConflictHint(item.label))
  const selectable = isEnabledValue(item.sfkxk)
  const full = !picked && capacity.isFull
  const { statusLabel, statusClass } = resolveCourseStatus({ picked, selectable, full, conflict })
  return {
    ...item,
    id: safeText(item.id),
    kcmc: stripHtml(item.kcmc),
    jxbmc: stripHtml(item.jxbmc),
    jxbmcDisplay: compactTeachingClassName(item.jxbmc),
    teacher: stripHtml(item.teacher),
    scheduleText: normalizeScheduleText(item),
    capacity,
    isPicked: picked,
    isConflict: conflict,
    isSelectable: selectable,
    isFull: full,
    isOnline: item.is_online === true || safeText(item.is_online) === 'true',
    hasChildClasses: item.has_child_classes === true || safeText(item.has_child_classes) === 'true',
    statusLabel,
    statusClass
  }
}

const getCoursePriority = (course) => {
  if (course.isPicked) return 0
  if (course.isSelectable && !course.isFull) return 1
  if (course.isSelectable && course.isFull) return 2
  return 3
}

const sortCoursesForDisplay = (list) => {
  return [...list].sort((a, b) => {
    const rankDiff = getCoursePriority(a) - getCoursePriority(b)
    if (rankDiff !== 0) return rankDiff
    if (a.isConflict !== b.isConflict) return a.isConflict ? 1 : -1
    return (a.kcmc || '').localeCompare(b.kcmc || '', 'zh-CN')
  })
}

const applyCoursePatch = (courseId, patcher) => {
  const targetId = safeText(courseId)
  if (!targetId || typeof patcher !== 'function') return
  let nextSelected = null
  courses.value = sortCoursesForDisplay(
    courses.value.map((course) => {
      if (safeText(course.id) !== targetId) return course
      const nextCourse = patcher(course)
      if (selectedCourse.value?.id && safeText(selectedCourse.value.id) === targetId) {
        nextSelected = nextCourse
      }
      return nextCourse
    })
  )
  infoCourses.value = sortInfoCourses(
    infoCourses.value.map((course) => {
      if (safeText(course.id) !== targetId) return course
      const nextCourse = patcher(course)
      if (selectedCourse.value?.id && safeText(selectedCourse.value.id) === targetId) {
        nextSelected = nextCourse
      }
      return nextCourse
    })
  )
  if (nextSelected) selectedCourse.value = nextSelected
}

const normalizeDetailSourceText = (content) => {
  if (typeof content === 'string') return content
  if (content == null) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

const showToast = (message, type = 'info') => {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  toastState.value = { visible: true, message, type }
  toastTimer = setTimeout(() => {
    toastState.value.visible = false
  }, 2800)
}

const stopCountdownTick = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

const startCountdownTick = () => {
  stopCountdownTick()
  if (!Number.isFinite(remainingSeconds.value) || remainingSeconds.value <= 0) return
  countdownTimer = setInterval(() => {
    if (!Number.isFinite(remainingSeconds.value)) return
    if (remainingSeconds.value <= 0) {
      remainingSeconds.value = 0
      countdownText.value = '已结束'
      stopCountdownTick()
      return
    }
    remainingSeconds.value -= 1
    countdownText.value = formatCountdown(remainingSeconds.value)
  }, 1000)
}

const stopEndTimeRefresh = () => {
  if (endTimeRefreshTimer) {
    clearInterval(endTimeRefreshTimer)
    endTimeRefreshTimer = null
  }
}

const startEndTimeRefresh = () => {
  stopEndTimeRefresh()
  if (!currentPcid.value) return
  endTimeRefreshTimer = setInterval(() => {
    void fetchEndTime()
  }, 30000)
}

const unwrapApiResult = (response, fallback = '请求失败') => {
  let payload = response?.data
  let meta = {}

  for (let i = 0; i < 3; i += 1) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) break

    if (payload.success === false) {
      throw new Error(payload.error || payload.message || fallback)
    }

    if ('success' in payload || 'sync_time' in payload || 'offline' in payload || 'error' in payload || 'message' in payload) {
      meta = { ...meta, ...payload }
    }

    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      payload = payload.data
      continue
    }

    break
  }

  return {
    data: payload || {},
    meta,
  }
}

const buildListPayload = ({ pcid, pcenc, filtersSource = EMPTY_LIST_FILTERS } = {}) => {
  const source = filtersSource || EMPTY_LIST_FILTERS
  return {
    pcid: safeText(pcid),
    pcenc: safeText(pcenc),
    from: safeText(source.from || DEFAULT_FROM) || DEFAULT_FROM,
    kcmc: safeText(source.kcmc),
    kcxz: safeText(source.kcxz),
    kcgs: safeText(source.kcgs),
    jxms: safeText(source.jxms),
    teacher: safeText(source.teacher),
    kkxq: safeText(source.kkxq),
    kclb: safeText(source.kclb),
    kclx: safeText(source.kclx)
  }
}

const getRequestPayload = () => buildListPayload({
  pcid: currentPcid.value,
  pcenc: currentPcenc.value,
  filtersSource: {
    ...filters.value,
    from: resolveTabFrom(currentTab.value)
  }
})

const fetchOverview = async () => {
  loadingOverview.value = true
  overviewError.value = ''
  try {
    const res = await axios.post(`${API_BASE}/v2/course_selection/overview`, {})
    console.log('[选课调试] overview 原始响应:', JSON.stringify(res?.data).slice(0, 500))
    const { data, meta } = unwrapApiResult(res, '获取选课总览失败')
    console.log('[选课调试] overview unwrap 后 data keys:', Object.keys(data || {}))
    console.log('[选课调试] tabs 数量:', Array.isArray(data.tabs) ? data.tabs.length : 'N/A', ', pcencs keys:', Object.keys(data.pcencs || {}))
    console.log('[选课调试] has_valid_pcencs:', data.has_valid_pcencs, ', message:', data.message)
    if (Array.isArray(data.tabs)) {
      data.tabs.forEach((t, i) => console.log(`[选课调试] tab[${i}]: xkgzid=${t.xkgzid}, xkgzMc=${t.xkgzMc}, kklx=${t.kklx}`))
    }
    overview.value = data
    tabs.value = Array.isArray(data.tabs) ? data.tabs : []
    pcencMap.value = data.pcencs || {}
    offline.value = meta.offline === true || data.offline === true
    syncTime.value = safeText(meta.sync_time || data.sync_time)
    if (tabs.value.length > 0) {
      activeTabId.value = safeText(tabs.value[0].xkgzid)
    } else {
      activeTabId.value = ''
      courses.value = []
      listMessage.value = cleanMessage(data.message) || '当前暂无可选课程'
      stopCountdownTick()
      stopEndTimeRefresh()
    }
  } catch (err) {
    overviewError.value = resolveErrorMessage(err, '获取选课总览失败')
    tabs.value = []
    courses.value = []
    stopCountdownTick()
    stopEndTimeRefresh()
  } finally {
    loadingOverview.value = false
  }
}

const fetchEndTime = async () => {
  if (!currentPcid.value || !safeText(currentTab.value?.kklx)) {
    remainingSeconds.value = null
    countdownText.value = '--'
    isPreview.value = false
    stopCountdownTick()
    stopEndTimeRefresh()
    return
  }
  try {
    const res = await axios.post(`${API_BASE}/v2/course_selection/end_time`, {
      pcid: currentPcid.value,
      kklx: safeText(currentTab.value?.kklx)
    })
    const { data } = unwrapApiResult(res, '获取批次倒计时失败')
    remainingSeconds.value = Number.isFinite(Number(data.remaining_seconds)) ? Number(data.remaining_seconds) : null
    if (Number.isFinite(remainingSeconds.value)) {
      countdownText.value = formatCountdown(remainingSeconds.value)
      startCountdownTick()
    } else {
      countdownText.value = safeText(data.countdown_text || '--')
      stopCountdownTick()
    }
    isPreview.value = data.is_preview === true
  } catch {
    remainingSeconds.value = null
    countdownText.value = '--'
    isPreview.value = false
    stopCountdownTick()
  }
}

const fetchList = async () => {
  console.log('[选课调试] fetchList: pcid=', currentPcid.value, ', pcenc=', currentPcenc.value ? currentPcenc.value.slice(0, 20) + '...' : '(空)')
  if (!currentPcid.value || !currentPcenc.value) {
    courses.value = []
    listMessage.value = '当前批次缺少有效凭证'
    console.warn('[选课调试] fetchList 中止：pcid 或 pcenc 为空')
    return
  }
  loadingList.value = true
  listMessage.value = ''
  try {
    const res = await axios.post(`${API_BASE}/v2/course_selection/list`, getRequestPayload())
    const { data, meta } = unwrapApiResult(res, '获取选课列表失败')
    listConditions.value = data.condition || {}
    availableRatio.value = safeText(data.available_ratio || '100')
    occupiedSlots.value = Array.isArray(data.occupied_slots) ? data.occupied_slots : []
    count.value = Number(data.count || 0)
    courses.value = Array.isArray(data.courses) ? sortCoursesForDisplay(data.courses.map(normalizeCourse)) : []
    listMessage.value = cleanMessage(data.message)
    offline.value = meta.offline === true || data.offline === true || offline.value
    syncTime.value = safeText(meta.sync_time || data.sync_time || syncTime.value)
    reconcileFilterSelection()
  } catch (err) {
    courses.value = []
    listMessage.value = resolveErrorMessage(err, '获取选课列表失败')
  } finally {
    loadingList.value = false
  }
}

const loadTabBundle = async () => {
  await Promise.all([fetchList(), fetchEndTime()])
  startEndTimeRefresh()
}

const handleTabChange = async (tabId) => {
  if (!safeText(tabId) || safeText(tabId) === safeText(activeTabId.value)) return
  activeTabId.value = safeText(tabId)
  detailIntro.value = ''
  detailTeachers.value = []
  selectedCourse.value = null
  showDetail.value = false
  reconcileFilterSelection()
  await loadTabBundle()
}

const resetFilters = async () => {
  filters.value = {
    kcmc: '',
    kcxz: '',
    kcgs: '',
    jxms: '',
    teacher: '',
    kkxq: '',
    kclb: '',
    kclx: ''
  }
  await fetchList()
}

const queryCourses = async () => {
  await fetchList()
}

const refreshCourseData = async () => {
  if (refreshing.value || loadingOverview.value || loadingList.value) return
  refreshing.value = true
  try {
    if (!tabs.value.length) {
      await fetchOverview()
    }
    if (activeTabId.value) {
      await loadTabBundle()
      showToast('已刷新当前批次课程', 'success')
    } else {
      showToast('当前暂无可刷新的选课批次', 'info')
    }
  } catch (err) {
    showToast(resolveErrorMessage(err, '刷新选课数据失败'), 'error')
  } finally {
    refreshing.value = false
  }
}

const mapToOptions = (sourceMap, placeholder = '全部') => {
  const options = [{ value: '', label: placeholder }]
  Array.from(sourceMap.entries())
    .map(([value, label]) => ({
      value: safeText(value),
      label: safeText(label || value)
    }))
    .filter((item) => item.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
    .forEach((item) => {
      if (options.some((existing) => existing.value === item.value && existing.label === item.label)) return
      options.push(item)
    })
  return options
}

const resolveInfoSelectionMode = (item) => {
  return safeText(
    item?.xkfsmc || item?.xkfs || item?.selection_mode || item?.select_mode || item?.mode || '选课'
  ) || '选课'
}

const deriveTabTermLabel = (tab) => {
  const tabName = safeText(tab?.xkgzMc)
  if (tabName) return tabName
  const studentSemester = safeText(summaryStudent.value?.semester)
  return studentSemester || '当前学期'
}

const normalizeInfoCourse = (item, context = {}) => {
  const fallbackId = `${safeText(context.tabId || 'tab')}-${safeText(context.index || '0')}-${safeText(item?.kcmc || item?.course_name || 'course')}`
  const merged = {
    ...item,
    id: safeText(item?.id || item?.jxbid || item?.jxb_id || item?.source_id || fallbackId),
    jxbmc: item?.jxbmc ?? item?.jxbmcDisplay ?? item?.jxb_name ?? item?.bjmc ?? '',
    kcmc: item?.kcmc ?? item?.course_name ?? item?.kcname ?? '',
    xf: item?.xf ?? item?.credit ?? '',
    teacher: item?.teacher ?? item?.jsxm ?? item?.lsxm ?? item?.skjs ?? '',
    sksjdd: item?.sksjdd ?? item?.skdd ?? item?.time_place ?? '',
    sksjddstr: item?.sksjddstr ?? item?.sksj ?? item?.time_text ?? '',
    yxrl: item?.yxrl ?? item?.capacity ?? item?.capacity_text ?? '',
    status: item?.status ?? (item?.picked === true || item?.isPicked === true ? '1' : ''),
    sfkxk: item?.sfkxk ?? (item?.isSelectable === true ? '1' : '0'),
    sfct: item?.sfct ?? (item?.isConflict === true ? '1' : '0'),
    kkxqmc: item?.kkxqmc ?? item?.campus ?? '',
    kcxz: item?.kcxz ?? item?.course_nature ?? '',
    kclx: item?.kclx ?? item?.course_type ?? '',
    kclbname: item?.kclbname ?? item?.kclb ?? '',
    kcjj: item?.kcjj ?? item?.course_intro ?? '',
    jxbzc: item?.jxbzc ?? item?.class_group ?? '',
    label: item?.label ?? item?.remark ?? '',
    jxms: item?.jxms ?? item?.teaching_mode ?? '',
    ksxs: item?.ksxs ?? item?.exam_mode ?? ''
  }
  const normalized = normalizeCourse(merged)
  const picked = normalized.isPicked || isPickedValue(item?.status) || safeText(item?.zt) === '已选' || safeText(item?.statusLabel).includes('已选')
  const status = resolveCourseStatus({
    picked,
    selectable: normalized.isSelectable,
    full: normalized.isFull,
    conflict: normalized.isConflict
  })
  return {
    ...normalized,
    ...status,
    isPicked: picked,
    termLabel: safeText(item?.xnxq || item?.semester || context.termLabel || summaryStudent.value?.semester || '当前学期'),
    xkfsText: resolveInfoSelectionMode(item),
    sourceTabId: safeText(context.tabId || item?.sourceTabId),
    sourceTabName: safeText(context.tabName || item?.sourceTabName)
  }
}

const dedupeInfoCourses = (list) => {
  const map = new Map()
  ;(list || []).forEach((item) => {
    const key = [safeText(item.id), safeText(item.termLabel), safeText(item.sourceTabId), safeText(item.xkfsText)].join('::')
    if (!map.has(key)) {
      map.set(key, item)
    }
  })
  return Array.from(map.values())
}

const sortInfoCourses = (list) => {
  return [...list].sort((a, b) => {
    const termDiff = safeText(b.termLabel).localeCompare(safeText(a.termLabel), 'zh-CN')
    if (termDiff !== 0) return termDiff
    return safeText(a.kcmc).localeCompare(safeText(b.kcmc), 'zh-CN')
  })
}

const pickArrayPayload = (data) => {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const candidates = [data.courses, data.list, data.items, data.rows, data.records, data.data]
  const found = candidates.find((item) => Array.isArray(item))
  return Array.isArray(found) ? found : []
}

const mergeConditionOptions = (condition, kcxzMap, kclxMap) => {
  normalizeOptionList(condition?.kcxzList, '全部性质').forEach((item) => {
    const value = safeText(item.value || item.label)
    const label = safeText(item.label || item.value)
    if (!value || !label) return
    kcxzMap.set(value, label)
  })
  normalizeOptionList(condition?.kclxList, '全部类型').forEach((item) => {
    const value = safeText(item.value || item.label)
    const label = safeText(item.label || item.value)
    if (!value || !label) return
    kclxMap.set(value, label)
  })
}

const applyInfoOptionsAndDefaults = ({ termMap, xkfsSet, kcxzMap, kclxMap }) => {
  infoOptions.value = {
    term: mapToOptions(termMap, '全部学期'),
    xkfs: mapToOptions(new Map(Array.from(xkfsSet).map((value) => [value, value])), '全部方式'),
    kcxz: mapToOptions(kcxzMap, '全部性质'),
    kclx: mapToOptions(kclxMap, '全部类型')
  }

  const semester = safeText(summaryStudent.value?.semester)
  const termOptions = infoOptions.value.term
  const selectedTerm = safeText(infoFilters.value.term)
  const currentTermValid = selectedTerm && termOptions.some((item) => safeText(item.value) === selectedTerm)
  if (!currentTermValid) {
    const matchedTerm = termOptions.find((item) => {
      if (!safeText(item.value)) return false
      if (!semester) return false
      return safeText(item.label).includes(semester) || safeText(item.value).includes(semester)
    })
    const firstNonEmpty = termOptions.find((item) => safeText(item.value))
    infoFilters.value.term = matchedTerm?.value || firstNonEmpty?.value || ''
  }

  if (!infoShowOtherModes.value) {
    infoFilters.value.xkfs = '选课'
  } else {
    const xkfsValid = infoOptions.value.xkfs.some((item) => safeText(item.value) === safeText(infoFilters.value.xkfs))
    if (!xkfsValid) infoFilters.value.xkfs = ''
  }

  ;['kcxz', 'kclx'].forEach((key) => {
    const valid = infoOptions.value[key].some((item) => safeText(item.value) === safeText(infoFilters.value[key]))
    if (!valid) infoFilters.value[key] = ''
  })
}

const fetchSelectedCoursesByEndpoint = async (querySemester) => {
  const semester = safeText(querySemester) || safeText(infoFilters.value.term) || safeText(summaryStudent.value?.semester)
  const res = await axios.post(`${API_BASE}/v2/course_selection/selected_courses`, {
    semester
  })
  const { data } = unwrapApiResult(res, '获取已选课程失败')
  const list = pickArrayPayload(data)
  if (!list.length) {
    throw new Error('已选课程接口暂无数据')
  }
  const termMap = new Map()
  // 从后端返回的 semesters 列表填充学期选项
  const serverSemesters = Array.isArray(data?.semesters) ? data.semesters : []
  serverSemesters.forEach((sem) => {
    const s = safeText(sem)
    if (s) termMap.set(s, s)
  })
  const xkfsSet = new Set(['选课'])
  const kcxzMap = new Map()
  const kclxMap = new Map()
  const normalized = list.map((item, index) => {
    const course = normalizeInfoCourse(item, {
      tabId: safeText(item?.sourceTabId || item?.pcid || 'selected_api'),
      tabName: safeText(item?.sourceTabName || item?.source || '已选课程'),
      termLabel: safeText(item?.xnxq || item?.semester || data?.current_semester || summaryStudent.value?.semester || '当前学期'),
      index
    })
    termMap.set(course.termLabel, course.termLabel)
    xkfsSet.add(course.xkfsText || '选课')
    if (safeText(course.kcxz)) {
      const code = safeText(course.kcxz)
      kcxzMap.set(code, KCXZ_LABEL_MAP[code] || safeText(course.kclb) || code)
    }
    if (safeText(course.kclx)) kclxMap.set(safeText(course.kclx), safeText(course.kclx))
    return course
  })
  mergeConditionOptions(data?.condition || data?.conditions || {}, kcxzMap, kclxMap)
  return {
    courses: normalized,
    termMap,
    xkfsSet,
    kcxzMap,
    kclxMap,
    currentSemester: safeText(data?.current_semester),
    source: 'endpoint'
  }
}

const fetchSelectedCoursesByTabs = async () => {
  if (!tabs.value.length) {
    await fetchOverview()
  }
  console.log('[选课调试] fetchSelectedCoursesByTabs: tabs 数量=', tabs.value.length, ', pcencMap keys=', Object.keys(pcencMap.value || {}))

  const termMap = new Map()
  const xkfsSet = new Set(['选课'])
  const kcxzMap = new Map()
  const kclxMap = new Map()
  const merged = []

  for (const tab of tabs.value) {
    const tabId = safeText(tab?.xkgzid)
    if (!tabId) { console.warn('[选课调试] 跳过无 xkgzid 的 tab'); continue }
    const termLabel = deriveTabTermLabel(tab)
    const tabFrom = resolveTabFrom(tab)
    termMap.set(termLabel, termLabel)
    const tabPcenc = safeText(pcencMap.value?.[tabId] || pcencMap.value?.[String(tabId)] || tab?.pcenc)
    console.log(`[选课调试] tab ${tabId}: pcenc=${tabPcenc ? tabPcenc.slice(0, 20) + '...' : '(空)'}, from=${tabFrom}`)
    if (!tabPcenc) { console.warn(`[选课调试] tab ${tabId} 无 pcenc，跳过`); continue }
    try {
      const res = await axios.post(
        `${API_BASE}/v2/course_selection/list`,
        buildListPayload({
          pcid: tabId,
          pcenc: tabPcenc,
          filtersSource: {
            ...EMPTY_LIST_FILTERS,
            from: tabFrom
          }
        })
      )
      const { data } = unwrapApiResult(res, '获取已选课程失败')
      mergeConditionOptions(data?.condition || {}, kcxzMap, kclxMap)
      const rawCourses = Array.isArray(data?.courses) ? data.courses : []
      console.log(`[选课调试] tab ${tabId}: list 返回 ${rawCourses.length} 门课程`)
      if (rawCourses.length > 0) {
        console.log(`[选课调试] tab ${tabId}: 第一门课程 status=${rawCourses[0].status}, kcmc=${rawCourses[0].kcmc}`)
      }
      let pickedCount = 0
      rawCourses.forEach((item, index) => {
        const normalized = normalizeInfoCourse(item, {
          tabId,
          tabName: safeText(tab?.xkgzMc || '未命名批次'),
          termLabel,
          index
        })
        if (!normalized.isPicked) return
        pickedCount += 1
        merged.push(normalized)
        xkfsSet.add(normalized.xkfsText || '选课')
        if (safeText(normalized.kcxz)) {
          kcxzMap.set(safeText(normalized.kcxz), findOptionLabel(optionMaps.value.kcxz, normalized.kcxz, KCXZ_LABEL_MAP[normalized.kcxz] || normalized.kcxz))
        }
        if (safeText(normalized.kclx)) {
          kclxMap.set(safeText(normalized.kclx), findOptionLabel(optionMaps.value.kclx, normalized.kclx, normalized.kclx))
        }
      })
      console.log(`[选课调试] tab ${tabId}: isPicked 数量= ${pickedCount}`)
    } catch (tabErr) {
      console.error(`[选课调试] tab ${tabId} list 请求失败:`, tabErr?.message || tabErr)
      continue
    }
  }

  return {
    courses: merged,
    termMap,
    xkfsSet,
    kcxzMap,
    kclxMap,
    source: 'tabs'
  }
}

const querySelectedCourses = async ({ showSuccessToast = false } = {}) => {
  if (loadingInfo.value) return
  loadingInfo.value = true
  infoError.value = ''
  infoSourceMessage.value = ''
  try {
    // 优先通过已选课程接口查询（无需选课时段开放）
    let fetched = null
    try {
      const endpointFetched = await fetchSelectedCoursesByEndpoint()
      console.log('[选课调试] endpoint 结果: courses=', endpointFetched.courses.length)
      if (endpointFetched.courses.length) {
        fetched = endpointFetched
        infoSourceMessage.value = '已通过已选课程接口自动查询'
      }
    } catch (epErr) {
      console.warn('[选课调试] endpoint 查询失败:', epErr?.message || epErr)
    }

    // endpoint 无结果时回退到选课批次聚合
    if (!fetched || !fetched.courses.length) {
      if (!tabs.value.length) {
        await fetchOverview()
      }
      const tabsFetched = await fetchSelectedCoursesByTabs()
      console.log('[选课调试] fetchSelectedCoursesByTabs 结果: courses=', tabsFetched.courses.length, ', termMap=', Array.from(tabsFetched.termMap.keys()))
      if (tabsFetched.courses.length) {
        fetched = tabsFetched
        infoSourceMessage.value = '已从选课批次聚合已选课程结果'
      } else if (!fetched) {
        fetched = tabsFetched
      }
    }

    const deduped = dedupeInfoCourses(fetched.courses)
    infoCourses.value = sortInfoCourses(deduped)
    applyInfoOptionsAndDefaults({
      termMap: fetched.termMap,
      xkfsSet: fetched.xkfsSet,
      kcxzMap: fetched.kcxzMap,
      kclxMap: fetched.kclxMap
    })
    infoLoaded.value = true
    if (showSuccessToast) {
      showToast('已刷新信息查询结果', 'success')
    }
  } catch (err) {
    infoCourses.value = []
    infoError.value = resolveErrorMessage(err, '获取已选课程失败')
    if (showSuccessToast) {
      showToast(infoError.value, 'error')
    }
  } finally {
    loadingInfo.value = false
  }
}

const resetInfoFilters = () => {
  const defaultTerm = infoOptions.value.term.find((item) => safeText(item.value))?.value || ''
  infoFilters.value = {
    term: defaultTerm,
    kcmc: '',
    teacher: '',
    kcxz: '',
    kclx: '',
    xkfs: infoShowOtherModes.value ? '' : '选课'
  }
}

const handleInfoOtherModesChange = () => {
  if (infoShowOtherModes.value) {
    infoFilters.value.xkfs = ''
  } else {
    infoFilters.value.xkfs = '选课'
  }
}

// 学期切换时自动重新查询
const onInfoTermChange = async () => {
  const term = safeText(infoFilters.value.term)
  if (!term) return
  // 如果当前已有该学期的课程数据，不需要重新查询
  const hasData = infoCourses.value.some((c) => safeText(c.termLabel) === term)
  if (hasData) return
  // 否则用新学期重新查询
  try {
    loadingInfo.value = true
    const endpointFetched = await fetchSelectedCoursesByEndpoint(term)
    if (endpointFetched.courses.length) {
      // 合并到已有课程列表
      const merged = [...infoCourses.value, ...endpointFetched.courses]
      infoCourses.value = sortInfoCourses(dedupeInfoCourses(merged))
    }
  } catch (err) {
    console.warn('[选课调试] 切换学期查询失败:', err?.message || err)
  } finally {
    loadingInfo.value = false
  }
}

const enterSelectionMode = async () => {
  centerMode.value = ENTRY_MODE_SELECTION
  if (!tabs.value.length) {
    await fetchOverview()
  }
  if (activeTabId.value && !courses.value.length && !loadingList.value) {
    await loadTabBundle()
  }
}

const enterInfoMode = async () => {
  centerMode.value = ENTRY_MODE_INFO
  if (!infoLoaded.value || !infoCourses.value.length) {
    await querySelectedCourses()
  }
}

const backToEntryMenu = () => {
  centerMode.value = ENTRY_MODE_MENU
  infoShowAdvanced.value = false
}

const handleBack = () => {
  if (centerMode.value === ENTRY_MODE_MENU) {
    emit('back')
    return
  }
  backToEntryMenu()
}

const handleHeaderRefresh = async () => {
  if (centerMode.value === ENTRY_MODE_SELECTION) {
    await refreshCourseData()
    return
  }
  if (centerMode.value === ENTRY_MODE_INFO) {
    await querySelectedCourses({ showSuccessToast: true })
  }
}

const openDetail = async (course) => {
  selectedCourse.value = course
  const cachedIntroText = normalizeDetailSourceText(course.kcjj)
  const cachedConflictHint = hasConflictHint(cachedIntroText)
  if (cachedConflictHint && !course.isPicked && !course.isConflict) {
    applyCoursePatch(course.id, (prev) => {
      const nextConflict = true
      const nextStatus = resolveCourseStatus({
        picked: prev.isPicked,
        selectable: prev.isSelectable,
        full: prev.isFull,
        conflict: nextConflict
      })
      return { ...prev, isConflict: nextConflict, ...nextStatus }
    })
  }
  detailIntro.value = normalizeDetailIntro(cachedIntroText, {
    allowConflictText: course.isConflict || cachedConflictHint
  })
  detailTeachers.value = course.teacher ? [course.teacher] : []
  showDetail.value = true
  detailLoading.value = true
  try {
    const [introRes, teacherRes] = await Promise.allSettled([
      axios.post(`${API_BASE}/v2/course_selection/detail_intro`, { jxbid: course.id }),
      axios.post(`${API_BASE}/v2/course_selection/detail_teacher`, { jxbid: course.id })
    ])
    if (introRes.status === 'fulfilled') {
      const { data } = unwrapApiResult(introRes.value, '获取课程简介失败')
      const introRaw = normalizeDetailSourceText(data.content || detailIntro.value)
      const introHasConflict = hasConflictHint(introRaw)
      if (introHasConflict && !course.isPicked) {
        applyCoursePatch(course.id, (prev) => {
          const nextConflict = true
          const nextStatus = resolveCourseStatus({
            picked: prev.isPicked,
            selectable: prev.isSelectable,
            full: prev.isFull,
            conflict: nextConflict
          })
          return { ...prev, isConflict: nextConflict, ...nextStatus }
        })
      }
      const latestCourse = courses.value.find((item) => item.id === course.id)
      detailIntro.value = normalizeDetailIntro(introRaw, {
        allowConflictText: latestCourse?.isConflict === true || introHasConflict
      })
    }
    if (teacherRes.status === 'fulfilled') {
      const { data } = unwrapApiResult(teacherRes.value, '获取教师详情失败')
      const normalized = normalizeTeacherContent(data.content)
      if (normalized.length > 0) detailTeachers.value = normalized
    }
  } catch {
    // ignore
  } finally {
    detailLoading.value = false
  }
}

const closeDetail = () => {
  showDetail.value = false
  selectedCourse.value = null
  detailLoading.value = false
}

const submitSelect = async (course, zjxbid = '') => {
  if (!course?.id) return
  selectingCourseId.value = course.id
  try {
    const res = await axios.post(`${API_BASE}/v2/course_selection/select`, {
      pcid: currentPcid.value,
      jxbid: course.id,
      zjxbid: safeText(zjxbid) || undefined,
      from: resolveTabFrom(currentTab.value)
    })
    const { data } = unwrapApiResult(res, '选课失败')
    showChildClassDialog.value = false
    childClasses.value = []
    pendingSelectCourse.value = null
    selectedChildClassId.value = ''
    showToast(safeText(data.msg) || '选课成功', 'success')
    await fetchList()
    if (selectedCourse.value?.id === course.id) {
      const next = courses.value.find((item) => item.id === course.id)
      if (next) selectedCourse.value = next
    }
  } catch (err) {
    showToast(resolveErrorMessage(err, '选课失败'), 'error')
  } finally {
    selectingCourseId.value = ''
  }
}

const openActionConfirm = ({ type, course, childClassId = '' }) => {
  if (!course?.id) return
  confirmActionType.value = type
  confirmTargetCourse.value = course
  confirmTargetChildClassId.value = safeText(childClassId)
  showActionConfirmDialog.value = true
}

const closeActionConfirm = () => {
  showActionConfirmDialog.value = false
  confirmActionType.value = ''
  confirmTargetCourse.value = null
  confirmTargetChildClassId.value = ''
}

const submitConfirmedAction = async () => {
  const course = confirmTargetCourse.value
  if (!course?.id) return
  const actionType = confirmActionType.value
  const childClassId = confirmTargetChildClassId.value
  closeActionConfirm()
  if (actionType === 'select') {
    await submitSelect(course, childClassId)
    return
  }
  if (actionType === 'withdraw') {
    await submitWithdraw(course)
  }
}

const openChildClassPicker = async (course) => {
  if (!course?.id) return
  selectingCourseId.value = course.id
  try {
    const res = await axios.post(`${API_BASE}/v2/course_selection/child_classes`, {
      pcid: currentPcid.value,
      pcenc: currentPcenc.value,
      jxbid: course.id,
      from: resolveTabFrom(currentTab.value)
    })
    const { data } = unwrapApiResult(res, '获取子教学班失败')
    const classes = Array.isArray(data.classes) ? data.classes : []
    const childIds = Array.isArray(data.child_ids) ? data.child_ids.map((item) => safeText(item)).filter(Boolean) : []
    const normalized = classes.map((item) => ({
      id: safeText(item.id),
      name: stripHtml(item.name || item.id),
      teacher: stripHtml(item.teacher),
      schedule: looksLikeEncodedSchedule(item.schedule) ? '' : stripHtml(item.schedule)
    })).filter((item) => item.id)
    if (normalized.length <= 1) {
      const singleId = normalized[0]?.id || childIds[0] || ''
      openActionConfirm({ type: 'select', course, childClassId: singleId })
      return
    }
    pendingSelectCourse.value = course
    childClasses.value = normalized
    selectedChildClassId.value = normalized[0]?.id || ''
    showChildClassDialog.value = true
  } catch (err) {
    showToast(resolveErrorMessage(err, '获取子教学班失败'), 'error')
  } finally {
    selectingCourseId.value = ''
  }
}

const handleSelectCourse = async (course) => {
  if (!course?.isSelectable || course?.isFull || course?.isPicked) return
  if (course.hasChildClasses) {
    await openChildClassPicker(course)
    return
  }
  openActionConfirm({ type: 'select', course })
}

const openWithdrawConfirm = (course) => {
  openActionConfirm({ type: 'withdraw', course })
}

const submitWithdraw = async (course) => {
  if (!course?.id) return
  withdrawingCourseId.value = course.id
  try {
    const res = await axios.post(`${API_BASE}/v2/course_selection/withdraw`, {
      pcid: currentPcid.value,
      jxbid: course.id
    })
    const { data } = unwrapApiResult(res, '退课失败')
    showToast(safeText(data.msg) || '退课成功', 'success')
    await fetchList()
    if (selectedCourse.value?.id === course.id) {
      const next = courses.value.find((item) => item.id === course.id)
      if (next) selectedCourse.value = next
    }
  } catch (err) {
    showToast(resolveErrorMessage(err, '退课失败'), 'error')
  } finally {
    withdrawingCourseId.value = ''
  }
}

const currentDetailCourse = computed(() => {
  if (!selectedCourse.value?.id) return selectedCourse.value
  const fromSelection = courses.value.find((item) => item.id === selectedCourse.value.id)
  if (fromSelection) return fromSelection
  return infoCourses.value.find((item) => item.id === selectedCourse.value.id) || selectedCourse.value
})

const filteredInfoCourses = computed(() => {
  const keyword = safeText(infoFilters.value.kcmc).toLowerCase()
  const teacher = safeText(infoFilters.value.teacher).toLowerCase()
  return infoCourses.value.filter((course) => {
    if (safeText(infoFilters.value.term) && safeText(course.termLabel) !== safeText(infoFilters.value.term)) {
      return false
    }
    if (keyword && !safeText(course.kcmc).toLowerCase().includes(keyword)) {
      return false
    }
    if (teacher && !safeText(course.teacher).toLowerCase().includes(teacher)) {
      return false
    }
    if (safeText(infoFilters.value.kcxz) && safeText(course.kcxz) !== safeText(infoFilters.value.kcxz)) {
      return false
    }
    if (safeText(infoFilters.value.kclx) && safeText(course.kclx) !== safeText(infoFilters.value.kclx)) {
      return false
    }

    const mode = safeText(course.xkfsText || '选课')
    if (!infoShowOtherModes.value && mode !== '选课') {
      return false
    }
    if (infoShowOtherModes.value && safeText(infoFilters.value.xkfs) && mode !== safeText(infoFilters.value.xkfs)) {
      return false
    }
    return true
  })
})

const infoEmptyHint = computed(() => {
  if (loadingInfo.value) return '正在查询已选课程...'
  if (infoError.value) return infoError.value
  if (!infoLoaded.value) return '点击“信息查询”后将自动加载结果'
  return '当前筛选条件下暂无课程'
})

const refreshButtonLabel = computed(() => {
  if (centerMode.value === ENTRY_MODE_SELECTION) {
    return refreshing.value ? '刷新中…' : '刷新'
  }
  if (centerMode.value === ENTRY_MODE_INFO) {
    return loadingInfo.value ? '查询中…' : '刷新查询'
  }
  return '刷新'
})

const refreshDisabled = computed(() => {
  if (centerMode.value === ENTRY_MODE_SELECTION) {
    return refreshing.value || loadingList.value || loadingOverview.value
  }
  if (centerMode.value === ENTRY_MODE_INFO) {
    return loadingInfo.value
  }
  return true
})

const headerMainPill = computed(() => {
  if (centerMode.value === ENTRY_MODE_SELECTION) {
    return `可选课程 ${count.value} 门`
  }
  if (centerMode.value === ENTRY_MODE_INFO) {
    return `已选课程 ${filteredInfoCourses.value.length} 门`
  }
  return '请选择查询入口'
})

const headerSubPill = computed(() => {
  if (centerMode.value === ENTRY_MODE_SELECTION) {
    return `批次倒计时 ${countdownText.value || '--'}`
  }
  if (centerMode.value === ENTRY_MODE_INFO) {
    return `当前学期 ${safeText(infoFilters.value.term) || safeText(summaryStudent.value?.semester) || '--'}`
  }
  return '左侧选课，右侧信息查询'
})

const pageTitle = computed(() => {
  if (centerMode.value === ENTRY_MODE_SELECTION) return '选课中心 · 选课'
  if (centerMode.value === ENTRY_MODE_INFO) return '选课中心 · 信息查询'
  return '选课中心'
})

const backButtonLabel = computed(() => (centerMode.value === ENTRY_MODE_MENU ? '← 返回' : '← 入口'))

const emptyHint = computed(() => {
  if (loadingOverview.value || loadingList.value) return '加载中...'
  if (overviewError.value) return overviewError.value
  return listMessage.value || '当前暂无可选课程'
})

const canShowList = computed(() => tabs.value.length > 0)

onMounted(async () => {
  await fetchOverview()
  if (activeTabId.value) {
    await loadTabBundle()
  }
})

onBeforeUnmount(() => {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  stopCountdownTick()
  stopEndTimeRefresh()
})
</script>

<template>
  <div class="course-selection-view">
    <div class="course-page-header glass-card">
      <div class="header-top">
        <button class="back-btn ios26-btn" @click="handleBack">{{ backButtonLabel }}</button>
        <div class="course-page-title">{{ pageTitle }}</div>
        <button
          v-if="centerMode !== ENTRY_MODE_MENU"
          class="refresh-btn ios26-btn"
          type="button"
          :disabled="refreshDisabled"
          @click="handleHeaderRefresh"
        >
          {{ refreshButtonLabel }}
        </button>
        <div v-else class="refresh-btn-placeholder" aria-hidden="true" />
      </div>
      <div class="header-meta-row">
        <span class="header-mini-pill">{{ headerMainPill }}</span>
        <span class="header-mini-pill">{{ headerSubPill }}</span>
      </div>
    </div>

    <div class="content">
      <template v-if="centerMode === ENTRY_MODE_MENU">
        <div class="entry-grid">
          <button type="button" class="entry-tile glass-card" @click="enterSelectionMode">
            <div class="entry-badge entry-badge-selection">选课</div>
            <div class="entry-title">选课</div>
            <div class="entry-desc">沿用当前选课与退课能力，支持批次切换、筛选与课程详情。</div>
          </button>
          <button type="button" class="entry-tile glass-card" @click="enterInfoMode">
            <div class="entry-badge entry-badge-info">信息查询</div>
            <div class="entry-title">信息查询</div>
            <div class="entry-desc">自动查询已选课程，默认匹配当前学期，并支持展开高级筛选。</div>
          </button>
        </div>
      </template>

      <template v-else-if="centerMode === ENTRY_MODE_SELECTION">
        <div class="filter-card glass-card">
          <div class="filter-header">
            <div>
              <div class="filter-title">查询条件</div>
              <div class="filter-subtitle">默认折叠，按需展开筛选条件</div>
            </div>
            <div class="filter-actions">
              <button class="ghost-btn" type="button" @click="backToEntryMenu">返回入口</button>
              <button class="ghost-btn" type="button" @click="resetFilters">重置</button>
              <button class="ghost-btn" type="button" @click="showAdvanced = !showAdvanced">{{ showAdvanced ? '收起筛选' : '展开筛选' }}</button>
              <button class="primary-btn" type="button" :disabled="loadingList || !canShowList" @click="queryCourses">查询课程</button>
            </div>
          </div>

          <template v-if="showAdvanced">
            <div class="filter-grid compact-grid">
              <div class="field span-2">
                <label>课程名称</label>
                <input v-model.trim="filters.kcmc" class="text-input" type="text" placeholder="输入课程名称关键词" />
              </div>
              <div class="field">
                <label>课程性质</label>
                <IOSSelect v-model="filters.kcxz" class="modern-select">
                  <option v-for="item in optionMaps.kcxz" :key="item.value || 'empty-kcxz'" :value="item.value">{{ item.label }}</option>
                </IOSSelect>
              </div>
              <div class="field">
                <label>课程归属</label>
                <IOSSelect v-model="filters.kcgs" class="modern-select">
                  <option v-for="item in optionMaps.kcgs" :key="item.value || 'empty-kcgs'" :value="item.value">{{ item.label }}</option>
                </IOSSelect>
              </div>
              <div class="field">
                <label>教学模式</label>
                <IOSSelect v-model="filters.jxms" class="modern-select">
                  <option v-for="item in optionMaps.jxms" :key="item.value || 'empty-jxms'" :value="item.value">{{ item.label }}</option>
                </IOSSelect>
              </div>
              <div class="field">
                <label>教师</label>
                <input v-model.trim="filters.teacher" class="text-input" type="text" placeholder="输入授课教师" />
              </div>
            </div>

            <div class="filter-grid advanced-grid">
              <div class="field">
                <label>上课校区</label>
                <IOSSelect v-model="filters.kkxq" class="modern-select">
                  <option v-for="item in optionMaps.kkxq" :key="item.value || 'empty-kkxq'" :value="item.value">{{ item.label }}</option>
                </IOSSelect>
              </div>
              <div class="field">
                <label>课程类别</label>
                <IOSSelect v-model="filters.kclb" class="modern-select">
                  <option v-for="item in optionMaps.kclb" :key="item.value || 'empty-kclb'" :value="item.value">{{ item.label }}</option>
                </IOSSelect>
              </div>
              <div class="field">
                <label>课程类型</label>
                <IOSSelect v-model="filters.kclx" class="modern-select">
                  <option v-for="item in optionMaps.kclx" :key="item.value || 'empty-kclx'" :value="item.value">{{ item.label }}</option>
                </IOSSelect>
              </div>
            </div>
          </template>
        </div>

        <div class="batch-card glass-card">
          <div class="section-head">
            <div>
              <h3>选课批次</h3>
              <p>{{ cleanMessage(overview?.message) || '从教务系统中选择当前开放的选课批次' }}</p>
            </div>
          </div>
          <div v-if="tabs.length > 0" class="batch-select-wrap">
            <IOSSelect :model-value="activeTabId" class="modern-select batch-select" @update:modelValue="handleTabChange">
              <option v-for="tab in tabs" :key="tab.xkgzid" :value="tab.xkgzid">{{ tab.xkgzMc || '未命名批次' }}</option>
            </IOSSelect>
          </div>
          <TEmptyState v-else message="" :icon="''">
            <p>{{ overviewError || cleanMessage(overview?.message) || '当前暂无选课批次' }}</p>
          </TEmptyState>
        </div>

        <div class="result-block">
          <TEmptyState v-if="loadingOverview || loadingList" type="loading" message="正在同步选课数据..." />
          <TEmptyState v-else-if="!canShowList || courses.length === 0" :message="emptyHint" />
          <div v-else class="course-list">
            <button
              v-for="course in courses"
              :key="course.id"
              type="button"
              class="course-card glass-card"
              @click="openDetail(course)"
            >
              <div class="course-top">
                <div>
                  <div class="course-name">{{ course.kcmc || '未命名课程' }}</div>
                  <div class="course-class">{{ course.jxbmcDisplay || course.jxbmc || '未命名教学班' }}</div>
                </div>
                <div class="course-top-right">
                  <span v-if="course.isConflict" class="meta-chip conflict-meta-pill">冲突</span>
                  <div class="course-credit">{{ course.xf || '--' }} 学分</div>
                </div>
              </div>

              <div class="course-meta-row">
                <span class="meta-chip teacher-chip">{{ course.teacher || '待定教师' }}</span>
                <span v-if="course.isOnline" class="meta-chip online-pill">网课</span>
                <span v-else class="meta-chip schedule-chip">{{ course.scheduleText || '未公布时间地点' }}</span>
              </div>

              <div class="course-footer-row">
                <div class="course-meta-row secondary compact">
                  <span class="meta-chip">容量 {{ course.capacity.display }}</span>
                  <span class="status-pill" :class="course.statusClass">{{ course.statusLabel }}</span>
                </div>

                <div class="course-actions" @click.stop>
                  <button
                    v-if="!course.isPicked"
                    class="action-btn primary"
                    type="button"
                    :disabled="!course.isSelectable || course.isFull || selectingCourseId === course.id"
                    @click="handleSelectCourse(course)"
                  >
                    {{ selectingCourseId === course.id ? '提交中...' : '选课' }}
                  </button>
                  <button
                    v-else
                    class="action-btn danger"
                    type="button"
                    :disabled="withdrawingCourseId === course.id"
                    @click="openWithdrawConfirm(course)"
                  >
                    {{ withdrawingCourseId === course.id ? '处理中...' : '退课' }}
                  </button>
                </div>
              </div>
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="filter-card glass-card">
          <div class="filter-header">
            <div>
              <div class="filter-title">信息查询条件</div>
              <div class="filter-subtitle">默认显示当前学期，展开后可查看更多筛选项</div>
            </div>
            <div class="filter-actions">
              <button class="ghost-btn" type="button" @click="backToEntryMenu">返回入口</button>
              <button class="ghost-btn" type="button" @click="resetInfoFilters">重置</button>
              <button class="ghost-btn" type="button" @click="infoShowAdvanced = !infoShowAdvanced">{{ infoShowAdvanced ? '收起筛选' : '展开筛选' }}</button>
              <button class="primary-btn" type="button" :disabled="loadingInfo" @click="querySelectedCourses()">查询</button>
            </div>
          </div>

          <div class="filter-grid info-base-grid">
            <div class="field">
              <label>当前学期</label>
              <IOSSelect v-model="infoFilters.term" class="modern-select" @change="onInfoTermChange">
                <option v-for="item in infoOptions.term" :key="item.value || 'empty-info-term'" :value="item.value">{{ item.label }}</option>
              </IOSSelect>
            </div>
          </div>

          <template v-if="infoShowAdvanced">
            <div class="filter-grid compact-grid">
              <div class="field span-2">
                <label>课程名称</label>
                <input v-model.trim="infoFilters.kcmc" class="text-input" type="text" placeholder="输入课程名称关键词" />
              </div>
              <div class="field">
                <label>授课教师</label>
                <input v-model.trim="infoFilters.teacher" class="text-input" type="text" placeholder="输入授课教师" />
              </div>
            </div>

            <div class="filter-grid advanced-grid">
              <div class="field">
                <label>课程性质</label>
                <IOSSelect v-model="infoFilters.kcxz" class="modern-select">
                  <option v-for="item in infoOptions.kcxz" :key="item.value || 'empty-info-kcxz'" :value="item.value">{{ item.label }}</option>
                </IOSSelect>
              </div>
              <div class="field">
                <label>课程类型</label>
                <IOSSelect v-model="infoFilters.kclx" class="modern-select">
                  <option v-for="item in infoOptions.kclx" :key="item.value || 'empty-info-kclx'" :value="item.value">{{ item.label }}</option>
                </IOSSelect>
              </div>
              <div class="field">
                <label>选课方式</label>
                <IOSSelect v-model="infoFilters.xkfs" class="modern-select" :disabled="!infoShowOtherModes">
                  <option v-for="item in infoOptions.xkfs" :key="item.value || 'empty-info-xkfs'" :value="item.value">{{ item.label }}</option>
                </IOSSelect>
              </div>
            </div>

            <div class="info-toggle-row">
              <label class="info-toggle-check">
                <input v-model="infoShowOtherModes" type="checkbox" @change="handleInfoOtherModesChange" />
                <span>显示其他选课方式课程（默认仅展示“选课”）</span>
              </label>
            </div>
          </template>
        </div>

        <div class="result-block">
          <TEmptyState v-if="loadingInfo" type="loading" message="正在查询已选课程..." />
          <TEmptyState v-else-if="filteredInfoCourses.length === 0" :message="infoEmptyHint" />
          <template v-else>
            <div v-if="infoSourceMessage" class="info-source-tip">{{ infoSourceMessage }}</div>
            <div class="course-list">
              <button
                v-for="course in filteredInfoCourses"
                :key="`${course.id}-${course.termLabel}-${course.sourceTabId}`"
                type="button"
                class="course-card glass-card"
                @click="openDetail(course)"
              >
                <div class="course-top">
                  <div>
                    <div class="course-name">{{ course.kcmc || '未命名课程' }}</div>
                    <div class="course-class">{{ course.jxbmcDisplay || course.jxbmc || '未命名教学班' }}</div>
                  </div>
                  <div class="course-top-right">
                    <span class="meta-chip success-meta-pill">{{ course.xkfsText || '选课' }}</span>
                    <div class="course-credit">{{ course.xf || '--' }} 学分</div>
                  </div>
                </div>

                <div class="course-meta-row">
                  <span class="meta-chip teacher-chip">{{ course.teacher || '待定教师' }}</span>
                  <span v-if="course.isOnline" class="meta-chip online-pill">网课</span>
                  <span v-else class="meta-chip schedule-chip">{{ course.scheduleText || '未公布时间地点' }}</span>
                </div>

                <div class="course-meta-row secondary compact">
                  <span class="meta-chip">学期 {{ course.termLabel || '--' }}</span>
                  <span class="meta-chip">选课方式 {{ course.xkfsText || '选课' }}</span>
                  <span class="status-pill" :class="course.statusClass">{{ course.statusLabel }}</span>
                </div>
              </button>
            </div>
          </template>
        </div>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="showDetail && currentDetailCourse" class="modal-overlay" @click="closeDetail">
        <div class="modal-content detail-modal glass" @click.stop>
          <div class="modal-header">
            <div>
              <div class="modal-title">{{ currentDetailCourse.kcmc }}</div>
              <div class="modal-subtitle">{{ currentDetailCourse.jxbmc }}</div>
            </div>
            <button class="close-btn" type="button" @click="closeDetail">×</button>
          </div>

          <div class="detail-badges">
            <span v-if="currentDetailCourse.isOnline" class="meta-chip online-pill">网课</span>
            <span class="status-pill" :class="currentDetailCourse.statusClass">{{ currentDetailCourse.statusLabel }}</span>
          </div>

          <div class="detail-grid">
            <div v-for="item in detailFields" :key="item.label" class="detail-item">
              <span class="detail-label">{{ item.label }}</span>
              <span class="detail-value">{{ item.value }}</span>
            </div>
          </div>

          <div class="detail-section">
            <h4>课程简介</h4>
            <div class="detail-paragraph">
              {{ detailIntro || normalizeDetailIntro(normalizeDetailSourceText(currentDetailCourse.kcjj), { allowConflictText: currentDetailCourse.isConflict }) || '暂无课程简介' }}
            </div>
          </div>

          <div class="detail-section">
            <h4>教师详情</h4>
            <div class="detail-paragraph">{{ detailTeacherText || currentDetailCourse.teacher || '暂无教师详情' }}</div>
          </div>

          <div v-if="detailLoading" class="detail-loading">正在补充课程简介与教师详情...</div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showChildClassDialog" class="modal-overlay" @click="showChildClassDialog = false">
        <div class="modal-content child-modal glass" @click.stop>
          <div class="modal-header">
            <div>
              <div class="modal-title">选择子教学班</div>
              <div class="modal-subtitle">{{ pendingSelectCourse?.kcmc || '当前课程' }}</div>
            </div>
            <button class="close-btn" type="button" @click="showChildClassDialog = false">×</button>
          </div>

          <div class="child-class-list">
            <button
              v-for="item in childClasses"
              :key="item.id"
              type="button"
              class="child-class-item"
              :class="{ active: selectedChildClassId === item.id }"
              @click="selectedChildClassId = item.id"
            >
              <div class="child-class-name">{{ item.name || item.id }}</div>
              <div class="child-class-meta">{{ item.teacher || '待定教师' }}</div>
              <div class="child-class-meta">{{ item.schedule || '时间地点待公布' }}</div>
            </button>
          </div>

          <div class="confirm-actions">
            <button class="ghost-btn" type="button" @click="showChildClassDialog = false">取消</button>
            <button
              class="primary-btn"
              type="button"
              :disabled="!selectedChildClassId || !pendingSelectCourse"
              @click="showChildClassDialog = false; openActionConfirm({ type: 'select', course: pendingSelectCourse, childClassId: selectedChildClassId })"
            >
              确认选课
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showActionConfirmDialog" class="modal-overlay" @click="closeActionConfirm">
        <div class="modal-content confirm-modal glass" @click.stop>
          <div class="modal-title">{{ confirmActionType === 'withdraw' ? '确认退课' : '确认选课' }}</div>
          <div class="detail-paragraph">
            <template v-if="confirmActionType === 'withdraw'">
              确定要退掉“{{ confirmTargetCourse?.kcmc || '当前课程' }}”吗？退课后会立即刷新当前批次列表。
            </template>
            <template v-else>
              确定要选择“{{ confirmTargetCourse?.kcmc || '当前课程' }}”吗？提交后会按教务系统规则实时校验容量与选课门数限制。
            </template>
          </div>
          <div class="confirm-actions">
            <button class="ghost-btn" type="button" @click="closeActionConfirm">取消</button>
            <button
              :class="confirmActionType === 'withdraw' ? 'danger-btn' : 'primary-btn'"
              type="button"
              :disabled="!confirmTargetCourse || (confirmActionType === 'withdraw' && withdrawingCourseId === confirmTargetCourse.id) || (confirmActionType === 'select' && selectingCourseId === confirmTargetCourse.id)"
              @click="submitConfirmedAction"
            >
              <template v-if="confirmActionType === 'withdraw'">
                {{ withdrawingCourseId === confirmTargetCourse?.id ? '处理中...' : '确认退课' }}
              </template>
              <template v-else>
                {{ selectingCourseId === confirmTargetCourse?.id ? '提交中...' : '确认选课' }}
              </template>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Transition name="fade">
      <div v-if="toastState.visible" class="toast-pill" :class="toastState.type">{{ toastState.message }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.course-selection-view {
  min-height: 100%;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: clip;
  padding: 6px 8px 96px;
}

.course-page-header {
  display: grid;
  gap: 8px;
  padding: 8px 10px;
}

.header-top {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.course-page-title {
  margin: 0;
  text-align: center;
  font-size: 26px;
  font-weight: 900;
  letter-spacing: 0.02em;
  color: var(--ui-text);
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.refresh-btn,
.back-btn {
  width: 96px;
  min-width: 96px;
  min-height: 40px;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, var(--ui-surface-border));
  background: color-mix(in oklab, var(--ui-primary) 9%, var(--ui-surface));
  color: var(--ui-text);
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
}

.refresh-btn:hover,
.back-btn:hover {
  box-shadow: var(--ui-shadow-soft);
  transform: translateY(-1px);
}

.refresh-btn:disabled,
.back-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.refresh-btn {
  justify-self: end;
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary) 70%, white),
    color-mix(in oklab, var(--ui-secondary) 55%, white)
  );
  border-color: color-mix(in oklab, var(--ui-primary) 44%, transparent);
  color: #fff;
}

.refresh-btn-placeholder {
  width: 96px;
  min-width: 96px;
  min-height: 40px;
}

.header-meta-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.header-mini-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-text);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, var(--ui-surface-border));
  background: color-mix(in oklab, var(--ui-primary) 8%, var(--ui-surface));
}

.content {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  min-width: 0;
  max-width: 100%;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.entry-tile {
  width: 100%;
  text-align: left;
  padding: 16px;
  display: grid;
  gap: 8px;
  border: 1px solid var(--ui-surface-border);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.entry-tile:hover {
  transform: translateY(-2px);
  box-shadow: var(--ui-shadow-strong);
}

.entry-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-height: 24px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.entry-badge-selection {
  background: color-mix(in oklab, #f59e0b 18%, var(--ui-surface));
  color: #92400e;
  border: 1px solid color-mix(in oklab, #f59e0b 34%, transparent);
}

.entry-badge-info {
  background: color-mix(in oklab, #0ea5e9 18%, var(--ui-surface));
  color: #0c4a6e;
  border: 1px solid color-mix(in oklab, #0ea5e9 34%, transparent);
}

.entry-title {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  color: var(--ui-text);
}

.entry-desc {
  margin: 0;
  color: var(--ui-muted);
  line-height: 1.6;
  font-size: 13px;
}

.glass-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
  border-radius: calc(26px * var(--theme-radius-scale, 1));
}

.detail-paragraph {
  word-break: break-word;
  overflow-wrap: anywhere;
}

.batch-card,
.filter-card {
  padding: 10px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.section-head,
.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.section-head h3,
.filter-title {
  margin: 0;
  font-size: 20px;
  color: var(--ui-text);
}

.section-head p,
.filter-subtitle {
  margin: 4px 0 0;
  color: var(--ui-muted);
  font-size: 12px;
}

.batch-select-wrap {
  margin-top: 2px;
}

.info-base-grid {
  grid-template-columns: minmax(0, 320px);
}

.batch-select :deep(.ios26-select-trigger) {
  min-height: 40px;
  border-radius: 14px;
}

.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.info-toggle-row {
  margin-top: 8px;
}

.info-toggle-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ui-muted);
}

.info-toggle-check input {
  width: 16px;
  height: 16px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.compact-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.field {
  display: grid;
  gap: 4px;
}

.span-2 {
  grid-column: span 2;
}

.field label {
  font-size: 13px;
  color: var(--ui-muted);
}

.text-input {
  min-height: 38px;
  border-radius: 14px;
  border: 1px solid var(--ui-surface-border);
  background: color-mix(in oklab, var(--ui-primary) 5%, var(--ui-surface));
  color: var(--ui-text);
  padding: 10px 14px;
  outline: none;
}

.modern-select :deep(.ios26-select-trigger) {
  min-height: 38px;
  border-radius: 14px;
}

.result-block {
  display: grid;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px 16px;
  color: var(--ui-muted);
  border-radius: 18px;
  border: 1px dashed color-mix(in oklab, var(--ui-primary) 18%, var(--ui-surface-border));
  background: color-mix(in oklab, var(--ui-primary) 7%, var(--ui-surface));
}

.empty-state.compact {
  padding: 16px;
}

.info-source-tip {
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, #0ea5e9 24%, var(--ui-surface-border));
  background: color-mix(in oklab, #0ea5e9 10%, var(--ui-surface));
  color: color-mix(in oklab, #0f4f5c 84%, var(--ui-text));
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
}

.course-list {
  display: grid;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.course-card {
  display: block;
  white-space: normal;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 8px;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  overflow: hidden;
}

.course-card * {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.course-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--ui-shadow-strong);
}

.course-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
}

.course-top > div:first-child {
  min-width: 0;
}

.course-top-right {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.course-name {
  font-size: 16px;
  font-weight: 800;
  color: var(--ui-text);
  line-height: 1.25;
  word-break: break-word;
}

.course-class {
  margin-top: 2px;
  color: var(--ui-muted);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.course-credit {
  flex: 0 0 auto;
  padding: 5px 10px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-secondary) 16%, var(--ui-surface));
  border: 1px solid color-mix(in oklab, var(--ui-secondary) 24%, var(--ui-surface-border));
  font-weight: 700;
  color: var(--ui-text);
}

.course-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-start;
  margin-top: 4px;
}

.course-meta-row > * {
  min-width: 0;
}

.course-meta-row.secondary {
  align-items: center;
}

.course-meta-row.compact {
  margin-top: 0;
}

.meta-chip,
.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  max-width: 100%;
  min-height: 28px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
  line-height: 1.3;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: left;
}

.meta-chip {
  background: color-mix(in oklab, var(--ui-primary) 8%, var(--ui-surface));
  border-color: color-mix(in oklab, var(--ui-primary) 18%, var(--ui-surface-border));
  color: var(--ui-text);
}

.online-pill {
  background: color-mix(in oklab, #22d3ee 20%, var(--ui-surface));
  border-color: color-mix(in oklab, #06b6d4 35%, transparent);
  color: #0f4f5c;
}

.status-pill.ready {
  background: color-mix(in oklab, #38bdf8 14%, var(--ui-surface));
  color: #0b4a6f;
  border-color: color-mix(in oklab, #38bdf8 34%, transparent);
}

.status-pill.picked {
  background: color-mix(in oklab, #34d399 18%, var(--ui-surface));
  color: #0f5132;
  border-color: color-mix(in oklab, #34d399 34%, transparent);
}

.status-pill.full {
  background: color-mix(in oklab, #a78bfa 18%, var(--ui-surface));
  color: #4c1d95;
  border-color: color-mix(in oklab, #8b5cf6 34%, transparent);
}

.status-pill.conflict {
  background: color-mix(in oklab, #fb923c 20%, var(--ui-surface));
  color: #9a3412;
  border-color: color-mix(in oklab, #fb923c 34%, transparent);
}

.status-pill.disabled,
.status-pill.neutral,
.status-pill.offline,
.status-pill.accent,
.status-pill.warning,
.status-pill.success {
  background: color-mix(in oklab, var(--ui-primary) 10%, var(--ui-surface));
  border-color: color-mix(in oklab, var(--ui-primary) 20%, var(--ui-surface-border));
  color: var(--ui-text);
}

.status-pill.warning {
  background: color-mix(in oklab, #f59e0b 18%, var(--ui-surface));
  color: #92400e;
  border-color: color-mix(in oklab, #f59e0b 34%, transparent);
}

.status-pill.success {
  background: color-mix(in oklab, #22c55e 16%, var(--ui-surface));
  color: #166534;
  border-color: color-mix(in oklab, #22c55e 34%, transparent);
}

.status-pill.accent {
  background: color-mix(in oklab, #8b5cf6 16%, var(--ui-surface));
  color: #5b21b6;
  border-color: color-mix(in oklab, #8b5cf6 34%, transparent);
}

.status-pill.offline {
  background: color-mix(in oklab, #64748b 18%, var(--ui-surface));
  color: #334155;
  border-color: color-mix(in oklab, #64748b 34%, transparent);
}

.teacher-chip {
  max-width: min(42%, 180px);
}

.schedule-chip {
  flex: 1 1 100%;
  max-width: 100%;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.course-footer-row > * {
  min-width: 0;
}

.course-actions {
  display: flex;
  justify-content: flex-end;
  flex: 0 0 auto;
  margin-left: auto;
  margin-top: 0;
}

.action-btn,
.ghost-btn,
.primary-btn,
.danger-btn {
  min-height: 30px;
  border-radius: 12px;
  padding: 0 10px;
  font-weight: 700;
}

.conflict-meta-pill {
  background: color-mix(in oklab, #f97316 18%, var(--ui-surface));
  border-color: color-mix(in oklab, #f97316 36%, transparent);
  color: #9a3412;
}

.success-meta-pill {
  background: color-mix(in oklab, #22c55e 16%, var(--ui-surface));
  border-color: color-mix(in oklab, #22c55e 34%, transparent);
  color: #166534;
}

.ghost-btn {
  border: 1px solid var(--ui-surface-border);
  background: color-mix(in oklab, var(--ui-primary) 6%, var(--ui-surface));
  color: var(--ui-text);
}

.primary-btn,
.action-btn.primary {
  border: none;
  background: linear-gradient(135deg, color-mix(in oklab, var(--ui-primary) 76%, white), color-mix(in oklab, var(--ui-secondary) 58%, white));
  color: white;
}

.danger-btn,
.action-btn.danger {
  border: none;
  background: linear-gradient(135deg, color-mix(in oklab, var(--ui-danger, #ef4444) 76%, white), #f97316);
  color: white;
}

.action-btn:disabled,
.primary-btn:disabled,
.danger-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
  z-index: 420;
}

.modal-content {
  width: min(760px, 100%);
  max-height: min(88vh, 920px);
  overflow: auto;
  padding: 18px;
  border-radius: 24px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-strong);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.modal-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--ui-text);
}

.modal-subtitle {
  margin-top: 6px;
  color: var(--ui-muted);
}

.close-btn {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid var(--ui-surface-border);
  background: color-mix(in oklab, var(--ui-primary) 7%, var(--ui-surface));
  color: var(--ui-text);
  font-size: 22px;
}

.detail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.detail-item {
  padding: 12px 14px;
  border-radius: 16px;
  background: color-mix(in oklab, var(--ui-primary) 6%, var(--ui-surface));
  border: 1px solid color-mix(in oklab, var(--ui-primary) 16%, var(--ui-surface-border));
}

.detail-label {
  display: block;
  font-size: 12px;
  color: var(--ui-muted);
}

.detail-value {
  display: block;
  margin-top: 6px;
  line-height: 1.5;
  color: var(--ui-text);
  white-space: pre-wrap;
}

.detail-section {
  margin-top: 14px;
}

.detail-section h4 {
  margin: 0 0 8px;
  color: var(--ui-text);
}

.detail-paragraph,
.detail-loading {
  padding: 14px;
  border-radius: 16px;
  background: color-mix(in oklab, var(--ui-primary) 6%, var(--ui-surface));
  border: 1px solid color-mix(in oklab, var(--ui-primary) 16%, var(--ui-surface-border));
  color: var(--ui-text);
  line-height: 1.7;
  white-space: pre-wrap;
}

.detail-loading {
  margin-top: 12px;
  color: var(--ui-muted);
}

.child-class-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.child-class-item {
  text-align: left;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--ui-surface-border);
  background: color-mix(in oklab, var(--ui-primary) 5%, var(--ui-surface));
}

.child-class-item.active {
  border-color: color-mix(in oklab, var(--ui-primary) 40%, transparent);
  background: color-mix(in oklab, var(--ui-primary) 12%, var(--ui-surface));
}

.child-class-name {
  font-weight: 800;
  color: var(--ui-text);
}

.child-class-meta {
  margin-top: 6px;
  color: var(--ui-muted);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.toast-pill {
  position: fixed;
  top: calc(16px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 520;
  max-width: min(86vw, 520px);
  padding: 12px 16px;
  border-radius: 999px;
  color: white;
  font-weight: 700;
  box-shadow: var(--ui-shadow-strong);
  text-align: center;
}

.toast-pill.info {
  background: color-mix(in oklab, var(--ui-primary) 80%, black);
}

.toast-pill.success {
  background: color-mix(in oklab, #16a34a 80%, black);
}

.toast-pill.error {
  background: color-mix(in oklab, #dc2626 80%, black);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .entry-grid {
    grid-template-columns: 1fr;
  }

  .course-page-title {
    font-size: 23px;
  }

  .refresh-btn,
  .back-btn {
    width: 90px;
    min-width: 90px;
  }

  .compact-grid,
  .filter-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: auto;
  }

  .course-footer-row {
    align-items: stretch;
  }

  .course-actions {
    width: 100%;
  }

  .course-actions > button {
    width: 100%;
  }

}

@media (max-width: 640px) {
  .refresh-btn-placeholder {
    width: 84px;
    min-width: 84px;
  }

  .course-selection-view {
    padding: 6px 6px 92px;
  }

  .course-page-header {
    padding: 10px;
  }

  .header-top {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
  }

  .refresh-btn,
  .back-btn {
    width: 84px;
    min-width: 84px;
  }

  .course-page-title {
    font-size: 21px;
  }

  .header-meta-row {
    justify-content: flex-start;
  }

  .section-head,
  .filter-header {
    flex-direction: column;
  }

  .teacher-chip {
    max-width: 100%;
  }

  .schedule-chip {
    flex-basis: 100%;
  }

  .filter-actions,
  .confirm-actions {
    width: 100%;
  }

  .filter-actions > button,
  .confirm-actions > button {
    flex: 1 1 0;
  }

  .course-top-right {
    align-items: flex-start;
  }

  .modal-content {
    padding: 16px;
    border-radius: 20px;
  }

  .course-name {
    font-size: 18px;
  }
}
</style>


