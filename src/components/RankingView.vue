<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { fetchWithCache } from '../utils/api.js'
import { formatRelativeTime } from '../utils/time.js'
import { normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const props = defineProps({
  studentId: { type: String, required: true }
})

const emit = defineEmits(['back', 'logout'])

const loading = ref(false)
const error = ref('')
const ranking = ref(null)
const semesters = ref([])
const selectedSemester = ref('')
const currentSemester = ref('')
const offline = ref(false)
const syncTime = ref('')

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
        selectedSemester.value = ''
      }
    }
  } catch (e) {
    console.error('获取学期列表失败:', e)
  }
}

// 获取排名
const fetchRanking = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const cacheKey = `ranking:${props.studentId}:${selectedSemester.value || 'all'}`
    const { data } = await fetchWithCache(cacheKey, async () => {
      const res = await axios.post(`${API_BASE}/v2/ranking`, {
        student_id: props.studentId,
        semester: selectedSemester.value
      })
      return res.data
    })
    
    if (data?.success) {
      ranking.value = data.data || {}
      offline.value = !!data.offline
      syncTime.value = data.sync_time || ''
    } else {
      error.value = data?.error || '获取排名失败'
    }
  } catch (e) {
    error.value = e.response?.data?.error || '网络错误'
  } finally {
    loading.value = false
  }
}

// 切换学期
const handleSemesterChange = () => {
  fetchRanking()
}

onMounted(async () => {
  await fetchSemesters()
  await fetchRanking()
})
</script>

