<script setup>
import { ref, computed, watch } from 'vue'
import { formatRelativeTime } from '../utils/time.js'
import { compareSemesterDesc, normalizeSemesterList, resolveCurrentSemester } from '../utils/semester.js'
import { TPageHeader, TEmptyState } from './templates'
import GradeDistributionView from './GradeDistributionView.vue'

const props = defineProps({
  grades: { type: Array, default: () => [] },
  studentId: { type: String, default: '' },
  offline: { type: Boolean, default: false },
  syncTime: { type: String, default: '' },
  refreshing: { type: Boolean, default: false }
})

const emit = defineEmits(['back', 'logout', 'refresh'])

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

// Tab 切换：成绩查询 / 给分记录
const activeGradeTab = ref('grades')

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

const formatPointNumber = (value) => {
  if (!Number.isFinite(value)) return '-'
  const safeValue = Math.max(0, value)
  return safeValue.toFixed(2).replace(/\.0+$|(\.\d*?)0+$/g, '$1').replace(/\.$/, '')
}

const normalizePointText = (value) => {
  const text = toSafeText(value)
  if (!text) return '-'
  const numeric = Number.parseFloat(text)
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(text)) {
    return formatPointNumber(numeric)
  }
  return text
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

const resolveCardTeacherName = (grade) => {
  // 首页卡片：优先显示录入教师(cjlrjsxm)，为空则显示课程教师(course_teacher)
  if (!grade || typeof grade !== 'object') return ''
  const entryTeacher = grade.teacher ?? grade.cjlrjsxm ?? grade.jsxm ?? ''
  if (String(entryTeacher).trim()) return String(entryTeacher).trim()
  return String(grade.course_teacher ?? grade.courseTeacher ?? '').trim()
}

const resolveCourseTeacherName = (grade) => {
  // 详情页课程教师：只取课程教师数据
  if (!grade || typeof grade !== 'object') return ''
  return String(grade.course_teacher ?? grade.courseTeacher ?? '').trim()
}

const resolveEntryTeacherName = (grade) => {
  // 详情页录入教师：只取原始后端字段 cjlrjsxm / jsxm，不使用 normalized 的 teacher 字段
  if (!grade || typeof grade !== 'object') return ''
  return String(grade.cjlrjsxm ?? grade.jsxm ?? '').trim()
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
    const gradePointNumber = scoreNumber !== null ? Math.max(0, scoreNumber / 10 - 5) : null
    return {
      ...grade,
      originIndex: index,
      term: toSafeText(grade.term || grade.xnxq),
      course_name: normalizeCourseName(grade.course_name || grade.kcmc),
      course_credit: toSafeText(grade.course_credit || grade.xf),
      earned_credit: toSafeText(grade.earned_credit || grade.hdxf),
      creditPoint: normalizePointText(grade.xfjd || grade.creditPoint || grade.gpa),
      gradePoint: gradePointNumber,
      gradePointText: formatPointNumber(gradePointNumber),
      creditGradePoint: normalizePointText(grade.xfjd || grade.creditPoint || grade.gpa),
      final_score: finalScore,
      scoreNumber,
      course_nature: resolveCourseNatureLabel(grade),
      teacher: resolveCardTeacherName(grade),
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
  return { total, credits: credits.toFixed(2), failed }
})

const lastUpdatedAt = computed(() => props.syncTime ? formatRelativeTime(props.syncTime) : '暂未更新')

