<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { formatRelativeTime } from '../utils/time.js'

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
  page,
  page_size: pagination.value.pageSize
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
  fetchList(1)
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
  }
})
</script>

<template>
  <div class="qxzkb-view">
    <header class="qxzkb-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <div class="title">
        <span class="icon">🏫</span>
        <span>全校课表</span>
      </div>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

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

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else class="result-list">
        <div v-if="results.length === 0" class="empty-state">暂无课表数据</div>
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
    </div>

    <Teleport to="body">
      <div v-if="showDetail && selectedRow" class="modal-overlay" @click="closeDetail">
        <div class="modal-content" @click.stop>
          <button class="modal-close" @click="closeDetail">×</button>
          <div class="modal-title">{{ detailTitle }}</div>

          <div v-if="selectedSections.length === 0" class="empty-state compact">
            当前记录无可展示详情字段
          </div>

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

@media (max-width: 700px) {
  .filter-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .result-list {
    grid-template-columns: 1fr;
  }

  .modal-content {
    padding: 12px;
  }
}
</style>
