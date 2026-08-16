<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import { useAutoLearning, SPEED_MODES } from '../utils/auto_learning'
import { TCard, TEmptyState, TModal, TPageHeader, TSection, TStatusBadge } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

/* ── Tab 系统 ── */
const activeTab = ref('overview')
const TABS = [
  { key: 'overview', label: '概览', icon: '📊' },
  { key: 'auto',     label: '自动学习', icon: '🤖' },
  { key: 'settings', label: '设置', icon: '⚙️' }
]

/* ── 原有状态 ── */
const loading = ref(true)
const refreshing = ref(false)
const detailLoading = ref(false)
const error = ref('')
const statusMeta = ref({})
const courses = ref([])
const selectedCourseId = ref('')
const outline = ref([])
const progress = ref({})
const showAdvanced = ref(false)

/* ── 自动学习 ── */
const auto = useAutoLearning('chaoxing')

const safeText = (value) => String(value ?? '').trim()
const safeNumber = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const unwrapPayload = (payload) => {
  if (payload && typeof payload === 'object' && payload.data && !Array.isArray(payload.data)) {
    return payload.data
  }
  return payload
}

const resolveBadgeType = (status) => {
  const text = safeText(status).toLowerCase()
  if (/(connected|ready|已连接|可用|success|ok)/.test(text)) return 'success'
  if (/(cache|offline|缓存|离线)/.test(text)) return 'warning'
  if (/(sync|running|同步中|pending)/.test(text)) return 'info'
  if (/(expired|需登录|未连接|error|fail)/.test(text)) return 'danger'
  return 'muted'
}

const resolveTaskType = (value) => {
  const text = safeText(value).toLowerCase()
  if (/(video|视频)/.test(text)) return { text: '视频', type: 'info' }
  if (/(audio|音频)/.test(text)) return { text: '音频', type: 'primary' }
  if (/(ppt|book|阅读|文档|章节)/.test(text)) return { text: '阅读', type: 'warning' }
  if (/(link|链接)/.test(text)) return { text: '链接', type: 'muted' }
  return { text: safeText(value) || '任务', type: 'muted' }
}

const normalizeCourse = (item = {}) => {
  const raw = item && typeof item === 'object' ? item : {}
  return {
    id: safeText(raw.id || raw.course_id || raw.courseId || raw.clazzid || raw.cpi),
    courseId: safeText(raw.course_id || raw.courseId || raw.courseid || ''),
    clazzId: safeText(raw.clazz_id || raw.clazzId || raw.clazzid || ''),
    cpi: safeText(raw.cpi || ''),
    title: safeText(raw.title || raw.name || raw.course_name || raw.courseName || '未命名课程'),
    teacher: safeText(raw.teacher || raw.teacher_name || raw.teacherName || raw.instructor || ''),
    progressText: safeText(raw.progress_text || raw.progressText || raw.progress || raw.schedule_text || raw.progress_summary || ''),
    progressRate: safeNumber(raw.progress_rate ?? raw.progressRate ?? raw.progress_percent ?? raw.progressPercent ?? raw.percent),
    pendingCount: safeNumber(raw.pending_count ?? raw.pendingCount ?? raw.todo_count ?? raw.unfinished_count),
    courseUrl: safeText(raw.url || raw.course_url || raw.courseUrl || ''),
    raw
  }
}

const normalizeSection = (item = {}) => {
  const raw = item && typeof item === 'object' ? item : {}
  const taskList = Array.isArray(raw.tasks)
    ? raw.tasks
    : Array.isArray(raw.children)
      ? raw.children
      : Array.isArray(raw.points)
        ? raw.points
        : []
  return {
    id: safeText(raw.id || raw.section_id || raw.sectionId || raw.chapter_id || raw.chapterId),
    title: safeText(raw.title || raw.name || raw.label || '未命名章节'),
    tasks: taskList.map((task) => {
      const node = task && typeof task === 'object' ? task : {}
      return {
        id: safeText(node.id || node.task_id || node.taskId || node.knowledge_id || node.knowledgeId),
        title: safeText(node.title || node.name || node.label || '未命名任务'),
        typeMeta: resolveTaskType(node.type || node.task_type || node.job_type || node.label_type),
        status: safeText(node.status || node.state || node.progress_text || node.progressText || ''),
        progress: safeText(node.progress || node.progress_text || node.progressText || ''),
        raw: node
      }
    })
  }
}

