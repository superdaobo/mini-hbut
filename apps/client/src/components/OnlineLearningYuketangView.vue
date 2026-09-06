<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'
import { useAutoLearning, SPEED_MODES } from '../utils/auto_learning'
// #792：学习通域文案英文化（t() 响应式取词；SPEED_MODES 文案经 onlinelearning.speed.* 映射）
import { useLocale } from '../utils/app_i18n'
import { TCard, TEmptyState, TModal, TPageHeader, TSection, TStatusBadge } from './templates'

const { t } = useLocale()

/** 带占位符的插值：{n}/{i}/{d} 等按序替换，供 i18n 字典参数化文案使用 */
const tFmt = (key, params = {}) =>
  Object.entries(params).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    t(key)
  )

/** SPEED_MODES 的展示文案映射（label/desc 来自 i18n 字典，icon/risk 保留原始数据） */
const speedModeView = (mode, key) => ({
  ...mode,
  label: t(`onlinelearning.speed.${key}.label`),
  desc: t(`onlinelearning.speed.${key}.desc`)
})

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

/* ── Tab 系统 ── */
const activeTab = ref('overview')
const TABS = [
  { key: 'overview', label: t('onlinelearning.tab.overview'), icon: '📊' },
  { key: 'auto',     label: t('onlinelearning.tab.auto'), icon: '🤖' },
  { key: 'settings', label: t('onlinelearning.tab.settings'), icon: '⚙️' }
]

/* ── 原有状态 ── */

const loading = ref(true)
const refreshing = ref(false)
const detailLoading = ref(false)
const qrBusy = ref(false)
const error = ref('')
const statusMeta = ref({})
const courses = ref([])
const selectedCourseId = ref('')
const outline = ref([])
const progress = ref({})

const showQrModal = ref(false)
const qrSession = ref({})
let qrPollTimer = null

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
  if (/(connected|ready|已连接|可用|success|ok|logged)/.test(text)) return 'success'
  if (/(cache|offline|缓存|离线)/.test(text)) return 'warning'
  if (/(sync|running|pending|二维码|扫码中|等待)/.test(text)) return 'info'
  if (/(expired|需登录|未连接|error|fail)/.test(text)) return 'danger'
  return 'muted'
}

const resolveTaskType = (value) => {
  const text = safeText(value).toLowerCase()
  if (/(video|视频)/.test(text)) return { text: t('onlinelearning.taskVideo'), type: 'info' }
  if (/(exam|quiz|测试)/.test(text)) return { text: t('onlinelearning.taskQuiz'), type: 'warning' }
  if (/(discussion|讨论)/.test(text)) return { text: t('onlinelearning.taskDiscussion'), type: 'primary' }
  if (/(homework|作业)/.test(text)) return { text: t('onlinelearning.taskHomework'), type: 'danger' }
  return { text: safeText(value) || t('onlinelearning.taskFallback'), type: 'muted' }
}

