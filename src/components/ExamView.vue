<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'

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

// 处理后的考试列表：未考最早的排最前，已考的排最后且灰色
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
  
  // 未考的：按日期升序（最早的在最前）
  future.sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date))
  
  // 已考的：按日期降序（最近考完的在历史记录最前）
  passed.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date))
  
  return [...future, ...passed]
})

// 获取学期列表
const fetchSemesters = async () => {
// ... (rest of the functions)
  try {
    const { data } = await fetchWithCache('semesters', async () => {
      const res = await axios.get(`${API_BASE}/v2/semesters`)
      return res.data
    })
    if (data?.success) {
      semesters.value = data.semesters
      if (semesters.value.length > 0) {
        selectedSemester.value = semesters.value[0]
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
    } else {
      error.value = data?.error || '获取考试安排失败'
    }
  } catch (e) {
    error.value = e.response?.data?.error || '网络错误'
  } finally {
    loading.value = false
  }
}

// 切换学期
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
    <!-- 头部 -->
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1>📝 考试安排</h1>
      <button class="logout-btn" @click="emit('logout')">退出</button>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，同步时间：{{ syncTime || '未知' }}
    </div>

    <!-- 学期选择 -->
    <div class="semester-selector">
      <label>选择学期：</label>
      <select v-model="selectedSemester" @change="handleSemesterChange">
        <option v-for="sem in semesters" :key="sem" :value="sem">{{ sem }}</option>
      </select>
    </div>

    <!-- 内容区 -->
    <div class="view-content">
      <!-- 加载中 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>正在获取考试安排...</p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="error-state">
        <div class="error-icon">❌</div>
        <p>{{ error }}</p>
        <button @click="fetchExams">重试</button>
      </div>

      <!-- 无考试 -->
      <div v-else-if="exams.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <p>本学期暂无考试安排</p>
      </div>

      <!-- 考试列表 -->
      <div v-else class="exam-list">
        <div 
          v-for="(exam, index) in processedExams" 
          :key="index" 
          :class="['exam-card', { 'is-passed': isPassed(exam.exam_date) }]"
        >
          <div class="exam-header">
            <span class="exam-type" v-if="exam.exam_type">{{ exam.exam_type }}</span>
            <span class="exam-status-badge" v-if="isPassed(exam.exam_date)">已结束</span>
            <span class="course-name">{{ exam.course_name }}</span>
          </div>
          <div class="exam-details">
            <div class="detail-item" v-if="exam.exam_date">
              <span class="icon">📅</span>
              <span>{{ exam.exam_date }}</span>
            </div>
            <div class="detail-item" v-if="exam.exam_time">
              <span class="icon">⏰</span>
              <span>{{ exam.exam_time }}</span>
            </div>
            <div class="detail-item" v-if="exam.location">
              <span class="icon">📍</span>
              <span>{{ exam.location }}</span>
            </div>
            <div class="detail-item" v-if="exam.seat_no">
              <span class="icon">💺</span>
              <span>座位号: {{ exam.seat_no }}</span>
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
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  padding: 20px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

.view-header h1 {
  font-size: 20px;
  margin: 0;
  color: #22543d;
}

.back-btn, .logout-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.back-btn {
  background: #c6f6d5;
  color: #22543d;
}

.back-btn:hover {
  background: #48bb78;
  color: white;
}

.logout-btn {
  background: #fee2e2;
  color: #dc2626;
}

.logout-btn:hover {
  background: #dc2626;
  color: white;
}

.semester-selector {
  background: rgba(255, 255, 255, 0.95);
  padding: 16px 24px;
  border-radius: 12px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.semester-selector label {
  font-weight: 500;
  color: #22543d;
}

.semester-selector select {
  padding: 10px 16px;
  border-radius: 8px;
  border: 2px solid #c6f6d5;
  font-size: 14px;
  min-width: 180px;
  cursor: pointer;
}

.semester-selector select:focus {
  outline: none;
  border-color: #48bb78;
}

.view-content {
  max-width: 800px;
  margin: 0 auto;
}

.loading-state, .error-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  background: white;
  border-radius: 20px;
  color: #374151;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-top-color: #48bb78;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon, .empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.error-state button {
  margin-top: 16px;
  padding: 10px 24px;
  background: #48bb78;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

/* 已结束考试样式 */
.exam-card.is-passed {
  background: #f3f4f6;
  opacity: 0.8;
  box-shadow: none;
  border: 1px dashed #d1d5db;
}

.exam-card.is-passed .course-name {
  color: #6b7280;
}

.exam-card.is-passed .exam-type {
  background: #e5e7eb;
  color: #6b7280;
}

.exam-status-badge {
  display: inline-block;
  padding: 4px 10px;
  background: #9ca3af;
  color: white;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  margin-right: 12px;
}

.exam-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.exam-card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.exam-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.exam-type {
  display: inline-block;
  padding: 4px 10px;
  background: #c6f6d5;
  color: #22543d;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  margin-right: 12px;
}

.course-name {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.exam-details {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #4b5563;
  font-size: 14px;
}

.detail-item .icon {
  font-size: 16px;
}

@media (max-width: 640px) {
  .exam-details {
    grid-template-columns: 1fr;
  }
  
  .semester-selector {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .semester-selector select {
    width: 100%;
  }
}

.offline-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  border-radius: 12px;
  font-weight: 600;
}
</style>
