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
const viewMode = ref('grouped') // grouped, all
const sortMode = ref('origin') // score_desc, score_asc, origin
const showAdvancedFilters = ref(false)

// 详情弹窗
const selectedGrade = ref(null)
const showDetail = ref(false)

const COURSE_NATURE_LABEL_MAP = {
  '11': '通识必修',
  '12': '通识选修',
  '16': '限定选修',
  '31': '学科基础',
  '32': '工程基础',
  '40': '专业核心',
  '41': '专业方向组',
  '42': '专业任选',
  '43': '专业基础',
  '44': '专业必修',
  '45': '专业选修',
  '50': '基础实践',
  '51': '专业实践',
  '52': '综合实践',
  '53': '其他实践',
  '54': '短学期实践',
  '70': '辅修理论',
  '71': '辅修实践',
  '90': '必修',
  '98': '重修',
  '99': '公共选修'
}

const CJBJ_STATUS_MAP = {
  '1': '补考',
  '2': '缓考',
  '3': '免修'
}

const toSafeText = (value) => String(value ?? '').trim()

const normalizeCourseName = (value) => {
  const text = toSafeText(value)
  if (!text) return ''
  const matched = text.match(/^\[[^\]]+\](.+)$/)
  return matched ? toSafeText(matched[1]) : text
}

const parseScoreNumber = (score) => {
  const n = Number.parseFloat(toSafeText(score))
  return Number.isFinite(n) ? n : null
}

const resolveCourseNatureLabel = (grade) => {
  const codes = [
    toSafeText(grade.kcxz),
    toSafeText(grade.course_nature_code),
    toSafeText(grade.course_nature)
  ].filter(Boolean)
  for (const code of codes) {
    if (COURSE_NATURE_LABEL_MAP[code]) return COURSE_NATURE_LABEL_MAP[code]
  }
  return toSafeText(grade.course_nature || grade.kcxzmc || codes[0] || '')
}

const resolveTeacherName = (grade) => {
  if (!grade || typeof grade !== 'object') return ''
  return String(
    grade.teacher ??
      grade.cjlrjsxm ??
      grade.jsxm ??
      grade.teacher_name ??
      ''
  )
    .trim()
}

const resolveStatusTags = (grade, scoreText, scoreNumber) => {
  const cjbj = toSafeText(grade.cjbj)
  const cjbjLabel = CJBJ_STATUS_MAP[cjbj] || ''
  const statusSource = `${scoreText}|${toSafeText(grade.cjfxms)}|${cjbjLabel}`
  const isFailed =
    (scoreNumber !== null && scoreNumber < 60) ||
    /(不合格|不及格|挂科|未通过)/.test(statusSource)
  const isMakeup =
    toSafeText(grade.sfbk) === '1' ||
    cjbjLabel === '补考' ||
    /补考/.test(statusSource)
  const isDeferred =
    toSafeText(grade.sfsq) === '1' ||
    cjbjLabel === '缓考' ||
    /缓考/.test(statusSource)
  const isExempt =
    cjbjLabel === '免修' ||
    /(免修|免考|免听)/.test(statusSource)

  const tags = []
  if (isFailed) tags.push({ key: 'failed', label: '挂科' })
  if (isMakeup) tags.push({ key: 'makeup', label: '补考' })
  if (isDeferred) tags.push({ key: 'deferred', label: '缓考' })
  if (isExempt) tags.push({ key: 'exempt', label: '免修' })

  const passByScore = scoreNumber !== null ? scoreNumber >= 60 : /合格|通过/.test(scoreText)
  const isPass = !isFailed && passByScore

  return { tags, isPass, isFailed, isMakeup, isDeferred, isExempt }
}

const normalizedGrades = computed(() =>
  props.grades.map((grade, index) => {
    const finalScore = toSafeText(grade.final_score || grade.zhcj || grade.yscj || '-')
    const scoreNumber = parseScoreNumber(finalScore)
    const status = resolveStatusTags(grade, finalScore, scoreNumber)
    return {
      ...grade,
      originIndex: index,
      term: toSafeText(grade.term || grade.xnxq),
      course_name: normalizeCourseName(grade.course_name || grade.kcmc),
      course_credit: toSafeText(grade.course_credit || grade.xf),
      earned_credit: toSafeText(grade.earned_credit || grade.hdxf),
      creditPoint: toSafeText(grade.creditPoint || grade.xfjd || grade.gpa),
      final_score: finalScore,
      scoreNumber,
      course_nature: resolveCourseNatureLabel(grade),
      teacher: resolveTeacherName(grade),
      statusTags: status.tags,
      isPass: status.isPass,
      isFailed: status.isFailed,
      isMakeup: status.isMakeup,
      isDeferred: status.isDeferred,
      isExempt: status.isExempt
    }
  })
)

