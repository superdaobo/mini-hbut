<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { fetchWithCache, LONG_TTL } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { TPageHeader, TEmptyState } from './templates'
import { isTestAccountSession } from '../utils/test_account.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(false)
const error = ref('')
const courses = ref([])
const offline = ref(false)
const syncTime = ref('')
const selectedCourse = ref(null)
const showDetail = ref(false)
const showAdvanced = ref(false)
const options = ref({
  grade: [],
  kkxq: [],
  kkyx: [],
  kcxz: [],
  kcgs: [],
  kkjys: []
})

const COURSE_NATURE_FALLBACK_MAP = {
  '11': '通识教育必修课',
  '12': '通识教育选修课',
  '16': '限定性选修课',
  '31': '学科基础课',
  '32': '工程基础课',
  '40': '专业核心课',
  '41': '专业方向组选课',
  '42': '专业任选课',
  '43': '专业基础课',
  '44': '专业必修课',
  '45': '专业选修课',
  '50': '基础实践',
  '51': '专业实践',
  '52': '综合实践',
  '53': '其他实践',
  '54': '短学期实践',
  '70': '辅修双学位理论',
  '71': '辅修双学位实践',
  '90': '必修',
  '98': '重修课',
  '99': '公共选修课'
}

const defaults = ref({
  grade: '',
  kkxq: ''
})

const filters = ref({
  grade: '',
  kkxq: '',
  kkyx: '',
  kkjys: '',
  kcxz: '',
  kcgs: '',
  kcbh: '',
  kcmc: ''
})

const pagination = ref({
  page: 1,
  pageSize: 50,
  total: 0,
  totalPages: 0
})

const loadLocalOptions = () => {
  const raw = localStorage.getItem('hbu_training_options')
  if (!raw) return
  try {
    const cached = JSON.parse(raw)
    if (cached?.options) {
      options.value = {
        ...options.value,
        ...cached.options
      }
    }
    if (cached?.defaults) {
      defaults.value = cached.defaults
      filters.value.grade = cached.defaults.grade || filters.value.grade
      filters.value.kkxq = cached.defaults.kkxq || filters.value.kkxq
    }
  } catch (e) {
    // ignore parse errors
  }
}

const fetchOptions = async () => {
  try {
    console.log('[TrainingPlan] Fetching options...')
    const { data, fromCache } = await fetchWithCache(`training:options:${props.studentId}`, async () => {
      console.log('[TrainingPlan] Making API call for options')
      const res = await axios.post(`${API_BASE}/v2/training_plan/options`, {
        student_id: props.studentId
      })
      console.log('[TrainingPlan] Options API response:', res.data)
      return res.data
    }, LONG_TTL)

    console.log('[TrainingPlan] Options data:', data, 'fromCache:', fromCache)
    if (data?.success) {
      options.value = {
        ...options.value,
        ...data.options
      }
      defaults.value = data.defaults || defaults.value
      filters.value.grade = defaults.value.grade || ''
      filters.value.kkxq = defaults.value.kkxq || ''
      if (!isTestAccountSession()) {
        localStorage.setItem('hbu_training_options', JSON.stringify({
          options: options.value,
          defaults: defaults.value
        }))
      }
      await fetchJys()
    } else if (data?.need_login) {
      emit('logout')
    }
  } catch (e) {
    console.error('获取培养方案筛选项失败', e)
  }
}

const fetchJys = async () => {
  if (!filters.value.kkyx) {
    options.value.kkjys = []
    filters.value.kkjys = ''
    return
  }
  try {
    const { data } = await fetchWithCache(`training:jys:${props.studentId}:${filters.value.kkyx}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/training_plan/jys`, {
        student_id: props.studentId,
        kkyx: filters.value.kkyx
      })
      return res.data
    }, LONG_TTL)
    if (data?.success) {
      options.value.kkjys = data.data || []
      filters.value.kkjys = ''
    }
  } catch (e) {
    console.error('获取教研室失败', e)
  }
}

const fetchCourses = async (page = pagination.value.page) => {
  loading.value = true
  error.value = ''
  console.log('[TrainingPlan] fetchCourses called with page:', page, 'filters:', JSON.stringify(filters.value))
  try {
    const cacheKey = `training:${props.studentId}:${page}:${JSON.stringify(filters.value)}`
    const { data, fromCache } = await fetchWithCache(cacheKey, async () => {
      console.log('[TrainingPlan] Making API call for courses')
      const res = await axios.post(`${API_BASE}/v2/training_plan`, {
        student_id: props.studentId,
        ...filters.value,
        page,
        page_size: pagination.value.pageSize
      })
      console.log('[TrainingPlan] Courses API response:', res.data)
      return res.data
    }, LONG_TTL)

    console.log('[TrainingPlan] Courses data:', data, 'fromCache:', fromCache)
    if (data?.success) {
      courses.value = data.data || []
      pagination.value.page = data.page || page
      pagination.value.total = data.total || 0
      pagination.value.totalPages = data.totalPages || 0
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
    } else {
      error.value = data?.error || '获取培养方案失败'
    }
  } catch (e) {
    error.value = e.response?.data?.error || '网络错误'
    console.error('[TrainingPlan] fetchCourses error:', e)
  } finally {
    loading.value = false
  }
}

