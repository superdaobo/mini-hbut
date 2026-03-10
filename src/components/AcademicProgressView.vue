<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const loading = ref(false)
const error = ref('')
const progressData = ref(null)
const fasz = ref(1)
const offline = ref(false)
const syncTime = ref('')
const showDetail = ref(false)
const selectedCourse = ref(null)

const faszOptions = [
  { value: 1, label: '课程性质完成度' },
  { value: 0, label: '培养方案完成度' },
  { value: 2, label: '教学计划完成度' },
  { value: 4, label: '毕业学分完成度' }
]
const FASZ_ALLOWED = new Set(faszOptions.map(item => item.value))

const SUMMARY_FIELD_LABEL = {
  gpa: 'GPA',
  pjcj: '平均成绩',
  hdzxf: '累计获得学分',
  yxkms: '已选课门数',
  bjgms: '不及格门数',
  gpazypm: 'GPA专业排名',
  xwjdpm: '学位绩点排名'
}
const SUMMARY_FIELD_ORDER = ['gpa', 'pjcj', 'hdzxf', 'yxkms', 'bjgms', 'gpazypm', 'xwjdpm']

const COURSE_FIELD_LABEL = {
  kcmc: '课程名称',
  kcbh: '课程编号',
  xf: '学分',
  hdxf: '获得学分',
  xfjd: '绩点',
  zhcj: '最高成绩',
  xnxq: '成绩学年学期',
  cjxq: '允许修读学年学期',
  kcxz: '课程性质',
  kclb: '课程类别',
  kkyxmc: '开课学院',
  skjs: '授课教师',
  jxbmc: '教学班名称',
  jxbzc: '教学班组成',
  wczt: '完成状态',
  sfbk: '是否补考',
  sfsq: '是否缓考',
  sfmx: '是否免修',
  bz: '备注'
}
const COURSE_DETAIL_FIELD_ORDER = [
  'kcbh',
  'xnxq',
  'cjxq',
  'xf',
  'hdxf',
  'xfjd',
  'zhcj',
  'kcxz',
  'kclb',
  'kkyxmc',
  'skjs',
  'jxbmc',
  'jxbzc',
  'wczt',
  'sfbk',
  'sfsq',
  'sfmx',
  'bz'
]
const BOOLEAN_TEXT_KEYS = new Set(['sfbk', 'sfsq', 'sfmx'])

const normalizeFasz = (value) => {
  const n = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(n)) return 1
  return FASZ_ALLOWED.has(n) ? n : 1
}

const normalizeValue = (value) => {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(item => normalizeValue(item)).filter(Boolean).join('、')
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value).trim()
}

const hasValue = (value) => normalizeValue(value) !== ''

const normalizeCourseFieldValue = (key, rawValue) => {
  const value = normalizeValue(rawValue)
  if (!BOOLEAN_TEXT_KEYS.has(key)) return value
  if (['1', '是', 'Y', 'y', 'true', 'TRUE'].includes(value)) return '是'
  if (['0', '否', 'N', 'n', 'false', 'FALSE', '-'].includes(value)) return '否'
  return value
}

const normalizeCompletionText = (raw) => {
  const text = normalizeValue(raw)
  if (!text) return ''
  return text
}

const completionPillClass = (raw) => {
  const text = normalizeCompletionText(raw)
  if (!text) return 'state-unknown'
  if (/(已修|完成|通过)/.test(text) && !/(未修|未通过)/.test(text)) return 'state-done'
  if (/(未修|未完成|未通过)/.test(text)) return 'state-todo'
  if (/(已选课|未得分|未获得成绩|在修|修读中)/.test(text)) return 'state-pending'
  return 'state-unknown'
}

const requirementText = (node) => {
  if (!node || typeof node !== 'object') return ''
  const parts = []
  if (hasValue(node.yqzdxf)) parts.push(`最低学分 ${normalizeValue(node.yqzdxf)}`)
  if (hasValue(node.yqzgxf)) parts.push(`最高学分 ${normalizeValue(node.yqzgxf)}`)
  if (hasValue(node.yqzdms)) parts.push(`最低门数 ${normalizeValue(node.yqzdms)}`)
  if (hasValue(node.yqzgms)) parts.push(`最高门数 ${normalizeValue(node.yqzgms)}`)
  return parts.join(' / ')
}

const flattenCategorySections = (tree) => {
  const sections = []
  const walk = (nodes, parentPath = []) => {
    if (!Array.isArray(nodes)) return
    nodes.forEach((node, idx) => {
      if (!node || typeof node !== 'object') return
      const nodeName = normalizeValue(node.nodeName) || normalizeValue(node.name) || `分类${idx + 1}`
      const path = [...parentPath, nodeName]
      const courses = Array.isArray(node.kcList)
        ? node.kcList.map((course, courseIdx) => ({
            ...course,
            _categoryPath: path.join(' / '),
            _categoryName: nodeName,
            _courseId: `${normalizeValue(node.nodeId) || path.join('-')}-${normalizeValue(course.kcbh) || normalizeValue(course.kcmc) || courseIdx}`
          }))
        : []
      if (courses.length) {
        sections.push({
          id: normalizeValue(node.nodeId) || path.join('-'),
          name: nodeName,
          path: path.join(' / '),
          requirement: requirementText(node),
          courses
        })
      }
      walk(node.children, path)
    })
  }
  walk(tree, [])
  return sections
}