const selectedCourse = computed(() => courses.value.find((item) => item.id === selectedCourseId.value) || null)
const emptySessionMessage = computed(() => {
  return safeText(statusMeta.value?.message) || '当前没有可用的学习通会话，请先在登录页完成融合门户登录后自动同步。'
})
const sessionConnected = computed(() => {
  if (statusMeta.value?.connected === true) return true
  const text = safeText(statusMeta.value.status || statusMeta.value.connection_status || statusMeta.value.state).toLowerCase()
  return /(connected|ready|已连接|可用|success|ok)/.test(text)
})

const loadStatusAndCourses = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const [statusRes, courseRes] = await Promise.all([
      axios.post(`${API_BASE}/v2/chaoxing/session_status`, {
        student_id: props.studentId || ''
      }),
      axios.post(`${API_BASE}/v2/chaoxing/courses`, {
        student_id: props.studentId || ''
      })
    ])

    const statusPayload = statusRes?.data || {}
    const coursePayload = courseRes?.data || {}

    if (statusPayload?.success === false) {
      throw new Error(statusPayload?.error || '学习通状态获取失败')
    }
    if (coursePayload?.success === false) {
      throw new Error(coursePayload?.error || '学习通课程获取失败')
    }

    statusMeta.value = unwrapPayload(statusPayload) || {}
    const courseData = unwrapPayload(coursePayload)
    const rawList = Array.isArray(courseData?.courses)
      ? courseData.courses
      : Array.isArray(courseData)
        ? courseData
        : []
    courses.value = rawList.map(normalizeCourse).filter((item) => item.id)

    if (!selectedCourseId.value && courses.value.length) {
      selectedCourseId.value = courses.value[0].id
      await loadCourseDetail(selectedCourseId.value)
    } else if (selectedCourseId.value) {
      await loadCourseDetail(selectedCourseId.value)
    }
  } catch (err) {
    error.value = safeText(err?.message || err) || '学习通数据获取失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const loadCourseDetail = async (courseId) => {
  const current = courses.value.find((item) => item.id === courseId)
  if (!current?.courseId || !current?.clazzId) return
  detailLoading.value = true
  error.value = ''
  try {
    const [outlineRes, progressRes] = await Promise.all([
      axios.post(`${API_BASE}/v2/chaoxing/course_outline`, {
        student_id: props.studentId || '',
        course_id: current.courseId,
        clazz_id: current.clazzId,
        cpi: current.cpi,
        course_url: current.courseUrl || ''
      }),
      axios.post(`${API_BASE}/v2/chaoxing/course_progress`, {
        student_id: props.studentId || '',
        course_id: current.courseId,
        clazz_id: current.clazzId,
        cpi: current.cpi,
        course_url: current.courseUrl || ''
      })
    ])

    const outlinePayload = outlineRes?.data || {}
    const progressPayload = progressRes?.data || {}

    const outlineData = unwrapPayload(outlinePayload)
    const sectionList = Array.isArray(outlineData?.sections)
      ? outlineData.sections
      : Array.isArray(outlineData?.outline)
        ? outlineData.outline
        : Array.isArray(outlineData?.nodes)
          ? outlineData.nodes
        : Array.isArray(outlineData)
          ? outlineData
          : []
    outline.value = sectionList.map(normalizeSection).filter((item) => item.title)
    progress.value = unwrapPayload(progressPayload) || {}
  } catch (err) {
    error.value = safeText(err?.message || err) || '课程详情获取失败'
  } finally {
    detailLoading.value = false
  }
}

const refreshAll = async () => {
  refreshing.value = true
  await loadStatusAndCourses({ silent: true })
}

const selectCourse = async (courseId) => {
  if (!safeText(courseId) || courseId === selectedCourseId.value) return
  selectedCourseId.value = courseId
  await loadCourseDetail(courseId)
}