const resetFilters = async () => {
  filters.value = {
    grade: defaults.value.grade || '',
    kkxq: defaults.value.kkxq || '',
    kkyx: '',
    kkjys: '',
    kcxz: '',
    kcgs: '',
    kcbh: '',
    kcmc: ''
  }
  await fetchJys()
  fetchCourses(1)
}

const handleSearch = () => {
  fetchCourses(1)
}

const handlePrev = () => {
  if (pagination.value.page > 1) {
    fetchCourses(pagination.value.page - 1)
  }
}

const handleNext = () => {
  if (pagination.value.page < pagination.value.totalPages) {
    fetchCourses(pagination.value.page + 1)
  }
}

const resolveCourseNature = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return '-'
  if (/[^\d]/.test(raw)) return raw
  const fromOptions = (options.value.kcxz || []).find(
    item => String(item?.value ?? '').trim() === raw
  )
  if (fromOptions?.label) return String(fromOptions.label).trim()
  return COURSE_NATURE_FALLBACK_MAP[raw] || raw
}

const openDetail = (course) => {
  selectedCourse.value = course
  showDetail.value = true
}

const closeDetail = () => {
  showDetail.value = false
  selectedCourse.value = null
}

onMounted(async () => {
  loadLocalOptions()
  await fetchOptions()
  // 即使没有选择院系也要查询课程
  console.log('[TrainingPlan] Mounted, fetching courses with filters:', JSON.stringify(filters.value))
  await fetchCourses(1)
})
</script>

<template>
  <div class="training-plan-view">
    <TPageHeader title="培养方案" @back="emit('back')" />

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <section class="filters">
      <div class="filter-grid compact-main">
        <label>
          <span>开设学年</span>
          <IOSSelect v-model="filters.grade">
            <option value="">请选择</option>
            <option v-for="opt in options.grade" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </IOSSelect>
        </label>
        <label>
          <span>开设学期</span>
          <IOSSelect v-model="filters.kkxq">
            <option value="">请选择</option>
            <option v-for="opt in options.kkxq" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </IOSSelect>
        </label>
      </div>
      <div class="filter-actions">
        <button class="primary" @click="handleSearch">搜索</button>
        <button class="ghost" @click="resetFilters">重置</button>
        <button class="ghost" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? '收起高级' : '展开高级' }}
        </button>
      </div>
      <div v-if="showAdvanced" class="advanced-section">
        <div class="filter-grid">
        <label>
          <span>开课院系</span>
          <IOSSelect v-model="filters.kkyx" @change="fetchJys">
            <option value="">请选择</option>
            <option v-for="opt in options.kkyx" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </IOSSelect>
        </label>
        <label>
          <span>开课教研室</span>
          <IOSSelect v-model="filters.kkjys">
            <option value="">请选择</option>
            <option v-for="opt in options.kkjys" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </IOSSelect>
        </label>
        <label>
          <span>课程性质</span>
          <IOSSelect v-model="filters.kcxz">
            <option value="">请选择</option>
            <option v-for="opt in options.kcxz" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </IOSSelect>
        </label>
        <label>
          <span>课程归属</span>
          <IOSSelect v-model="filters.kcgs">
            <option value="">请选择</option>
            <option v-for="opt in options.kcgs" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </IOSSelect>
        </label>
        <label>
          <span>课程编号</span>
          <input v-model="filters.kcbh" placeholder="输入编号" />
        </label>
        <label>
          <span>课程名称</span>
          <input v-model="filters.kcmc" placeholder="输入名称" />
        </label>
      </div>
      </div>
    </section>

    <section class="content">
