<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'
import { writeExamToWidget } from '../utils/widget_bridge'
import { TPageHeader, TEmptyState } from './templates'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(false)
const error = ref('')
const exams = ref([])
const semesters = ref([])
const selectedSemester = ref('')
const currentSemester = ref('')
const offline = ref(false)
const syncTime = ref('')

// 判断考试是否已结束
const isPassed = (examDate) => {
  if (!examDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(examDate)
  return date < today
}

// 格式化考试时间：只保留时间部分（如 "10:00~12:00"），去掉重复的日期
const formatExamTime = (timeStr) => {
  if (!timeStr) return ''
  const text = String(timeStr).trim()
  // 匹配 "YYYY-MM-DD HH:mm~HH:mm" 或 "MM-DD HH:mm~HH:mm" 格式，只取时间部分
  const match = text.match(/(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/)
  if (match) return `${match[1]}~${match[2]}`
  // 如果只有时间
  const timeOnly = text.match(/^\d{1,2}:\d{2}/)
  if (timeOnly) return text
  return text
}

// 格式化考试日期：YYYY-MM-DD
const formatExamDate = (dateStr) => {
  if (!dateStr) return ''
  const text = String(dateStr).trim()
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  return text
}

// 计算距离考试的天数
const daysUntilExam = (examDate) => {
  if (!examDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(examDate)
  date.setHours(0, 0, 0, 0)
  const diff = Math.ceil((date - today) / (1000 * 60 * 60 * 24))
  return diff
}

// 获取倒计时标签
const getCountdownLabel = (examDate) => {
  const days = daysUntilExam(examDate)
  if (days === null) return ''
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days < 0) return ''
  if (days <= 7) return `${days}天后`
  return ''
}

// 处理后的考试列表
const processedExams = computed(() => {
  if (!exams.value) return []
  
  const future = []
  const passed = []
  
  exams.value.forEach(exam => {
    if (isPassed(exam.exam_date)) {
      passed.push(exam)
    } else {
      future.push(exam)
    }
  })
  
  future.sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date))
  passed.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date))
  
  return [...future, ...passed]
})

const futureCount = computed(() => processedExams.value.filter(e => !isPassed(e.exam_date)).length)
const passedCount = computed(() => processedExams.value.filter(e => isPassed(e.exam_date)).length)

// 获取学期列表
const fetchSemesters = async () => {
  try {
    const { data } = await fetchWithCache('semesters', async () => {
      const res = await axios.get(`${API_BASE}/v2/semesters`)
      return res.data
    })
    if (data?.success) {
      const sorted = normalizeSemesterList(data.semesters || [])
      semesters.value = sorted
      currentSemester.value = resolveCurrentSemester(sorted, data.current || '')
      if (!selectedSemester.value) {
        selectedSemester.value = currentSemester.value || sorted[0] || ''
      }
    }
  } catch (e) {
    console.error('获取学期列表失败:', e)
  }
}

// 获取考试安排
const fetchExams = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const cacheKey = `exams:${props.studentId}:${selectedSemester.value || 'current'}`
    const { data } = await fetchWithCache(cacheKey, async () => {
      const res = await axios.post(`${API_BASE}/v2/exams`, {
        student_id: props.studentId,
        semester: selectedSemester.value
      })
      return res.data
    })
    
    if (data?.success) {
      exams.value = data.data || []
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
      // 写入小组件（只写未来的考试）
      const futureExams = (data.data || []).filter(e => !isPassed(e.exam_date))
      if (futureExams.length > 0) {
        const daysLeft = daysUntilExam(futureExams[0].exam_date)
        writeExamToWidget({
          exams: futureExams.slice(0, 3).map(e => ({
            course_name: e.course_name || '',
            exam_date: e.exam_date || '',
            exam_time: e.exam_time || '',
            location: e.location || ''
          })),
          days_left: daysLeft ?? -1
        }).catch(() => {})
      }
    } else {
      error.value = data?.error || '获取考试安排失败'
    }
  } catch (e) {
    error.value = e.response?.data?.error || '网络错误'
  } finally {
    loading.value = false
  }
}

const handleSemesterChange = () => {
  fetchExams()
}

onMounted(async () => {
  await fetchSemesters()
  await fetchExams()
})
</script>