onMounted(() => {
  void loadStatusAndCourses()
})

/* ── 自动学习启动/停止 ── */
const handleStartAuto = () => {
  if (auto.running.value) return
  auto.runChaoxingAuto(props.studentId, courses.value)
}

/* ── 课程多选切换 ── */
const toggleCourseSelect = (courseId) => {
  const idx = auto.config.selectedCourseIds.indexOf(courseId)
  if (idx >= 0) auto.config.selectedCourseIds.splice(idx, 1)
  else auto.config.selectedCourseIds.push(courseId)
}
const isCourseSelected = (courseId) => auto.config.selectedCourseIds.includes(courseId)

/* ── 风险颜色 ── */
const riskColor = (risk) => {
  if (risk === 'high') return 'var(--ui-danger)'
  if (risk === 'medium') return 'var(--ui-primary)'
  return 'var(--ui-success)'
}

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(safeNumber(value))))
const resolveLogOverallPercent = (log, idx) => idx === 0 && auto.running.value
  ? clampPercent(auto.overallPercent.value)
  : clampPercent(log?.overallPercent ?? log?.progressRate ?? log?.progress_percent)
const resolveLogVideoPercent = (log, idx) => idx === 0 && auto.running.value
  ? clampPercent(auto.progress.currentVideoProgress)
  : clampPercent(log?.videoPercent ?? log?.currentVideoProgress)
const showLogProgress = (log, idx) => Boolean(idx === 0 && auto.running.value)
  || Boolean(log?.showBar)
  || safeNumber(log?.totalVideos) > 0
  || safeNumber(log?.totalCourses) > 0
  || resolveLogOverallPercent(log, idx) > 0
  || resolveLogVideoPercent(log, idx) > 0
const resolveLogMeta = (log) => {
  const parts = []
  const courseName = safeText(log?.courseName)
  if (courseName) parts.push(courseName)
  if (safeNumber(log?.totalCourses) > 0) parts.push(`课程 ${safeNumber(log?.courseIndex)}/${safeNumber(log?.totalCourses)}`)
  if (safeNumber(log?.totalVideos) > 0) parts.push(`视频 ${safeNumber(log?.videoIndex)}/${safeNumber(log?.totalVideos)}`)
  return parts.join(' · ') || '执行进度'
}
const resolveLogVideoLabel = (log, idx) => {
  const liveVideoName = idx === 0 && auto.running.value ? safeText(auto.progress.currentVideoName) : ''
  return liveVideoName || safeText(log?.videoName) || '当前视频'
}
</script>