const summaryItems = computed(() => {
  const summary = progressData.value?.summary
  if (!summary || typeof summary !== 'object') return []
  return SUMMARY_FIELD_ORDER
    .map((key) => ({
      key,
      label: SUMMARY_FIELD_LABEL[key],
      value: normalizeValue(summary[key])
    }))
    .filter(item => hasValue(item.value))
})

const categorySections = computed(() => {
  const tree = progressData.value?.tree
  if (Array.isArray(tree) && tree.length) {
    return flattenCategorySections(tree)
  }
  const list = progressData.value?.kcList
  if (Array.isArray(list) && list.length) {
    return [{
      id: 'all-courses',
      name: '全部课程',
      path: '全部课程',
      requirement: '',
      courses: list.map((course, idx) => ({
        ...course,
        _categoryPath: '全部课程',
        _categoryName: '全部课程',
        _courseId: `${normalizeValue(course.kcbh) || normalizeValue(course.kcmc) || idx}`
      }))
    }]
  }
  return []
})

const selectedCourseFields = computed(() => {
  const course = selectedCourse.value
  if (!course || typeof course !== 'object') return []
  return COURSE_DETAIL_FIELD_ORDER
    .filter(key => Object.prototype.hasOwnProperty.call(course, key))
    .map((key) => ({
      key,
      label: COURSE_FIELD_LABEL[key],
      value: normalizeCourseFieldValue(key, course[key])
    }))
    .filter(item => hasValue(item.value))
})

const selectedCourseTitle = computed(() => normalizeValue(selectedCourse.value?.kcmc) || '课程详情')
const selectedCourseCategory = computed(() => normalizeValue(selectedCourse.value?._categoryPath) || '-')

const openCourseDetail = (course) => {
  selectedCourse.value = course
  showDetail.value = true
}

const closeCourseDetail = () => {
  showDetail.value = false
  selectedCourse.value = null
}

const fetchProgress = async () => {
  loading.value = true
  error.value = ''
  try {
    const faszInt = normalizeFasz(fasz.value)
    fasz.value = faszInt
    const cacheKey = `academic:${props.studentId}:${faszInt}`
    const { data } = await fetchWithCache(cacheKey, async () => {
      const res = await axios.post(`${API_BASE}/v2/academic_progress`, {
        student_id: props.studentId,
        fasz: faszInt
      })
      return res.data
    })

    if (data?.success) {
      progressData.value = data.data || {}
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
    } else {
      if (data?.need_login) {
        emit('logout')
        return
      }
      error.value = data?.error || '获取学业完成情况失败'
    }
  } catch (e) {
    error.value = e.response?.data?.error || '网络错误'
  } finally {
    loading.value = false
  }
}

const handleFaszChange = () => {
  fasz.value = normalizeFasz(fasz.value)
  fetchProgress()
}

onMounted(() => {
  fetchProgress()
})
</script>

<template>
  <div class="progress-view">
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1>学业完成情况</h1>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <div class="controls">
      <label>完成度类型</label>
      <IOSSelect v-model.number="fasz" class="fasz-select" @change="handleFaszChange">
        <option v-for="f in faszOptions" :key="f.value" :value="f.value">
          {{ f.label }}
        </option>
      </IOSSelect>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="content" v-if="progressData">
      <div class="summary-card" v-if="summaryItems.length">
        <div class="summary-item" v-for="item in summaryItems" :key="item.key">
          <span class="summary-label">{{ item.label }}</span>
          <span class="summary-value">{{ item.value }}</span>
        </div>
      </div>

      <div class="category-section" v-if="categorySections.length">
        <section class="category-card" v-for="section in categorySections" :key="section.id">
          <div class="category-header">
            <div>
              <h2>{{ section.name }}</h2>
              <p class="category-path">{{ section.path }}</p>
              <p v-if="section.requirement" class="category-requirement">{{ section.requirement }}</p>
            </div>
            <div class="course-count">{{ section.courses.length }} 门</div>
          </div>

          <div class="course-list">
            <button
              v-for="course in section.courses"
              :key="course._courseId"
              type="button"
              class="course-card"
              @click="openCourseDetail(course)"
            >
              <div class="course-title">{{ normalizeValue(course.kcmc) || '-' }}</div>
              <div class="course-meta">
                <span>学分 {{ normalizeValue(course.xf) || '-' }}</span>
                <span>{{ normalizeValue(course.kcxz) || normalizeValue(course.kclb) || '-' }}</span>
                <span class="status-pill" :class="completionPillClass(course.wczt)">
                  {{ normalizeCompletionText(course.wczt) || '状态未知' }}
                </span>
              </div>
            </button>
          </div>
        </section>
      </div>

      <div v-else class="empty">暂无学业情况数据</div>
    </div>

    <Teleport to="body">
      <div v-if="showDetail && selectedCourse" class="modal-overlay" @click="closeCourseDetail">
        <div class="modal-content" @click.stop>
          <button class="modal-close" @click="closeCourseDetail">×</button>

          <div class="modal-top">
            <h2>{{ selectedCourseTitle }}</h2>
            <div class="modal-tags">
              <span class="modal-tag">学分 {{ normalizeValue(selectedCourse.xf) || '-' }}</span>
              <span class="modal-tag status-pill" :class="completionPillClass(selectedCourse.wczt)">
                {{ normalizeCompletionText(selectedCourse.wczt) || '状态未知' }}
              </span>
            </div>
            <div class="modal-path">所属分类：{{ selectedCourseCategory }}</div>
          </div>

          <div class="detail-grid">
            <div class="detail-item" v-for="item in selectedCourseFields" :key="item.key">
              <span class="detail-label">{{ item.label }}</span>
              <span class="detail-value">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.progress-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient, #f5f7fa);
  color: var(--ui-text);
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
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

