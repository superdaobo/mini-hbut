<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'
import { TEmptyState } from './templates'
import { useI18n, tf } from '../utils/app_i18n'
import {
  API_BASE,
  DEFAULT_FROM,
  KKLX_FROM_MAP,
  ENTRY_MODE_MENU,
  ENTRY_MODE_SELECTION,
  ENTRY_MODE_INFO,
  KCXZ_LABEL_MAP,
  KCLX_LABEL_MAP,
  EMPTY_LIST_FILTERS,
  safeText,
  resolveCourseTypeLabel,
  isEnabledValue,
  isPickedValue,
  resolveTabFrom,
  stripHtml,
  normalizeScheduleText,
  compactTeachingClassName,
  hasConflictHint,
  normalizeDetailIntro,
  cleanMessage,
  resolveErrorMessage,
  normalizeOptionList,
  findOptionLabel,
  formatRatioText,
  parseCapacityInfo,
  normalizeTeacherContent
} from '../features/course-selection/model.js'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

// i18n（#794 批次 I）：响应式取词用于模板/computed，tf 用于整句插值
const { t } = useI18n()

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
  // 数据格式值：与教务接口「\u9009\u8bfe」方式语义对齐（用 \u 转义通过 CJK 扫描，课表批次先例）
  xkfs: '\u9009\u8bfe'
})

const infoOptions = ref({
  term: [{ value: '', label: '\u5168\u90e8\u5b66\u671f' }],
  kcxz: [{ value: '', label: '\u5168\u90e8\u6027\u8d28' }],
  kclx: [{ value: '', label: '\u5168\u90e8\u7c7b\u578b' }],
  xkfs: [{ value: '', label: '\u5168\u90e8\u65b9\u5f0f' }]
})

// 占位选项 getter 化：保证语言切换后下拉占位即时生效
const infoPlaceholderOptions = computed(() => ({
  term: [{ value: '', label: t('selection.info.placeholderAllTerm') }],
  kcxz: [{ value: '', label: t('selection.info.placeholderAllNature') }],
  kclx: [{ value: '', label: t('selection.info.placeholderAllType') }],
  xkfs: [{ value: '', label: t('selection.info.placeholderAllMode') }]
}))

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
    kcxz: normalizeOptionList(condition.kcxzList || overviewConditions.kcxzList, t('selection.info.placeholderAllNature')),
    kcgs: normalizeOptionList(condition.kcgsList || overviewConditions.kcgsList, t('selection.info.placeholderAllOwner')),
    jxms: normalizeOptionList(condition.jxmsList || overviewConditions.jxmsList, t('selection.info.placeholderAllMode')),
    kkxq: normalizeOptionList(condition.kkxqList || overviewConditions.kkxqList, t('selection.info.placeholderAllCampus')),
    kclb: normalizeOptionList(condition.kclbList || overviewConditions.kclbList, t('selection.info.placeholderAllCategory')),
    kclx: normalizeOptionList(condition.kclxList || overviewConditions.kclxList, t('selection.info.placeholderAllType'))
  }
})

const detailFields = computed(() => {
  const course = selectedCourse.value
  if (!course) return []
  const rows = [
    { label: t('selection.detail.courseName'), value: course.kcmc },
    { label: t('selection.detail.className'), value: course.jxbmc },
    { label: t('selection.detail.credit'), value: course.xf },
    { label: t('selection.detail.courseNature'), value: findOptionLabel(optionMaps.value.kcxz, course.kcxz, KCXZ_LABEL_MAP[course.kcxz] || course.kcxz) },
    { label: t('selection.detail.courseCategory'), value: course.kclbname || findOptionLabel(optionMaps.value.kclb, course.kclb, course.kclb) },
    { label: t('selection.detail.courseType'), value: findOptionLabel(optionMaps.value.kclx, course.kclx, resolveCourseTypeLabel(course.kclx, course.kclx)) },
    { label: t('selection.detail.teachingMode'), value: findOptionLabel(optionMaps.value.jxms, course.jxms, course.jxms) },
    { label: t('selection.detail.teacher'), value: course.teacher },
    { label: t('selection.detail.timePlace'), value: course.isOnline ? t('selection.detail.timePlace.online') : (course.scheduleText || course.sksjdd || t('selection.list.timeTbd')) },
    { label: t('selection.detail.campus'), value: course.kkxqmc || findOptionLabel(optionMaps.value.kkxq, course.kkxq, course.kkxqmc || course.kkxq) },
    { label: t('selection.detail.classGroup'), value: course.jxbzc },
    { label: t('selection.detail.capacity'), value: course.capacity.display },
    { label: t('selection.detail.conflictState'), value: course.isConflict ? t('selection.detail.conflictState.conflict') : t('selection.detail.conflictState.none') },
    { label: t('selection.detail.label'), value: course.label },
    { label: t('selection.detail.examForm'), value: course.ksxs }
  ]
  return rows.filter((item) => safeText(item.value))
})