<template>
  <div class="online-view">
    <TPageHeader title="学习通" @back="emit('back')">
      <template #actions>
        <div class="header-actions">
          <button class="ghost-btn" :disabled="refreshing" @click="refreshAll">
            {{ refreshing ? '刷新中' : '刷新' }}
          </button>
        </div>
      </template>
    </TPageHeader>

    <!-- ═══ Tab Bar ═══ -->
    <div class="tab-bar">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="tab-item"
        :class="{ 'tab-item--active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
      </button>
      <div class="tab-indicator" :style="{ transform: `translateX(${TABS.findIndex(t => t.key === activeTab) * 100}%)` }" />
    </div>

    <div class="online-view__body">

      <!-- ═══════════ TAB: 概览 ═══════════ -->
      <template v-if="activeTab === 'overview'">
      <TCard compact>
        <template #header>
          <div class="status-head">
            <div>
              <strong>平台状态</strong>
              <p>登录融合门户后自动桥接学习通会话，读取课程、章节和进度。</p>
            </div>
            <TStatusBadge
              :type="resolveBadgeType(statusMeta.status || statusMeta.connection_status || statusMeta.state)"
              :text="statusMeta.status || statusMeta.connection_status || statusMeta.state || '未连接'"
            />
          </div>
        </template>

        <div class="status-grid">
          <div class="status-chip">
            <span>课程数</span>
            <strong>{{ courses.length }}</strong>
          </div>
          <div class="status-chip">
            <span>最近同步</span>
            <strong>{{ statusMeta.last_sync || statusMeta.sync_time || '未同步' }}</strong>
          </div>
          <div class="status-chip">
            <span>数据来源</span>
            <strong>{{ statusMeta.offline ? '缓存数据' : '实时数据' }}</strong>
          </div>
        </div>

        <p v-if="statusMeta.message" class="helper-text">{{ statusMeta.message }}</p>
        <p v-if="error" class="error-text">{{ error }}</p>
      </TCard>

      <TEmptyState v-if="loading" type="loading" message="正在读取学习通课程..." />

      <template v-else>
        <TEmptyState
          v-if="!sessionConnected && !courses.length"
          type="empty"
          :message="emptySessionMessage"
        />

        <template v-else>
          <TSection title="课程列表" icon="📚">
            <div class="course-list">
              <TCard
                v-for="course in courses"
                :key="course.id"
                compact
                hoverable
                class="course-card"
                :class="{ 'course-card--active': selectedCourseId === course.id }"
                @click="selectCourse(course.id)"
              >
                <template #header>
                  <div class="course-card__head">
                    <div>
                      <strong>{{ course.title }}</strong>
                      <p>{{ course.teacher || '教师信息暂缺' }}</p>
                    </div>
                    <TStatusBadge
                      :type="course.pendingCount > 0 ? 'warning' : 'success'"
                      :text="course.pendingCount > 0 ? `待完成 ${course.pendingCount}` : '已跟踪'"
                    />
                  </div>
                </template>

                <div class="course-meta">
                  <span>{{ course.progressText || '暂无官方进度文本' }}</span>
                  <strong v-if="course.progressRate > 0">{{ course.progressRate }}%</strong>
                </div>
              </TCard>
            </div>
          </TSection>

          <TSection title="章节任务" icon="🧩">
            <TCard compact>
              <template v-if="selectedCourse">
                <div class="detail-head">
                  <div>
                    <strong>{{ selectedCourse.title }}</strong>
                    <p>{{ selectedCourse.teacher || '教师信息暂缺' }}</p>
                  </div>
                  <div class="detail-badges">
                    <TStatusBadge
                      type="info"
                      :text="progress.progress_text || progress.summary || selectedCourse.progressText || '官方进度'"
                    />
                    <TStatusBadge
                      :type="progress.offline || statusMeta.offline ? 'warning' : 'success'"
                      :text="progress.offline || statusMeta.offline ? '缓存数据' : '实时数据'"
                    />
                  </div>
                </div>

                <div v-if="detailLoading" class="detail-loading">
                  <TEmptyState type="loading" message="正在加载课程大纲..." />
                </div>

                <div v-else-if="outline.length" class="outline-list">
                  <section v-for="section in outline" :key="section.id || section.title" class="outline-section">
                    <header class="outline-section__head">
                      <strong>{{ section.title }}</strong>
                      <span>{{ section.tasks.length }} 个任务</span>
                    </header>
                    <article v-for="task in section.tasks" :key="task.id || task.title" class="task-row">
                      <div class="task-row__main">
                        <strong>{{ task.title }}</strong>
                        <p>{{ task.status || task.progress || '等待在官方页面完成或同步' }}</p>
                      </div>
                      <div class="task-row__side">
                        <TStatusBadge :type="task.typeMeta.type" :text="task.typeMeta.text" />
                      </div>
                    </article>
                  </section>
                </div>

                <TEmptyState
                  v-else
                  type="empty"
                  message="当前课程暂未返回章节任务，可能需要先在官方页面进入课程。"
                />
              </template>
              <TEmptyState v-else type="empty" message="请选择一门课程查看章节任务。" />
            </TCard>
          </TSection>
        </template>
      </template>
      </template><!-- end overview tab -->

      <!-- ═══════════ TAB: 自动学习 ═══════════ -->
      <template v-if="activeTab === 'auto'">
        <TCard compact>
          <template #header>
            <div class="status-head">
              <div>
                <strong>自动刷课</strong>
                <p>自动上报视频播放进度，模拟学习通客户端播放行为。</p>
              </div>
              <TStatusBadge
                :type="auto.running.value ? 'info' : auto.progress.phase === 'done' ? 'success' : auto.progress.phase === 'error' ? 'danger' : 'muted'"
                :text="auto.running.value ? (auto.paused.value ? '已暂停' : '运行中') : auto.progress.phase === 'done' ? '已完成' : auto.progress.phase === 'error' ? '出错' : '就绪'"
              />
            </div>
          </template>
        </TCard>

        <!-- 速度模式选择 -->
        <TSection title="速度模式" icon="⚡">
          <div class="speed-grid">
            <button
              v-for="(mode, key) in SPEED_MODES"
              :key="key"
              class="speed-card"
              :class="{ 'speed-card--active': auto.config.speedMode === key }"
              :disabled="auto.running.value"
              @click="auto.config.speedMode = key"
            >
              <span class="speed-icon">{{ mode.icon }}</span>
              <strong>{{ mode.label }}</strong>
              <p>{{ mode.desc }}</p>
              <span class="speed-risk" :style="{ color: riskColor(mode.risk) }">
                {{ mode.risk === 'high' ? '⚠ 高风险' : mode.risk === 'medium' ? '● 中风险' : '✓ 低风险' }}
              </span>
            </button>
          </div>
        </TSection>

        <!-- 课程选择 -->
        <TSection title="课程选择" icon="📚">
          <TCard compact>
            <div class="select-all-row">
              <label class="checkbox-label">
                <input type="checkbox" v-model="auto.config.allCourses" :disabled="auto.running.value" />
                <span>全部课程 ({{ courses.length }} 门)</span>
              </label>
            </div>
            <div v-if="!auto.config.allCourses" class="course-select-list">
              <label
                v-for="course in courses"
                :key="course.id"
                class="course-select-item"
                :class="{ 'course-select-item--selected': isCourseSelected(course.id) }"
              >
                <input
                  type="checkbox"
                  :checked="isCourseSelected(course.id)"
                  :disabled="auto.running.value"
                  @change="toggleCourseSelect(course.id)"
                />
                <div class="course-select-info">
                  <strong>{{ course.title }}</strong>
                  <span>{{ course.teacher || '教师暂缺' }} · {{ course.progressText || '暂无进度' }}</span>
                </div>
              </label>
            </div>
            <TEmptyState v-if="!courses.length" type="empty" message="请先在概览页获取课程列表" />
          </TCard>
        </TSection>

        <!-- 控制按钮 -->
        <div class="auto-controls">
          <button
            v-if="!auto.running.value"
            class="primary-btn auto-btn"
            :disabled="!courses.length || (!auto.config.allCourses && !auto.config.selectedCourseIds.length)"
            @click="handleStartAuto"
          >
            🚀 开始刷课
          </button>
          <template v-else>
            <button class="warning-btn auto-btn" @click="auto.togglePause()">
              {{ auto.paused.value ? '▶️ 恢复' : '⏸️ 暂停' }}
            </button>
            <button class="danger-btn auto-btn" @click="auto.stopAuto()">
              ⏹️ 停止
            </button>
          </template>
        </div>

        <!-- 进度面板 -->
        <TSection v-if="auto.progress.phase" title="执行进度" icon="📈">
          <TCard compact>
            <div class="progress-summary">
              <div class="progress-stat">
                <span>课程</span>
                <strong>{{ auto.progress.currentCourseIndex }} / {{ auto.progress.totalCourses }}</strong>
              </div>
              <div class="progress-stat">
                <span>视频</span>
                <strong>{{ auto.progress.currentVideoIndex }} / {{ auto.progress.totalVideos }}</strong>
              </div>
              <div class="progress-stat">
                <span>完成</span>
                <strong class="text-success">{{ auto.stats.videosCompleted }}</strong>
              </div>
              <div class="progress-stat">
                <span>失败</span>
                <strong class="text-danger">{{ auto.stats.videosFailed }}</strong>
              </div>
            </div>
            <div v-if="auto.progress.currentCourseName" class="progress-current">
              <p>📖 {{ auto.progress.currentCourseName }}</p>
              <p v-if="auto.progress.currentVideoName">▶️ {{ auto.progress.currentVideoName }}</p>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar">
                <div class="progress-bar__fill" :style="{ width: auto.overallPercent.value + '%' }" />
              </div>
              <span class="progress-percent">{{ auto.overallPercent.value }}%</span>
            </div>
            <div v-if="auto.stats.totalTime && !auto.running.value" class="progress-done">
              <p>⏱️ 总耗时 {{ auto.formatDuration(auto.stats.totalTime) }}</p>
            </div>
          </TCard>
        </TSection>

        <!-- 日志面板 -->
        <TSection v-if="auto.progress.logs.length" title="执行日志" icon="📋">
          <TCard compact>
            <div class="log-panel">
              <div
                v-for="(log, idx) in auto.progress.logs.slice(0, 50)"
                :key="idx"
                class="log-line"
                :class="'log-line--' + log.level"
              >
                <div class="log-line__head">
                  <span class="log-time">{{ log.time }}</span>
                  <span v-if="showLogProgress(log, idx)" class="log-line__percent">{{ resolveLogOverallPercent(log, idx) }}%</span>
                </div>
                <span class="log-msg">{{ log.message }}</span>
                <div v-if="showLogProgress(log, idx)" class="log-progress-card">
                  <div class="log-progress">
                    <div class="log-progress__fill" :style="{ width: resolveLogOverallPercent(log, idx) + '%' }" />
                  </div>
                  <div class="log-progress__meta">
                    <span>{{ resolveLogMeta(log) }}</span>
                    <span>{{ resolveLogVideoLabel(log, idx) }} {{ resolveLogVideoPercent(log, idx) }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </TCard>
        </TSection>
      </template>

      <!-- ═══════════ TAB: 设置 ═══════════ -->
      <template v-if="activeTab === 'settings'">
        <TSection title="速度默认值" icon="⚡">
          <TCard compact>
            <div class="setting-row">
              <div class="setting-label">
                <strong>默认速度模式</strong>
                <p>每次打开自动学习时使用的速度</p>
              </div>
              <select class="setting-select" v-model="auto.config.speedMode">
                <option v-for="(mode, key) in SPEED_MODES" :key="key" :value="key">
                  {{ mode.icon }} {{ mode.label }}
                </option>
              </select>
            </div>
          </TCard>
        </TSection>

        <TSection title="进度上报参数" icon="🔧">
          <TCard compact>
            <div class="setting-row">
              <div class="setting-label">
                <strong>上报间隔</strong>
                <p>模拟播放时每次上报的时间间隔(秒)</p>
              </div>
              <div class="setting-input-wrap">
                <input type="number" class="setting-input" v-model.number="auto.config.cx_reportInterval" min="10" max="300" step="5" />
                <span class="setting-unit">秒</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-label">
                <strong>随机抖动</strong>
                <p>延时随机浮动范围 (0.0~1.0)</p>
              </div>
              <div class="setting-input-wrap">
                <input type="number" class="setting-input" v-model.number="auto.config.cx_jitterFactor" min="0" max="1" step="0.05" />
              </div>
            </div>
          </TCard>
        </TSection>

        <TSection title="关于" icon="ℹ️">
          <TCard compact>
            <div class="about-text">
              <p>本功能通过模拟超星学习通客户端的视频进度上报接口, 将视频标记为已观看。</p>
              <p><strong>原理</strong>: 定时调用 report_progress 接口, 按 enc 加密算法生成签名, 逐帧递增播放时间。</p>
              <p><strong>参数对照</strong>: 与 chaoxing_auto.py 脚本完全一致 — rush(3s)/fast(10s,默认)/normal(30s), 进度上报间隔60秒, 抖动系数0.2。</p>
            </div>
          </TCard>
        </TSection>
      </template>

    </div>
  </div>
</template>

<style scoped>
.online-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
}

