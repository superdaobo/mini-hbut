<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { fetchWithCache, EXTRA_LONG_TTL } from '../utils/api.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(true)
const error = ref('')
const info = ref(null)
const offline = ref(false)
const syncTime = ref('')

const fetchInfo = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const { data } = await fetchWithCache(`studentinfo:${props.studentId}`, async () => {
      const res = await axios.post(`${API_BASE}/v2/student_info`, {
        student_id: props.studentId
      })
      return res.data
    }, EXTRA_LONG_TTL)
    
    if (data?.success) {
      info.value = data.data
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
    } else {
      error.value = data?.error || '获取信息失败'
    }
  } catch (e) {
    error.value = e.response?.data?.error || '网络错误'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchInfo()
})

// 信息字段映射
const fieldLabels = {
  student_id: '学号',
  name: '姓名',
  gender: '性别',
  id_number: '身份证号',
  ethnicity: '民族',
  grade: '年级',
  college: '学院',
  major: '专业',
  class_name: '班级',
  education_level: '培养层次',
  study_years: '学制'
}
</script>

<template>
  <div class="student-info-view">
    <!-- 头部 -->
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">
        ← 返回
      </button>
      <h1>👤 个人信息</h1>
      <button class="logout-btn" @click="emit('logout')">退出</button>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，同步时间：{{ syncTime || '未知' }}
    </div>

    <!-- 内容区 -->
    <div class="view-content">
      <!-- 加载中 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>正在获取个人信息...</p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="error-state">
        <div class="error-icon">❌</div>
        <p>{{ error }}</p>
        <button @click="fetchInfo">重试</button>
      </div>

      <!-- 信息卡片 -->
      <div v-else-if="info" class="info-card">
        <div class="avatar-section">
          <div class="avatar">{{ info.name?.charAt(0) || '?' }}</div>
          <h2>{{ info.name }}</h2>
          <p class="student-id-badge">{{ info.student_id }}</p>
        </div>
        
        <div class="info-grid">
          <div v-for="(label, key) in fieldLabels" :key="key" class="info-item">
            <span class="label">{{ label }}</span>
            <span class="value">{{ info[key] || '-' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.student-info-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
  margin-bottom: 24px;
}

.view-header h1 {
  font-size: 20px;
  margin: 0;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
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
  background: #f0f4ff;
  color: #667eea;
}

.back-btn:hover {
  background: #667eea;
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

.view-content {
  max-width: 600px;
  margin: 0 auto;
}

.loading-state, .error-state {
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
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.error-state button {
  margin-top: 16px;
  padding: 10px 24px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.info-card {
  background: white;
  border-radius: 20px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
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
.avatar-section {
  text-align: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid #e5e7eb;
}

.avatar {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  font-size: 36px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin: 0 auto 16px;
}

.avatar-section h2 {
  margin: 0 0 8px;
  font-size: 24px;
  color: #1f2937;
}

.student-id-badge {
  display: inline-block;
  padding: 6px 16px;
  background: #f0f4ff;
  color: #667eea;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #f9fafb;
  border-radius: 12px;
}

.info-item .label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.info-item .value {
  font-size: 15px;
  color: #1f2937;
  font-weight: 500;
}

@media (max-width: 640px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .view-header h1 {
    font-size: 16px;
  }
}
</style>
