<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'
import { invokeNative as invoke, isTauriRuntime, isCapacitorRuntime } from '../platform/native'
import { blobToDataUrl, waitForCaptureReady, renderElementToCanvas } from '../utils/capture_service'
import { useI18n, tf } from '../utils/app_i18n'
import { TPageHeader } from './templates'

// i18n（#794 批次 I）：响应式取词用于模板/computed，tf 用于整句插值
const { t } = useI18n()

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const isNative = isTauriRuntime()
const isCapacitor = isCapacitorRuntime()

const periodTimeMap = {
  1: { start: '08:20', end: '09:05' },
  2: { start: '09:10', end: '09:55' },
  3: { start: '10:15', end: '11:00' },
  4: { start: '11:05', end: '11:50' },
  5: { start: '14:00', end: '14:45' },
  6: { start: '14:50', end: '15:35' },
  7: { start: '15:55', end: '16:40' },
  8: { start: '16:45', end: '17:30' },
  9: { start: '18:30', end: '19:15' },
  10: { start: '19:20', end: '20:05' },
  11: { start: '20:10', end: '20:55' }
}

const weekdayText = computed(() => [
  t('common.week.mon'),
  t('common.week.tue'),
  t('common.week.wed'),
  t('common.week.thu'),
  t('common.week.fri'),
  t('common.week.sat'),
  t('common.week.sun')
])

// 模块分组配置：名称走 i18n（getter 保证语言切换即时生效）
const moduleGroups = computed(() => [
  {
    id: 'academic',
    title: t('export.group.academic'),
    modules: [
      { id: 'grades', name: t('export.module.grades'), icon: '📊', semesterAware: true },
      { id: 'ranking', name: t('export.module.ranking'), icon: '🏆', semesterAware: true },
      { id: 'schedule', name: t('export.module.schedule'), icon: '📅', semesterAware: true },
      { id: 'exams', name: t('export.module.exams'), icon: '📝', semesterAware: true },
      { id: 'calendar', name: t('export.module.calendar'), icon: '📘', semesterAware: true },
      { id: 'academic_progress', name: t('export.module.academic_progress'), icon: '🎓', semesterAware: false },
      { id: 'training_plan', name: t('export.module.training_plan'), icon: '📚', semesterAware: false }
    ]
  },
  {
    id: 'basic',
    title: t('export.group.basic'),
    modules: [
      { id: 'student_info', name: t('export.module.student_info'), icon: '👤', semesterAware: false }
    ]
  },
  {
    id: 'life',
    title: t('export.group.life'),
    modules: [
      { id: 'classroom', name: t('export.module.classroom'), icon: '🏫', semesterAware: false },
      { id: 'electricity', name: t('export.module.electricity'), icon: '⚡', semesterAware: false },
      { id: 'transactions', name: t('export.module.transactions'), icon: '💰', semesterAware: false },
      { id: 'campus_map', name: t('export.module.campus_map'), icon: '🗺️', semesterAware: false }
    ]
  }
])

const moduleMap = computed(() => {
  const out = new Map()
  moduleGroups.forEach((group) => {
    group.modules.forEach((mod) => out.set(mod.id, mod))
  })
  return out
})

const defaultSelected = ['grades', 'ranking', 'schedule', 'calendar', 'student_info']
const selectedModules = ref([...defaultSelected])
const semesters = ref([])
const currentSemester = ref('')
const selectedSemesters = ref([])
const rankingIncludeAll = ref(true)
const selectedTransactionMonths = ref([])

const loadingSemesters = ref(false)
const preparing = ref(false)
const exporting = ref(false)
const exportError = ref('')
const exportSuccess = ref('')
const exportSuccessPath = ref('')
const exportSuccessHint = ref('')

const previewRef = ref(null)
const exportPayload = ref(null)
const lastSyncTime = ref('')

const requiresSemester = computed(() =>
  selectedModules.value.some((id) => moduleMap.value.get(id)?.semesterAware)
)

const effectiveSemesters = computed(() => {
  const normalized = normalizeSemesterList(selectedSemesters.value)
  if (normalized.length) return normalized
  if (currentSemester.value) return [currentSemester.value]
  if (semesters.value.length) return [semesters.value[0]]
  return []
})

const selectedModuleMetas = computed(() =>
  selectedModules.value
    .map((id) => moduleMap.value.get(id))
    .filter(Boolean)
)

const studentInfoFieldMap = computed(() => ({
  name: t('export.field.name'),
  student_id: t('export.field.studentId'),
  class_name: t('export.field.className'),
  college: t('export.field.college'),
  major: t('export.field.major'),
  grade: t('export.field.grade'),
  gender: t('export.field.gender'),
  ethnicity: t('export.field.ethnicity'),
  id_card: t('export.field.idCard'),
  id_number: t('export.field.idCard')
}))

const studentInfoFieldOrder = [
  'name',
  'student_id',
  'class_name',
  'college',
  'major',
  'grade',
  'gender',
  'ethnicity',
  'id_card',
  'id_number'
]

const transactionMonthOptions = computed(() => {
  const now = new Date()
  const list = []
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    list.push({
      value: `${year}-${month}`,
      label: `${year}/${month}`
    })
  }
  return list
})

const readCacheEntry = (matcher) => {
  let latest = null
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith('cache:')) continue
    if (!matcher(key)) continue
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}')
      const timestamp = Number(parsed?.timestamp || 0)
      if (!latest || timestamp > latest.timestamp) {
        latest = { key, timestamp, data: parsed?.data }
      }
    } catch {
      // ignore broken cache entry
    }
  }
  return latest
}

const clearExportSuccess = () => {
  exportSuccess.value = ''
  exportSuccessPath.value = ''
  exportSuccessHint.value = ''
}

const setExportSuccess = (message, { path = '', hint = '' } = {}) => {
  exportSuccess.value = String(message || '').trim()
  exportSuccessPath.value = String(path || '').trim()
  exportSuccessHint.value = String(hint || '').trim()
}

const ensureModuleSelected = () => {
  if (selectedModules.value.length === 0) {
    selectedModules.value = [...defaultSelected]
  }
}

const safeText = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