.online-view__body {
  padding: 16px 16px calc(96px + env(safe-area-inset-bottom));
}

/* ── Tab Bar ── */
.tab-bar {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0 16px;
  padding: 4px;
  border-radius: calc(16px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 85%, #fff 15%);
  border: 1px solid rgba(148, 163, 184, 0.18);
  backdrop-filter: blur(12px);
}

.tab-item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: calc(12px * var(--ui-radius-scale));
  transition: color 0.25s ease;
  color: var(--ui-muted);
  font-weight: 600;
  font-size: calc(14px * var(--ui-font-scale));
}

.tab-item--active {
  color: #fff;
}

.tab-icon {
  font-size: 16px;
}

.tab-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc((100% - 8px) / 3);
  height: calc(100% - 8px);
  border-radius: calc(12px * var(--ui-radius-scale));
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  box-shadow: 0 4px 12px color-mix(in oklab, var(--ui-primary) 30%, transparent);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 0;
}

/* ── Header ── */
.header-actions,
.detail-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-head,
.course-card__head,
.detail-head,
.outline-section__head,
.task-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.status-head p,
.course-card__head p,
.detail-head p,
.task-row__main p,
.helper-text {
  margin: 6px 0 0;
  color: var(--ui-muted);
  line-height: 1.45;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.status-chip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: calc(16px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.status-chip span {
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.status-chip strong {
  color: var(--ui-text);
}

.course-list,
.outline-list {
  display: grid;
  gap: 12px;
}

.course-card { cursor: pointer; }

.course-card--active {
  border-color: color-mix(in oklab, var(--ui-primary) 36%, transparent);
  box-shadow: 0 14px 28px color-mix(in oklab, var(--ui-primary) 18%, transparent);
}

.course-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--ui-muted);
  font-size: calc(13px * var(--ui-font-scale));
}

.outline-section {
  padding: 12px;
  border-radius: calc(18px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 94%, #fff 6%);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.outline-section__head span {
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
}

.task-row {
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
}

.task-row:first-of-type { margin-top: 10px; }
.task-row__main { min-width: 0; }
.task-row__main strong { display: block; color: var(--ui-text); }

/* ── Speed Grid ── */
.speed-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.speed-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 10px;
  border-radius: calc(18px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  border: 2px solid rgba(148, 163, 184, 0.18);
  cursor: pointer;
  transition: all 0.25s ease;
  text-align: center;
}

.speed-card:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.speed-card--active {
  border-color: var(--ui-primary);
  background: color-mix(in oklab, var(--ui-primary) 8%, var(--ui-surface) 92%);
  box-shadow: 0 8px 24px color-mix(in oklab, var(--ui-primary) 20%, transparent);
}

.speed-card:disabled { opacity: 0.5; cursor: not-allowed; }
.speed-icon { font-size: 28px; }

.speed-card strong {
  color: var(--ui-text);
  font-size: calc(15px * var(--ui-font-scale));
}

.speed-card p {
  margin: 0;
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
  line-height: 1.4;
}

.speed-risk {
  font-size: calc(11px * var(--ui-font-scale));
  font-weight: 700;
}

/* ── Course Select ── */
.select-all-row {
  padding: 10px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: 600;
  color: var(--ui-text);
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--ui-primary);
}

.course-select-list {
  display: grid;
  gap: 2px;
  max-height: 320px;
  overflow-y: auto;
  margin-top: 8px;
}

.course-select-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: calc(12px * var(--ui-radius-scale));
  cursor: pointer;
  transition: background 0.15s ease;
}

