<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import {
  getPreferredSemesterFast,
  mergeSemesterOptions,
  normalizeSemesterList,
  resolveCurrentSemester
} from '../utils/semester.js'
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
let examRequestSeq = 0

const initializeFastSemester = () => {
  const preferred = getPreferredSemesterFast()
  if (preferred && !selectedSemester.value) {
    selectedSemester.value = preferred
  }
  semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value)
}

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
      semesters.value = mergeSemesterOptions(sorted, selectedSemester.value)
      currentSemester.value = resolveCurrentSemester(sorted, data.current || '')
      if (!selectedSemester.value) {
        selectedSemester.value = currentSemester.value || sorted[0] || ''
        semesters.value = mergeSemesterOptions(semesters.value, selectedSemester.value)
      }
    }
  } catch (e) {
    console.error('获取学期列表失败:', e)
  }
}

// 获取考试安排
const fetchExams = async () => {
  const requestSeq = ++examRequestSeq
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
    
    if (requestSeq !== examRequestSeq) return
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
    if (requestSeq !== examRequestSeq) return
    error.value = e.response?.data?.error || '网络错误'
  } finally {
    if (requestSeq === examRequestSeq) {
      loading.value = false
    }
  }
}

const handleSemesterChange = () => {
  fetchExams()
}

onMounted(() => {
  initializeFastSemester()
  fetchExams()
  fetchSemesters()
})
</script>

<template>
  <div class="exam-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative pb-24">
    <!-- Header -->
    <TPageHeader title="考试安排" icon="edit_document" @back="emit('back')" />

    <!-- Offline Banner -->
    <div v-if="offline" class="mx-4 mt-2 px-3 py-2 rounded-xl bg-error-container/60 text-on-error-container text-xs font-medium">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <main class="flex-1 flex flex-col gap-5 p-4">
      <!-- Semester Selector & Stats -->
      <section class="flex flex-col gap-3">
        <!-- Semester Dropdown -->
        <div class="flex items-center justify-between">
          <div class="relative bg-surface-container-lowest rounded-lg border border-outline-variant shadow-sm px-3 py-2 flex items-center gap-2 cursor-pointer active:scale-95 transition-transform">
            <IOSSelect v-model="selectedSemester" @change="handleSemesterChange" class="appearance-none bg-transparent border-none text-sm text-on-surface font-medium pr-6 focus:outline-none">
              <option v-for="sem in semesters" :key="sem" :value="sem">{{ sem }}</option>
            </IOSSelect>
            <span class="material-symbols-outlined text-outline absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-base">arrow_drop_down</span>
          </div>
        </div>

        <!-- Stats Bento Grid -->
        <div v-if="!loading && exams.length > 0" class="grid grid-cols-2 gap-3">
          <div class="bg-primary-container rounded-2xl p-4 flex flex-col justify-center items-start shadow-sm">
            <span class="text-xs font-medium text-on-primary-container/80 mb-1">待考</span>
            <div class="flex items-baseline gap-1">
              <span class="text-3xl font-bold text-on-primary-container leading-tight">{{ futureCount }}</span>
              <span class="text-[10px] font-semibold text-on-primary-container/80">科</span>
            </div>
          </div>
          <div class="bg-surface-container-lowest rounded-2xl p-4 flex flex-col justify-center items-start border border-surface-container-highest shadow-sm">
            <span class="text-xs font-medium text-on-surface-variant mb-1">已考</span>
            <div class="flex items-baseline gap-1">
              <span class="text-3xl font-bold text-on-surface leading-tight">{{ passedCount }}</span>
              <span class="text-[10px] font-semibold text-on-surface-variant">科</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Content Area -->
      <section class="flex flex-col gap-4">
        <TEmptyState v-if="loading" type="loading" message="正在获取考试安排..." />
        <TEmptyState v-else-if="error" type="error" :message="error">
          <button class="mt-3 px-5 py-2 bg-primary text-on-primary rounded-lg font-semibold text-sm" @click="fetchExams">重试</button>
        </TEmptyState>
        <TEmptyState v-else-if="exams.length === 0" type="empty" message="本学期暂无考试安排" />

        <!-- Exam Cards -->
        <template v-else>
          <article
            v-for="(exam, index) in processedExams"
            :key="index"
            :class="[
              'bg-surface-container-lowest rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.03)] border relative',
              isPassed(exam.exam_date)
                ? 'border-surface-container-highest opacity-70'
                : getCountdownLabel(exam.exam_date)
                  ? 'border-primary/10'
                  : 'border-surface-container-highest'
            ]"
          >
            <!-- Top Accent Line (upcoming with countdown only) -->
            <div v-if="!isPassed(exam.exam_date) && getCountdownLabel(exam.exam_date)" class="h-1 w-full bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end"></div>

            <div class="p-4 flex flex-col gap-3">
              <!-- Header Row -->
              <div class="flex justify-between items-start">
                <div>
                  <h2 :class="[
                    'text-lg font-bold mb-1',
                    isPassed(exam.exam_date) ? 'text-on-surface line-through decoration-outline-variant' : 'text-on-surface'
                  ]">{{ exam.course_name }}</h2>
                  <span v-if="exam.exam_type" :class="[
                    'inline-block text-[10px] font-semibold px-2 py-0.5 rounded',
                    isPassed(exam.exam_date)
                      ? 'bg-surface-container text-on-surface-variant'
                      : 'bg-primary-fixed text-on-primary-fixed'
                  ]">{{ exam.exam_type }}</span>
                </div>
                <!-- Countdown / Status Badge -->
                <div v-if="isPassed(exam.exam_date)" class="bg-surface-container-high text-on-surface-variant text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
                  <span class="material-symbols-outlined text-[14px]">check_circle</span>
                  已结束
                </div>
                <div v-else-if="getCountdownLabel(exam.exam_date)" class="bg-error-container text-on-error-container text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
                  <span class="material-symbols-outlined text-[14px]">timer</span>
                  {{ getCountdownLabel(exam.exam_date) }}
                </div>
              </div>

              <!-- Detail Rows -->
              <div class="grid grid-cols-1 gap-2 mt-1">
                <div v-if="exam.exam_date" class="flex items-center gap-2 text-on-surface-variant text-sm">
                  <span class="material-symbols-outlined text-[18px] text-primary">calendar_clock</span>
                  <span>{{ formatExamDate(exam.exam_date) }} {{ formatExamTime(exam.exam_time) }}</span>
                </div>
                <div v-if="exam.location" class="flex items-center gap-2 text-on-surface-variant text-sm">
                  <span class="material-symbols-outlined text-[18px] text-primary">location_on</span>
                  <span>{{ exam.location }}</span>
                </div>
                <div v-if="exam.seat_no" class="flex items-center gap-2 text-on-surface-variant text-sm">
                  <span class="material-symbols-outlined text-[18px] text-primary">chair_alt</span>
                  <span>座位号: {{ exam.seat_no }}</span>
                </div>
              </div>
            </div>
          </article>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* Minimal scoped styles - layout handled by Tailwind */
</style>