const toggleModule = (moduleId) => {
  const idx = selectedModules.value.indexOf(moduleId)
  if (idx >= 0) {
    selectedModules.value.splice(idx, 1)
  } else {
    selectedModules.value.push(moduleId)
  }
  ensureModuleSelected()
}

const toggleSemester = (semester) => {
  const idx = selectedSemesters.value.indexOf(semester)
  if (idx >= 0) {
    selectedSemesters.value.splice(idx, 1)
  } else {
    selectedSemesters.value.push(semester)
  }
  selectedSemesters.value = normalizeSemesterList(selectedSemesters.value)
}

const semesterChecked = (semester) => selectedSemesters.value.includes(semester)

const toggleTransactionMonth = (monthValue) => {
  const idx = selectedTransactionMonths.value.indexOf(monthValue)
  if (idx >= 0) {
    selectedTransactionMonths.value.splice(idx, 1)
  } else {
    selectedTransactionMonths.value.push(monthValue)
  }
  if (selectedTransactionMonths.value.length === 0 && transactionMonthOptions.value.length) {
    selectedTransactionMonths.value = [transactionMonthOptions.value[0].value]
  }
}

const monthChecked = (monthValue) => selectedTransactionMonths.value.includes(monthValue)

const semesterHint = computed(() => {
  if (!requiresSemester.value) return t('export.semester.notRequired')
  if (!effectiveSemesters.value.length) return t('export.semester.none')
  return tf('export.semester.selected', { n: effectiveSemesters.value.length })
})

const transactionHint = computed(() => {
  if (!selectedModules.value.includes('transactions')) return t('export.transactions.noneSelected')
  return tf('export.transactions.selected', { n: selectedTransactionMonths.value.length })
})

const formatScore = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

const sortCourses = (list) => {
  const arr = Array.isArray(list) ? [...list] : []
  arr.sort((a, b) => {
    const dayDiff = Number(a.weekday || 0) - Number(b.weekday || 0)
    if (dayDiff !== 0) return dayDiff
    return Number(a.period || 0) - Number(b.period || 0)
  })
  return arr
}

const formatPeriod = (course) => {
  const start = Number(course.period || 0)
  if (!Number.isFinite(start) || start <= 0) return '-'
  const len = Number(course.duration || 1)
  const end = start + Math.max(1, len) - 1
  const startText = periodTimeMap[start]?.start || ''
  const endText = periodTimeMap[end]?.end || ''
  return `${start}-${end}${startText && endText ? ` (${startText}-${endText})` : ''}`
}

const formatWeekday = (weekday) => {
  const idx = Number(weekday || 0) - 1
  if (idx < 0 || idx >= weekdayText.value.length) return '-'
  return weekdayText.value[idx]
}

const formatTimestampText = (timestamp) => {
  if (!timestamp) return '-'
  return formatRelativeTime(new Date(timestamp).toISOString())
}

const normalizeStudentInfoEntries = (raw) => {
  const data = raw && typeof raw === 'object' ? raw : {}
  const entries = []
  const used = new Set()
  const idCardLabel = t('export.field.idCard')

  studentInfoFieldOrder.forEach((key) => {
    if (!(key in data)) return
    const label = studentInfoFieldMap.value[key] || key
    if (label === idCardLabel && used.has(idCardLabel)) return
    if (label === idCardLabel) used.add(idCardLabel)
    entries.push({ label, value: safeText(data[key]) })
  })

  Object.keys(data).forEach((key) => {
    if (studentInfoFieldOrder.includes(key)) return
    entries.push({ label: key, value: safeText(data[key]) })
  })

  return entries
}

const currentDormitoryLabel = () => {
  try {
    const raw = localStorage.getItem('last_dorm_selection')
    if (!raw) return '-'
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) return '-'
    return parsed
      .map((item) => {
        if (!item) return ''
        if (typeof item === 'string') return item
        return String(item.name || item.label || item.value || '').trim()
      })
      .filter(Boolean)
      .join(' / ') || '-'
  } catch {
    return '-'
  }
}

const normalizeClassroomRows = (cachePayload) => {
  const inner = cachePayload?.data
  const list = Array.isArray(inner?.data) ? inner.data : Array.isArray(inner) ? inner : []
  return list.map((item, index) => ({
    id: item.id || `${item.building || ''}-${item.name || ''}-${index}`,
    name: safeText(item.name),
    building: safeText(item.building),
    campus: safeText(item.campus),
    floor: safeText(item.floor),
    seats: safeText(item.seats),
    status: safeText(item.status),
    roomType: safeText(item.type)
  }))
}

const normalizeElectricityInfo = (cachePayload) => {
  const inner = cachePayload?.data && typeof cachePayload.data === 'object' ? cachePayload.data : {}
  return {
    dormitory: currentDormitoryLabel(),
    quantity: safeText(inner.quantity ?? inner.power),
    balance: safeText(inner.balance),
    status: safeText(inner.status),
    syncTime: safeText(inner.sync_time)
  }
}

const normalizeCampusMaps = (cachePayload) => {
  const inner = cachePayload?.data
  if (Array.isArray(inner)) return inner
  if (Array.isArray(inner?.maps)) return inner.maps
  if (Array.isArray(inner?.list)) return inner.list
  return []
}

const monthRange = (monthValue) => {
  const [yearText, monthText] = String(monthValue || '').split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  if (!year || !month) return null
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  const format = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    start: format(start),
    end: format(end)
  }
}

const loadSemesters = async () => {
  loadingSemesters.value = true
  try {
    const { data } = await fetchWithCache('semesters', async () => {
      const res = await axios.get(`${API_BASE}/v2/semesters`)
      return res.data
    })
    if (data?.success) {
      const sorted = normalizeSemesterList(data.semesters || [])
      semesters.value = sorted
      currentSemester.value = resolveCurrentSemester(sorted, data.current || '')
      if (!selectedSemesters.value.length && currentSemester.value) {
        selectedSemesters.value = [currentSemester.value]
      }
    }
  } catch (e) {
    exportError.value = tf('export.error.semesters', { msg: e?.message || e })
  } finally {
    loadingSemesters.value = false
  }
}