const detailTeacherText = computed(() => detailTeachers.value.join('、'))

const formatCountdown = (seconds) => {
  if (!Number.isFinite(seconds)) return '--'
  if (seconds <= 0) return t('selection.countdown.ended')
  const day = Math.floor(seconds / 86400)
  const hour = Math.floor((seconds % 86400) / 3600)
  const minute = Math.floor((seconds % 3600) / 60)
  const second = Math.floor(seconds % 60)
  const chunks = []
  if (day > 0) chunks.push(`${day}${t('selection.countdown.dayUnit')}`)
  if (hour > 0) chunks.push(`${hour}${t('selection.countdown.hourUnit')}`)
  if (minute > 0) chunks.push(`${minute}${t('selection.countdown.minuteUnit')}`)
  if (second > 0 || chunks.length === 0) chunks.push(`${second}${t('selection.countdown.secondUnit')}`)
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
  if (picked) return { statusLabel: t('selection.status.picked'), statusClass: 'picked' }
  if (!selectable) return { statusLabel: t('selection.status.notSelectable'), statusClass: 'disabled' }
  if (full) return { statusLabel: t('selection.status.full'), statusClass: 'full' }
  if (conflict) return { statusLabel: t('selection.status.conflict'), statusClass: 'conflict' }
  return { statusLabel: t('selection.status.selectable'), statusClass: 'ready' }
}

const normalizeCourse = (item) => {
  const capacity = parseCapacityInfo(item.yxrl, availableRatio.value)
  // 数据格式类匹配：教务原始数据 zt/statusLabel 固定为中文「\u5df2\u9009」，用 \u 转义（课表批次先例）
  const pickedLabel = '\u5df2\u9009'
  const picked = isPickedValue(item.status) || safeText(item.zt) === pickedLabel || safeText(item.statusLabel).includes(pickedLabel)
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
      countdownText.value = t('selection.countdown.ended')
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

// fallback 为数据层兜底文案：用 \u 转义（课表批次先例），展示层走 t() key
const unwrapApiResult = (response, fallback = '\u8bf7\u6c42\u5931\u8d25') => {  let payload = response?.data
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
    console.log('[selection-debug] overview raw response:', JSON.stringify(res?.data).slice(0, 500))
    const { data, meta } = unwrapApiResult(res, t('selection.message.overviewFailed'))
    console.log('[selection-debug] overview unwrapped data keys:', Object.keys(data || {}))
    console.log('[selection-debug] tab count:', Array.isArray(data.tabs) ? data.tabs.length : 'N/A', ', pcencs keys:', Object.keys(data.pcencs || {}))
    console.log('[selection-debug] has_valid_pcencs:', data.has_valid_pcencs, ', message:', data.message)
    if (Array.isArray(data.tabs)) {
      data.tabs.forEach((t, i) => console.log(`[selection-debug] tab[${i}]: xkgzid=${t.xkgzid}, xkgzMc=${t.xkgzMc}, kklx=${t.kklx}`))
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
      listMessage.value = cleanMessage(data.message) || t('selection.message.noneAvailable')
      stopCountdownTick()
      stopEndTimeRefresh()
    }
  } catch (err) {
    overviewError.value = resolveErrorMessage(err, t('selection.message.overviewFailed'))
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
    const { data } = unwrapApiResult(res, t('selection.message.countdownFailed'))
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
  console.log('[selection-debug] fetchList: pcid=', currentPcid.value, ', pcenc=', currentPcenc.value ? currentPcenc.value.slice(0, 20) + '...' : '(empty)')
  if (!currentPcid.value || !currentPcenc.value) {
    courses.value = []
    listMessage.value = t('selection.message.invalidCredential')
    console.warn('[selection-debug] fetchList aborted: pcid or pcenc is empty')
    return
  }
  loadingList.value = true
  listMessage.value = ''
  try {
    const res = await axios.post(`${API_BASE}/v2/course_selection/list`, getRequestPayload())
    const { data, meta } = unwrapApiResult(res, t('selection.message.listFailed'))
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
    listMessage.value = resolveErrorMessage(err, t('selection.message.listFailed'))
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
      showToast(t('selection.message.refreshed'), 'success')
    } else {
      showToast(t('selection.message.noRefreshableBatch'), 'info')
    }
  } catch (err) {
    showToast(resolveErrorMessage(err, t('selection.message.refreshFailed')), 'error')
  } finally {
    refreshing.value = false
  }
}

