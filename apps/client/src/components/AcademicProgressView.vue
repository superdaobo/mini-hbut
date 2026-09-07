<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { t, useLocale } from '../utils/app_i18n'
import { TPageHeader, TEmptyState } from './templates'

// i18n：响应式 locale（语言切换即时生效），t() 按当前语言取词
const { locale } = useLocale()

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

// fasz 完成度类型选项：label 改为 i18n key，渲染时取词
const faszOptions = [
  { value: 1, labelKey: 'academic.fasz.nature' },
  { value: 0, labelKey: 'academic.fasz.curriculum' },
  { value: 2, labelKey: 'academic.fasz.teaching' },
  { value: 4, labelKey: 'academic.fasz.graduation' }
]
const FASZ_ALLOWED = new Set(faszOptions.map(item => item.value))

/** 概览字段标签：数据驱动枚举，label 为 i18n key，渲染时取词 */
const SUMMARY_FIELD_LABEL = {
  gpa: 'academic.summary.gpa',
  pjcj: 'academic.summary.avgScore',
  hdzxf: 'academic.summary.earnedCredits',
  yxkms: 'academic.summary.selectedCourses',
  bjgms: 'academic.summary.failedCourses',
  gpazypm: 'academic.summary.gpaRank',
  xwjdpm: 'academic.summary.degreeRank'
}
const SUMMARY_FIELD_ORDER = ['gpa', 'pjcj', 'hdzxf', 'yxkms', 'bjgms', 'gpazypm', 'xwjdpm']

/** 课程详情字段标签：数据驱动枚举，label 为 i18n key，渲染时取词 */
const COURSE_FIELD_LABEL = {
  kcmc: 'academic.course.kcmc',
  kcbh: 'academic.course.kcbh',
  xf: 'academic.course.xf',
  hdxf: 'academic.course.hdxf',
  xfjd: 'academic.course.xfjd',
  zhcj: 'academic.course.zhcj',
  xnxq: 'academic.course.xnxq',
  cjxq: 'academic.course.cjxq',
  kcxz: 'academic.course.kcxz',
  kclb: 'academic.course.kclb',
  kkyxmc: 'academic.course.kkyxmc',
  skjs: 'academic.course.skjs',
  jxbmc: 'academic.course.jxbmc',
  jxbzc: 'academic.course.jxbzc',
  wczt: 'academic.course.wczt',
  sfbk: 'academic.course.sfbk',
  sfsq: 'academic.course.sfsq',
  sfmx: 'academic.course.sfmx',
  bz: 'academic.course.bz'
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
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no')
  return String(value).trim()
}

const hasValue = (value) => normalizeValue(value) !== ''

const normalizeCourseFieldValue = (key, rawValue) => {
  const value = normalizeValue(rawValue)
  if (!BOOLEAN_TEXT_KEYS.has(key)) return value
  if (['1', '是', 'Y', 'y', 'true', 'TRUE'].includes(value)) return t('common.yes')
  if (['0', '否', 'N', 'n', 'false', 'FALSE', '-'].includes(value)) return t('common.no')
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
  if (hasValue(node.yqzdxf)) parts.push(`${t('academic.req.minCredits')} ${normalizeValue(node.yqzdxf)}`)
  if (hasValue(node.yqzgxf)) parts.push(`${t('academic.req.maxCredits')} ${normalizeValue(node.yqzgxf)}`)
  if (hasValue(node.yqzdms)) parts.push(`${t('academic.req.minCourses')} ${normalizeValue(node.yqzdms)}`)
  if (hasValue(node.yqzgms)) parts.push(`${t('academic.req.maxCourses')} ${normalizeValue(node.yqzgms)}`)
  return parts.join(' / ')
}