const fetchGradesData = async (selected) => {
  const res = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: props.studentId })
  const payload = res.data || {}
  if (!payload.success) throw new Error(payload.error || t('export.error.grades'))
  const allGrades = Array.isArray(payload.data) ? payload.data : []
  const sourceSemesters = normalizeSemesterList(
    allGrades.map((item) => String(item.term || '').trim()).filter(Boolean)
  )
  const targetSemesters = selected.length ? selected : sourceSemesters
  const grouped = targetSemesters.map((semester) => ({
    semester,
    list: allGrades
      .filter((item) => String(item.term || '').trim() === semester)
      .sort((a, b) => String(a.course_name || '').localeCompare(String(b.course_name || ''), 'zh-Hans-CN'))
  }))
  const noTerm = allGrades.filter((item) => !String(item.term || '').trim())
  return {
    total: allGrades.length,
    grouped,
    noTerm,
    offline: !!payload.offline,
    syncTime: payload.sync_time || ''
  }
}

const fetchRankingData = async (selected) => {
  const semesterSet = new Set()
  if (rankingIncludeAll.value) semesterSet.add('')
  ;(selected.length ? selected : []).forEach((value) => semesterSet.add(value))
  if (semesterSet.size === 0) semesterSet.add('')

  const rows = []
  for (const sem of semesterSet) {
    const res = await axios.post(`${API_BASE}/v2/ranking`, {
      student_id: props.studentId,
      semester: sem
    })
    const payload = res.data || {}
    if (!payload.success) {
      rows.push({
        semester: sem || t('export.semester.all'),
        error: payload.error || t('export.error.fetchFailed')
      })
      continue
    }
    rows.push({
      semester: sem || t('export.semester.all'),
      data: payload.data || {},
      offline: !!payload.offline,
      syncTime: payload.sync_time || ''
    })
  }
  return rows
}

const fetchScheduleData = async (selected) => {
  const res = await axios.post(`${API_BASE}/v2/schedule/query`, { student_id: props.studentId })
  const payload = res.data || {}
  if (!payload.success) throw new Error(payload.error || t('export.error.schedule'))

  const metaSemester = String(payload?.meta?.semester || '').trim() || t('export.semester.current')
  const courses = Array.isArray(payload.data) ? payload.data : []
  const groups = new Map()
  courses.forEach((course) => {
    const semKey = String(course.semester || course.term || metaSemester).trim() || metaSemester
    if (!groups.has(semKey)) groups.set(semKey, [])
    groups.get(semKey).push(course)
  })

  const keys = normalizeSemesterList([...groups.keys()])
  const targetSemesters = selected.length ? selected : keys
  const grouped = targetSemesters.map((semester) => ({
    semester,
    list: sortCourses(groups.get(semester) || [])
  }))
  return {
    grouped,
    meta: payload.meta || {},
    offline: !!payload.offline,
    syncTime: payload.sync_time || ''
  }
}

const fetchExamsData = async (selected) => {
  const targetSemesters = selected.length ? selected : ['']
  const grouped = []
  for (const sem of targetSemesters) {
    const res = await axios.post(`${API_BASE}/v2/exams`, { semester: sem })
    const payload = res.data || {}
    if (!payload.success) {
      grouped.push({
        semester: sem || t('export.semester.allSemesters'),
        error: payload.error || t('export.error.fetchFailed'),
        list: []
      })
      continue
    }
    grouped.push({
      semester: sem || t('export.semester.allSemesters'),
      list: Array.isArray(payload.data) ? payload.data : [],
      offline: !!payload.offline,
      syncTime: payload.sync_time || ''
    })
  }
  return grouped
}

const fetchCalendarData = async (selected) => {
  const targetSemesters = selected.length ? selected : ['']
  const grouped = []
  for (const sem of targetSemesters) {
    const res = await axios.post(`${API_BASE}/v2/calendar`, {
      student_id: props.studentId,
      semester: sem
    })
    const payload = res.data || {}
    if (!payload.success) {
      grouped.push({
        semester: sem || t('export.semester.current'),
        error: payload.error || t('export.error.fetchFailed'),
        list: [],
        meta: {}
      })
      continue
    }
    grouped.push({
      semester: payload?.meta?.semester || sem || t('export.semester.current'),
      list: Array.isArray(payload.data) ? payload.data : [],
      meta: payload.meta || {},
      offline: !!payload.offline,
      syncTime: payload.sync_time || ''
    })
  }
  return grouped
}

const fetchStudentInfoData = async () => {
  const res = await axios.post(`${API_BASE}/v2/student_info`, { student_id: props.studentId })
  const payload = res.data || {}
  if (!payload.success) throw new Error(payload.error || t('export.error.studentInfo'))
  return {
    data: payload.data || {},
    offline: !!payload.offline,
    syncTime: payload.sync_time || ''
  }
}

const fetchAcademicProgressData = async () => {
  const res = await axios.post(`${API_BASE}/v2/academic_progress`, {
    student_id: props.studentId,
    fasz: 1
  })
  const payload = res.data || {}
  if (!payload.success) throw new Error(payload.error || t('export.error.academicProgress'))
  return {
    data: payload.data || {},
    offline: !!payload.offline,
    syncTime: payload.sync_time || ''
  }
}

const fetchTrainingPlanData = async () => {
  let options = null
  try {
    const optionRes = await axios.post(`${API_BASE}/v2/training_plan/options`, {
      student_id: props.studentId
    })
    const optionPayload = optionRes.data || {}
    if (optionPayload.success) {
      options = optionPayload.options || optionPayload.data || null
    }
  } catch {
    // ignore and fallback
  }

  const firstValue = (arr) => (Array.isArray(arr) && arr.length ? arr[0]?.value || arr[0] || '' : '')
  const payload = {
    grade: firstValue(options?.grade),
    kkxq: firstValue(options?.kkxq),
    kkyx: firstValue(options?.kkyx),
    kkjys: '',
    kcxz: '',
    kcgs: '',
    kcbh: '',
    kcmc: '',
    page: 1,
    page_size: 500
  }

  const res = await axios.post(`${API_BASE}/v2/training_plan`, payload)
  const data = res.data || {}
  if (!data.success) throw new Error(data.error || t('export.error.trainingPlan'))
  return {
    list: Array.isArray(data.data) ? data.data : [],
    total: Number(data.total || 0),
    filters: payload,
    offline: !!data.offline,
    syncTime: data.sync_time || ''
  }
}