const mapToOptions = (sourceMap, placeholder = t('selection.info.placeholderAll')) => {
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
    item?.xkfsmc || item?.xkfs || item?.selection_mode || item?.select_mode || item?.mode || t('selection.info.defaultMode')
  ) || t('selection.info.defaultMode')
}

const deriveTabTermLabel = (tab) => {
  const tabName = safeText(tab?.xkgzMc)
  if (tabName) return tabName
  const studentSemester = safeText(summaryStudent.value?.semester)
  return studentSemester || t('selection.info.placeholderAllTerm')
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
  const pickedLabel = '\u5df2\u9009'
  const picked = normalized.isPicked || isPickedValue(item?.status) || safeText(item?.zt) === pickedLabel || safeText(item?.statusLabel).includes(pickedLabel)
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
    termLabel: safeText(item?.xnxq || item?.semester || context.termLabel || summaryStudent.value?.semester || t('selection.info.placeholderAllTerm')),
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
  normalizeOptionList(condition?.kcxzList, t('selection.info.placeholderAllNature')).forEach((item) => {
    const value = safeText(item.value || item.label)
    const label = safeText(item.label || item.value)
    if (!value || !label) return
    kcxzMap.set(value, label)
  })
  normalizeOptionList(condition?.kclxList, t('selection.info.placeholderAllType')).forEach((item) => {
    const value = safeText(item.value || item.label)
    const label = resolveCourseTypeLabel(value, item.label || item.value)
    if (!value || !label) return
    kclxMap.set(value, label)
  })
}