<template>
  <div class="exam-view">
    <TPageHeader title="考试安排" icon="📝" @back="emit('back')" />

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <!-- 学期选择 -->
    <div class="semester-selector">
      <label>选择学期：</label>
      <IOSSelect v-model="selectedSemester" @change="handleSemesterChange">
        <option v-for="sem in semesters" :key="sem" :value="sem">{{ sem }}</option>
      </IOSSelect>
    </div>

    <!-- 统计摘要 -->
    <div v-if="!loading && exams.length > 0" class="exam-summary">
      <span class="summary-capsule capsule-upcoming" v-if="futureCount > 0">
        🔥 待考 {{ futureCount }} 科
      </span>
      <span class="summary-capsule capsule-passed" v-if="passedCount > 0">
        ✅ 已考 {{ passedCount }} 科
      </span>
    </div>

    <!-- 内容区 -->
    <div class="view-content">
      <TEmptyState v-if="loading" type="loading" message="正在获取考试安排..." />
      <TEmptyState v-else-if="error" type="error" :message="error">
        <button class="btn" style="margin-top: 12px" @click="fetchExams">重试</button>
      </TEmptyState>
      <TEmptyState v-else-if="exams.length === 0" type="empty" message="本学期暂无考试安排" />

      <!-- 考试列表 -->
      <div v-else class="exam-list">
        <div 
          v-for="(exam, index) in processedExams" 
          :key="index" 
          :class="['exam-card', { 'is-passed': isPassed(exam.exam_date) }]"
        >
          <!-- 卡片头部 -->
          <div class="exam-header">
            <div class="header-left">
              <span class="exam-status-badge badge-passed" v-if="isPassed(exam.exam_date)">已结束</span>
              <span class="exam-status-badge badge-upcoming" v-else-if="getCountdownLabel(exam.exam_date)">
                {{ getCountdownLabel(exam.exam_date) }}
              </span>
              <span class="course-name">{{ exam.course_name }}</span>
            </div>
            <span class="exam-type-capsule" v-if="exam.exam_type">{{ exam.exam_type }}</span>
          </div>

          <!-- 详情区域 -->
          <div class="exam-details">
            <div class="detail-capsule capsule-date" v-if="exam.exam_date">
              <span class="capsule-icon">📅</span>
              <span class="capsule-label">日期：</span>
              <span>{{ formatExamDate(exam.exam_date) }}</span>
            </div>
            <div class="detail-capsule capsule-time" v-if="exam.exam_time">
              <span class="capsule-icon">⏰</span>
              <span class="capsule-label">时间：</span>
              <span>{{ formatExamTime(exam.exam_time) }}</span>
            </div>
            <div class="detail-capsule capsule-location" v-if="exam.location">
              <span class="capsule-icon">📍</span>
              <span class="capsule-label">地点：</span>
              <span>{{ exam.location }}</span>
            </div>
            <div class="detail-capsule capsule-seat" v-if="exam.seat_no">
              <span class="capsule-icon">💺</span>
              <span class="capsule-label">座位号：</span>
              <span>{{ exam.seat_no }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.exam-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
  padding: 20px;
  color: var(--ui-text);
}

.semester-selector {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  padding: 16px 24px;
  border-radius: 12px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--ui-shadow-soft);
}

.semester-selector label {
  font-weight: 500;
  color: var(--ui-text);
}

/* 统计摘要 */
.exam-summary {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.summary-capsule {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
}

.capsule-upcoming {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.capsule-passed {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.view-content {
  max-width: 800px;
  margin: 0 auto;
}

.exam-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 考试卡片 — 待考 */
.exam-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--ui-shadow-soft);
  border-left: 4px solid var(--ui-primary);
  transition: all 0.2s;
}

/* 考试卡片 — 已结束（强对比） */
.exam-card.is-passed {
  background: var(--ui-surface);
  opacity: 0.55;
  border-left: 4px solid transparent;
  border: 1px dashed var(--ui-surface-border);
  box-shadow: none;
}

.exam-card.is-passed .course-name {
  color: var(--ui-muted);
  text-decoration: line-through;
  text-decoration-color: rgba(148, 163, 184, 0.5);
}

.exam-card.is-passed .detail-capsule {
  opacity: 0.6;
}

/* 卡片头部 */
.exam-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.course-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态徽章 */
.exam-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
}

.badge-passed {
  background: rgba(148, 163, 184, 0.2);
  color: var(--ui-muted);
}

.badge-upcoming {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
  animation: pulse-soft 2s infinite;
}

@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 考试类型胶囊 */
.exam-type-capsule {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 详情区域 — 彩色胶囊（每行一个） */
.exam-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-capsule {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.capsule-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.capsule-label {
  color: inherit;
  opacity: 0.7;
  font-size: 12px;
  margin-right: 2px;
}

.capsule-date {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.capsule-time {
  background: rgba(168, 85, 247, 0.1);
  color: #7c3aed;
  border: 1px solid rgba(168, 85, 247, 0.2);
}

.capsule-location {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.capsule-seat {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

/* 深色模式适配 */
:root[data-theme="dark"] .capsule-date,
.dark .capsule-date {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border-color: rgba(59, 130, 246, 0.3);
}

:root[data-theme="dark"] .capsule-time,
.dark .capsule-time {
  background: rgba(168, 85, 247, 0.15);
  color: #a78bfa;
  border-color: rgba(168, 85, 247, 0.3);
}

:root[data-theme="dark"] .capsule-location,
.dark .capsule-location {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border-color: rgba(34, 197, 94, 0.3);
}

:root[data-theme="dark"] .capsule-seat,
.dark .capsule-seat {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.3);
}

:root[data-theme="dark"] .badge-upcoming,
.dark .badge-upcoming {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

:root[data-theme="dark"] .capsule-upcoming,
.dark .capsule-upcoming {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}

.offline-banner {
  margin: 12px 0;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #b91c1c;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

@media (max-width: 640px) {
  .exam-card {
    padding: 14px;
  }

  .course-name {
    font-size: 15px;
  }

  .exam-details {
    gap: 6px;
  }

  .detail-capsule {
    font-size: 11px;
    padding: 4px 10px;
  }

  .semester-selector {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