const fetchCachedOnlyData = (id) => {
  if (id === 'classroom') {
    const latest = readCacheEntry((key) => key.includes('classroom:'))
    return latest
      ? { found: true, timestamp: latest.timestamp, data: latest.data }
      : { found: false, message: t('export.cache.classroomMiss') }
  }
  if (id === 'electricity') {
    const latest = readCacheEntry((key) => key.includes('electricity:'))
    return latest
      ? { found: true, timestamp: latest.timestamp, data: latest.data }
      : { found: false, message: t('export.cache.electricityMiss') }
  }
  if (id === 'campus_map') {
    const latest = readCacheEntry((key) => key.includes('campus_map') || key.includes('maps:'))
    return latest
      ? { found: true, timestamp: latest.timestamp, data: latest.data }
      : { found: false, message: t('export.cache.campusMapMiss') }
  }
  return { found: false, message: t('export.cache.none') }
}

const parseTransactionPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return { ok: false, list: [], message: t('export.error.emptyResponse') }
  const list = Array.isArray(payload.resultData)
    ? payload.resultData
    : (Array.isArray(payload.data) ? payload.data : [])
  const ok = payload.success === true || payload.code === '' || list.length > 0
  return {
    ok,
    list,
    message: payload.message || payload.error || ''
  }
}

const fetchTransactionsData = async () => {
  if (!isNative) {
    return { grouped: [], total: 0, error: t('export.transactions.notSupported') }
  }

  const selected = Array.isArray(selectedTransactionMonths.value) && selectedTransactionMonths.value.length
    ? selectedTransactionMonths.value
    : (transactionMonthOptions.value.length ? [transactionMonthOptions.value[0].value] : [])

  const grouped = []
  for (const month of selected) {
    const range = monthRange(month)
    if (!range) continue
    try {
      const payload = await invoke('fetch_transaction_history', {
        startDate: range.start,
        endDate: range.end,
        pageNo: 1,
        pageSize: 1200
      })
      const parsed = parseTransactionPayload(payload)
      grouped.push({
        month,
        label: transactionMonthOptions.value.find((item) => item.value === month)?.label || month,
        list: parsed.list,
        error: parsed.ok ? '' : (parsed.message || t('export.error.queryFailed'))
      })
    } catch (e) {
      grouped.push({
        month,
        label: transactionMonthOptions.value.find((item) => item.value === month)?.label || month,
        list: [],
        error: e?.message || String(e)
      })
    }
  }

  return {
    grouped,
    total: grouped.reduce((sum, item) => sum + (item.list?.length || 0), 0)
  }
}

const fetchByModule = async (moduleId, semesterList) => {
  if (moduleId === 'grades') return fetchGradesData(semesterList)
  if (moduleId === 'ranking') return fetchRankingData(semesterList)
  if (moduleId === 'schedule') return fetchScheduleData(semesterList)
  if (moduleId === 'exams') return fetchExamsData(semesterList)
  if (moduleId === 'calendar') return fetchCalendarData(semesterList)
  if (moduleId === 'student_info') return fetchStudentInfoData()
  if (moduleId === 'academic_progress') return fetchAcademicProgressData()
  if (moduleId === 'training_plan') return fetchTrainingPlanData()
  if (moduleId === 'classroom') return fetchCachedOnlyData('classroom')
  if (moduleId === 'electricity') return fetchCachedOnlyData('electricity')
  if (moduleId === 'transactions') return fetchTransactionsData()
  if (moduleId === 'campus_map') return fetchCachedOnlyData('campus_map')
  return { error: t('export.error.unimplemented') }
}

const collectExportData = async () => {
  exportError.value = ''
  clearExportSuccess()
  preparing.value = true
  try {
    const payload = {
      studentId: props.studentId,
      generatedAt: new Date().toISOString(),
      semesters: [...effectiveSemesters.value],
      ranking_include_all: rankingIncludeAll.value,
      transaction_months: [...selectedTransactionMonths.value],
      modules: {}
    }

    let newestSync = ''
    for (const moduleId of selectedModules.value) {
      try {
        const data = await fetchByModule(moduleId, effectiveSemesters.value)
        payload.modules[moduleId] = { success: true, data }
        const syncTime = data?.syncTime || ''
        if (syncTime && syncTime > newestSync) newestSync = syncTime
      } catch (e) {
        payload.modules[moduleId] = {
          success: false,
          error: e?.message || String(e)
        }
      }
    }

    exportPayload.value = payload
    lastSyncTime.value = newestSync
    setExportSuccess(t('export.result.prepared'))
  } catch (e) {
    exportError.value = tf('export.error.prepare', { msg: e?.message || e })
  } finally {
    preparing.value = false
  }
}

const saveByTauri = async (fileName, mimeType, base64Content, preferMedia = false) => {
  const result = await invoke('save_export_file', {
    req: {
      fileName,
      mimeType,
      contentBase64: base64Content,
      preferMedia
    }
  })
  return result
}

const saveByBrowser = (fileName, mimeType, content) => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const link = document.createElement('a')
  const href = URL.createObjectURL(blob)
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(href)
}

const saveByCapacitor = async (fileName, blob) => {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const dataUrl = await blobToDataUrl(blob)
  const base64 = dataUrl.split(',')[1] || ''

  // 写入缓存目录
  const written = await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache
  })
  const fileUri = written.uri

  // 通过系统分享面板让用户保存到相册
  const { Share } = await import('@capacitor/share')
  await Share.share({
    title: fileName,
    text: t('export.result.imageShareText'),
    url: fileUri,
    dialogTitle: t('export.result.imageShareTitle')
  })
  return fileUri
}

