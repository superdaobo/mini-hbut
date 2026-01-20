<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import AcademicTreeNode from './AcademicTreeNode.vue'

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

const faszOptions = [
  { value: 1, label: '课程性质完成度' },
  { value: 0, label: '培养方案完成度' },
  { value: 2, label: '教学计划完成度' },
  { value: 4, label: '毕业学分完成度' }
]

const fetchProgress = async () => {
  loading.value = true
  error.value = ''
  try {
    const cacheKey = `academic:${props.studentId}:${fasz.value}`
    const { data } = await fetchWithCache(cacheKey, async () => {
      const res = await axios.post(`${API_BASE}/v2/academic_progress`, {
        student_id: props.studentId,
        fasz: fasz.value
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
      <h1>🎓 学业完成情况</h1>
      <button class="logout-btn" @click="emit('logout')">退出</button>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，同步时间：{{ syncTime || '未知' }}
    </div>

    <div class="controls">
      <label>完成度类型：</label>
      <select v-model="fasz" @change="handleFaszChange">
        <option v-for="f in faszOptions" :key="f.value" :value="f.value">
          {{ f.label }}
        </option>
      </select>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="content" v-if="progressData">
      <div class="summary-card" v-if="progressData.summary">
        <div class="summary-item">GPA：{{ progressData.summary.gpa ?? '-' }}</div>
        <div class="summary-item">平均成绩：{{ progressData.summary.pjcj ?? '-' }}</div>
        <div class="summary-item">累计获得学分：{{ progressData.summary.hdzxf ?? '-' }}</div>
        <div class="summary-item">已选课门数：{{ progressData.summary.yxkms ?? '-' }}</div>
        <div class="summary-item">不及格门数：{{ progressData.summary.bjgms ?? '-' }}</div>
        <div class="summary-item">GPA专业排名：{{ progressData.summary.gpazypm ?? '-' }}</div>
        <div class="summary-item">学位绩点排名：{{ progressData.summary.xwjdpm ?? '-' }}</div>
      </div>

      <div class="tree-section" v-if="progressData.tree && progressData.tree.length">
        <AcademicTreeNode v-for="node in progressData.tree" :key="node.nodeId" :node="node" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-view {
  min-height: 100vh;
  background: #f5f7fa;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
  color: white;
}

.back-btn, .logout-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.controls {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 16px 20px;
  background: white;
}

.controls select {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.loading, .error {
  padding: 20px;
  text-align: center;
  color: #6b7280;
}

.content {
  padding: 16px 20px 28px;
}

.summary-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  background: white;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.summary-item {
  font-size: 13px;
  color: #374151;
  background: #f3f4f6;
  padding: 8px 10px;
  border-radius: 8px;
}

.offline-banner {
  margin: 12px 20px 0;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
  border-radius: 12px;
  font-weight: 600;
}

.tree-section {
  background: white;
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
</style>