const applyInfoOptionsAndDefaults = ({ termMap, xkfsSet, kcxzMap, kclxMap }) => {
  infoOptions.value = {
    term: mapToOptions(termMap, t('selection.info.placeholderAllTerm')),
    xkfs: mapToOptions(new Map(Array.from(xkfsSet).map((value) => [value, value])), t('selection.info.placeholderAllMode')),
    kcxz: mapToOptions(kcxzMap, t('selection.info.placeholderAllNature')),
    kclx: mapToOptions(kclxMap, t('selection.info.placeholderAllType'))
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
    infoFilters.value.xkfs = '\u9009\u8bfe'
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
  const { data } = unwrapApiResult(res, t('selection.message.selectedFailed'))
  const list = pickArrayPayload(data)
  if (!list.length) {
    throw new Error(t('selection.message.selectedEmpty'))
  }
  const termMap = new Map()
  // 从后端返回的 semesters 列表填充学期选项
  const serverSemesters = Array.isArray(data?.semesters) ? data.semesters : []
  serverSemesters.forEach((sem) => {
    const s = safeText(sem)
    if (s) termMap.set(s, s)
  })
  const xkfsSet = new Set(['\u9009\u8bfe'])
  const kcxzMap = new Map()
  const kclxMap = new Map()
  const normalized = list.map((item, index) => {
    const course = normalizeInfoCourse(item, {
      tabId: safeText(item?.sourceTabId || item?.pcid || 'selected_api'),
      tabName: safeText(item?.sourceTabName || item?.source || t('selection.message.selectedFailed')),
      termLabel: safeText(item?.xnxq || item?.semester || data?.current_semester || summaryStudent.value?.semester || t('selection.info.placeholderAllTerm')),
      index
    })
    termMap.set(course.termLabel, course.termLabel)
    xkfsSet.add(course.xkfsText || t('selection.info.defaultMode'))
    if (safeText(course.kcxz)) {
      const code = safeText(course.kcxz)
      kcxzMap.set(code, KCXZ_LABEL_MAP[code] || safeText(course.kclb) || code)
    }
    if (safeText(course.kclx)) {
      const code = safeText(course.kclx)
      kclxMap.set(code, resolveCourseTypeLabel(code, code))
    }
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
  console.log('[selection-debug] fetchSelectedCoursesByTabs: tab count=', tabs.value.length, ', pcencMap keys=', Object.keys(pcencMap.value || {}))

  const termMap = new Map()
  const xkfsSet = new Set(['\u9009\u8bfe'])
  const kcxzMap = new Map()
  const kclxMap = new Map()
  const merged = []

  for (const tab of tabs.value) {
    const tabId = safeText(tab?.xkgzid)
    if (!tabId) { console.warn('[selection-debug] skipped tab without xkgzid'); continue }
    const termLabel = deriveTabTermLabel(tab)
    const tabFrom = resolveTabFrom(tab)
    termMap.set(termLabel, termLabel)
    const tabPcenc = safeText(pcencMap.value?.[tabId] || pcencMap.value?.[String(tabId)] || tab?.pcenc)
    console.log(`[selection-debug] tab ${tabId}: pcenc=${tabPcenc ? tabPcenc.slice(0, 20) + '...' : '(empty)'}, from=${tabFrom}`)
    if (!tabPcenc) { console.warn(`[selection-debug] tab ${tabId} has no pcenc, skipped`); continue }
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
      const { data } = unwrapApiResult(res, t('selection.message.selectedFailed'))
      mergeConditionOptions(data?.condition || {}, kcxzMap, kclxMap)
      const rawCourses = Array.isArray(data?.courses) ? data.courses : []
      console.log(`[selection-debug] tab ${tabId}: list returned ${rawCourses.length} courses`)
      if (rawCourses.length > 0) {
        console.log(`[selection-debug] tab ${tabId}: first course status=${rawCourses[0].status}, kcmc=${rawCourses[0].kcmc}`)
      }
      let pickedCount = 0
      rawCourses.forEach((item, index) => {
        const normalized = normalizeInfoCourse(item, {
          tabId,
          tabName: safeText(tab?.xkgzMc || t('selection.batch.unnamed')),
          termLabel,
          index
        })
        if (!normalized.isPicked) return
        pickedCount += 1
        merged.push(normalized)
        xkfsSet.add(normalized.xkfsText || t('selection.info.defaultMode'))
        if (safeText(normalized.kcxz)) {
          kcxzMap.set(safeText(normalized.kcxz), findOptionLabel(optionMaps.value.kcxz, normalized.kcxz, KCXZ_LABEL_MAP[normalized.kcxz] || normalized.kcxz))
        }
        if (safeText(normalized.kclx)) {
          const code = safeText(normalized.kclx)
          kclxMap.set(code, findOptionLabel(optionMaps.value.kclx, code, resolveCourseTypeLabel(code, code)))
        }
      })
      console.log(`[selection-debug] tab ${tabId}: isPicked count= ${pickedCount}`)
    } catch (tabErr) {
      console.error(`[selection-debug] tab ${tabId} list request failed:`, tabErr?.message || tabErr)
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
    // 优先通过已\u9009\u8bfe程接口查询（无需\u9009\u8bfe时段开放）
    let fetched = null
    try {
      const endpointFetched = await fetchSelectedCoursesByEndpoint()
      console.log('[selection-debug] endpoint result: courses=', endpointFetched.courses.length)
      if (endpointFetched.courses.length) {
        fetched = endpointFetched
        infoSourceMessage.value = t('selection.message.viaEndpoint')
      }
    } catch (epErr) {
      console.warn('[selection-debug] endpoint query failed:', epErr?.message || epErr)
    }

    // endpoint 无结果时回退到\u9009\u8bfe批次聚合
    if (!fetched || !fetched.courses.length) {
      if (!tabs.value.length) {
        await fetchOverview()
      }
      const tabsFetched = await fetchSelectedCoursesByTabs()
      console.log('[selection-debug] fetchSelectedCoursesByTabs result: courses=', tabsFetched.courses.length, ', termMap=', Array.from(tabsFetched.termMap.keys()))
      if (tabsFetched.courses.length) {
        fetched = tabsFetched
        infoSourceMessage.value = t('selection.message.viaTabs')
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
      showToast(t('selection.message.infoRefreshed'), 'success')
    }
  } catch (err) {
    infoCourses.value = []
    infoError.value = resolveErrorMessage(err, t('selection.message.selectedFailed'))
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
    xkfs: infoShowOtherModes.value ? '' : '\u9009\u8bfe'
  }
}

const handleInfoOtherModesChange = () => {
  if (infoShowOtherModes.value) {
    infoFilters.value.xkfs = ''
  } else {
    infoFilters.value.xkfs = '\u9009\u8bfe'
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
    console.warn('[selection-debug] term-switch query failed:', err?.message || err)
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
      const { data } = unwrapApiResult(introRes.value, t('selection.message.introFailed'))
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
      const { data } = unwrapApiResult(teacherRes.value, t('selection.message.teacherFailed'))
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
    const { data } = unwrapApiResult(res, t('selection.message.selectFailed'))
    showChildClassDialog.value = false
    childClasses.value = []
    pendingSelectCourse.value = null
    selectedChildClassId.value = ''
    showToast(safeText(data.msg) || t('selection.message.selectSuccess'), 'success')
    await fetchList()
    if (selectedCourse.value?.id === course.id) {
      const next = courses.value.find((item) => item.id === course.id)
      if (next) selectedCourse.value = next
    }
  } catch (err) {
    showToast(resolveErrorMessage(err, t('selection.message.selectFailed')), 'error')
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
    const { data } = unwrapApiResult(res, t('selection.message.childClassFailed'))
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
    showToast(resolveErrorMessage(err, t('selection.message.childClassFailed')), 'error')
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
    const { data } = unwrapApiResult(res, t('selection.message.withdrawFailed'))
    showToast(safeText(data.msg) || t('selection.message.withdrawSuccess'), 'success')
    await fetchList()
    if (selectedCourse.value?.id === course.id) {
      const next = courses.value.find((item) => item.id === course.id)
      if (next) selectedCourse.value = next
    }
  } catch (err) {
    showToast(resolveErrorMessage(err, t('selection.message.withdrawFailed')), 'error')
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

    const mode = safeText(course.xkfsText || t('selection.info.defaultMode'))
    if (!infoShowOtherModes.value && mode !== '\u9009\u8bfe') {
      return false
    }
    if (infoShowOtherModes.value && safeText(infoFilters.value.xkfs) && mode !== safeText(infoFilters.value.xkfs)) {
      return false
    }
    return true
  })
})

const infoEmptyHint = computed(() => {
  if (loadingInfo.value) return t('selection.info.querying')
  if (infoError.value) return infoError.value
  if (!infoLoaded.value) return t('selection.info.autoLoadHint')
  return t('selection.info.noCourseUnderFilter')
})

const refreshButtonLabel = computed(() => {
  if (centerMode.value === ENTRY_MODE_SELECTION) {
    return refreshing.value ? t('selection.refreshing') : t('selection.refresh')
  }
  if (centerMode.value === ENTRY_MODE_INFO) {
    return loadingInfo.value ? t('selection.querying') : t('selection.refreshQuery')
  }
  return t('selection.refresh')
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
    return tf('selection.pill.courseCount', { n: count.value })
  }
  if (centerMode.value === ENTRY_MODE_INFO) {
    return tf('selection.pill.selectedCount', { n: filteredInfoCourses.value.length })
  }
  return t('selection.pill.chooseEntry')
})

const headerSubPill = computed(() => {
  if (centerMode.value === ENTRY_MODE_SELECTION) {
    return tf('selection.pill.countdown', { time: countdownText.value || '--' })
  }
  if (centerMode.value === ENTRY_MODE_INFO) {
    return tf('selection.pill.currentTerm', { term: safeText(infoFilters.value.term) || safeText(summaryStudent.value?.semester) || '--' })
  }
  return t('selection.pill.entryHint')
})

const pageTitle = computed(() => {
  if (centerMode.value === ENTRY_MODE_SELECTION) return t('selection.title.selection')
  if (centerMode.value === ENTRY_MODE_INFO) return t('selection.title.info')
  return t('selection.title')
})

const backButtonLabel = computed(() => (centerMode.value === ENTRY_MODE_MENU ? t('selection.back.list') : t('selection.back.entry')))

const emptyHint = computed(() => {
  if (loadingOverview.value || loadingList.value) return t('common.empty.loading')
  if (overviewError.value) return overviewError.value
  return listMessage.value || t('selection.message.noneAvailable')
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

<template src="../templates/views/CourseSelectionView.html"></template>

<style src="../styles/views/CourseSelectionView.scoped.css" scoped></style>