const exportJson = async () => {
  if (!exportPayload.value) {
    await collectExportData()
  }
  if (!exportPayload.value) return

  exporting.value = true
  exportError.value = ''
  clearExportSuccess()
  try {
    const fileName = `Mini-HBUT_Export_${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.json`
    const jsonText = JSON.stringify(exportPayload.value, null, 2)

    if (isNative) {
      const base64 = btoa(unescape(encodeURIComponent(jsonText)))
      const saved = await saveByTauri(fileName, 'application/json', base64, false)
      setExportSuccess(t('export.result.jsonSaved'), { path: saved.path })
    } else if (isCapacitor) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const base64 = btoa(unescape(encodeURIComponent(jsonText)))
      await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache })
      const { Share } = await import('@capacitor/share')
      const written = await Filesystem.getUri({ path: fileName, directory: Directory.Cache })
      await Share.share({ title: fileName, url: written.uri, dialogTitle: t('export.result.jsonShareTitle') })
      setExportSuccess(t('export.result.jsonShare'))
    } else {
      saveByBrowser(fileName, 'application/json', jsonText)
      setExportSuccess(t('export.result.jsonBrowser'))
    }
  } catch (e) {
    exportError.value = tf('export.error.json', { msg: e?.message || e })
  } finally {
    exporting.value = false
  }
}

const renderWideCanvas = async () => {
  if (!previewRef.value) throw new Error(t('export.error.canvasNotReady'))

  const exportWidth = Math.max(1280, Math.ceil(previewRef.value.scrollWidth || 0))
  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-99999px'
  wrapper.style.top = '0'
  wrapper.style.width = `${exportWidth}px`
  wrapper.style.background = '#f4f7ff'
  wrapper.style.padding = '16px'
  wrapper.style.opacity = '0'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.zIndex = '0'
  wrapper.style.overflow = 'visible'

  const clone = previewRef.value.cloneNode(true)
  clone.classList.add('capture-mode')
  clone.style.width = `${exportWidth}px`
  clone.style.minWidth = `${exportWidth}px`
  clone.style.maxWidth = `${exportWidth}px`
  clone.style.boxSizing = 'border-box'
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    await nextTick()
    await waitForCaptureReady(clone)
    return await renderElementToCanvas(clone, {
      exportWidth,
      backgroundColor: '#f4f7ff',
      scale: 2
    })
  } finally {
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
  }
}

const exportImage = async () => {
  if (!exportPayload.value) {
    await collectExportData()
  }
  if (!exportPayload.value) return

  exporting.value = true
  exportError.value = ''
  clearExportSuccess()
  try {
    const canvas = await renderWideCanvas()
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value)
        else reject(new Error(t('export.error.imageFailed')))
      }, 'image/png', 0.98)
    })
    const fileName = `Mini-HBUT_Export_${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.png`

    if (isNative) {
      const dataUrl = await blobToDataUrl(blob)
      const base64 = dataUrl.split(',')[1] || ''
      const saved = await saveByTauri(fileName, 'image/png', base64, true)
      setExportSuccess(t('export.result.imageSaved'), {
        path: saved.path,
        hint: saved.needs_manual_import ? t('export.result.imageImportHint') : ''
      })
    } else if (isCapacitor) {
      await saveByCapacitor(fileName, blob)
      setExportSuccess(t('export.result.imageShare'))
    } else {
      saveByBrowser(fileName, 'image/png', blob)
      setExportSuccess(t('export.result.imageBrowser'))
    }
  } catch (e) {
    exportError.value = tf('export.error.image', { msg: e?.message || e })
  } finally {
    exporting.value = false
  }
}

const getModuleResult = (moduleId) => exportPayload.value?.modules?.[moduleId]
const hasPreparedData = computed(() => !!exportPayload.value)

const prettySyncText = computed(() => {
  if (!lastSyncTime.value) return ''
  return formatRelativeTime(lastSyncTime.value)
})

const topSummary = computed(() => {
  const modules = selectedModuleMetas.value.map((item) => `${item.icon} ${item.name}`)
  return modules.join(' · ')
})

onMounted(async () => {
  await loadSemesters()
  if (transactionMonthOptions.value.length) {
    selectedTransactionMonths.value = [transactionMonthOptions.value[0].value]
  }
})
</script>

