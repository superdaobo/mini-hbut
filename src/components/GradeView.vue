<script setup>
import { ref, computed, watch } from 'vue'
import { formatRelativeTime } from '../utils/time.js'
import { compareSemesterDesc, normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'

const props = defineProps({
  grades: { type: Array, default: () => [] },
  studentId: { type: String, default: '' },
  offline: { type: Boolean, default: false },
  syncTime: { type: String, default: '' }
})

const emit = defineEmits(['back', 'logout'])

// 筛选条件
const searchName = ref('')
const filterTerm = ref('')
const filterPass = ref('all') // all, pass, fail
const filterMakeup = ref('all') // all, yes, no

// 详情弹窗
const selectedGrade = ref(null)
const showDetail = ref(false)

// 获取所有学期列表
const terms = computed(() => {
  const termSet = new Set()
  props.grades.forEach(g => {
    if (g.term) termSet.add(g.term)
  })
  return normalizeSemesterList(Array.from(termSet))
})

// 筛选后的成绩
const filteredGrades = computed(() => {
  return props.grades.filter(grade => {
    // 名称筛选
    if (searchName.value && !grade.course_name.toLowerCase().includes(searchName.value.toLowerCase())) {
      return false
    }
    
    // 学期筛选
    if (filterTerm.value && grade.term !== filterTerm.value) {
      return false
    }
    
    // 是否合格筛选
    if (filterPass.value !== 'all') {
      const score = parseFloat(grade.final_score)
      const isPassed = !isNaN(score) ? score >= 60 : grade.final_score === '合格'
      if (filterPass.value === 'pass' && !isPassed) return false
      if (filterPass.value === 'fail' && isPassed) return false
    }
    
    // 是否补考筛选
    if (filterMakeup.value !== 'all') {
      const isMakeup = grade.is_makeup === '是' || grade.is_makeup === 'Y'
      if (filterMakeup.value === 'yes' && !isMakeup) return false
      if (filterMakeup.value === 'no' && isMakeup) return false
    }
    
    return true
  })
})

// 按学期分组
const groupedGrades = computed(() => {
  const groups = {}
  filteredGrades.value.forEach(grade => {
    const term = grade.term || '未知学期'
    if (!groups[term]) {
      groups[term] = []
    }
    groups[term].push(grade)
  })
  
  return Object.entries(groups)
    .sort((a, b) => compareSemesterDesc(a[0], b[0]))
    .map(([term, items]) => ({ term, items }))
})

// 统计
const stats = computed(() => {
  const total = filteredGrades.value.length
  const credits = filteredGrades.value.reduce((sum, g) => sum + (parseFloat(g.course_credit) || 0), 0)
  const passed = filteredGrades.value.filter(g => {
    const score = parseFloat(g.final_score)
    return (!isNaN(score) && score >= 60) || g.final_score === '合格'
  }).length
  return { total, credits: credits.toFixed(1), passed }
})

// 获取分数等级样式
const getScoreClass = (score) => {
  const num = parseFloat(score)
  if (isNaN(num)) {
    return score === '合格' ? 'pass' : score === '不合格' ? 'fail' : ''
  }
  if (num >= 90) return 'excellent'
  if (num >= 80) return 'good'
  if (num >= 60) return 'pass'
  return 'fail'
}

// 打开详情
const openDetail = (grade) => {
  selectedGrade.value = grade
  showDetail.value = true
}

// 关闭详情
const closeDetail = () => {
  showDetail.value = false
  selectedGrade.value = null
}

// 重置筛选
const resetFilters = () => {
  searchName.value = ''
  filterTerm.value = ''
  filterPass.value = 'all'
  filterMakeup.value = 'all'
}

const handleBack = () => emit('back')
const handleLogout = () => emit('logout')

const readPreferredSemester = () => {
  try {
    const raw = localStorage.getItem('hbu_schedule_meta')
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return String(parsed?.semester || '').trim()
  } catch {
    return ''
  }
}

watch(
  terms,
  (list) => {
    if (!Array.isArray(list) || list.length === 0) {
      filterTerm.value = ''
      return
    }
    if (filterTerm.value && list.includes(filterTerm.value)) {
      return
    }
    filterTerm.value = resolveCurrentSemester(list, readPreferredSemester())
  },
  { immediate: true }
)
</script>

<template>
  <div class="grade-view">
    <!-- 头部 -->
    <header class="grade-header">
      <button class="back-btn" @click="handleBack">← 返回</button>
      <div class="title">
        <span class="icon">📊</span>
        <span>成绩查询</span>
      </div>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <div v-if="offline" class="offline-banner">
      当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="filter-row">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input 
            v-model="searchName" 
            type="text" 
            placeholder="搜索课程名称..."
            class="search-input"
          />
        </div>
        
        <select v-model="filterTerm" class="filter-select">
          <option value="">全部学期</option>
          <option v-for="term in terms" :key="term" :value="term">{{ term }}</option>
        </select>
      </div>
      
      <div class="filter-row">
        <div class="filter-group">
          <label>成绩状态:</label>
          <div class="radio-group">
            <label class="radio-label" :class="{ active: filterPass === 'all' }">
              <input type="radio" v-model="filterPass" value="all" />
              <span>全部</span>
            </label>
            <label class="radio-label" :class="{ active: filterPass === 'pass' }">
              <input type="radio" v-model="filterPass" value="pass" />
              <span>合格</span>
            </label>
            <label class="radio-label" :class="{ active: filterPass === 'fail' }">
              <input type="radio" v-model="filterPass" value="fail" />
              <span>不合格</span>
            </label>
          </div>
        </div>
        
        <div class="filter-group">
          <label>补考:</label>
          <div class="radio-group">
            <label class="radio-label" :class="{ active: filterMakeup === 'all' }">
              <input type="radio" v-model="filterMakeup" value="all" />
              <span>全部</span>
            </label>
            <label class="radio-label" :class="{ active: filterMakeup === 'no' }">
              <input type="radio" v-model="filterMakeup" value="no" />
              <span>正常</span>
            </label>
            <label class="radio-label" :class="{ active: filterMakeup === 'yes' }">
              <input type="radio" v-model="filterMakeup" value="yes" />
              <span>补考</span>
            </label>
          </div>
        </div>
        
        <button class="reset-btn" @click="resetFilters">重置</button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">筛选结果</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.credits }}</div>
        <div class="stat-label">总学分</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.passed }}</div>
        <div class="stat-label">已通过</div>
      </div>
    </div>

    <!-- 成绩卡片网格 -->
    <div class="grade-list">
      <div v-for="group in groupedGrades" :key="group.term" class="term-group">
        <div class="term-header">📅 {{ group.term }} ({{ group.items.length }}门)</div>
        <div class="grade-grid">
          <div 
            v-for="grade in group.items" 
            :key="grade.course_name"
            class="grade-card"
            :class="getScoreClass(grade.final_score)"
            @click="openDetail(grade)"
          >
            <div class="card-score">{{ grade.final_score }}</div>
            <div class="card-name">{{ grade.course_name }}</div>
            <div class="card-meta">
              <span class="credit">{{ grade.course_credit }}分</span>
              <span class="nature">{{ grade.course_nature }}</span>
            </div>
            <div class="card-teacher" v-if="grade.teacher">
              👨‍🏫 {{ grade.teacher }}
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="filteredGrades.length === 0" class="no-results">
        <div class="empty-icon">📭</div>
        <p>没有找到符合条件的成绩</p>
        <button @click="resetFilters">清除筛选</button>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <Teleport to="body">
      <div v-if="showDetail" class="modal-overlay" @click="closeDetail">
        <div class="modal-content" @click.stop>
          <button class="modal-close" @click="closeDetail">×</button>
          
          <div class="detail-header">
            <div class="detail-score" :class="getScoreClass(selectedGrade.final_score)">
              {{ selectedGrade.final_score }}
            </div>
            <h2>{{ selectedGrade.course_name }}</h2>
          </div>
          
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">学期</span>
              <span class="detail-value">{{ selectedGrade.term }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">学分</span>
              <span class="detail-value">{{ selectedGrade.course_credit }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">获得学分</span>
              <span class="detail-value">{{ selectedGrade.earned_credit || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">绩点</span>
              <span class="detail-value">{{ selectedGrade.gpa || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">课程性质</span>
              <span class="detail-value">{{ selectedGrade.course_nature || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">课程类型</span>
              <span class="detail-value">{{ selectedGrade.course_type || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">考试形式</span>
              <span class="detail-value">{{ selectedGrade.exam_form || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">是否补考</span>
              <span class="detail-value">{{ selectedGrade.is_makeup || '否' }}</span>
            </div>
            <div class="detail-item full-width">
              <span class="detail-label">录入教师</span>
              <span class="detail-value">{{ selectedGrade.teacher || '-' }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.grade-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
  padding-bottom: 40px;
  color: var(--ui-text);
}

.grade-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--ui-surface);
  color: var(--ui-text);
  border: 1px solid var(--ui-surface-border);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: var(--ui-shadow-soft);
}

.grade-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 600;
}

.grade-header .icon {
  font-size: 24px;
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
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
}

.back-btn:hover {
  background: var(--ui-primary);
  color: #ffffff;
}

.logout-btn {
  background: rgba(239, 68, 68, 0.12);
  color: var(--ui-danger);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 筛选栏 */
.filter-bar {
  background: var(--ui-surface);
  padding: 16px 20px;
  margin: 16px 20px;
  border-radius: 16px;
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.filter-row + .filter-row {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ui-surface-border);
}

.search-box {
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
  background: var(--ui-surface);
  border-radius: 10px;
  padding: 0 12px;
}

.search-icon {
  margin-right: 8px;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 12px 0;
  font-size: 14px;
  outline: none;
}

.filter-select {
  padding: 12px 16px;
  border: 1px solid var(--ui-surface-border);
  border-radius: 10px;
  font-size: 14px;
  min-width: 140px;
  background: var(--ui-surface);
  color: var(--ui-text);
  cursor: pointer;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-group label:first-child {
  font-size: 13px;
  color: var(--ui-muted);
  white-space: nowrap;
}

.radio-group {
  display: flex;
  gap: 4px;
}

.radio-label {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  background: var(--ui-primary-soft);
  transition: all 0.2s;
}

.radio-label input {
  display: none;
}

.radio-label.active {
  background: var(--ui-primary);
  color: #ffffff;
}

.reset-btn {
  padding: 8px 16px;
  background: #fee2e2;
  color: #dc2626;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: #dc2626;
  color: white;
}

/* 统计卡片 */
.stats-row {
  display: flex;
  gap: 12px;
  padding: 0 20px;
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
  background: var(--ui-surface);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--ui-muted);
  margin-top: 4px;
}

/* 成绩卡片网格 */
.grade-list {
  padding: 0 20px;
}

.term-group {
  margin-bottom: 24px;
}

.term-header {
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-text);
  margin-bottom: 12px;
}

.grade-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.grade-card {
  background: var(--ui-surface);
  border-radius: 14px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
  position: relative;
  overflow: hidden;
}

.grade-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
}

.grade-card.excellent::before { background: #10b981; }
.grade-card.good::before { background: #3b82f6; }
.grade-card.pass::before { background: #f59e0b; }
.grade-card.fail::before { background: #ef4444; }

.grade-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.card-score {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.grade-card.excellent .card-score { color: #10b981; }
.grade-card.good .card-score { color: #3b82f6; }
.grade-card.pass .card-score { color: #f59e0b; }
.grade-card.fail .card-score { color: #ef4444; }

.card-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-text);
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  font-size: 11px;
  color: var(--ui-muted);
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.card-teacher {
  font-size: 11px;
  color: var(--ui-muted);
  background: var(--ui-primary-soft);
  padding: 4px 8px;
  border-radius: 6px;
  margin-top: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.no-results {
  text-align: center;
  padding: 60px 20px;
  color: var(--ui-muted);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.no-results button {
  margin-top: 16px;
  padding: 12px 24px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
}

/* 详情弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: var(--ui-surface);
  border-radius: 20px;
  padding: 32px;
  max-width: 480px;
  width: 100%;
  position: relative;
  animation: slideUp 0.3s ease;
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-strong);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border: none;
  background: var(--ui-primary-soft);
  border-radius: 50%;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-header {
  text-align: center;
  margin-bottom: 24px;
}

.detail-score {
  font-size: 48px;
  font-weight: 700;
  margin-bottom: 8px;
}

.detail-score.excellent { color: #10b981; }
.detail-score.good { color: #3b82f6; }
.detail-score.pass { color: #f59e0b; }
.detail-score.fail { color: #ef4444; }

.detail-header h2 {
  font-size: 20px;
  color: var(--ui-text);
  margin: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.detail-item {
  background: var(--ui-surface);
  padding: 12px;
  border-radius: 10px;
}

.detail-item.full-width {
  grid-column: span 2;
}

.detail-label {
  display: block;
  font-size: 12px;
  color: var(--ui-muted);
  margin-bottom: 4px;
}

.detail-value {
  font-size: 15px;
  font-weight: 500;
  color: var(--ui-text);
}

@media (max-width: 640px) {
  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-group {
    width: 100%;
    justify-content: space-between;
  }
  
  .grade-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .stats-row {
    flex-wrap: wrap;
  }
  
  .stat-card {
    min-width: calc(33% - 8px);
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
