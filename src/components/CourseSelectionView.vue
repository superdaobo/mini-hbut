<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'
import { TEmptyState } from './templates'
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
    { label: '课程类型', value: findOptionLabel(optionMaps.value.kclx, course.kclx, resolveCourseTypeLabel(course.kclx, course.kclx)) },
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
    const label = resolveCourseTypeLabel(value, item.label || item.value)
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
          const code = safeText(normalized.kclx)
          kclxMap.set(code, findOptionLabel(optionMaps.value.kclx, code, resolveCourseTypeLabel(code, code)))
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

<template src="../templates/views/CourseSelectionView.html"></template>

<style src="../styles/views/CourseSelectionView.scoped.css" scoped></style>

