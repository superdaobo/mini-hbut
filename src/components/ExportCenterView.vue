<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'
import axios from 'axios'
import html2canvas from 'html2canvas'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const isNative = (() => {
  try {
    return typeof isTauri === 'function' && isTauri()
  } catch {
    return false
  }
})()

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

const weekdayText = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const moduleGroups = [
  {
    id: 'academic',
    title: '学业类',
    modules: [
      { id: 'grades', name: '成绩查询', icon: '📊', semesterAware: true },
      { id: 'ranking', name: '绩点排名', icon: '🏆', semesterAware: true },
      { id: 'schedule', name: '课表', icon: '📅', semesterAware: true },
      { id: 'exams', name: '考试安排', icon: '📝', semesterAware: true },
      { id: 'calendar', name: '校历', icon: '📘', semesterAware: true },
      { id: 'academic_progress', name: '学业完成情况', icon: '🎓', semesterAware: false },
      { id: 'training_plan', name: '培养方案', icon: '📚', semesterAware: false }
    ]
  },
  {
    id: 'basic',
    title: '基础信息',
    modules: [
      { id: 'student_info', name: '个人信息', icon: '👤', semesterAware: false }
    ]
  },
  {
    id: 'life',
    title: '生活类',
    modules: [
      { id: 'classroom', name: '空教室（缓存）', icon: '🏫', semesterAware: false },
      { id: 'electricity', name: '电费（缓存）', icon: '⚡', semesterAware: false },
      { id: 'transactions', name: '交易记录', icon: '💰', semesterAware: false },
      { id: 'campus_map', name: '校园地图（缓存）', icon: '🗺️', semesterAware: false }
    ]
  }
]

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

const loadingSemesters = ref(false)
const preparing = ref(false)
const exporting = ref(false)
const exportError = ref('')
const exportSuccess = ref('')

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