const normalizeCourse = (item = {}) => {
  const raw = item && typeof item === 'object' ? item : {}
  return {
    id: safeText(raw.id || raw.classroom_id || raw.classroomId || raw.course_id || raw.courseId),
    classroomId: safeText(raw.classroom_id || raw.classroomId || raw.id || ''),
    sign: safeText(raw.sign || raw.university_id || raw.universityId || ''),
    title: safeText(raw.title || raw.name || raw.course_name || raw.courseName || t('onlinelearning.unnamedCourse')),
    teacher: safeText(raw.teacher || raw.teacher_name || raw.teacherName || raw.instructor || ''),
    progressText: safeText(raw.progress_text || raw.progressText || raw.progress || raw.schedule_text || ''),
    progressRate: safeNumber(raw.progress_rate ?? raw.progressRate ?? raw.percent),
    pendingCount: safeNumber(raw.pending_count ?? raw.todo_count ?? raw.unfinished_count),
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
      : Array.isArray(raw.leaf_list)
        ? raw.leaf_list
        : []
  return {
    id: safeText(raw.id || raw.section_id || raw.sectionId || raw.chapter_id || raw.chapterId),
    title: safeText(raw.title || raw.name || raw.label || t('onlinelearning.unnamedChapter')),
    tasks: taskList.map((task) => {
      const node = task && typeof task === 'object' ? task : {}
      return {
        id: safeText(node.id || node.task_id || node.taskId || node.leaf_id || node.leafId),
        title: safeText(node.title || node.name || node.label || t('onlinelearning.unnamedTask')),
        typeMeta: resolveTaskType(node.type || node.task_type || node.leaf_type || node.label_type),
        status: safeText(node.status || node.state || node.progress_text || node.progressText || ''),
        progress: safeText(node.progress || node.progress_text || node.progressText || ''),
        raw: node
      }
    })
  }
}

const selectedCourse = computed(() => courses.value.find((item) => item.id === selectedCourseId.value) || null)
const sessionConnected = computed(() => {
  if (statusMeta.value?.connected === true) return true
  const text = safeText(statusMeta.value.status || statusMeta.value.connection_status || statusMeta.value.state).toLowerCase()
  return /(connected|ready|已连接|success|ok|logged)/.test(text)
})

const stopQrPolling = () => {
  if (qrPollTimer) {
    clearInterval(qrPollTimer)
    qrPollTimer = null
  }
}

const loadCourses = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const courseRes = await axios.post(`${API_BASE}/v2/yuketang/courses`, {
      student_id: props.studentId || ''
    })
    const payload = courseRes?.data || {}
    if (payload?.success === false) {
      throw new Error(payload?.error || t('onlinelearning.errYuketangCourses'))
    }
    const data = unwrapPayload(payload)
    statusMeta.value = data && typeof data === 'object' ? (data.platform_status || data.status || data) : {}
    const rawList = Array.isArray(data?.courses)
      ? data.courses
      : Array.isArray(data)
        ? data
        : []
    courses.value = rawList.map(normalizeCourse).filter((item) => item.id)

    if (!selectedCourseId.value && courses.value.length) {
      selectedCourseId.value = courses.value[0].id
      await loadCourseDetail(selectedCourseId.value)
    } else if (selectedCourseId.value) {
      await loadCourseDetail(selectedCourseId.value)
    }
  } catch (err) {
    error.value = safeText(err?.message || err) || t('onlinelearning.errYuketangCourses')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const loadCourseDetail = async (courseId) => {
  const current = courses.value.find((item) => item.id === courseId)
  if (!current?.classroomId) return
  detailLoading.value = true
  try {
    const [outlineRes, progressRes] = await Promise.all([
      axios.post(`${API_BASE}/v2/yuketang/course_outline`, {
        student_id: props.studentId || '',
        classroom_id: current.classroomId,
        sign: current.sign
      }),
      axios.post(`${API_BASE}/v2/yuketang/course_progress`, {
        student_id: props.studentId || '',
        classroom_id: current.classroomId
      })
    ])

    const outlineData = unwrapPayload(outlineRes?.data || {})
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
    progress.value = unwrapPayload(progressRes?.data || {}) || {}
  } catch (err) {
    error.value = safeText(err?.message || err) || t('onlinelearning.errYuketangDetail')
  } finally {
    detailLoading.value = false
  }
}

const refreshAll = async () => {
  refreshing.value = true
  await loadCourses({ silent: true })
}

const selectCourse = async (courseId) => {
  if (!safeText(courseId) || selectedCourseId.value === courseId) return
  selectedCourseId.value = courseId
  await loadCourseDetail(courseId)
}

const startQrLogin = async () => {
  qrBusy.value = true
  error.value = ''
  stopQrPolling()
  try {
    const res = await axios.post(`${API_BASE}/v2/yuketang/qr_login/create`, {
      student_id: props.studentId || ''
    })
    const payload = res?.data || {}
    if (payload?.success === false) {
      throw new Error(payload?.error || t('onlinelearning.errQrCreate'))
    }
    qrSession.value = unwrapPayload(payload) || {}
    showQrModal.value = true
    qrPollTimer = setInterval(() => {
      void pollQrStatus()
    }, 2500)
  } catch (err) {
    error.value = safeText(err?.message || err) || t('onlinelearning.errQrCreate')
  } finally {
    qrBusy.value = false
  }
}

const pollQrStatus = async () => {
  const sessionId = safeText(qrSession.value.session_id || qrSession.value.sessionId || qrSession.value.id)
  if (!sessionId) return
  try {
    const res = await axios.post(`${API_BASE}/v2/yuketang/qr_login/poll`, {
      student_id: props.studentId || '',
      session_id: sessionId
    })
    const payload = res?.data || {}
    if (payload?.success === false) {
      throw new Error(payload?.error || t('onlinelearning.errQrPoll'))
    }
    const next = unwrapPayload(payload) || {}
    qrSession.value = { ...qrSession.value, ...next }
    const status = safeText(next.status || next.state || '')
    if (/(success|connected|logged|confirmed|done|已登录)/i.test(status)) {
      stopQrPolling()
      showQrModal.value = false
      await loadCourses({ silent: true })
      return
    }
    if (/(expired|cancel|failed|timeout|失效|取消)/i.test(status)) {
      stopQrPolling()
    }
  } catch (err) {
    stopQrPolling()
    error.value = safeText(err?.message || err) || t('onlinelearning.errQrPoll')
  }
}

const closeQrModal = () => {
  stopQrPolling()
  showQrModal.value = false
}

/* ── 自动学习 ── */
const auto = useAutoLearning('yuketang')

const handleStartAuto = () => {
  if (auto.running.value) return
  auto.runYuketangAuto(props.studentId, courses.value)
}

const toggleCourseSelect = (courseId) => {
  const idx = auto.config.selectedCourseIds.indexOf(courseId)
  if (idx >= 0) auto.config.selectedCourseIds.splice(idx, 1)
  else auto.config.selectedCourseIds.push(courseId)
}
const isCourseSelected = (courseId) => auto.config.selectedCourseIds.includes(courseId)

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
  if (safeNumber(log?.totalCourses) > 0) parts.push(tFmt('onlinelearning.logCourse', { i: safeNumber(log?.courseIndex), n: safeNumber(log?.totalCourses) }))
  if (safeNumber(log?.totalVideos) > 0) parts.push(tFmt('onlinelearning.logVideo', { i: safeNumber(log?.videoIndex), n: safeNumber(log?.totalVideos) }))
  return parts.join(' · ') || t('onlinelearning.execProgress')
}
const resolveLogVideoLabel = (log, idx) => {
  const liveVideoName = idx === 0 && auto.running.value ? safeText(auto.progress.currentVideoName) : ''
  return liveVideoName || safeText(log?.videoName) || t('onlinelearning.currentVideo')
}