.view-header h1 {
  margin: 0;
  font-size: 20px;
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

.controls {
  margin: 12px 16px 0;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-soft);
  display: flex;
  align-items: center;
  gap: 10px;
}

.controls label {
  font-size: 12px;
  color: var(--ui-muted);
  font-weight: 700;
}

.fasz-select {
  min-width: 220px;
}

.fasz-select :deep(.ios26-select-trigger) {
  min-height: 36px;
  border-radius: 12px;
}

.loading,
.error,
.empty {
  margin: 12px 16px 0;
  text-align: center;
  padding: 24px 12px;
  color: var(--ui-muted);
  border-radius: 14px;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
}

.content {
  padding: 12px 14px 120px;
}

.summary-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

.summary-item {
  border: 1px solid var(--ui-surface-border);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--ui-surface);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  font-size: 11px;
  color: var(--ui-muted);
}

.summary-value {
  font-size: 14px;
  font-weight: 700;
}

.category-section {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-card {
  border: 1px solid var(--ui-surface-border);
  border-radius: 14px;
  padding: 12px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-soft);
}

.category-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}

.category-header h2 {
  margin: 0;
  font-size: 16px;
}

.category-path,
.category-requirement {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ui-muted);
}

.course-count {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}

.course-list {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.course-card {
  border: 1px solid var(--ui-surface-border);
  border-radius: 10px;
  background: color-mix(in oklab, var(--ui-primary-soft) 62%, #fff 38%);
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  white-space: normal;
  overflow: hidden;
}

.course-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--ui-muted);
  line-height: 1.25;
  width: 100%;
}

.course-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary-soft) 50%, #fff 50%);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, transparent);
}

.status-pill {
  font-weight: 700;
  border-width: 1px;
  border-style: solid;
}

.state-done {
  background: color-mix(in oklab, #10b981 18%, #ffffff 82%);
  color: #0f9f6e;
  border-color: color-mix(in oklab, #10b981 40%, transparent);
}

.state-todo {
  background: color-mix(in oklab, #ef4444 16%, #ffffff 84%);
  color: #dc2626;
  border-color: color-mix(in oklab, #ef4444 40%, transparent);
}

.state-pending {
  background: color-mix(in oklab, #f59e0b 18%, #ffffff 82%);
  color: #c26c00;
  border-color: color-mix(in oklab, #f59e0b 40%, transparent);
}

.state-unknown {
  background: color-mix(in oklab, var(--ui-primary-soft) 55%, #fff 45%);
  color: var(--ui-primary);
  border-color: color-mix(in oklab, var(--ui-primary) 24%, transparent);
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
}

.modal-close {
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

.modal-top h2 {
  margin: 8px 0 6px;
  font-size: 20px;
}

.modal-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.modal-tag {
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
}

.modal-path {
  margin-top: 6px;
  font-size: 12px;
  color: var(--ui-muted);
}

.detail-grid {
  margin-top: 10px;
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
  gap: 3px;
}

.detail-label {
  font-size: 11px;
  color: var(--ui-muted);
}

.detail-value {
  font-size: 13px;
  line-height: 1.35;
  word-break: break-word;
  white-space: pre-wrap;
}

@media (max-width: 760px) {
  .controls {
    flex-direction: column;
    align-items: stretch;
  }

  .fasz-select {
    min-width: 0;
  }

  .course-list {
    grid-template-columns: 1fr;
  }
}
</style>