<template>
  <div class="export-view">
    <!-- Header -->
    <header class="export-page-header">
      <button class="header-icon-btn" @click="emit('back')">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <h1 class="header-title-center">{{ t('export.title') }}</h1>
      <div class="header-spacer"></div>
    </header>

    <!-- Hero Section -->
    <main class="export-main">
    <section class="export-hero">
      <div class="hero-bg-icon">
        <span class="material-symbols-outlined">cloud_download</span>
      </div>
      <h2 class="hero-title">{{ t('export.hero.title') }}</h2>
      <p class="hero-desc">{{ t('export.hero.desc') }}</p>
    </section>

    <section class="intro-card">
      <h2>{{ t('export.intro.title') }}</h2>
      <p>{{ t('export.intro.desc') }}</p>
    </section>

    <section class="config-card">
      <div class="card-title-row">
        <h3>{{ t('export.semester.title') }}</h3>
        <span class="semester-hint">{{ semesterHint }}</span>
      </div>
      <div v-if="loadingSemesters" class="hint-line">{{ t('export.semester.loading') }}</div>
      <div v-else-if="semesters.length === 0" class="hint-line warn">{{ t('export.semester.missing') }}</div>
      <div v-else class="semester-grid">
        <label
          v-for="sem in semesters"
          :key="sem"
          class="semester-chip"
          :class="{ active: semesterChecked(sem), disabled: !requiresSemester }"
        >
          <input
            type="checkbox"
            :disabled="!requiresSemester"
            :checked="semesterChecked(sem)"
            @change="toggleSemester(sem)"
          />
          <span>{{ sem }}</span>
        </label>
      </div>
    </section>

    <section v-if="selectedModules.includes('ranking')" class="config-card">
      <h3>{{ t('export.ranking.title') }}</h3>
      <label class="inline-switch">
        <input v-model="rankingIncludeAll" type="checkbox" />
        <span>{{ t('export.ranking.includeAll') }}</span>
      </label>
    </section>

    <section v-if="selectedModules.includes('transactions')" class="config-card">
      <div class="card-title-row">
        <h3>{{ t('export.transactions.title') }}</h3>
        <span class="semester-hint">{{ transactionHint }}</span>
      </div>
      <div class="month-grid">
        <label
          v-for="item in transactionMonthOptions"
          :key="item.value"
          class="month-chip"
          :class="{ active: monthChecked(item.value) }"
        >
          <input
            type="checkbox"
            :checked="monthChecked(item.value)"
            @change="toggleTransactionMonth(item.value)"
          />
          <span>{{ item.label }}</span>
        </label>
      </div>
    </section>

    <section v-for="group in moduleGroups" :key="group.id" class="config-card">
      <h3>{{ group.title }}</h3>
      <div class="export-module-grid">
        <label
          v-for="mod in group.modules"
          :key="mod.id"
          class="export-module-item"
          :class="{ active: selectedModules.includes(mod.id) }"
        >
          <input
            type="checkbox"
            :checked="selectedModules.includes(mod.id)"
            @change="toggleModule(mod.id)"
          />
          <span class="export-module-icon">{{ mod.icon }}</span>
          <span class="export-module-name">{{ mod.name }}</span>
          <span v-if="mod.semesterAware" class="export-semester-tag">{{ t('export.tag.semester') }}</span>
        </label>
      </div>
    </section>

    <section class="actions-card">
      <button class="export-btn outline" :disabled="preparing || exporting" @click="exportJson">
        <span class="material-symbols-outlined">data_object</span>
        {{ exporting ? t('export.action.processing') : t('export.action.json') }}
      </button>
      <button class="export-btn primary" :disabled="preparing || exporting" @click="exportImage">
        <span class="material-symbols-outlined">image</span>
        {{ exporting ? t('export.action.processing') : t('export.action.image') }}
      </button>
      <button class="export-btn outline" :disabled="preparing || exporting" @click="collectExportData">
        {{ preparing ? t('export.action.preparing') : t('export.action.preview') }}
      </button>
    </section>

    <div v-if="exportError" class="export-feedback export-feedback--error">
      <div class="export-feedback__title">{{ exportError }}</div>
    </div>
    <div v-if="exportSuccess" class="export-feedback export-feedback--success">
      <div class="export-feedback__title">{{ exportSuccess }}</div>
      <div v-if="exportSuccessPath" class="export-feedback__path">
        <span>{{ t('export.result.saveLocation') }}</span>
        <strong>{{ exportSuccessPath }}</strong>
      </div>
      <div v-if="exportSuccessHint" class="export-feedback__hint">{{ exportSuccessHint }}</div>
    </div>

    <section v-if="hasPreparedData" class="preview-wrap">
      <div ref="previewRef" class="preview-content">
        <div class="preview-header">
          <div>
            <h2>{{ t('export.preview.title') }}</h2>
            <p>{{ t('export.preview.studentId') }}：{{ studentId || t('export.preview.notLoggedIn') }}</p>
            <p>{{ t('export.preview.exportedAt') }}：{{ exportPayload.generatedAt }}</p>
            <p v-if="prettySyncText">{{ t('export.preview.lastSync') }}：{{ prettySyncText }}</p>
          </div>
          <div class="preview-summary">{{ topSummary }}</div>
        </div>

        <article v-for="meta in selectedModuleMetas" :key="meta.id" class="preview-module">
          <header class="preview-module-header">
            <h3>{{ meta.icon }} {{ meta.name }}</h3>
          </header>

          <div v-if="!getModuleResult(meta.id)" class="module-empty">{{ t('export.preview.moduleEmpty') }}</div>
          <div v-else-if="!getModuleResult(meta.id).success" class="module-empty error">
            {{ getModuleResult(meta.id).error }}
          </div>

          <template v-else>
            <div v-if="meta.id === 'grades'" class="module-block">
              <div class="module-kv">
                <span>{{ t('export.preview.totalCourses') }}</span>
                <strong>{{ getModuleResult(meta.id).data.total }}</strong>
              </div>
              <div
                v-for="term in getModuleResult(meta.id).data.grouped"
                :key="`grade-${term.semester}`"
                class="term-block"
              >
                <h4>{{ term.semester }}（{{ term.list.length }} {{ t('export.preview.courseCountUnit') }}）</h4>
                <table class="detail-table">
                  <thead>
                    <tr>
                      <th>{{ t('export.preview.table.course') }}</th>
                      <th>{{ t('export.preview.table.score') }}</th>
                      <th>{{ t('export.preview.table.credit') }}</th>
                      <th>{{ t('export.preview.table.nature') }}</th>
                      <th>{{ t('export.preview.table.teacher') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in term.list" :key="`${term.semester}-${item.course_name}-${item.teacher}`">
                      <td>{{ item.course_name }}</td>
                      <td>{{ formatScore(item.final_score) }}</td>
                      <td>{{ item.course_credit || '-' }}</td>
                      <td>{{ item.course_nature || '-' }}</td>
                      <td>{{ item.teacher || '-' }}</td>
                    </tr>
                    <tr v-if="term.list.length === 0">
                      <td colspan="5">{{ t('export.preview.noTermData') }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-else-if="meta.id === 'ranking'" class="module-block">
              <div v-for="row in getModuleResult(meta.id).data" :key="`ranking-${row.semester}`" class="term-block">
                <h4>{{ row.semester }}</h4>
                <p v-if="row.error" class="warn-text">{{ row.error }}</p>
                <template v-else>
                  <div class="module-kv-grid">
                    <div class="module-kv"><span>{{ t('export.preview.gpa') }}</span><strong>{{ row.data?.gpa || '-' }}</strong></div>
                    <div class="module-kv"><span>{{ t('export.preview.avgScore') }}</span><strong>{{ row.data?.avg_score || '-' }}</strong></div>
                    <div class="module-kv"><span>{{ t('export.preview.majorGpaRank') }}</span><strong>{{ row.data?.gpa_major_rank || '-' }}/{{ row.data?.gpa_major_total || '-' }}</strong></div>
                    <div class="module-kv"><span>{{ t('export.preview.classGpaRank') }}</span><strong>{{ row.data?.gpa_class_rank || '-' }}/{{ row.data?.gpa_class_total || '-' }}</strong></div>
                  </div>
                </template>
              </div>
            </div>

            <div v-else-if="meta.id === 'schedule'" class="module-block">
              <div
                v-for="term in getModuleResult(meta.id).data.grouped"
                :key="`schedule-${term.semester}`"
                class="term-block"
              >
                <h4>{{ term.semester }}（{{ term.list.length }} {{ t('export.preview.itemCountUnit') }}）</h4>
                <table class="detail-table">
                  <thead>
                    <tr>
                      <th>{{ t('export.preview.table.weekday') }}</th>
                      <th>{{ t('export.preview.table.period') }}</th>
                      <th>{{ t('export.preview.table.course') }}</th>
                      <th>{{ t('export.preview.table.location') }}</th>
                      <th>{{ t('export.preview.table.teacher') }}</th>
                      <th>{{ t('export.preview.table.weeks') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in term.list" :key="`${term.semester}-${item.course_name}-${item.weekday}-${item.period}-${item.room}`">
                      <td>{{ formatWeekday(item.weekday) }}</td>
                      <td>{{ formatPeriod(item) }}</td>
                      <td>{{ item.course_name || '-' }}</td>
                      <td>{{ item.room || '-' }}</td>
                      <td>{{ item.teacher || '-' }}</td>
                      <td>{{ item.weeks || '-' }}</td>
                    </tr>
                    <tr v-if="term.list.length === 0">
                      <td colspan="6">{{ t('export.preview.noScheduleData') }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-else-if="meta.id === 'exams'" class="module-block">
              <div v-for="term in getModuleResult(meta.id).data" :key="`exam-${term.semester}`" class="term-block">
                <h4>{{ term.semester }}（{{ term.list.length }} {{ t('export.preview.examCountUnit') }}）</h4>
                <p v-if="term.error" class="warn-text">{{ term.error }}</p>
                <table v-else class="detail-table">
                  <thead>
                    <tr>
                      <th>{{ t('export.preview.table.course') }}</th>
                      <th>{{ t('export.preview.table.examDate') }}</th>
                      <th>{{ t('export.preview.table.examTime') }}</th>
                      <th>{{ t('export.preview.table.location') }}</th>
                      <th>{{ t('export.preview.table.seat') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in term.list" :key="`${term.semester}-${item.course_name}-${item.exam_date}-${item.exam_time}`">
                      <td>{{ item.course_name || item.name || '-' }}</td>
                      <td>{{ item.exam_date || '-' }}</td>
                      <td>{{ item.exam_time || '-' }}</td>
                      <td>{{ item.exam_room || item.room || '-' }}</td>
                      <td>{{ item.seat_no || '-' }}</td>
                    </tr>
                    <tr v-if="term.list.length === 0">
                      <td colspan="5">{{ t('export.preview.noExamData') }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-else-if="meta.id === 'calendar'" class="module-block">
              <div v-for="term in getModuleResult(meta.id).data" :key="`cal-${term.semester}`" class="term-block">
                <h4>{{ term.semester }}（{{ term.list.length }} {{ t('export.preview.weekCountUnit') }}）</h4>
                <p v-if="term.error" class="warn-text">{{ term.error }}</p>
                <table v-else class="detail-table">
                  <thead>
                    <tr>
                      <th>{{ t('export.preview.table.month') }}</th>
                      <th>{{ t('export.preview.table.weeks') }}</th>
                      <th>{{ t('common.week.mon') }}</th>
                      <th>{{ t('common.week.tue') }}</th>
                      <th>{{ t('common.week.wed') }}</th>
                      <th>{{ t('common.week.thu') }}</th>
                      <th>{{ t('common.week.fri') }}</th>
                      <th>{{ t('common.week.sat') }}</th>
                      <th>{{ t('common.week.sun') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in term.list" :key="`${term.semester}-${item.ny}-${item.zc}`">
                      <td>{{ item.ny || '-' }}</td>
                      <td>{{ item.zc || '-' }}</td>
                      <td>{{ item.monday || '-' }}</td>
                      <td>{{ item.tuesday || '-' }}</td>
                      <td>{{ item.wednesday || '-' }}</td>
                      <td>{{ item.thursday || '-' }}</td>
                      <td>{{ item.friday || '-' }}</td>
                      <td>{{ item.saturday || '-' }}</td>
                      <td>{{ item.sunday || '-' }}</td>
                    </tr>
                    <tr v-if="term.list.length === 0">
                      <td colspan="9">{{ t('export.preview.noCalendarData') }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-else-if="meta.id === 'student_info'" class="module-block module-kv-grid">
              <div
                v-for="item in normalizeStudentInfoEntries(getModuleResult(meta.id).data.data)"
                :key="`stu-${item.label}`"
                class="module-kv"
              >
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>

            <div v-else-if="meta.id === 'academic_progress'" class="module-block">
              <div class="module-kv-grid">
                <div v-for="(value, key) in getModuleResult(meta.id).data.data.summary || {}" :key="`prog-${key}`" class="module-kv">
                  <span>{{ key }}</span>
                  <strong>{{ value || '-' }}</strong>
                </div>
              </div>
              <p class="hint-line">{{ t('export.preview.treeNodes') }}：{{ (getModuleResult(meta.id).data.data.tree || []).length }}</p>
            </div>

            <div v-else-if="meta.id === 'training_plan'" class="module-block">
              <div class="module-kv"><span>{{ t('export.preview.totalCoursesPlan') }}</span><strong>{{ getModuleResult(meta.id).data.total || getModuleResult(meta.id).data.list.length }}</strong></div>
              <table class="detail-table">
                <thead>
                  <tr>
                    <th>{{ t('export.preview.table.courseCode') }}</th>
                    <th>{{ t('export.preview.table.courseName') }}</th>
                    <th>{{ t('export.preview.table.credit') }}</th>
                    <th>{{ t('export.preview.table.nature') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in getModuleResult(meta.id).data.list" :key="`${item.kcbh || item.course_code}-${item.kcmc || item.course_name}`">
                    <td>{{ item.kcbh || item.course_code || '-' }}</td>
                    <td>{{ item.kcmc || item.course_name || '-' }}</td>
                    <td>{{ item.xf || item.course_credit || '-' }}</td>
                    <td>{{ item.kcxzmc || item.course_nature || '-' }}</td>
                  </tr>
                  <tr v-if="(getModuleResult(meta.id).data.list || []).length === 0">
                    <td colspan="4">{{ t('export.preview.noPlanData') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else-if="meta.id === 'transactions'" class="module-block">
              <div class="module-kv">
                <span>{{ t('export.preview.txTotal') }}</span>
                <strong>{{ safeText(getModuleResult(meta.id).data.total) }}</strong>
              </div>
              <div v-for="item in getModuleResult(meta.id).data.grouped" :key="`tx-${item.month}`" class="term-block">
                <h4>{{ item.label }}（{{ item.list.length }} {{ t('export.preview.recordCountUnit') }}）</h4>
                <p v-if="item.error" class="warn-text">{{ item.error }}</p>
                <table v-else class="detail-table">
                  <thead>
                    <tr>
                      <th>{{ t('export.preview.table.time') }}</th>
                      <th>{{ t('export.preview.table.merchant') }}</th>
                      <th>{{ t('export.preview.table.amount') }}</th>
                      <th>{{ t('export.preview.table.remark') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, idx) in item.list"
                      :key="`tx-row-${item.month}-${idx}`"
                    >
                      <td>{{ safeText(row.date || row.tradeTime || row.time) }}</td>
                      <td>{{ safeText(row.merchantName || row.summary || row.title) }}</td>
                      <td>{{ safeText(row.amt || row.amount || row.money) }}</td>
                      <td>{{ safeText(row.summary || row.remark) }}</td>
                    </tr>
                    <tr v-if="item.list.length === 0">
                      <td colspan="4">{{ t('export.preview.noTxData') }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-else-if="meta.id === 'electricity'" class="module-block">
              <p v-if="!getModuleResult(meta.id).data.found" class="warn-text">{{ getModuleResult(meta.id).data.message || t('export.cache.electricityEmpty') }}</p>
              <template v-else>
                <p class="hint-line">{{ t('export.cache.hitTime') }}：{{ formatTimestampText(getModuleResult(meta.id).data.timestamp) }}</p>
                <div class="module-kv-grid">
                  <div class="module-kv">
                    <span>{{ t('export.preview.dormitory') }}</span>
                    <strong>{{ normalizeElectricityInfo(getModuleResult(meta.id).data).dormitory }}</strong>
                  </div>
                  <div class="module-kv">
                    <span>{{ t('export.preview.remainQuantity') }}</span>
                    <strong>{{ normalizeElectricityInfo(getModuleResult(meta.id).data).quantity }}</strong>
                  </div>
                  <div class="module-kv">
                    <span>{{ t('export.preview.balance') }}</span>
                    <strong>{{ normalizeElectricityInfo(getModuleResult(meta.id).data).balance }}</strong>
                  </div>
                  <div class="module-kv">
                    <span>{{ t('export.preview.status') }}</span>
                    <strong>{{ normalizeElectricityInfo(getModuleResult(meta.id).data).status }}</strong>
                  </div>
                </div>
              </template>
            </div>

            <div v-else-if="meta.id === 'classroom'" class="module-block">
              <p v-if="!getModuleResult(meta.id).data.found" class="warn-text">{{ getModuleResult(meta.id).data.message || t('export.cache.classroomEmpty') }}</p>
              <template v-else>
                <p class="hint-line">{{ t('export.cache.hitTime') }}：{{ formatTimestampText(getModuleResult(meta.id).data.timestamp) }}</p>
                <div class="classroom-grid">
                  <div
                    v-for="room in normalizeClassroomRows(getModuleResult(meta.id).data).slice(0, 24)"
                    :key="`cls-${room.id}`"
                    class="classroom-card"
                  >
                    <h5>{{ room.name }}</h5>
                    <p>{{ room.campus }} · {{ room.building }} · {{ tf('export.field.floorSuffix', { floor: room.floor }) }}</p>
                    <p>{{ t('export.field.seatsLabel') }}：{{ room.seats }} · {{ t('export.field.statusLabel') }}：{{ room.status }}</p>
                  </div>
                </div>
              </template>
            </div>

            <div v-else-if="meta.id === 'campus_map'" class="module-block">
              <p v-if="!getModuleResult(meta.id).data.found" class="warn-text">{{ getModuleResult(meta.id).data.message || t('export.cache.campusMapEmpty') }}</p>
              <template v-else>
                <p class="hint-line">{{ t('export.cache.hitTime') }}：{{ formatTimestampText(getModuleResult(meta.id).data.timestamp) }}</p>
                <div class="module-kv-grid">
                  <div class="module-kv">
                    <span>{{ t('export.preview.mapCount') }}</span>
                    <strong>{{ normalizeCampusMaps(getModuleResult(meta.id).data).length }}</strong>
                  </div>
                </div>
                <table class="detail-table">
                  <thead>
                    <tr>
                      <th>{{ t('export.preview.table.name') }}</th>
                      <th>{{ t('export.preview.table.description') }}</th>
                      <th>{{ t('export.preview.table.link') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, idx) in normalizeCampusMaps(getModuleResult(meta.id).data)" :key="`map-${idx}`">
                      <td>{{ safeText(item.name || item.title) }}</td>
                      <td>{{ safeText(item.desc || item.description) }}</td>
                      <td>{{ safeText(item.url || item.image) }}</td>
                    </tr>
                    <tr v-if="normalizeCampusMaps(getModuleResult(meta.id).data).length === 0">
                      <td colspan="3">{{ t('export.preview.noMapDetail') }}</td>
                    </tr>
                  </tbody>
                </table>
              </template>
            </div>

            <div v-else class="module-block">
              <pre class="cache-preview">{{ JSON.stringify(getModuleResult(meta.id).data || {}, null, 2) }}</pre>
            </div>
          </template>
        </article>
      </div>
    </section>
    </main>
  </div>
</template>

<style src="../styles/views/ExportCenterView.scoped.css" scoped></style>