const ensureModuleSelected = () => {
  if (selectedModules.value.length === 0) {
    selectedModules.value = [...defaultSelected]
  }
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

const semesterHint = computed(() => {
  if (!requiresSemester.value) return '当前已选模块无需学期过滤。'
  if (!effectiveSemesters.value.length) return '暂无可用学期，请先登录并同步数据。'
  return `已选择 ${effectiveSemesters.value.length} 个学期`
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
  if (idx < 0 || idx >= weekdayText.length) return '-'
  return weekdayText[idx]
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
    exportError.value = `获取学期失败：${e?.message || e}`
  } finally {
    loadingSemesters.value = false
  }
}

const fetchGradesData = async (selected) => {
  const res = await axios.post(`${API_BASE}/v2/quick_fetch`, { student_id: props.studentId })
  const payload = res.data || {}
  if (!payload.success) throw new Error(payload.error || '成绩查询失败')
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
  const targetSemesters = selected.length ? selected : ['']
  const rows = []
  for (const sem of targetSemesters) {
    const res = await axios.post(`${API_BASE}/v2/ranking`, {
      student_id: props.studentId,
      semester: sem
    })
    const payload = res.data || {}
    if (!payload.success) {
      rows.push({
        semester: sem || '全部学期',
        error: payload.error || '获取失败'
      })
      continue
    }
    rows.push({
      semester: sem || '全部学期',
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
  if (!payload.success) throw new Error(payload.error || '课表查询失败')

  const metaSemester = String(payload?.meta?.semester || '').trim() || '当前学期'
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
        semester: sem || '全部学期',
        error: payload.error || '获取失败',
        list: []
      })
      continue
    }
    grouped.push({
      semester: sem || '全部学期',
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
        semester: sem || '当前学期',
        error: payload.error || '获取失败',
        list: [],
        meta: {}
      })
      continue
    }
    grouped.push({
      semester: payload?.meta?.semester || sem || '当前学期',
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
  if (!payload.success) throw new Error(payload.error || '个人信息查询失败')
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
  if (!payload.success) throw new Error(payload.error || '学业完成情况查询失败')
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
  if (!data.success) throw new Error(data.error || '培养方案查询失败')
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
      : { found: false, message: '未命中空教室缓存，请先进入空教室页面查询一次。' }
  }
  if (id === 'electricity') {
    const latest = readCacheEntry((key) => key.includes('electricity:'))
    return latest
      ? { found: true, timestamp: latest.timestamp, data: latest.data }
      : { found: false, message: '未命中电费缓存，请先进入电费页面查询一次。' }
  }
  if (id === 'campus_map') {
    const latest = readCacheEntry((key) => key.includes('campus_map') || key.includes('maps:'))
    return latest
      ? { found: true, timestamp: latest.timestamp, data: latest.data }
      : { found: false, message: '未命中校园地图缓存。' }
  }
  return { found: false, message: '暂无缓存数据。' }
}

const fetchTransactionsData = async () => {
  if (!isNative) {
    return { list: [], error: '浏览器模式不支持交易记录导出。' }
  }
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 12)
  const payload = await invoke('fetch_transaction_history', {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    pageNo: 1,
    pageSize: 1000
  })
  const success = payload?.success === true || payload?.code === '' || Array.isArray(payload?.resultData) || Array.isArray(payload?.data)
  if (!success) {
    return {
      list: [],
      error: payload?.message || payload?.error || '交易记录查询失败'
    }
  }
  return {
    list: Array.isArray(payload?.resultData) ? payload.resultData : (Array.isArray(payload?.data) ? payload.data : []),
    offline: !!payload?.offline,
    syncTime: payload?.sync_time || ''
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
  return { error: '未实现的数据模块' }
}

const collectExportData = async () => {
  exportError.value = ''
  exportSuccess.value = ''
  preparing.value = true
  try {
    const payload = {
      studentId: props.studentId,
      generatedAt: new Date().toISOString(),
      semesters: [...effectiveSemesters.value],
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
    exportSuccess.value = '导出数据已准备完成，可直接导出 JSON 或长图片。'
  } catch (e) {
    exportError.value = `准备导出数据失败：${e?.message || e}`
  } finally {
    preparing.value = false
  }
}

const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = (e) => reject(e)
    reader.readAsDataURL(blob)
  })

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

const exportJson = async () => {
  if (!exportPayload.value) {
    await collectExportData()
  }
  if (!exportPayload.value) return

  exporting.value = true
  exportError.value = ''
  exportSuccess.value = ''
  try {
    const fileName = `Mini-HBUT_Export_${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.json`
    const jsonText = JSON.stringify(exportPayload.value, null, 2)

    if (isNative) {
      const base64 = btoa(unescape(encodeURIComponent(jsonText)))
      const saved = await saveByTauri(fileName, 'application/json', base64, false)
      exportSuccess.value = `JSON 导出成功：${saved.path}`
    } else {
      saveByBrowser(fileName, 'application/json', jsonText)
      exportSuccess.value = 'JSON 已通过浏览器下载。'
    }
  } catch (e) {
    exportError.value = `JSON 导出失败：${e?.message || e}`
  } finally {
    exporting.value = false
  }
}

const exportImage = async () => {
  if (!exportPayload.value) {
    await collectExportData()
  }
  if (!exportPayload.value) return

  exporting.value = true
  exportError.value = ''
  exportSuccess.value = ''
  try {
    await nextTick()
    if (!previewRef.value) throw new Error('导出画布未准备完成')

    const canvas = await html2canvas(previewRef.value, {
      useCORS: true,
      allowTaint: false,
      scale: Math.max(2, window.devicePixelRatio || 1),
      backgroundColor: '#f0f4ff',
      logging: false
    })
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value)
        else reject(new Error('无法生成图片'))
      }, 'image/png', 0.98)
    })
    const fileName = `Mini-HBUT_Export_${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.png`

    if (isNative) {
      const dataUrl = await toDataUrl(blob)
      const base64 = dataUrl.split(',')[1] || ''
      const saved = await saveByTauri(fileName, 'image/png', base64, true)
      const tip = saved.needs_manual_import ? '（已写入应用目录，可在系统文件中导入相册）' : ''
      exportSuccess.value = `长图片导出成功：${saved.path}${tip}`
    } else {
      saveByBrowser(fileName, 'image/png', blob)
      exportSuccess.value = '长图片已通过浏览器下载。'
    }
  } catch (e) {
    exportError.value = `长图片导出失败：${e?.message || e}`
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
})
</script>