const flattenCategorySections = (tree) => {
  const sections = []
  const walk = (nodes, parentPath = []) => {
    if (!Array.isArray(nodes)) return
    nodes.forEach((node, idx) => {
      if (!node || typeof node !== 'object') return
      const nodeName = normalizeValue(node.nodeName) || normalizeValue(node.name) || `${t('academic.category.prefix')}${idx + 1}`
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
    const allCoursesLabel = t('academic.allCourses')
    return [{
      id: 'all-courses',
      name: allCoursesLabel,
      path: allCoursesLabel,
      requirement: '',
      courses: list.map((course, idx) => ({
        ...course,
        _categoryPath: allCoursesLabel,
        _categoryName: allCoursesLabel,
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

const selectedCourseTitle = computed(() => normalizeValue(selectedCourse.value?.kcmc) || t('academic.courseDetail.default'))
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
      error.value = data?.error || t('academic.error.fetch')
    }
  } catch (e) {
    error.value = e.response?.data?.error || t('common.error.network')
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
    <TPageHeader :title="t('academic.title')" @back="emit('back')" />

    <div v-if="offline" class="offline-banner">
      {{ t('common.offline.prefix') }}{{ formatRelativeTime(syncTime) }}
    </div>

    <div class="controls">
      <label>{{ t('academic.progressType') }}</label>
      <IOSSelect v-model.number="fasz" class="fasz-select" @change="handleFaszChange">
        <option v-for="f in faszOptions" :key="f.value" :value="f.value">
          {{ t(f.labelKey) }}
        </option>
      </IOSSelect>
    </div>

    <TEmptyState v-if="loading" type="loading" />
    <TEmptyState v-else-if="error" type="error" :message="error" />

    <div v-else class="content" v-if="progressData">
      <div class="summary-card" v-if="summaryItems.length">
        <div class="summary-item" v-for="item in summaryItems" :key="item.key">
          <span class="summary-label">{{ t(item.label) }}</span>
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
            <div class="course-count">{{ section.courses.length }} {{ t('academic.unit.courses') }}</div>
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
                <span>{{ t('academic.creditPrefix') }} {{ normalizeValue(course.xf) || '-' }}</span>
                <span>{{ normalizeValue(course.kcxz) || normalizeValue(course.kclb) || '-' }}</span>
                <span class="status-pill" :class="completionPillClass(course.wczt)">
                  {{ normalizeCompletionText(course.wczt) || t('academic.status.unknown') }}
                </span>
              </div>
            </button>
          </div>
        </section>
      </div>

      <div v-else class="empty">{{ t('academic.empty') }}</div>
    </div>

    <Teleport to="body">
      <div v-if="showDetail && selectedCourse" class="modal-overlay" @click="closeCourseDetail">
        <div class="modal-content" @click.stop>
          <button class="modal-close" @click="closeCourseDetail">×</button>

          <div class="modal-top">
            <h2>{{ selectedCourseTitle }}</h2>
            <div class="modal-tags">
              <span class="modal-tag">{{ t('academic.creditPrefix') }} {{ normalizeValue(selectedCourse.xf) || '-' }}</span>
              <span class="modal-tag status-pill" :class="completionPillClass(selectedCourse.wczt)">
                {{ normalizeCompletionText(selectedCourse.wczt) || t('academic.status.unknown') }}
              </span>
            </div>
            <div class="modal-path">{{ t('academic.belongCategory') }}：{{ selectedCourseCategory }}</div>
          </div>

          <div class="detail-grid">
            <div class="detail-item" v-for="item in selectedCourseFields" :key="item.key">
              <span class="detail-label">{{ t(item.label) }}</span>
              <span class="detail-value">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 页级背景对齐成绩查询：中性浅底，避免 --ui-bg-gradient 蓝青全页染色 */
.progress-view {
  min-height: 100vh;
  background: #f6fafe;
  color: var(--ui-text);
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: rgba(246, 250, 254, 0.86);
  border-bottom: 1px solid rgba(226, 232, 240, 0.86);
  box-shadow: none;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.back-btn {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 26%, transparent);
  background: #eff6ff;
  color: var(--ui-primary);
  font-weight: 700;
  cursor: pointer;
}

.view-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #1e293b;
}

.offline-banner {
  margin: 12px 16px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fef3c7;
  border: 1px solid color-mix(in oklab, #f59e0b 36%, transparent);
  color: #b45309;
  font-weight: 600;
  font-size: 13px;
}

.controls {
  margin: 12px 16px 0;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: #ffffff;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  display: flex;
  align-items: center;
  gap: 10px;
  animation: progress-fade-up 0.28s ease both;
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
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: #ffffff;
}

.content {
  padding: 12px 14px 120px;
  animation: progress-fade-up 0.32s ease both;
  animation-delay: 0.04s;
}

.summary-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

.summary-item {
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  padding: 10px 12px;
  background: #ffffff;
  box-shadow: 0 4px 16px -4px rgba(15, 23, 42, 0.06);
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
  color: #1e293b;
}

.category-section {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-card {
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 16px;
  padding: 14px;
  background: #ffffff;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  animation: progress-fade-up 0.3s ease both;
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
  font-weight: 800;
  color: #1e293b;
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
  background: #eff6ff;
  color: #2563eb;
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
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  white-space: normal;
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.course-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -6px rgba(15, 23, 42, 0.12);
  border-color: color-mix(in oklab, var(--ui-primary) 28%, transparent);
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
  color: #1e293b;
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
  background: #eff6ff;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, transparent);
  color: #334155;
}

.status-pill {
  font-weight: 700;
  border-width: 1px;
  border-style: solid;
}

.state-done {
  background: #d1fae5;
  color: #047857;
  border-color: color-mix(in oklab, var(--ui-success, #10b981) 40%, transparent);
}

.state-todo {
  background: #fee2e2;
  color: #dc2626;
  border-color: color-mix(in oklab, var(--ui-danger, #ef4444) 40%, transparent);
}

.state-pending {
  background: #fef3c7;
  color: #b45309;
  border-color: color-mix(in oklab, var(--ui-warning, #f59e0b) 40%, transparent);
}

.state-unknown {
  background: #eff6ff;
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
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 18px;
  box-shadow: var(--ui-shadow-strong);
  padding: 16px;
  animation: progress-slide-up 0.28s ease;
}

.modal-close {
  margin-left: auto;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 22%, transparent);
  background: #eff6ff;
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
  background: #eff6ff;
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
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 10px;
  padding: 8px 10px;
  background: #f8fafc;
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

@keyframes progress-fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes progress-slide-up {
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
  .controls,
  .content,
  .category-card,
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