.course-select-item:hover {
  background: color-mix(in oklab, var(--ui-surface) 85%, #fff 15%);
}

.course-select-item--selected {
  background: color-mix(in oklab, var(--ui-primary) 8%, var(--ui-surface) 92%);
}

.course-select-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.course-select-info strong {
  color: var(--ui-text);
  font-size: calc(14px * var(--ui-font-scale));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.course-select-info span {
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
}

/* ── Auto Controls ── */
.auto-controls {
  display: flex;
  gap: 10px;
  padding: 12px 0;
}

.auto-btn {
  flex: 1;
  min-height: 44px;
  font-size: calc(15px * var(--ui-font-scale));
}

/* ── Progress Panel ── */
.progress-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.progress-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: calc(12px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
}

.progress-stat span {
  font-size: calc(11px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.progress-stat strong {
  font-size: calc(16px * var(--ui-font-scale));
  color: var(--ui-text);
}

.text-success { color: var(--ui-success) !important; }
.text-danger { color: var(--ui-danger) !important; }

.progress-current { margin: 12px 0 8px; }

.progress-current p {
  margin: 4px 0;
  color: var(--ui-text);
  font-size: calc(13px * var(--ui-font-scale));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-surface) 80%, #fff 20%);
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ui-primary), var(--ui-secondary));
  transition: width 0.4s ease;
}

.progress-percent {
  min-width: 40px;
  text-align: right;
  font-weight: 700;
  font-size: calc(14px * var(--ui-font-scale));
  color: var(--ui-primary);
}

.progress-done p {
  margin: 10px 0 0;
  color: var(--ui-muted);
  font-size: calc(13px * var(--ui-font-scale));
}

/* ── Log Panel ── */
.log-panel {
  max-height: 280px;
  overflow-y: auto;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: calc(12px * var(--ui-font-scale));
}

.log-line {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.log-line__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.log-time {
  color: var(--ui-muted);
  flex-shrink: 0;
  min-width: 70px;
}

.log-line__percent {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--ui-primary);
}

.log-msg {
  color: var(--ui-text);
  word-break: break-all;
  line-height: 1.5;
}

.log-progress-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-progress {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-surface) 80%, #fff 20%);
  overflow: hidden;
}