<template>
  <div class="export-view">
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">返回</button>
      <h1>📦 导出中心</h1>
      <button class="logout-btn" @click="emit('logout')">退出</button>
    </header>

    <section class="intro-card">
      <h2>导出模块</h2>
      <p>可按业务分类导出 JSON 或长图片。成绩、课表、排名等模块会按所选学期输出完整明细。</p>
    </section>

    <section class="config-card">
      <div class="card-title-row">
        <h3>学期选择</h3>
        <span class="semester-hint">{{ semesterHint }}</span>
      </div>
      <div v-if="loadingSemesters" class="hint-line">正在加载学期...</div>
      <div v-else-if="semesters.length === 0" class="hint-line warn">未获取到学期列表，导出时将使用当前缓存学期。</div>
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

    <section v-for="group in moduleGroups" :key="group.id" class="config-card">
      <h3>{{ group.title }}</h3>
      <div class="module-grid">
        <label
          v-for="mod in group.modules"
          :key="mod.id"
          class="module-item"
          :class="{ active: selectedModules.includes(mod.id) }"
        >
          <input
            type="checkbox"
            :checked="selectedModules.includes(mod.id)"
            @change="toggleModule(mod.id)"
          />
          <span class="module-icon">{{ mod.icon }}</span>
          <span class="module-name">{{ mod.name }}</span>
          <span v-if="mod.semesterAware" class="semester-tag">学期</span>
        </label>
      </div>
    </section>

    <section class="actions-card">
      <button class="action-btn prepare" :disabled="preparing || exporting" @click="collectExportData">
        {{ preparing ? '正在准备数据...' : '预览导出数据' }}
      </button>
      <button class="action-btn json" :disabled="preparing || exporting" @click="exportJson">
        {{ exporting ? '处理中...' : '导出 JSON' }}
      </button>
      <button class="action-btn image" :disabled="preparing || exporting" @click="exportImage">
        {{ exporting ? '处理中...' : '导出长图片' }}
      </button>
    </section>

    <p v-if="exportError" class="feedback error">{{ exportError }}</p>
    <p v-if="exportSuccess" class="feedback success">{{ exportSuccess }}</p>

    <section v-if="hasPreparedData" class="preview-wrap">
      <div ref="previewRef" class="preview-content">
        <div class="preview-header">
          <div>
            <h2>Mini-HBUT 导出报表</h2>
            <p>学号：{{ studentId || '未登录' }}</p>
            <p>导出时间：{{ exportPayload.generatedAt }}</p>
            <p v-if="prettySyncText">最近同步：{{ prettySyncText }}</p>
          </div>
          <div class="preview-summary">{{ topSummary }}</div>
        </div>

        <article v-for="meta in selectedModuleMetas" :key="meta.id" class="preview-module">
          <header class="preview-module-header">
            <h3>{{ meta.icon }} {{ meta.name }}</h3>
          </header>

          <div v-if="!getModuleResult(meta.id)" class="module-empty">暂无该模块导出数据。</div>
          <div v-else-if="!getModuleResult(meta.id).success" class="module-empty error">
            {{ getModuleResult(meta.id).error }}
          </div>

          <template v-else>
            <div v-if="meta.id === 'grades'" class="module-block">
              <div class="module-kv">
                <span>总课程数</span>
                <strong>{{ getModuleResult(meta.id).data.total }}</strong>
              </div>
              <div
                v-for="term in getModuleResult(meta.id).data.grouped"
                :key="`grade-${term.semester}`"
                class="term-block"
              >
                <h4>{{ term.semester }}（{{ term.list.length }} 门）</h4>
                <table class="detail-table">
                  <thead>
                    <tr>
                      <th>课程</th>
                      <th>成绩</th>
                      <th>学分</th>
                      <th>课程性质</th>
                      <th>教师</th>
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
                      <td colspan="5">该学期无数据</td>
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
                    <div class="module-kv"><span>平均学分绩点</span><strong>{{ row.data?.gpa || '-' }}</strong></div>
                    <div class="module-kv"><span>算术平均分</span><strong>{{ row.data?.avg_score || '-' }}</strong></div>
                    <div class="module-kv"><span>专业绩点排名</span><strong>{{ row.data?.gpa_major_rank || '-' }}/{{ row.data?.gpa_major_total || '-' }}</strong></div>
                    <div class="module-kv"><span>班级绩点排名</span><strong>{{ row.data?.gpa_class_rank || '-' }}/{{ row.data?.gpa_class_total || '-' }}</strong></div>
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
                <h4>{{ term.semester }}（{{ term.list.length }} 条）</h4>
                <table class="detail-table">
                  <thead>
                    <tr>
                      <th>星期</th>
                      <th>节次</th>
                      <th>课程</th>
                      <th>地点</th>
                      <th>教师</th>
                      <th>周次</th>
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
                      <td colspan="6">该学期无课表数据</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-else-if="meta.id === 'exams'" class="module-block">
              <div v-for="term in getModuleResult(meta.id).data" :key="`exam-${term.semester}`" class="term-block">
                <h4>{{ term.semester }}（{{ term.list.length }} 场）</h4>
                <p v-if="term.error" class="warn-text">{{ term.error }}</p>
                <table v-else class="detail-table">
                  <thead>
                    <tr>
                      <th>课程</th>
                      <th>考试日期</th>
                      <th>考试时间</th>
                      <th>地点</th>
                      <th>座位号</th>
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
                      <td colspan="5">该学期无考试安排</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-else-if="meta.id === 'calendar'" class="module-block">
              <div v-for="term in getModuleResult(meta.id).data" :key="`cal-${term.semester}`" class="term-block">
                <h4>{{ term.semester }}（{{ term.list.length }} 周）</h4>
                <p v-if="term.error" class="warn-text">{{ term.error }}</p>
                <table v-else class="detail-table">
                  <thead>
                    <tr>
                      <th>月份</th>
                      <th>周次</th>
                      <th>周一</th>
                      <th>周二</th>
                      <th>周三</th>
                      <th>周四</th>
                      <th>周五</th>
                      <th>周六</th>
                      <th>周日</th>
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
                      <td colspan="9">该学期无校历数据</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-else-if="meta.id === 'student_info'" class="module-block module-kv-grid">
              <div v-for="(value, key) in getModuleResult(meta.id).data.data" :key="`stu-${key}`" class="module-kv">
                <span>{{ key }}</span>
                <strong>{{ value || '-' }}</strong>
              </div>
            </div>

            <div v-else-if="meta.id === 'academic_progress'" class="module-block">
              <div class="module-kv-grid">
                <div v-for="(value, key) in getModuleResult(meta.id).data.data.summary || {}" :key="`prog-${key}`" class="module-kv">
                  <span>{{ key }}</span>
                  <strong>{{ value || '-' }}</strong>
                </div>
              </div>
              <p class="hint-line">树形节点数量：{{ (getModuleResult(meta.id).data.data.tree || []).length }}</p>
            </div>

            <div v-else-if="meta.id === 'training_plan'" class="module-block">
              <div class="module-kv"><span>课程总数</span><strong>{{ getModuleResult(meta.id).data.total || getModuleResult(meta.id).data.list.length }}</strong></div>
              <table class="detail-table">
                <thead>
                  <tr>
                    <th>课程编号</th>
                    <th>课程名称</th>
                    <th>学分</th>
                    <th>课程性质</th>
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
                    <td colspan="4">暂无培养方案数据</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else-if="meta.id === 'transactions'" class="module-block">
              <p v-if="getModuleResult(meta.id).data.error" class="warn-text">{{ getModuleResult(meta.id).data.error }}</p>
              <table v-else class="detail-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>商户</th>
                    <th>金额</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, idx) in getModuleResult(meta.id).data.list"
                    :key="`tx-${idx}-${item.date || item.tradeTime || ''}`"
                  >
                    <td>{{ item.date || item.tradeTime || item.time || '-' }}</td>
                    <td>{{ item.merchantName || item.summary || item.title || '-' }}</td>
                    <td>{{ item.amt || item.amount || item.money || '-' }}</td>
                    <td>{{ item.summary || item.remark || '-' }}</td>
                  </tr>
                  <tr v-if="(getModuleResult(meta.id).data.list || []).length === 0">
                    <td colspan="4">暂无交易记录</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="module-block">
              <p v-if="getModuleResult(meta.id).data.found" class="hint-line">
                命中缓存时间：{{ formatRelativeTime(new Date(getModuleResult(meta.id).data.timestamp).toISOString()) }}
              </p>
              <p v-else class="warn-text">{{ getModuleResult(meta.id).data.message || '暂无数据' }}</p>
              <pre class="cache-preview">{{ JSON.stringify(getModuleResult(meta.id).data.data || {}, null, 2) }}</pre>
            </div>
          </template>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.export-view {
  min-height: 100vh;
  padding: 20px 20px 120px;
  background: var(--ui-bg-gradient);
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 auto 18px;
  max-width: 1080px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 22px;
  padding: 14px 16px;
}