<template>
  <div class="ranking-view">
    <!-- 头部 -->
    <header class="view-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1><span>🏆</span><span>绩点排名</span></h1>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <!-- 学期选择 -->
    <div class="semester-selector">
      <span class="label">学年学期：</span>
      <IOSSelect v-model="selectedSemester" @change="handleSemesterChange">
        <option value="">全部(从入学至今)</option>
        <option v-for="sem in semesters" :key="sem" :value="sem">{{ sem }}</option>
      </IOSSelect>
      <button class="search-btn" @click="fetchRanking">🔍 搜索</button>
    </div>

    <!-- 内容区 -->
    <div class="view-content">
      <!-- 加载中 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>正在获取排名数据...</p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="error-state">
        <div class="error-icon">❌</div>
        <p>{{ error }}</p>
        <button @click="fetchRanking">重试</button>
      </div>

      <!-- 排名卡片 -->
      <div v-else-if="ranking && ranking.gpa" class="ranking-card">
        <!-- 学生信息区 -->
        <div class="student-info">
          <div class="info-row">
            <span class="info-item"><strong>姓名：</strong>{{ ranking.name || '-' }}</span>
            <span class="info-item"><strong>学号：</strong>{{ ranking.student_id || studentId }}</span>
            <span class="info-item"><strong>年级：</strong>{{ ranking.grade || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-item"><strong>学院：</strong>{{ ranking.college || '-' }}</span>
            <span class="info-item"><strong>专业：</strong>{{ ranking.major || '-' }}</span>
            <span class="info-item"><strong>班级：</strong>{{ ranking.class_name || '-' }}</span>
          </div>
          <div class="info-row highlight">
            <span class="info-item"><strong>平均学分绩点：</strong><span class="score gpa-badge">{{ ranking.gpa || '-' }}</span></span>
            <span class="info-item"><strong>算术平均分：</strong><span class="score">{{ ranking.avg_score || '-' }}</span></span>
          </div>
        </div>

        <!-- 排名表格 -->
        <div class="ranking-table-wrapper">
          <table class="ranking-table">
            <thead>
              <tr>
                <th class="col-method">排名方式</th>
                <th class="col-rank">学院(年级)</th>
                <th class="col-rank">专业</th>
                <th class="col-rank">班级</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="method-name">平均学分绩点</td>
                <td class="rank-cell">
                  <span class="rank-value" v-if="ranking.gpa_college_rank">
                    {{ ranking.gpa_college_rank }}/{{ ranking.gpa_college_total }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td class="rank-cell">
                  <span class="rank-value" v-if="ranking.gpa_major_rank">
                    {{ ranking.gpa_major_rank }}/{{ ranking.gpa_major_total }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td class="rank-cell">
                  <span class="rank-value highlight-rank" v-if="ranking.gpa_class_rank">
                    {{ ranking.gpa_class_rank }}/{{ ranking.gpa_class_total }}
                  </span>
                  <span v-else>-</span>
                </td>
              </tr>
              <tr>
                <td class="method-name bold">算术平均分</td>
                <td class="rank-cell">
                  <span class="rank-value" v-if="ranking.avg_college_rank">
                    {{ ranking.avg_college_rank }}/{{ ranking.avg_college_total }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td class="rank-cell">
                  <span class="rank-value" v-if="ranking.avg_major_rank">
                    {{ ranking.avg_major_rank }}/{{ ranking.avg_major_total }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td class="rank-cell">
                  <span class="rank-value highlight-rank" v-if="ranking.avg_class_rank">
                    {{ ranking.avg_class_rank }}/{{ ranking.avg_class_total }}
                  </span>
                  <span v-else>-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 专业排名高亮 -->
        <div class="class-highlight" v-if="ranking.gpa_major_rank">
          <div class="highlight-badge">
            🎯 专业排名 <span class="big-rank">{{ ranking.gpa_major_rank }}</span> / {{ ranking.gpa_major_total }}
          </div>
        </div>
      </div>

      <!-- 无数据 -->
      <div v-else class="empty-state">
        <div class="empty-icon">📭</div>
        <p>暂无排名数据</p>
        <p class="hint">该学期可能尚未公布排名</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ranking-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
  padding: 18px 14px 110px;
  color: var(--ui-text);
}

.view-header {
  margin-bottom: 16px;
}

.view-header h1 {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: clamp(19px, 2.2vw, 24px);
  margin: 0;
  color: var(--ui-text);
}

.semester-selector {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
  padding: 16px;
  border-radius: 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.semester-selector .label {
  font-weight: 700;
  color: var(--ui-text);
}

.semester-selector select {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--ui-surface-border);
  font-size: 14px;
  min-width: 200px;
  cursor: pointer;
  color: var(--ui-text);
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
}

.semester-selector select:focus {
  outline: none;
  border-color: var(--ui-primary);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ui-primary) 20%, transparent);
}

.search-btn {
  padding: 10px 18px;
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  color: #ffffff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  transition: transform 0.2s;
}

.search-btn:hover {
  transform: scale(1.02);
}

.view-content {
  max-width: 900px;
  margin: 0 auto;
}

.loading-state, .error-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  background: var(--ui-surface);
  border-radius: 16px;
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
  color: var(--ui-text);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid color-mix(in oklab, var(--ui-primary) 14%, #e5e7eb);
  border-top-color: var(--ui-primary);
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
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
}

.hint {
  font-size: 14px;
  color: var(--ui-muted);
  margin-top: 8px;
}

/* 排名卡片 */
.ranking-card {
  background: var(--ui-surface);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: var(--ui-shadow-soft);
  border: 1px solid var(--ui-surface-border);
}

/* 学生信息 */
.student-info {
  padding: 24px;
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-primary-soft) 62%, #ffffff 38%),
    color-mix(in oklab, var(--ui-primary-soft) 40%, var(--ui-secondary) 60%)
  );
  border-bottom: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 12px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-row.highlight {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed color-mix(in oklab, var(--ui-primary) 38%, transparent);
}

.info-item {
  font-size: 15px;
  color: var(--ui-text);
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
  background: color-mix(in oklab, #ffffff 78%, var(--ui-primary-soft) 22%);
}

.info-item strong {
  color: color-mix(in oklab, var(--ui-primary) 72%, #1e3a8a 28%);
  margin-right: 4px;
}

.info-item .score {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-secondary);
}

.info-item .gpa-badge {
  display: inline-block;
  padding: 6px 16px;
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  color: #ffffff;
  border-radius: 999px;
  font-size: 20px;
  font-weight: 800;
  box-shadow: 0 8px 16px color-mix(in oklab, var(--ui-primary) 26%, transparent);
  margin-left: 4px;
}

/* 排名表格 */
.ranking-table-wrapper {
  padding: 24px;
  overflow-x: auto;
}

.ranking-table {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
}

.ranking-table th {
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  color: #ffffff;
  padding: 14px 16px;
  font-weight: 600;
  font-size: 14px;
}

.ranking-table th:first-child {
  border-radius: 8px 0 0 0;
}

.ranking-table th:last-child {
  border-radius: 0 8px 0 0;
}

.ranking-table td {
  padding: 16px;
  border-bottom: 1px solid var(--ui-surface-border);
}

.method-name {
  text-align: left;
  font-weight: 500;
  color: var(--ui-text);
  background: color-mix(in oklab, var(--ui-primary-soft) 52%, #fff 48%);
}

.method-name.bold {
  font-weight: 700;
  color: var(--ui-text);
}

.rank-cell {
  font-size: 16px;
}

.rank-value {
  display: inline-block;
  padding: 6px 10px;
  background: color-mix(in oklab, var(--ui-primary-soft) 72%, #fff 28%);
  color: var(--ui-primary);
  border-radius: 999px;
  font-weight: 700;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.rank-value.highlight-rank {
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-secondary) 18%, #fff 82%),
    color-mix(in oklab, var(--ui-primary) 16%, #fff 84%)
  );
  color: color-mix(in oklab, var(--ui-secondary) 68%, #111827 32%);
  font-weight: 700;
  border: 1px solid color-mix(in oklab, var(--ui-secondary) 34%, transparent);
}

/* 班级排名高亮 */
.class-highlight {
  padding: 20px 24px;
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--ui-secondary) 18%, #ffffff 82%),
    color-mix(in oklab, var(--ui-primary) 16%, #ffffff 84%)
  );
  display: flex;
  justify-content: center;
  border-top: 1px solid color-mix(in oklab, var(--ui-primary) 20%, transparent);
}

.highlight-badge {
  font-size: 18px;
  font-weight: 700;
  color: var(--ui-text);
}

.big-rank {
  font-size: 32px;
  font-weight: 800;
  color: var(--ui-primary);
  margin: 0 4px;
}

@media (max-width: 640px) {
  .info-row {
    flex-direction: column;
    gap: 8px;
  }
  
  .semester-selector {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .semester-selector select,
  .search-btn {
    width: 100%;
  }
  
  .ranking-table th,
  .ranking-table td {
    padding: 10px 8px;
    font-size: 13px;
  }
  
  .rank-value {
    padding: 4px 8px;
    font-size: 13px;
  }
  
  .big-rank {
    font-size: 24px;
  }
}

.offline-banner {
  margin: 12px 0 0;
  padding: 10px 14px;
  background: color-mix(in oklab, var(--ui-danger) 14%, #ffffff 86%);
  border: 1px solid color-mix(in oklab, var(--ui-danger) 40%, transparent);
  color: var(--ui-danger);
  border-radius: 12px;
  font-weight: 600;
}
</style>