<TEmptyState v-if="loading" type="loading" />
    <TEmptyState v-else-if="error" type="error" :message="error" />

      <div v-else class="course-grid">
        <div 
          v-for="row in courses" 
          :key="row.id" 
          class="course-card"
          @click="openDetail(row)"
        >
          <div class="course-title">{{ row.kcmc || '-' }}</div>
            <div class="course-tags">
              <span class="tag primary">{{ row.sfbx || '未知' }}</span>
              <span class="tag">学分 {{ row.xf || '-' }}</span>
              <span class="tag ghost">{{ resolveCourseNature(row.kcxz) }}</span>
            </div>
          <div class="course-sub">
            <span>{{ row.kcbh || '-' }}</span>
            <span>{{ row.kkxq || '-' }}</span>
          </div>
        </div>
        <div v-if="courses.length === 0" class="empty">暂无数据</div>
      </div>

      <div class="pagination" v-if="pagination.totalPages > 1">
        <button @click="handlePrev" :disabled="pagination.page <= 1">上一页</button>
        <span>第 {{ pagination.page }} / {{ pagination.totalPages }} 页</span>
        <button @click="handleNext" :disabled="pagination.page >= pagination.totalPages">下一页</button>
      </div>

      <div v-if="showDetail" class="modal-overlay" @click="closeDetail">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>{{ selectedCourse?.kcmc || '课程详情' }}</h3>
            <button class="close-btn" @click="closeDetail">×</button>
          </div>
          <div class="modal-body">
            <div class="detail-item">
              <span class="label">课程编号</span>
              <span class="value">{{ selectedCourse?.kcbh || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">课程性质</span>
              <span class="value">{{ resolveCourseNature(selectedCourse?.kcxz) }}</span>
            </div>
            <div class="detail-item">
              <span class="label">选/必修</span>
              <span class="value">{{ selectedCourse?.sfbx || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">课程归属</span>
              <span class="value">{{ selectedCourse?.kcgs || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">开设学年</span>
              <span class="value">{{ selectedCourse?.gradename || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">开设学期</span>
              <span class="value">{{ selectedCourse?.kkxq || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">学分</span>
              <span class="value">{{ selectedCourse?.xf || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">开课院系</span>
              <span class="value">{{ selectedCourse?.kkyxmc || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">开课教研室</span>
              <span class="value">{{ selectedCourse?.kkjysmc || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">考试形式</span>
              <span class="value">{{ selectedCourse?.ksxs || '-' }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 页级背景对齐成绩查询：中性浅底，避免 --ui-bg-gradient 蓝青全页染色 */
.training-plan-view {
  min-height: 100vh;
  background: #f6fafe;
  color: var(--ui-text);
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: rgba(246, 250, 254, 0.86);
  color: var(--ui-text);
  border-bottom: 1px solid rgba(226, 232, 240, 0.86);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.back-btn,
.logout-btn {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, transparent);
  cursor: pointer;
  background: #eff6ff;
  color: var(--ui-primary);
  font-weight: 700;
}

.filters {
  background: #ffffff;
  margin: 16px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  animation: training-fade-up 0.28s ease both;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px 16px;
}

.compact-main {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.filter-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--ui-text);
}

.filter-grid select,
.filter-grid input {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--ui-surface-border);
  font-size: 13px;
  background: #f0f4f8;
  color: var(--ui-text);
}

.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.advanced-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--ui-surface-border);
}

.filter-actions button {
  padding: 8px 16px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  font-weight: 600;
}

.filter-actions .primary {
  background: var(--ui-primary);
  color: #ffffff;
}

.filter-actions .ghost {
  background: #eff6ff;
  color: var(--ui-primary);
}

.content {
  padding: 0 16px 24px;
  animation: training-fade-up 0.32s ease both;
  animation-delay: 0.04s;
}

.state {
  padding: 16px;
  color: var(--ui-muted);
}

.state.error {
  color: var(--ui-danger);
}

.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.course-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  animation: training-fade-up 0.3s ease both;
}

.course-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px -8px rgba(15, 23, 42, 0.14);
  border-color: color-mix(in oklab, var(--ui-primary) 28%, transparent);
}

.course-title {
  font-size: 16px;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 10px;
}

.course-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.tag {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, transparent);
}

.tag.primary {
  background: #dbeafe;
  color: #1d4ed8;
}

.tag.ghost {
  background: #d1fae5;
  color: #047857;
  border-color: color-mix(in oklab, var(--ui-success, #10b981) 28%, transparent);
}

.course-sub {
  display: flex;
  justify-content: space-between;
  color: var(--ui-muted);
  font-size: 12px;
  font-weight: 600;
}

.empty {
  text-align: center;
  color: var(--ui-muted);
  padding: 20px;
}

.pagination {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination button {
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: #ffffff;
  color: var(--ui-text);
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  padding: 20px;
}

.modal-content {
  background: #ffffff;
  border-radius: 18px;
  width: min(520px, 100%);
  padding: 20px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: var(--ui-shadow-strong);
  animation: training-slide-up 0.28s ease;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
  font-weight: 800;
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: #eff6ff;
  color: var(--ui-primary);
  font-size: 18px;
  cursor: pointer;
}

.modal-body {
  display: grid;
  gap: 12px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--ui-text);
  border-bottom: 1px solid var(--ui-surface-border);
  padding-bottom: 8px;
}

.detail-item .label {
  color: var(--ui-muted);
}

.detail-item .value {
  font-weight: 600;
  text-align: right;
}

.offline-banner {
  margin: 12px 16px 0;
  padding: 10px 14px;
  background: #fef3c7;
  border: 1px solid color-mix(in oklab, #f59e0b 36%, transparent);
  color: #b45309;
  border-radius: 12px;
  font-weight: 600;
}

@keyframes training-fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes training-slide-up {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .filters,
  .content,
  .course-card,
  .modal-content {
    animation: none;
  }

  .course-card {
    transition: none;
  }

  .course-card:hover {
    transform: none;
  }
}
</style>