// 获取所有学期列表
const terms = computed(() => {
  const termSet = new Set()
  normalizedGrades.value.forEach(g => {
    if (g.term) termSet.add(g.term)
  })
  return normalizeSemesterList(Array.from(termSet))
})

// 筛选后的成绩
const filteredGrades = computed(() => {
  return normalizedGrades.value.filter(grade => {
    const name = toSafeText(grade.course_name).toLowerCase()
    // 名称筛选
    if (searchName.value && !name.includes(searchName.value.toLowerCase())) {
      return false
    }
    
    // 学期筛选
    if (filterTerm.value && grade.term !== filterTerm.value) {
      return false
    }
    
    // 是否合格筛选
    if (filterPass.value !== 'all') {
      if (filterPass.value === 'pass' && !grade.isPass) return false
      if (filterPass.value === 'fail' && grade.isPass) return false
    }
    
    // 是否补考筛选
    if (filterMakeup.value !== 'all') {
      if (filterMakeup.value === 'yes' && !grade.isMakeup) return false
      if (filterMakeup.value === 'no' && grade.isMakeup) return false
    }
    
    return true
  })
})

const resolveSortScore = (grade) => {
  if (grade.scoreNumber !== null) return grade.scoreNumber
  const text = toSafeText(grade.final_score)
  if (/优秀/.test(text)) return 95
  if (/(良好|中等)/.test(text)) return 80
  if (/(及格|合格|通过)/.test(text)) return 60
  if (/(不及格|不合格|未通过)/.test(text)) return 0
  return -1
}

const compareBySortMode = (a, b) => {
  if (sortMode.value === 'origin') {
    return a.originIndex - b.originIndex
  }
  const scoreA = resolveSortScore(a)
  const scoreB = resolveSortScore(b)
  const diff = sortMode.value === 'score_asc' ? scoreA - scoreB : scoreB - scoreA
  if (diff !== 0) return diff
  return a.originIndex - b.originIndex
}

const sortGradeList = (list) => [...list].sort(compareBySortMode)

const sortedGrades = computed(() => sortGradeList(filteredGrades.value))

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
    .map(([term, items]) => ({ term, items: sortGradeList(items) }))
})