.log-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ui-primary), var(--ui-secondary));
  transition: width 0.35s ease;
}

.log-progress__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--ui-muted);
  font-size: calc(11px * var(--ui-font-scale));
}

.log-progress__meta span:last-child {
  text-align: right;
}

.log-line--warn .log-msg { color: #f59e0b; }
.log-line--error .log-msg { color: var(--ui-danger); }

/* ── Settings ── */
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.setting-row:last-child { border-bottom: none; }

.setting-label {
  flex: 1;
  min-width: 0;
}

.setting-label strong {
  display: block;
  color: var(--ui-text);
  font-size: calc(14px * var(--ui-font-scale));
}

.setting-label p {
  margin: 4px 0 0;
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
  line-height: 1.4;
}

.setting-select,
.setting-input {
  min-height: 38px;
  padding: 0 12px;
  border-radius: calc(10px * var(--ui-radius-scale));
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  color: var(--ui-text);
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 600;
}

.setting-input { width: 80px; text-align: center; }

.setting-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.setting-unit {
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
}

.about-text p {
  margin: 0 0 10px;
  color: var(--ui-muted);
  line-height: 1.55;
}

/* ── Buttons ── */
.detail-loading,
.extra-top { margin-top: 12px; }

.guide-text p,
.error-text {
  margin: 0 0 10px;
  line-height: 1.55;
}

.error-text {
  color: var(--ui-danger);
  font-weight: 600;
}

.ghost-btn,
.primary-btn,
.warning-btn,
.danger-btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.ghost-btn:hover,
.primary-btn:hover,
.warning-btn:hover,
.danger-btn:hover { transform: translateY(-1px); }

.ghost-btn:disabled,
.primary-btn:disabled,
.warning-btn:disabled,
.danger-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.ghost-btn {
  color: var(--ui-text);
  border-color: rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
}

.primary-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  box-shadow: 0 6px 16px color-mix(in oklab, var(--ui-primary) 24%, transparent);
}

.warning-btn {
  color: #fff;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.24);
}

.danger-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--ui-danger), #dc2626);
  box-shadow: 0 6px 16px color-mix(in oklab, var(--ui-danger) 24%, transparent);
}

@media (max-width: 760px) {
  .status-grid { grid-template-columns: 1fr; }
  .speed-grid { grid-template-columns: 1fr; }
  .progress-summary { grid-template-columns: repeat(2, 1fr); }

  .status-head,
  .course-card__head,
  .detail-head,
  .outline-section__head,
  .task-row,
  .setting-row { flex-direction: column; }
}
</style>
