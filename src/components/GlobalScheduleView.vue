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

watch(() => filters.value.xnxq, () => fetchJcinfo())
watch([() => filters.value.yxid, () => filters.value.nj], () => fetchZyxx())
watch(() => filters.value.kkyxid, () => fetchKkjys())

onMounted(async () => {
  await fetchOptions()
  await fetchUserProfile()
  await fetchJcinfo()
  if (filters.value.yxid && filters.value.nj) {
    fetchZyxx()
  }
  if (filters.value.kkyxid) {
    fetchKkjys()
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

        <div class="filter-grid">
          <div class="field">
            <label>学年学期 *</label>
            <select v-model="filters.xnxq" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in options.xnxq" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>校区</label>
            <select v-model="filters.xqid" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in options.xqid" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>年级</label>
            <select v-model="filters.nj" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in options.nj" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>学院</label>
            <select v-model="filters.yxid" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in options.yxid" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>专业</label>
            <select v-model="filters.zyid" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in zyOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>开课单位</label>
            <select v-model="filters.kkyxid" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in options.kkyxid" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>教研室</label>
            <select v-model="filters.kkjysid" class="modern-select">
              <option value="">请选择</option>
              <option v-for="item in kkjysOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>课程名称</label>
            <input v-model="filters.kcmc" class="text-input" placeholder="支持模糊匹配" />
          </div>
          <div class="field">
            <label>任课教师</label>
            <input v-model="filters.skjs" class="text-input" placeholder="教师姓名" />
          </div>
        </div>

        <div v-if="showAdvanced" class="advanced-section">
          <div class="filter-grid">
            <div class="field">
              <label>课程性质</label>
              <select v-model="filters.kcxz" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.kcxz" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>课程类别</label>
              <select v-model="filters.kclb" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.kclb" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>学时类型</label>
              <select v-model="filters.xslx" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.xslx" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>教学楼</label>
              <select v-model="filters.jxlid" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.jxlid" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>教室类型</label>
              <select v-model="filters.jslx" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.jslx" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>考试形式</label>
              <select v-model="filters.ksxs" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.ksxs" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>考试方式</label>
              <select v-model="filters.ksfs" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.ksfs" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>教室名称</label>
              <input v-model="filters.jsmc" class="text-input" placeholder="教室名称" />
            </div>
          </div>

          <div class="filter-grid">
            <div class="field">
              <label>最小节次</label>
              <select v-model="filters.zxjc" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in jcOptions.jc" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>最大节次</label>
              <select v-model="filters.zdjc" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in jcOptions.jc" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>起始周</label>
              <select v-model="filters.zxzc" class="modern-select" :disabled="disableWeekRange">
                <option value="">请选择</option>
                <option v-for="item in jcOptions.zc" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>截止周</label>
              <select v-model="filters.zdzc" class="modern-select" :disabled="disableWeekRange">
                <option value="">请选择</option>
                <option v-for="item in jcOptions.zc" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>起始星期</label>
              <select v-model="filters.zxxq" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.zxxq" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>截止星期</label>
              <select v-model="filters.zdxq" class="modern-select">
                <option value="">请选择</option>
                <option v-for="item in options.zdxq" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>显示无排课</label>
              <select v-model="filters.xsqbkb" class="modern-select">
                <option v-for="item in options.xsqbkb" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
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
            <select v-model="pagination.pageSize" class="modern-select compact" @change="handlePageSizeChange">
              <option v-for="size in pageSizes" :key="size" :value="size">{{ size }} / 页</option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="error" class="error-banner">{{ error }}</div>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else class="result-list">
        <div v-if="results.length === 0" class="empty-state">暂无课表数据</div>
        <div v-for="(row, idx) in results" :key="row.jxbid || row.jxbmc || idx" class="result-card">
          <div class="result-header">
            <div class="course-name">{{ row.kcmc || row.kcname || row.courseName || '未知课程' }}</div>
            <div class="course-tags">
              <span v-if="row.kcxz" class="tag">{{ row.kcxz }}</span>
              <span v-if="row.kclb" class="tag muted">{{ row.kclb }}</span>
            </div>
          </div>
          <div class="result-meta">
            <span>教师：{{ row.skjs || row.jsmc || '-' }}</span>
            <span>时间：{{ row.schooltime || row.sksjdd || '-' }}</span>
            <span>地点：{{ row.skdd || row.sksjdd || '-' }}</span>
          </div>
          <div class="result-grid">
            <div>开课单位：{{ row.kkyxmc || '-' }}</div>
            <div>教研室：{{ row.kkjysmc || '-' }}</div>
            <div>教学班：{{ row.jxbmc || '-' }}</div>
            <div>班级人数：{{ row.bjrs || '-' }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qxzkb-view {
  min-height: 100vh;
  background: #f5f7fa;
}

.qxzkb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.25);
}

.qxzkb-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
}

.back-btn,
.logout-btn {
  padding: 6px 14px;
  border-radius: 18px;
  border: none;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.offline-banner {
  background: #fff3cd;
  color: #856404;
  padding: 10px 16px;
  text-align: center;
  font-size: 14px;
}

.content {
  padding: 16px 18px 40px;
}

.filter-card {
  padding: 18px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.filter-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.filter-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.filter-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ghost-btn {
  border: 1px solid rgba(148, 163, 184, 0.4);
  padding: 6px 14px;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  color: #475569;
}

.ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-btn {
  background: #4f46e5;
  color: #fff;
  border: none;
  padding: 6px 16px;
  border-radius: 14px;
  cursor: pointer;
  font-size: 13px;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #334155;
}

.text-input,
.modern-select {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 13px;
}

.modern-select.compact {
  padding: 6px 10px;
  font-size: 12px;
}

.advanced-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}

.kklx-section {
  margin-top: 16px;
}

.kklx-title {
  font-size: 13px;
  color: #334155;
  margin-bottom: 8px;
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
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
}

.pagination-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  gap: 12px;
  font-size: 13px;
  color: #475569;
}

.page-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.error-banner {
  margin-top: 16px;
  background: #fee2e2;
  color: #991b1b;
  padding: 10px 16px;
  border-radius: 12px;
}

.loading,
.empty-state {
  text-align: center;
  padding: 40px 12px;
  color: #64748b;
}

.result-list {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-card {
  background: #fff;
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.course-name {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.course-tags {
  display: flex;
  gap: 6px;
}

.tag {
  background: #ecfeff;
  color: #0e7490;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.tag.muted {
  background: #f1f5f9;
  color: #475569;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: #475569;
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 12px;
  font-size: 13px;
  color: #64748b;
}

@media (max-width: 640px) {
  .filter-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .pagination-bar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