// 统计
const stats = computed(() => {
  const total = filteredGrades.value.length
  const credits = filteredGrades.value.reduce((sum, g) => sum + (parseFloat(g.course_credit) || 0), 0)
  const failed = filteredGrades.value.filter(g => g.isFailed).length
  return { total, credits: credits.toFixed(1), failed }
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
        
        <IOSSelect v-model="filterTerm" class="filter-select">
          <option value="">全部学期</option>
          <option v-for="term in terms" :key="term" :value="term">{{ term }}</option>
        </IOSSelect>
      </div>
      
      <div class="filter-row filter-actions-row">
        <button class="ghost-btn" @click="showAdvancedFilters = !showAdvancedFilters">
          {{ showAdvancedFilters ? '收起筛选' : '展开筛选' }}
        </button>
        <button class="reset-btn" @click="resetFilters">重置</button>
      </div>

      <div v-if="showAdvancedFilters" class="filter-advanced">
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
        </div>

        <div class="filter-row">
          <div class="filter-group">
            <label>展示方式:</label>
            <div class="radio-group">
              <label class="radio-label" :class="{ active: viewMode === 'grouped' }">
                <input type="radio" v-model="viewMode" value="grouped" />
                <span>分组视图</span>
              </label>
              <label class="radio-label" :class="{ active: viewMode === 'all' }">
                <input type="radio" v-model="viewMode" value="all" />
                <span>全部视图</span>
              </label>
            </div>
          </div>
          <div class="filter-group">
            <label>排序:</label>
            <IOSSelect v-model="sortMode" class="filter-select sort-select">
              <option value="score_desc">成绩高到低</option>
              <option value="score_asc">成绩低到高</option>
              <option value="origin">成绩公布先后</option>
            </IOSSelect>
          </div>
        </div>
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
        <div class="stat-value">{{ stats.failed }}</div>
        <div class="stat-label">挂科数</div>
      </div>
    </div>

    <!-- 成绩卡片网格 -->
    <div class="grade-list">
      <template v-if="viewMode === 'grouped'">
        <div v-for="group in groupedGrades" :key="group.term" class="term-group">
          <div class="term-header">📅 {{ group.term }} ({{ group.items.length }}门)</div>
          <div class="grade-grid">
            <div 
              v-for="grade in group.items" 
              :key="`${group.term}-${grade.course_name}-${grade.originIndex}`"
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
              <div v-if="grade.statusTags?.length" class="card-status">
                <span
                  v-for="tag in grade.statusTags"
                  :key="`${grade.course_name}-${tag.key}`"
                  class="status-chip"
                  :class="`status-${tag.key}`"
                >
                  {{ tag.label }}
                </span>
              </div>
              <div class="card-teacher" v-if="grade.teacher">
                👨‍🏫 {{ grade.teacher }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="grade-grid">
          <div 
            v-for="grade in sortedGrades" 
            :key="`all-${grade.term}-${grade.course_name}-${grade.originIndex}`"
            class="grade-card"
            :class="getScoreClass(grade.final_score)"
            @click="openDetail(grade)"
          >
            <div class="card-score">{{ grade.final_score }}</div>
            <div class="card-name">{{ grade.course_name }}</div>
            <div class="card-meta">
              <span class="credit">{{ grade.course_credit }}分</span>
              <span class="nature">{{ grade.course_nature }}</span>
              <span class="nature">{{ grade.term }}</span>
            </div>
            <div v-if="grade.statusTags?.length" class="card-status">
              <span
                v-for="tag in grade.statusTags"
                :key="`${grade.course_name}-${tag.key}`"
                class="status-chip"
                :class="`status-${tag.key}`"
              >
                {{ tag.label }}
              </span>
            </div>
            <div class="card-teacher" v-if="grade.teacher">
              👨‍🏫 {{ grade.teacher }}
            </div>
          </div>
        </div>
      </template>
      
      <div v-if="sortedGrades.length === 0" class="no-results">
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
              <span class="detail-value">{{ selectedGrade.creditPoint || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">课程性质</span>
              <span class="detail-value">{{ selectedGrade.course_nature || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">录入教师</span>
              <span class="detail-value">{{ selectedGrade.teacher || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">是否挂科</span>
              <span class="detail-value">{{ selectedGrade.isFailed ? '是' : '否' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">是否补考</span>
              <span class="detail-value">{{ selectedGrade.isMakeup ? '是' : '否' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">是否缓考</span>
              <span class="detail-value">{{ selectedGrade.isDeferred ? '是' : '否' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">是否免修</span>
              <span class="detail-value">{{ selectedGrade.isExempt ? '是' : '否' }}</span>
            </div>
            <div class="detail-item full-width" v-if="selectedGrade.statusTags?.length">
              <span class="detail-label">关键状态</span>
              <div class="detail-tags">
                <span
                  v-for="tag in selectedGrade.statusTags"
                  :key="`detail-${selectedGrade.course_name}-${tag.key}`"
                  class="status-chip"
                  :class="`status-${tag.key}`"
                >
                  {{ tag.label }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.grade-view {
  min-height: 100%;
  background: var(--ui-bg-gradient);
  padding: 16px 14px 120px;
  color: var(--ui-text);
}

.grade-header {
  margin-bottom: 12px;
}

.grade-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: clamp(19px, 2.2vw, 24px);
  font-weight: 800;
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
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
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
  padding: 16px;
  margin: 16px 0;
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
  border-top: 1px dashed color-mix(in oklab, var(--ui-primary) 24%, var(--ui-surface-border));
}

.filter-actions-row {
  justify-content: flex-end;
}

.filter-advanced {
  margin-top: 10px;
}

.search-box {
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
  background: var(--ui-surface);
  border-radius: 10px;
  padding: 0 12px;
  border: 1px solid var(--ui-surface-border);
}

.search-icon {
  margin-right: 8px;
}

.search-input {
  flex: 1;
  border: none !important;
  box-shadow: none !important;
  min-height: 0 !important;
  height: auto !important;
  background: transparent;
  padding: 12px 0 !important;
  font-size: 14px;
  outline: none;
}

.filter-select {
  min-width: 146px;
}

.sort-select {
  min-width: 170px;
}

.filter-select :deep(.ios26-select-trigger) {
  min-height: 42px;
  border-radius: 12px;
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
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
  transition: all 0.2s;
}

.radio-label input {
  display: none;
}

.radio-label.active {
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  color: #ffffff;
  border-color: transparent;
}

.ghost-btn {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 30%, transparent);
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.ghost-btn:hover {
  background: color-mix(in oklab, var(--ui-primary-soft) 72%, #ffffff 28%);
}

.reset-btn {
  padding: 8px 16px;
  background: color-mix(in oklab, var(--ui-danger) 14%, #ffffff 86%);
  color: var(--ui-danger);
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid color-mix(in oklab, var(--ui-danger) 30%, transparent);
}

.reset-btn:hover {
  background: var(--ui-danger);
  color: white;
}

/* 统计卡片 */
.stats-row {
  display: flex;
  gap: 12px;
  padding: 0;
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
  background: var(--ui-surface);
  border-radius: 16px;
  padding: 16px;
  text-align: center;
  border: 1px solid var(--ui-surface-border);
  box-shadow: var(--ui-shadow-soft);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary-soft) 70%, #fff 30%);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.stat-label {
  font-size: 12px;
  color: var(--ui-muted);
  margin-top: 4px;
}

/* 成绩卡片网格 */
.grade-list {
  padding: 0;
}

.term-group {
  margin-bottom: 24px;
}

.term-header {
  font-size: 15px;
  font-weight: 800;
  color: var(--ui-text);
  margin-bottom: 12px;
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, transparent);
  background: color-mix(in oklab, var(--ui-primary-soft) 72%, #fff 28%);
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
  box-shadow: var(--ui-shadow-strong);
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

.card-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid transparent;
}

.status-failed {
  background: color-mix(in oklab, #ef4444 14%, #ffffff 86%);
  color: #ef4444;
  border-color: color-mix(in oklab, #ef4444 36%, transparent);
}

.status-makeup {
  background: color-mix(in oklab, #f59e0b 16%, #ffffff 84%);
  color: #c26c00;
  border-color: color-mix(in oklab, #f59e0b 36%, transparent);
}

.status-deferred {
  background: color-mix(in oklab, #3b82f6 16%, #ffffff 84%);
  color: #2563eb;
  border-color: color-mix(in oklab, #3b82f6 36%, transparent);
}

.status-exempt {
  background: color-mix(in oklab, #10b981 16%, #ffffff 84%);
  color: #0f9f6e;
  border-color: color-mix(in oklab, #10b981 36%, transparent);
}

.card-teacher {
  font-size: 11px;
  color: var(--ui-muted);
  background: var(--ui-primary-soft);
  border: 1px solid color-mix(in oklab, var(--ui-primary) 20%, transparent);
  padding: 4px 8px;
  border-radius: 999px;
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
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
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
  padding: 14px;
}

.modal-content {
  background: var(--ui-surface);
  border-radius: 20px;
  padding: 22px 18px 16px;
  max-width: 480px;
  width: 100%;
  max-height: min(80vh, 680px);
  overflow: auto;
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
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  border: none;
  background: var(--ui-primary-soft);
  color: var(--ui-text);
  border-radius: 50%;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-header {
  text-align: center;
  margin-bottom: 14px;
  padding-right: 28px;
}

.detail-score {
  font-size: 42px;
  font-weight: 700;
  margin-bottom: 6px;
}

.detail-score.excellent { color: #10b981; }
.detail-score.good { color: #3b82f6; }
.detail-score.pass { color: #f59e0b; }
.detail-score.fail { color: #ef4444; }

.detail-header h2 {
  font-size: 18px;
  color: var(--ui-text);
  margin: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.detail-item {
  background: var(--ui-surface);
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--ui-surface-border);
}

.detail-item.full-width {
  grid-column: span 2;
}

.detail-label {
  display: block;
  font-size: 11px;
  color: var(--ui-muted);
  margin-bottom: 3px;
}

.detail-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-text);
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
  background: color-mix(in oklab, var(--ui-danger) 14%, #ffffff 86%);
  border: 1px solid color-mix(in oklab, var(--ui-danger) 40%, transparent);
  color: var(--ui-danger);
  border-radius: 12px;
  font-weight: 600;
}
</style>