onMounted(() => {
  void loadCourses()
})

onBeforeUnmount(() => {
  stopQrPolling()
})
</script>

<template>
  <div class="online-view">
    <TPageHeader title="长江雨课堂" @back="emit('back')">
      <template #actions>
        <div class="header-actions">
          <button class="ghost-btn" :disabled="refreshing" @click="refreshAll">
            {{ refreshing ? t('onlinelearning.refreshing') : t('onlinelearning.refresh') }}
          </button>
          <button class="primary-btn" @click="startQrLogin">
            {{ qrBusy ? t('onlinelearning.preparing') : t('onlinelearning.scanToLogin') }}
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
              <strong>{{ t('onlinelearning.status') }}</strong>
              <p>{{ t('onlinelearning.statusYuketangDesc') }}</p>
            </div>
            <TStatusBadge
              :type="resolveBadgeType(statusMeta.status || statusMeta.connection_status || statusMeta.state)"
              :text="statusMeta.status || statusMeta.connection_status || statusMeta.state || t('onlinelearning.notConnected')"
            />
          </div>
        </template>

        <div class="status-grid">
          <div class="status-chip">
            <span>{{ t('onlinelearning.courseCount') }}</span>
            <strong>{{ courses.length }}</strong>
          </div>
          <div class="status-chip">
            <span>{{ t('onlinelearning.lastSync') }}</span>
            <strong>{{ statusMeta.last_sync || statusMeta.sync_time || t('onlinelearning.notSynced') }}</strong>
          </div>
          <div class="status-chip">
            <span>{{ t('onlinelearning.dataSource') }}</span>
            <strong>{{ statusMeta.offline ? t('onlinelearning.cachedData') : t('onlinelearning.liveData') }}</strong>
          </div>
        </div>

        <p v-if="error" class="error-text">{{ error }}</p>
      </TCard>

      <TEmptyState v-if="loading" type="loading" :message="t('onlinelearning.loadingYuketangCourses')" />

      <template v-else>
        <TEmptyState
          v-if="!sessionConnected && !courses.length"
          type="empty"
          :message="t('onlinelearning.noSessionYuketang')"
        >
          <button class="primary-btn extra-top" @click="startQrLogin">{{ t('onlinelearning.scanToLogin') }}</button>
        </TEmptyState>

        <template v-else>
          <TSection :title="t('onlinelearning.courseList')" icon="🎓">
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
                      <p>{{ course.teacher || t('onlinelearning.teacherMissing') }}</p>
                    </div>
                    <TStatusBadge
                      :type="course.pendingCount > 0 ? 'warning' : 'success'"
                      :text="course.pendingCount > 0 ? tFmt('onlinelearning.pendingYkN', { n: course.pendingCount }) : t('onlinelearning.tracked')"
                    />
                  </div>
                </template>

                <div class="course-meta">
                  <span>{{ course.progressText || t('onlinelearning.noOfficialProgress') }}</span>
                  <strong v-if="course.progressRate > 0">{{ course.progressRate }}%</strong>
                </div>
              </TCard>
            </div>
          </TSection>

          <TSection :title="t('onlinelearning.chapterTasks')" icon="🎬">
            <TCard compact>
              <template v-if="selectedCourse">
                <div class="detail-head">
                  <div>
                    <strong>{{ selectedCourse.title }}</strong>
                    <p>{{ selectedCourse.teacher || t('onlinelearning.teacherMissing') }}</p>
                  </div>
                  <div class="detail-badges">
                    <TStatusBadge
                      type="info"
                      :text="progress.progress_text || progress.summary || selectedCourse.progressText || t('onlinelearning.officialProgress')"
                    />
                    <TStatusBadge
                      :type="progress.offline || statusMeta.offline ? 'warning' : 'success'"
                      :text="progress.offline || statusMeta.offline ? t('onlinelearning.cachedData') : t('onlinelearning.liveData')"
                    />
                  </div>
                </div>

                <div v-if="detailLoading" class="detail-loading">
                  <TEmptyState type="loading" :message="t('onlinelearning.loadingOutline')" />
                </div>

                <div v-else-if="outline.length" class="outline-list">
                  <section v-for="section in outline" :key="section.id || section.title" class="outline-section">
                    <header class="outline-section__head">
                      <strong>{{ section.title }}</strong>
                      <span>{{ tFmt('onlinelearning.taskCount', { n: section.tasks.length }) }}</span>
                    </header>
                    <article v-for="task in section.tasks" :key="task.id || task.title" class="task-row">
                      <div class="task-row__main">
                        <strong>{{ task.title }}</strong>
                        <p>{{ task.status || task.progress || t('onlinelearning.taskWaitClass') }}</p>
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
                  :message="t('onlinelearning.noOutlineYuketang')"
                />
              </template>
              <TEmptyState v-else type="empty" :message="t('onlinelearning.pickCourse')" />
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
                <strong>{{ t('onlinelearning.autoTitle') }}</strong>
                <p>{{ t('onlinelearning.autoYuketangDesc') }}</p>
              </div>
              <TStatusBadge
                :type="auto.running.value ? 'info' : auto.progress.phase === 'done' ? 'success' : auto.progress.phase === 'error' ? 'danger' : 'muted'"
                :text="auto.running.value ? (auto.paused.value ? t('onlinelearning.statePaused') : t('onlinelearning.stateRunning')) : auto.progress.phase === 'done' ? t('onlinelearning.stateDone') : auto.progress.phase === 'error' ? t('onlinelearning.stateError') : t('onlinelearning.stateReady')"
              />
            </div>
          </template>
        </TCard>

        <TSection :title="t('onlinelearning.speedMode')" icon="⚡">
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
              <strong>{{ speedModeView(mode, key).label }}</strong>
              <p>{{ speedModeView(mode, key).desc }}</p>
              <span class="speed-risk" :style="{ color: riskColor(mode.risk) }">
                {{ mode.risk === 'high' ? t('onlinelearning.riskHigh') : mode.risk === 'medium' ? t('onlinelearning.riskMedium') : t('onlinelearning.riskLow') }}
              </span>
            </button>
          </div>
        </TSection>

        <TSection :title="t('onlinelearning.courseSelect')" icon="📚">
          <TCard compact>
            <div class="select-all-row">
              <label class="checkbox-label">
                <input type="checkbox" v-model="auto.config.allCourses" :disabled="auto.running.value" />
                <span>{{ tFmt('onlinelearning.allCoursesN', { n: courses.length }) }}</span>
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
                  <span>{{ course.teacher || t('onlinelearning.teacherMissingShort') }} · {{ course.progressText || t('onlinelearning.noProgress') }}</span>
                </div>
              </label>
            </div>
            <TEmptyState v-if="!courses.length" type="empty" :message="t('onlinelearning.pickCoursesFirst')" />
          </TCard>
        </TSection>

        <div class="auto-controls">
          <button
            v-if="!auto.running.value"
            class="primary-btn auto-btn"
            :disabled="!sessionConnected || !courses.length || (!auto.config.allCourses && !auto.config.selectedCourseIds.length)"
            @click="handleStartAuto"
          >
            {{ t('onlinelearning.startAuto') }}
          </button>
          <template v-else>
            <button class="warning-btn auto-btn" @click="auto.togglePause()">
              {{ auto.paused.value ? t('onlinelearning.resume') : t('onlinelearning.pause') }}
            </button>
            <button class="danger-btn auto-btn" @click="auto.stopAuto()">
              {{ t('onlinelearning.stop') }}
            </button>
          </template>
        </div>

        <TSection v-if="auto.progress.phase" :title="t('onlinelearning.execProgress')" icon="📈">
          <TCard compact>
            <div class="progress-summary">
              <div class="progress-stat">
                <span>{{ t('onlinelearning.statCourses') }}</span>
                <strong>{{ auto.progress.currentCourseIndex }} / {{ auto.progress.totalCourses }}</strong>
              </div>
              <div class="progress-stat">
                <span>{{ t('onlinelearning.statVideos') }}</span>
                <strong>{{ auto.progress.currentVideoIndex }} / {{ auto.progress.totalVideos }}</strong>
              </div>
              <div class="progress-stat">
                <span>{{ t('onlinelearning.statDone') }}</span>
                <strong class="text-success">{{ auto.stats.videosCompleted }}</strong>
              </div>
              <div class="progress-stat">
                <span>{{ t('onlinelearning.statFailed') }}</span>
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
              <p>{{ tFmt('onlinelearning.totalTime', { d: auto.formatDuration(auto.stats.totalTime) }) }}</p>
            </div>
          </TCard>
        </TSection>

        <TSection v-if="auto.progress.logs.length" :title="t('onlinelearning.execLog')" icon="📋">
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
        <TSection :title="t('onlinelearning.speedDefaults')" icon="⚡">
          <TCard compact>
            <div class="setting-row">
              <div class="setting-label">
                <strong>{{ t('onlinelearning.defaultSpeedMode') }}</strong>
                <p>{{ t('onlinelearning.defaultSpeedDesc') }}</p>
              </div>
              <select class="setting-select" v-model="auto.config.speedMode">
                <option v-for="(mode, key) in SPEED_MODES" :key="key" :value="key">
                  {{ mode.icon }} {{ speedModeView(mode, key).label }}
                </option>
              </select>
            </div>
          </TCard>
        </TSection>

        <TSection :title="t('onlinelearning.heartbeatParams')" icon="🔧">
          <TCard compact>
            <div class="setting-row">
              <div class="setting-label">
                <strong>{{ t('onlinelearning.heartbeatInterval') }}</strong>
                <p>{{ t('onlinelearning.heartbeatIntervalDesc') }}</p>
              </div>
              <div class="setting-input-wrap">
                <input type="number" class="setting-input" v-model.number="auto.config.yk_heartbeatInterval" min="1" max="30" step="1" />
                <span class="setting-unit">{{ t('onlinelearning.secondsUnit') }}</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-label">
                <strong>{{ t('onlinelearning.batchSize') }}</strong>
                <p>{{ t('onlinelearning.batchSizeDesc') }}</p>
              </div>
              <div class="setting-input-wrap">
                <input type="number" class="setting-input" v-model.number="auto.config.yk_batchSize" min="1" max="20" step="1" />
              </div>
            </div>
          </TCard>
        </TSection>

        <TSection :title="t('onlinelearning.about')" icon="ℹ️">
          <TCard compact>
            <div class="about-text">
              <p>{{ t('onlinelearning.aboutYk1') }}</p>
              <p><strong>{{ t('onlinelearning.aboutCx2Label') }}</strong>: {{ t('onlinelearning.aboutYk2Text') }}</p>
              <p><strong>{{ t('onlinelearning.aboutCx3Label') }}</strong>: {{ t('onlinelearning.aboutYk3Text') }}</p>
            </div>
          </TCard>
        </TSection>
      </template>

    </div>

    <TModal :visible="showQrModal" :title="t('onlinelearning.qrModalTitle')" width="420px" @close="closeQrModal">
      <div class="qr-panel">
        <div class="qr-image-wrap">
          <img
            v-if="qrSession.qr_image_base64 || qrSession.qrImageBase64"
            class="qr-image"
            :src="qrSession.qr_image_base64 || qrSession.qrImageBase64"
            :alt="t('onlinelearning.qrImageAlt')"
          />
          <img
            v-else-if="qrSession.qr_code_url || qrSession.qrCodeUrl"
            class="qr-image"
            :src="qrSession.qr_code_url || qrSession.qrCodeUrl"
            :alt="t('onlinelearning.qrImageAlt')"
          />
          <TEmptyState v-else type="loading" :message="t('onlinelearning.preparingQr')" />
        </div>
        <div class="qr-meta">
          <TStatusBadge
            :type="resolveBadgeType(qrSession.status || qrSession.state || '扫码中')"
            :text="qrSession.status || qrSession.state || t('onlinelearning.waitingScan')"
          />
          <p>{{ t('onlinelearning.qrHint') }}</p>
          <p v-if="qrSession.expires_at || qrSession.expire_at">{{ t('onlinelearning.expiresPrefix') }}{{ qrSession.expires_at || qrSession.expire_at }}</p>
        </div>
      </div>
      <template #footer>
        <button class="ghost-btn" @click="closeQrModal">{{ t('onlinelearning.close') }}</button>
        <button class="primary-btn" :disabled="qrBusy" @click="startQrLogin">
          {{ qrBusy ? t('onlinelearning.rebuilding') : t('onlinelearning.rebuildQr') }}
        </button>
      </template>
    </TModal>
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

.header-actions,
.detail-badges,
.platform-actions {
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
.qr-meta p {
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

.tab-item--active { color: #fff; }
.tab-icon { font-size: 16px; }

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

/* ── QR ── */
.qr-panel {
  display: grid;
  gap: 14px;
}

.qr-image-wrap {
  display: grid;
  place-items: center;
  min-height: 220px;
  padding: 16px;
  border-radius: calc(20px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  border: 1px dashed rgba(148, 163, 184, 0.28);
}

.qr-image {
  width: min(240px, 100%);
  border-radius: 16px;
  object-fit: contain;
  background: #fff;
}

/* ── Buttons ── */
.detail-loading,
.extra-top { margin-top: 12px; }

.error-text {
  margin: 12px 0 0;
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