.view-header h1 {
  margin: 0;
  font-size: 34px;
  color: var(--ui-text);
}

.back-btn,
.logout-btn {
  min-width: 90px;
  height: 42px;
  border: none;
  border-radius: 12px;
  font-size: 26px;
  font-weight: 700;
  cursor: pointer;
  color: var(--ui-text);
  background: var(--ui-primary-soft);
}

.logout-btn {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

.intro-card,
.config-card,
.actions-card,
.preview-wrap {
  max-width: 1080px;
  margin: 0 auto 16px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 22px;
  padding: 18px 20px;
}

.intro-card h2 {
  margin: 0 0 8px;
  font-size: 34px;
  color: var(--ui-text);
}

.intro-card p {
  margin: 0;
  color: var(--ui-muted);
  font-size: 25px;
  line-height: 1.6;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.config-card h3 {
  margin: 0 0 10px;
  font-size: 30px;
  color: var(--ui-text);
}

.semester-hint,
.hint-line {
  font-size: 22px;
  color: var(--ui-muted);
}

.hint-line.warn,
.warn-text {
  color: #b45309;
  font-weight: 600;
}

.semester-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.semester-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 22px;
  color: #1d4ed8;
  cursor: pointer;
  user-select: none;
  background: rgba(239, 246, 255, 0.75);
}

.semester-chip input {
  width: 16px;
  height: 16px;
  margin: 0;
}

.semester-chip.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.semester-chip.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.module-item {
  display: grid;
  grid-template-columns: 18px 28px 1fr auto;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 16px;
  padding: 9px 10px;
  background: rgba(248, 250, 252, 0.9);
  cursor: pointer;
}

.module-item input {
  width: 16px;
  height: 16px;
  margin: 0;
}

.module-item.active {
  border-color: #2563eb;
  background: rgba(219, 234, 254, 0.75);
}

.module-icon {
  display: inline-flex;
  justify-content: center;
  font-size: 22px;
  line-height: 1;
}

.module-name {
  font-size: 24px;
  color: #1f2937;
  line-height: 1.3;
  font-weight: 600;
}

.semester-tag {
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.14);
  color: #4f46e5;
  font-size: 18px;
  padding: 3px 8px;
  font-weight: 700;
}