// 获取分数等级样式
const getScoreClass = (score) => {
  const text = toSafeText(score)
  const num = parseFloat(text)
  if (isNaN(num)) {
    if (/优秀/.test(text)) return 'excellent'
    if (/(良好|中等)/.test(text)) return 'good'
    if (/(及格|合格|通过)/.test(text)) return 'pass'
    if (/(不及格|不合格|未通过)/.test(text)) return 'fail'
    return ''
  }
  if (num >= 90) return 'excellent'
  if (num >= 80) return 'good'
  if (num >= 70) return 'average'
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
const handleRefresh = () => emit('refresh')

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
    <header class="grade-stitch-header">
      <button class="grade-stitch-back" type="button" aria-label="返回" @click="handleBack">
        <span class="material-symbols-outlined">chevron_left</span>
      </button>
      <h1>成绩查询</h1>
      <button
        class="grade-stitch-refresh grade-refresh-btn"
        type="button"
        :disabled="refreshing"
        aria-label="刷新成绩"
        title="刷新成绩"
        @click="handleRefresh"
      >
        <span class="material-symbols-outlined" :class="{ spinning: refreshing || offline }">refresh</span>
      </button>
    </header>

    <main class="grade-stitch-main">
      <div class="grade-tab-bar rounded-2xl">
        <button
          class="grade-tab-btn"
          :class="{ active: activeGradeTab === 'grades' }"
          @click="activeGradeTab = 'grades'"
        >
          成绩查询
        </button>
        <button
          class="grade-tab-btn"
          :class="{ active: activeGradeTab === 'distribution' }"
          @click="activeGradeTab = 'distribution'"
        >
          给分记录<span class="beta-tag">Beta</span>
        </button>
      </div>

      <GradeDistributionView v-if="activeGradeTab === 'distribution'" />

      <template v-if="activeGradeTab === 'grades'">
        <div v-if="offline" class="offline-banner">
          当前显示为离线数据，更新于{{ formatRelativeTime(syncTime) }}
        </div>

        <div class="grade-filter-card">
          <div class="search-box">
            <span class="material-symbols-outlined search-icon">search</span>
            <input
              v-model="searchName"
              type="text"
              placeholder="搜索课程名称..."
              class="search-input"
            />
          </div>

          <div class="select-wrap">
            <IOSSelect v-model="filterTerm" class="filter-select">
              <option value="">全部学期</option>
              <option v-for="term in terms" :key="term" :value="term">{{ term }}</option>
            </IOSSelect>
          </div>

          <div class="filter-divider">
            <button class="ghost-btn" type="button" @click="showAdvancedFilters = !showAdvancedFilters">
              {{ showAdvancedFilters ? '收起筛选' : '展开筛选' }}
              <span class="material-symbols-outlined">expand_more</span>
            </button>
          </div>

          <div v-if="showAdvancedFilters" class="filter-advanced">
            <div class="filter-group">
              <label>成绩状态</label>
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
              <label>补考</label>
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

            <div class="filter-group">
              <label>展示方式</label>
              <div class="radio-group">
                <label class="radio-label" :class="{ active: viewMode === 'grouped' }">
                  <input type="radio" v-model="viewMode" value="grouped" />
                  <span>分组</span>
                </label>
                <label class="radio-label" :class="{ active: viewMode === 'all' }">
                  <input type="radio" v-model="viewMode" value="all" />
                  <span>全部</span>
                </label>
              </div>
            </div>

            <div class="filter-group filter-sort-row">
              <label>排序</label>
              <IOSSelect v-model="sortMode" class="filter-select sort-select">
                <option value="origin">成绩公布先后</option>
                <option value="score_desc">成绩高到低</option>
                <option value="score_asc">成绩低到高</option>
              </IOSSelect>
              <button class="reset-btn" type="button" @click="resetFilters">重置</button>
            </div>
          </div>
        </div>

        <div class="grade-stats-grid">
          <div class="stat-card">
            <span class="stat-value">{{ stats.total }}</span>
            <span class="stat-label">筛选结果</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ stats.credits }}</span>
            <span class="stat-label">总学分</span>
          </div>
          <div class="stat-card">
            <span class="stat-value stat-value-dark">{{ stats.failed }}</span>
            <span class="stat-label">挂科数</span>
          </div>
        </div>

        <div class="grade-list">
          <template v-if="viewMode === 'grouped'">
            <div v-for="group in groupedGrades" :key="group.term" class="term-group">
              <div class="term-header">
                <span class="term-icon"><i class="fa-regular fa-calendar"></i></span>
                <h2>{{ group.term }} ({{ group.items.length }}门)</h2>
              </div>
              <div class="grade-grid">
                <div
                  v-for="grade in group.items"
                  :key="`${group.term}-${grade.course_name}-${grade.originIndex}`"
                  class="grade-card"
                  :class="getScoreClass(grade.final_score)"
                  @click="openDetail(grade)"
                >
                  <div class="card-score">{{ grade.final_score }}</div>
                  <h3 class="card-name">{{ grade.course_name }}</h3>
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
                  <div class="card-teacher" v-if="resolveCardTeacherName(grade)">
                    <span class="material-symbols-outlined">person</span>
                    {{ resolveCardTeacherName(grade) }}
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
                <h3 class="card-name">{{ grade.course_name }}</h3>
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
                <div class="card-teacher" v-if="resolveCardTeacherName(grade)">
                  <span class="material-symbols-outlined">person</span>
                  {{ resolveCardTeacherName(grade) }}
                </div>
              </div>
            </div>
          </template>

          <TEmptyState v-if="refreshing && props.grades.length === 0" type="loading" message="正在获取成绩数据..." />
          <TEmptyState v-else-if="sortedGrades.length === 0" message="没有找到符合条件的成绩">
            <button @click="resetFilters">清除筛选</button>
          </TEmptyState>
        </div>

        <p class="grade-updated-at">最新更新时间：{{ lastUpdatedAt }}</p>

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
              <span class="detail-value">{{ selectedGrade.gradePointText || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">学分绩点</span>
              <span class="detail-value">{{ selectedGrade.creditGradePoint || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">课程性质</span>
              <span class="detail-value">{{ selectedGrade.course_nature || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">录入教师</span>
              <span class="detail-value">{{ resolveEntryTeacherName(selectedGrade) || '-' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">课程教师</span>
              <span class="detail-value">{{ resolveCourseTeacherName(selectedGrade) || '-' }}</span>
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
            <div class="detail-item full-width detail-formula-note">
              <span class="detail-label">绩点说明</span>
              <div class="detail-note-lines">
                <span>绩点 = 分数 / 10 - 5</span>
                <span>学分绩点 = 学分 × 绩点</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
      </template>
    </main>
  </div>
</template>

<style scoped>
.grade-view {
  min-height: 100%;
  background: #f6fafe;
  color: #1e293b;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  padding-bottom: 104px;
}

.grade-stitch-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 16px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.86);
  background: rgba(246, 250, 254, 0.86);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.grade-stitch-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0;
  color: #1e293b;
}

.grade-stitch-back,
.grade-stitch-refresh {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #1e293b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.grade-stitch-refresh {
  color: #3b82f6;
}

.grade-refresh-btn:disabled {
  cursor: wait;
  opacity: 0.72;
}

.grade-refresh-btn .material-symbols-outlined {
  font-size: 22px;
  line-height: 1;
}

.grade-refresh-btn .spinning {
  animation: gradeRefreshSpin 0.8s linear infinite;
}

.grade-stitch-main {
  padding: 16px 20px 0;
  display: grid;
  gap: 24px;
}

.grade-tab-bar {
  display: flex;
  margin: 0;
  padding: 4px;
  gap: 0;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
}

.grade-tab-btn {
  flex: 1;
  min-height: 44px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #64748b;
  font-size: 14px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.grade-tab-btn.active {
  color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.08);
}

.beta-tag {
  padding: 2px 6px;
  border-radius: 6px;
  background: #fef3c7;
  color: #d97706;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
  text-transform: uppercase;
}

.grade-filter-card {
  display: grid;
  gap: 14px;
  padding: 20px;
  border-radius: 24px;
  background: #ffffff;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
}

.search-box,
.select-wrap {
  min-height: 48px;
  border-radius: 14px;
  background: #f0f4f8;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
}

.search-icon {
  color: #94a3b8;
  font-size: 20px;
}

.search-input {
  width: 100%;
  border: 0 !important;
  box-shadow: none !important;
  background: transparent;
  color: #1e293b;
  font-size: 14px;
  outline: none;
  padding: 13px 0 !important;
}

.filter-select {
  width: 100%;
}

.filter-select :deep(.ios26-select-trigger) {
  min-height: 48px;
  border: 0;
  border-radius: 14px;
  background: #f0f4f8;
  color: #1e293b;
  box-shadow: none;
}

.filter-divider {
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
}

.ghost-btn {
  width: 100%;
  min-height: 36px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #3b82f6;
  font-size: 14px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.filter-advanced {
  display: grid;
  gap: 12px;
  padding-top: 2px;
}

.filter-group {
  display: grid;
  gap: 8px;
}

.filter-group > label {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.radio-label {
  border-radius: 10px;
  background: #f0f4f8;
  color: #64748b;
  padding: 7px 11px;
  font-size: 13px;
  font-weight: 700;
}

.radio-label input {
  display: none;
}

.radio-label.active {
  color: #3b82f6;
  background: #eff6ff;
}

.filter-sort-row {
  grid-template-columns: 1fr auto;
  align-items: end;
}

.filter-sort-row > label {
  grid-column: 1 / -1;
}

.sort-select {
  min-width: 170px;
}

.reset-btn {
  min-height: 38px;
  border: 0;
  border-radius: 10px;
  padding: 0 14px;
  background: #fee2e2;
  color: #ef4444;
  font-size: 13px;
  font-weight: 700;
}

.grade-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  min-height: 104px;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 8px;
}

.stat-value {
  color: #3b82f6;
  font-size: 30px;
  font-weight: 900;
  line-height: 1.05;
}

.stat-value-dark {
  color: #1e293b;
}

.stat-label {
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.grade-list {
  display: grid;
  gap: 24px;
}

.term-group {
  display: grid;
  gap: 12px;
}

.term-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
}

.term-header h2 {
  margin: 0;
  color: #1e293b;
  font-size: 14px;
  font-weight: 800;
}

.term-icon {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: #dbeafe;
  color: #3b82f6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.grade-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.grade-card {
  min-height: 166px;
  display: flex;
  flex-direction: column;
  padding: 20px;
  border: 0;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  overflow: hidden;
  cursor: pointer;
}

.card-score {
  color: #10b981;
  font-size: 40px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0;
  margin-bottom: 14px;
}

.grade-card.excellent .card-score {
  color: #10b981;
}

.grade-card.good .card-score {
  color: #22c55e;
}

.grade-card.average .card-score {
  color: #eab308;
}

.grade-card.pass .card-score {
  color: #f97316;
}

.grade-card.fail .card-score {
  color: #ef4444;
}

.card-name {
  min-height: 38px;
  margin: 0 0 10px;
  color: #1e293b;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta,
.card-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.card-meta {
  margin-top: auto;
}

.credit,
.nature,
.status-chip {
  border-radius: 7px;
  padding: 5px 8px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.15;
}

.credit {
  background: #f1f5f9;
  color: #64748b;
}

.nature {
  background: #eff6ff;
  color: #3b82f6;
}

.status-chip {
  background: #fee2e2;
  color: #ef4444;
}

.status-makeup {
  background: #fef3c7;
  color: #d97706;
}

.status-deferred {
  background: #eff6ff;
  color: #3b82f6;
}

.status-exempt {
  background: #d1fae5;
  color: #059669;
}

.card-teacher {
  margin-top: 8px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.card-teacher .material-symbols-outlined {
  font-size: 15px;
}

.grade-updated-at {
  margin: -4px 0 0;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

.offline-banner {
  margin: -8px 0 -4px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #fef3c7;
  color: #b45309;
  font-size: 12px;
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
.detail-score.good { color: #22c55e; }
.detail-score.average { color: #eab308; }
.detail-score.pass { color: #f97316; }
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

.detail-formula-note {
  background: color-mix(in oklab, var(--ui-primary-soft) 64%, #fff 36%);
}

.detail-note-lines {
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: var(--ui-text);
  line-height: 1.45;
}

</style>
