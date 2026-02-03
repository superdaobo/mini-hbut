<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { fetchWithCache, LONG_TTL } from '../utils/api.js'

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
const options = ref({
  grade: [],
  kkxq: [],
  kkyx: [],
  kcxz: [],
  kcgs: [],
  kkjys: []
})

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
      localStorage.setItem('hbu_training_options', JSON.stringify({
        options: options.value,
        defaults: defaults.value
      }))
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
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1>📚 培养方案</h1>
      <button class="logout-btn" @click="emit('logout')">退出</button>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，同步时间：{{ syncTime || '未知' }}
    </div>

    <section class="filters">
      <div class="filter-grid">
        <label>
          <span>开设学年</span>
          <select v-model="filters.grade">
            <option value="">请选择</option>
            <option v-for="opt in options.grade" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label>
          <span>开设学期</span>
          <select v-model="filters.kkxq">
            <option value="">请选择</option>
            <option v-for="opt in options.kkxq" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label>
          <span>开课院系</span>
          <select v-model="filters.kkyx" @change="fetchJys">
            <option value="">请选择</option>
            <option v-for="opt in options.kkyx" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label>
          <span>开课教研室</span>
          <select v-model="filters.kkjys">
            <option value="">请选择</option>
            <option v-for="opt in options.kkjys" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label>
          <span>课程性质</span>
          <select v-model="filters.kcxz">
            <option value="">请选择</option>
            <option v-for="opt in options.kcxz" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </label>
        <label>
          <span>课程归属</span>
          <select v-model="filters.kcgs">
            <option value="">请选择</option>
            <option v-for="opt in options.kcgs" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
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
      <div class="filter-actions">
        <button class="primary" @click="handleSearch">搜索</button>
        <button class="ghost" @click="resetFilters">重置</button>
      </div>
    </section>

    <section class="content">
      <div v-if="loading" class="state">加载中...</div>
      <div v-else-if="error" class="state error">{{ error }}</div>

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
            <span class="tag ghost">{{ row.kcxz || '课程性质' }}</span>
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
              <span class="value">{{ selectedCourse?.kcxz || '-' }}</span>
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
.training-plan-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
  color: var(--ui-text);
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--ui-surface);
  color: var(--ui-text);
}

.back-btn,
.logout-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
}

.filters {
  background: var(--ui-surface);
  margin: 16px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px 16px;
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
  border-radius: 8px;
  border: 1px solid var(--ui-surface-border);
  font-size: 13px;
  background: var(--ui-surface);
  color: var(--ui-text);
}

.filter-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.filter-actions button {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 600;
}

.filter-actions .primary {
  background: var(--ui-primary);
  color: #ffffff;
}

.filter-actions .ghost {
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
}

.content {
  padding: 0 16px 24px;
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
  background: var(--ui-surface);
  border-radius: 16px;
  padding: 16px;
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.course-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--ui-shadow-strong);
}

.course-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
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
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-weight: 600;
}

.tag.primary {
  background: var(--ui-primary-soft-strong);
  color: var(--ui-primary);
}

.tag.ghost {
  background: rgba(16, 185, 129, 0.12);
  color: var(--ui-success);
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
  border-radius: 6px;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
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
  background: var(--ui-surface);
  border-radius: 16px;
  width: min(520px, 100%);
  padding: 20px;
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-strong);
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
  color: var(--ui-text);
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: var(--ui-primary-soft);
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
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  border-radius: 12px;
  font-weight: 600;
}
</style>