.actions-card {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.action-btn {
  border: none;
  border-radius: 14px;
  padding: 11px 16px;
  min-width: 180px;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
}

.action-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.action-btn.prepare {
  background: linear-gradient(135deg, #1d4ed8, #0ea5e9);
}

.action-btn.json {
  background: linear-gradient(135deg, #16a34a, #22c55e);
}

.action-btn.image {
  background: linear-gradient(135deg, #7c3aed, #a855f7);
}

.feedback {
  max-width: 1080px;
  margin: 0 auto 12px;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 22px;
  font-weight: 600;
}

.feedback.error {
  background: rgba(254, 226, 226, 0.92);
  border: 1px solid rgba(248, 113, 113, 0.5);
  color: #b91c1c;
}

.feedback.success {
  background: rgba(220, 252, 231, 0.92);
  border: 1px solid rgba(74, 222, 128, 0.5);
  color: #166534;
}

.preview-content {
  background: linear-gradient(180deg, #f7f9ff 0%, #eff4ff 100%);
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 16px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  padding: 12px 14px;
  margin-bottom: 12px;
}

.preview-header h2 {
  margin: 0 0 4px;
  font-size: 30px;
}

.preview-header p {
  margin: 2px 0;
  font-size: 20px;
  color: #475569;
}

.preview-summary {
  align-self: center;
  max-width: 44%;
  font-size: 19px;
  color: #334155;
  line-height: 1.5;
  text-align: right;
}

.preview-module {
  background: #fff;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  margin-bottom: 12px;
}

.preview-module-header {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.12), rgba(14, 165, 233, 0.05));
  border-radius: 14px 14px 0 0;
}

.preview-module-header h3 {
  margin: 0;
  font-size: 26px;
  color: #0f172a;
}

.module-block {
  padding: 12px 14px;
}

.module-empty {
  padding: 12px 14px;
  color: #64748b;
}

.module-empty.error {
  color: #b91c1c;
}

.module-kv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
}

.module-kv {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  padding: 8px 10px;
  background: rgba(248, 250, 252, 0.75);
  font-size: 19px;
}

.module-kv span {
  color: #475569;
}

.module-kv strong {
  color: #0f172a;
}

.term-block {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 10px;
}

.term-block h4 {
  margin: 0 0 8px;
  font-size: 22px;
  color: #1e3a8a;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 18px;
}

.detail-table th,
.detail-table td {
  border: 1px solid rgba(148, 163, 184, 0.28);
  padding: 6px 7px;
  text-align: left;
  vertical-align: top;
}

.detail-table th {
  background: rgba(241, 245, 249, 0.95);
  color: #334155;
  font-weight: 700;
}

.cache-preview {
  margin: 10px 0 0;
  max-height: 220px;
  overflow: auto;
  background: rgba(15, 23, 42, 0.94);
  color: #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
}

@media (max-width: 768px) {
  .export-view {
    padding: 14px 12px 110px;
  }

  .view-header h1 {
    font-size: 30px;
  }

  .back-btn,
  .logout-btn {
    min-width: 74px;
    font-size: 22px;
  }

  .intro-card h2 {
    font-size: 30px;
  }

  .intro-card p,
  .hint-line,
  .semester-hint {
    font-size: 21px;
  }

  .config-card h3 {
    font-size: 27px;
  }

  .module-name {
    font-size: 21px;
  }

  .semester-tag {
    font-size: 16px;
  }

  .action-btn {
    width: 100%;
    font-size: 21px;
  }

  .feedback {
    font-size: 21px;
  }

  .preview-header {
    flex-direction: column;
  }

  .preview-summary {
    max-width: 100%;
    text-align: left;
    font-size: 18px;
  }

  .preview-header h2 {
    font-size: 25px;
  }

  .preview-header p {
    font-size: 18px;
  }

  .preview-module-header h3 {
    font-size: 24px;
  }

  .module-kv,
  .detail-table {
    font-size: 16px;
  }
}
</style>
