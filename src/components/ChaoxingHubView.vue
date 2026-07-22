<script setup>
/**
 * 学习通课程中心
 * - 封面 / 进度 / 教师
 * - 一级：课程列表
 * - 二级：章节
 * - 三级：任务点
 * - 打开官方课程、刷新会话
 */
import { computed, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import { showToast } from '../utils/toast'
import {
  TPageHeader,
  TEmptyState,
  TStatusBadge
} from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})
const emit = defineEmits(['back'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const loading = ref(true)
const refreshing = ref(false)
const detailLoading = ref(false)
const taskLoading = ref(false)
const scoreLoading = ref(false)
const error = ref('')
const courses = ref([])
const selectedId = ref('')
const outline = ref([])
const progress = ref({})
const scoreData = ref(null)
const statusMeta = ref({})
const searchQuery = ref('')
const viewMode = ref('list') // list | detail
const expandedSections = ref({})
const activeDetailTab = ref('chapters') // chapters | score | progress
/** knowledgeId -> { tasks, fid, reportUrl, userid } */
const knowledgeCache = ref({})
const activeKnowledgeId = ref('')
/** 应用内视频播放器 */
const videoPlayer = ref({
  open: false,
  title: '',
  src: '',
  poster: '',
  loading: false,
  error: ''
})

const DETAIL_TABS = [
  { key: 'chapters', label: '章节任务', icon: 'account_tree' },
  { key: 'score', label: '成绩组成', icon: 'grade' },
  { key: 'progress', label: '学习进度', icon: 'trending_up' }
]

const safeText = (v) => String(v ?? '').trim()
const safeNumber = (v, fb = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}
const unwrap = (payload) => {
  if (payload && typeof payload === 'object' && payload.data && !Array.isArray(payload.data)) {
    return payload.data
  }
  return payload
}

const normalizeCourse = (item = {}) => {
  const raw = item && typeof item === 'object' ? item : {}
  const courseId = safeText(raw.course_id || raw.courseId || raw.courseid || '')
  const clazzId = safeText(raw.clazz_id || raw.clazzId || raw.clazzid || '')
  const cpi = safeText(raw.cpi || '')
  return {
    id: safeText(raw.id || `${courseId}:${clazzId}` || cpi),
    courseId,
    clazzId,
    cpi,
    title: safeText(raw.title || raw.name || raw.course_name || raw.courseName || '未命名课程'),
    teacher: safeText(raw.teacher || raw.teacher_name || raw.teacherName || raw.teacherfactor || ''),
    imageUrl: safeText(
      raw.image_url || raw.imageUrl || raw.imageurl || raw.cover || raw.cover_url || raw.img || ''
    ),
    progressText: safeText(
      raw.progress_text || raw.progressText || raw.progress || raw.schedule_text || ''
    ),
    progressRate: safeNumber(
      raw.progress_rate ?? raw.progressRate ?? raw.progress_percent ?? raw.progressPercent ?? raw.percent
    ),
    pendingCount: safeNumber(raw.pending_count ?? raw.pendingCount ?? raw.todo_count ?? 0),
    courseUrl: safeText(raw.url || raw.course_url || raw.courseUrl || ''),
    roleLabel: safeText(raw.role_label || raw.roleLabel || ''),
    raw
  }
}

const resolveTaskType = (value) => {
  const text = safeText(value).toLowerCase()
  if (/(video|视频)/.test(text)) return { text: '视频', type: 'info' }
  if (/(audio|音频)/.test(text)) return { text: '音频', type: 'primary' }
  if (/(ppt|book|阅读|文档|章节)/.test(text)) return { text: '阅读', type: 'warning' }
  if (/(work|作业|exam|测验|测试)/.test(text)) return { text: '作业', type: 'danger' }
  if (/(link|链接)/.test(text)) return { text: '链接', type: 'muted' }
  return { text: safeText(value) || '任务', type: 'muted' }
}

const normalizeTask = (node = {}) => {
  const raw = node && typeof node === 'object' ? node : {}
  const knowledgeId = safeText(raw.knowledge_id || raw.knowledgeId || '')
  const childrenRaw = Array.isArray(raw.tasks)
    ? raw.tasks
    : Array.isArray(raw.children)
      ? raw.children
      : Array.isArray(raw.points)
        ? raw.points
        : Array.isArray(raw.list)
          ? raw.list
          : []
  const typeRaw = raw.type || raw.task_type || raw.job_type || raw.label_type || raw.card_type || ''
  // knowledge 叶子本身是可展开章节点
  const isKnowledge = typeRaw === 'knowledge' || (!!knowledgeId && childrenRaw.length === 0 && !raw.objectId && !raw.object_id)
  return {
    id: safeText(raw.id || raw.task_id || raw.taskId || knowledgeId || raw.jobid),
    title: safeText(raw.title || raw.name || raw.label || '未命名任务'),
    status: safeText(
      raw.status ||
        raw.state ||
        raw.progress_text ||
        raw.progressText ||
        (raw.completed || raw.isPassed ? '已完成' : '')
    ),
    progress: safeText(raw.progress || ''),
    completed: !!(raw.completed || raw.isPassed),
    knowledgeId,
    objectId: safeText(raw.objectId || raw.object_id || ''),
    jobid: safeText(raw.jobid || raw.jobId || ''),
    typeMeta: isKnowledge
      ? { text: '章节', type: 'info' }
      : resolveTaskType(typeRaw),
    isKnowledge,
    // 附件任务禁止外链字段
    children: childrenRaw.map(normalizeTask)
  }
}

const normalizeSection = (item = {}) => {
  const raw = item && typeof item === 'object' ? item : {}
  // 后端已返回 { title, tasks: knowledge[] }；若误把 knowledge 当 section，则包一层
  let taskList = Array.isArray(raw.tasks)
    ? raw.tasks
    : Array.isArray(raw.children)
      ? raw.children
      : Array.isArray(raw.points)
        ? raw.points
        : Array.isArray(raw.list)
          ? raw.list
          : []
  // 扁平 nodes：每个 node 是 knowledge 叶子
  if (!taskList.length && (raw.knowledge_id || raw.knowledgeId || raw.task_type === 'knowledge')) {
    taskList = [raw]
  }
  return {
    id: safeText(raw.id || raw.section_id || raw.sectionId || raw.chapter_id || raw.chapterId),
    title: safeText(raw.title || raw.name || raw.label || '未命名章节'),
    tasks: taskList.map(normalizeTask)
  }
}

const selected = computed(() => courses.value.find((c) => c.id === selectedId.value) || null)

const filteredCourses = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return courses.value
  return courses.value.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.teacher.toLowerCase().includes(q)
  )
})

const sessionConnected = computed(() => {
  if (statusMeta.value?.connected === true) return true
  const t = safeText(statusMeta.value.status || statusMeta.value.connection_status || statusMeta.value.state).toLowerCase()
  return /(connected|ready|已连接|可用|success|ok)/.test(t)
})

const badgeType = computed(() => {
  if (sessionConnected.value) return 'success'
  if (courses.value.length) return 'warning'
  return 'muted'
})

const badgeText = computed(() => {
  if (sessionConnected.value) return '会话可用'
  if (courses.value.length) return '缓存/部分可用'
  return statusMeta.value.status || '未连接'
})

const totalPending = computed(() =>
  courses.value.reduce((sum, c) => sum + (c.pendingCount || 0), 0)
)

const loadList = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  else refreshing.value = true
  error.value = ''
  try {
    const [statusRes, courseRes] = await Promise.all([
      axios.post(`${API_BASE}/v2/chaoxing/session_status`, { student_id: props.studentId || '' }),
      axios.post(`${API_BASE}/v2/chaoxing/courses`, { student_id: props.studentId || '' })
    ])
    const statusPayload = statusRes?.data || {}
    const coursePayload = courseRes?.data || {}
    if (statusPayload?.success === false) {
      throw new Error(statusPayload?.error || '会话状态失败')
    }
    if (coursePayload?.success === false) {
      throw new Error(coursePayload?.error || '课程列表失败')
    }
    statusMeta.value = unwrap(statusPayload) || {}
    const data = unwrap(coursePayload)
    const list = Array.isArray(data?.courses) ? data.courses : Array.isArray(data) ? data : []
    courses.value = list.map(normalizeCourse).filter((c) => c.id && c.courseId)
    if (!selectedId.value && courses.value.length) {
      selectedId.value = courses.value[0].id
    }
    if (selectedId.value && viewMode.value === 'detail') {
      await loadDetail(selectedId.value)
    }
  } catch (e) {
    error.value = safeText(e?.message || e) || '加载失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const loadDetail = async (id) => {
  const cur = courses.value.find((c) => c.id === id)
  if (!cur?.courseId || !cur?.clazzId) {
    outline.value = []
    progress.value = {}
    return
  }
  detailLoading.value = true
  knowledgeCache.value = {}
  activeKnowledgeId.value = ''
  scoreData.value = null
  try {
    const [outlineRes, progressRes] = await Promise.all([
      axios.post(`${API_BASE}/v2/chaoxing/course_outline`, {
        student_id: props.studentId || '',
        course_id: cur.courseId,
        clazz_id: cur.clazzId,
        cpi: cur.cpi,
        course_url: cur.courseUrl || '',
        force: true
      }),
      axios.post(`${API_BASE}/v2/chaoxing/course_progress`, {
        student_id: props.studentId || '',
        course_id: cur.courseId,
        clazz_id: cur.clazzId,
        cpi: cur.cpi,
        course_url: cur.courseUrl || '',
        force: true
      })
    ])
    const outlineData = unwrap(outlineRes?.data)
    let sectionList = Array.isArray(outlineData?.sections)
      ? outlineData.sections
      : Array.isArray(outlineData?.outline)
        ? outlineData.outline
        : []
    // 仅有 nodes：整合成一个章节
    if (!sectionList.length && Array.isArray(outlineData?.nodes)) {
      sectionList = [{ id: 'all', title: '全部章节', tasks: outlineData.nodes }]
    }
    outline.value = sectionList.map(normalizeSection).filter((s) => s.title || s.tasks?.length)
    const nextExpand = {}
    outline.value.slice(0, 3).forEach((s, i) => {
      nextExpand[s.id || `sec-${i}`] = true
    })
    expandedSections.value = nextExpand
    progress.value = unwrap(progressRes?.data) || {}
  } catch (e) {
    showToast(safeText(e?.message || e) || '详情加载失败')
    outline.value = []
  } finally {
    detailLoading.value = false
  }
}

/** 展开知识点：应用内拉取 cards（视频/文档），禁止外链 */
const loadKnowledgeTasks = async (task) => {
  const cur = selected.value
  const kid = task?.knowledgeId || task?.id
  if (!cur || !kid) return
  activeKnowledgeId.value = kid
  if (knowledgeCache.value[kid]?.tasks?.length) return
  taskLoading.value = true
  try {
    const res = await axios.post(`${API_BASE}/v2/chaoxing/knowledge_cards`, {
      student_id: props.studentId || '',
      course_id: cur.courseId,
      clazz_id: cur.clazzId,
      knowledge_id: kid,
      cpi: cur.cpi || ''
    })
    const data = unwrap(res?.data) || {}
    if (data.success === false) throw new Error(data.error || '任务点加载失败')
    const list = Array.isArray(data.tasks)
      ? data.tasks
      : Array.isArray(data.attachments)
        ? data.attachments
        : Array.isArray(data.videos)
          ? data.videos
          : []
    knowledgeCache.value = {
      ...knowledgeCache.value,
      [kid]: {
        tasks: list.map(normalizeTask),
        fid: safeText(data.fid || ''),
        reportUrl: safeText(data.reportUrl || data.report_url || ''),
        userid: safeText(data.userid || '')
      }
    }
  } catch (e) {
    showToast(safeText(e?.message || e) || '任务点加载失败')
    knowledgeCache.value = {
      ...knowledgeCache.value,
      [kid]: { tasks: [], fid: '', reportUrl: '', userid: '' }
    }
  } finally {
    taskLoading.value = false
  }
}

const openTaskLink = async (task) => {
  // 知识点：展开/收起并拉取子任务
  if (task?.isKnowledge || task?.typeMeta?.text === '章节') {
    const kid = task?.knowledgeId || task?.id
    if (activeKnowledgeId.value === kid) {
      activeKnowledgeId.value = ''
      return
    }
    await loadKnowledgeTasks(task)
    return
  }
  // 视频：应用内播放
  if (task?.typeMeta?.text === '视频' || task?.objectId) {
    await playVideoInApp(task)
    return
  }
  showToast('该任务类型暂仅展示信息，文档预览后续接入')
}

/** 应用内视频：请求 ananas/status 拿直链，不外跳 */
const playVideoInApp = async (task) => {
  const objectId = safeText(task?.objectId || task?.object_id)
  if (!objectId) {
    showToast('缺少视频 objectId')
    return
  }
  const kid = activeKnowledgeId.value
  const meta = knowledgeCache.value[kid] || {}
  let fid = meta.fid
  videoPlayer.value = {
    open: true,
    title: task.title || '视频',
    src: '',
    poster: '',
    loading: true,
    error: ''
  }
  try {
    // fid 可能为空，先 cards 再试
    if (!fid && kid && selected.value) {
      await loadKnowledgeTasks({ knowledgeId: kid, id: kid, isKnowledge: true })
      fid = knowledgeCache.value[kid]?.fid || ''
    }
    const res = await axios.post(`${API_BASE}/v2/chaoxing/video_status`, {
      student_id: props.studentId || '',
      object_id: objectId,
      fid: fid || '0'
    })
    const data = unwrap(res?.data)
    const st = data?.data || data || {}
    const src = safeText(st.http || st.hd || st.mp3 || '')
    if (!src) throw new Error(st.status === 'failed' ? '视频资源不可用' : '未返回播放地址')
    videoPlayer.value = {
      open: true,
      title: task.title || st.filename || '视频',
      src,
      poster: safeText(st.screenshot || ''),
      loading: false,
      error: ''
    }
  } catch (e) {
    videoPlayer.value = {
      ...videoPlayer.value,
      loading: false,
      error: safeText(e?.message || e) || '视频加载失败'
    }
  }
}

const closeVideo = () => {
  videoPlayer.value = { open: false, title: '', src: '', poster: '', loading: false, error: '' }
}

const loadScore = async () => {
  const cur = selected.value
  if (!cur?.courseId || !cur?.clazzId) return
  scoreLoading.value = true
  try {
    const res = await axios.post(`${API_BASE}/v2/chaoxing/course_score`, {
      student_id: props.studentId || '',
      course_id: cur.courseId,
      clazz_id: cur.clazzId,
      cpi: cur.cpi || ''
    })
    const data = unwrap(res?.data)
    if (data?.success === false) throw new Error(data.error || '成绩加载失败')
    scoreData.value = data
  } catch (e) {
    showToast(safeText(e?.message || e) || '成绩加载失败')
    scoreData.value = null
  } finally {
    scoreLoading.value = false
  }
}

const selectCourse = async (id) => {
  selectedId.value = id
  viewMode.value = 'detail'
  activeDetailTab.value = 'chapters'
  await loadDetail(id)
}

const onDetailTab = async (key) => {
  activeDetailTab.value = key
  if (key === 'score' && !scoreData.value) {
    await loadScore()
  }
}

const knowledgeTasksOf = (task) => {
  const kid = task?.knowledgeId || task?.id
  return knowledgeCache.value[kid]?.tasks || []
}

const backToList = () => {
  viewMode.value = 'list'
}

const toggleSection = (key) => {
  expandedSections.value = {
    ...expandedSections.value,
    [key]: !expandedSections.value[key]
  }
}

const onCoverError = (e) => {
  if (e?.target) {
    e.target.style.display = 'none'
    const fallback = e.target.nextElementSibling
    if (fallback) fallback.style.display = 'flex'
  }
}

const handleHeaderBack = () => {
  if (viewMode.value === 'detail') backToList()
  else emit('back')
}

watch(
  () => props.studentId,
  () => {
    void loadList()
  }
)

onMounted(() => {
  void loadList()
})
</script>

<template>
  <div class="cx-hub">
    <TPageHeader
      :title="viewMode === 'detail' && selected ? selected.title : '课程中心'"
      icon="school"
      @back="handleHeaderBack"
    >
      <template #actions>
        <button class="ghost-btn" type="button" :disabled="refreshing || loading" @click="loadList({ silent: true })">
          {{ refreshing ? '刷新中' : '刷新' }}
        </button>
      </template>
    </TPageHeader>

    <div class="cx-hub__body">
      <!-- ===== 列表态 ===== -->
      <template v-if="viewMode === 'list'">
        <section class="panel">
          <div class="status-head">
            <div>
              <strong>学习通课程</strong>
              <p>封面、章节与任务点；点进课程可展开三级目录。</p>
            </div>
            <TStatusBadge :type="badgeType" :text="badgeText" />
          </div>
          <div class="status-grid">
            <div class="status-chip">
              <span>课程数</span>
              <strong>{{ courses.length }}</strong>
            </div>
            <div class="status-chip">
              <span>待办</span>
              <strong>{{ totalPending }}</strong>
            </div>
            <div class="status-chip">
              <span>数据</span>
              <strong>{{ statusMeta.offline ? '缓存' : '实时' }}</strong>
            </div>
          </div>
          <p v-if="error" class="error-text">{{ error }}</p>
        </section>

        <div class="search-wrap">
          <span class="material-symbols-outlined search-icon">search</span>
          <input
            v-model="searchQuery"
            class="search-input"
            type="search"
            placeholder="搜索课程名 / 教师"
          />
        </div>

        <TEmptyState v-if="loading" type="loading" message="正在读取学习通课程…" />

        <TEmptyState
          v-else-if="!filteredCourses.length"
          type="empty"
          :message="error || (courses.length ? '没有匹配的课程' : '暂无课程，请先登录融合门户并完成学习通 SSO')"
        />

        <div v-else class="course-grid">
          <button
            v-for="course in filteredCourses"
            :key="course.id"
            type="button"
            class="course-card"
            @click="selectCourse(course.id)"
          >
            <div class="course-cover">
              <img
                v-if="course.imageUrl"
                :src="course.imageUrl"
                :alt="course.title"
                loading="lazy"
                referrerpolicy="no-referrer"
                @error="onCoverError"
              />
              <div class="course-cover-fallback" :style="course.imageUrl ? { display: 'none' } : undefined">
                <span class="material-symbols-outlined">menu_book</span>
              </div>
              <span v-if="course.pendingCount > 0" class="course-badge">待办 {{ course.pendingCount }}</span>
            </div>
            <div class="course-body">
              <strong class="course-title">{{ course.title }}</strong>
              <p class="course-teacher">{{ course.teacher || '教师信息暂缺' }}</p>
              <div class="course-progress-row">
                <div class="progress-bar">
                  <div
                    class="progress-bar__fill"
                    :style="{ width: Math.max(0, Math.min(100, course.progressRate || 0)) + '%' }"
                  />
                </div>
                <span class="progress-text">
                  {{ course.progressRate > 0 ? `${course.progressRate}%` : course.progressText || '—' }}
                </span>
              </div>
            </div>
            <span class="material-symbols-outlined course-chevron">chevron_right</span>
          </button>
        </div>
      </template>

      <!-- ===== 详情态 ===== -->
      <template v-else-if="selected">
        <section class="panel detail-hero">
          <div class="detail-hero__row">
            <div class="detail-cover">
              <img
                v-if="selected.imageUrl"
                :src="selected.imageUrl"
                :alt="selected.title"
                referrerpolicy="no-referrer"
                @error="onCoverError"
              />
              <div class="course-cover-fallback" :style="selected.imageUrl ? { display: 'none' } : undefined">
                <span class="material-symbols-outlined">menu_book</span>
              </div>
            </div>
            <div class="detail-meta">
              <strong>{{ selected.title }}</strong>
              <p>{{ selected.teacher || '教师信息暂缺' }}</p>
              <div class="detail-badges">
                <TStatusBadge
                  type="info"
                  :text="progress.progress_text || progress.summary || selected.progressText || '官方进度'"
                />
                <TStatusBadge
                  :type="selected.pendingCount > 0 ? 'warning' : 'success'"
                  :text="selected.pendingCount > 0 ? `待办 ${selected.pendingCount}` : '已跟踪'"
                />
              </div>
            </div>
          </div>
          <div class="detail-actions">
            <button type="button" class="primary-btn" @click="loadDetail(selected.id)">刷新章节</button>
            <button type="button" class="ghost-btn solid" @click="onDetailTab('score')">成绩组成</button>
          </div>
        </section>

        <div class="detail-tabs">
          <button
            v-for="tab in DETAIL_TABS"
            :key="tab.key"
            type="button"
            class="detail-tab"
            :class="{ active: activeDetailTab === tab.key }"
            @click="onDetailTab(tab.key)"
          >
            <span class="material-symbols-outlined">{{ tab.icon }}</span>
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <!-- 章节（应用内：一级章 → 知识点 → cards 任务点） -->
        <template v-if="activeDetailTab === 'chapters'">
          <TEmptyState v-if="detailLoading" type="loading" message="正在加载章节大纲…" />
          <TEmptyState
            v-else-if="!outline.length"
            type="empty"
            message="当前课程暂未返回章节。请确认学习通会话有效后点刷新。"
          />
          <div v-else class="outline-tree">
            <section
              v-for="(sec, sIdx) in outline"
              :key="sec.id || sIdx"
              class="outline-section"
            >
              <button
                type="button"
                class="outline-section__head"
                @click="toggleSection(sec.id || `sec-${sIdx}`)"
              >
                <span class="material-symbols-outlined expand-icon">
                  {{ expandedSections[sec.id || `sec-${sIdx}`] ? 'expand_more' : 'chevron_right' }}
                </span>
                <strong class="level-1">{{ sec.title }}</strong>
                <span class="count-chip">{{ sec.tasks.length }} 项</span>
              </button>

              <div v-show="expandedSections[sec.id || `sec-${sIdx}`]" class="outline-section__body">
                <article
                  v-for="(task, tIdx) in sec.tasks"
                  :key="task.id || tIdx"
                  class="task-block"
                >
                  <button type="button" class="task-row" @click="openTaskLink(task)">
                    <div class="task-row__main">
                      <strong class="level-2">{{ task.title }}</strong>
                      <p>
                        {{
                          task.status ||
                          (task.completed ? '已完成' : '点击展开任务点')
                        }}
                      </p>
                    </div>
                    <div class="task-row__side">
                      <TStatusBadge :type="task.typeMeta.type" :text="task.typeMeta.text" />
                      <span class="material-symbols-outlined">
                        {{ activeKnowledgeId === (task.knowledgeId || task.id) ? 'expand_less' : 'expand_more' }}
                      </span>
                    </div>
                  </button>

                  <!-- 知识点下的任务点（视频/文档） -->
                  <div
                    v-if="activeKnowledgeId === (task.knowledgeId || task.id)"
                    class="task-children"
                  >
                    <p v-if="taskLoading" class="helper-text">加载任务点…</p>
                    <template v-else>
                      <button
                        v-for="(child, cIdx) in knowledgeTasksOf(task)"
                        :key="child.id || cIdx"
                        type="button"
                        class="child-row"
                        @click="openTaskLink(child)"
                      >
                        <span class="child-dot" />
                        <span class="level-3">{{ child.title }}</span>
                        <TStatusBadge :type="child.typeMeta.type" :text="child.typeMeta.text" />
                      </button>
                      <p
                        v-if="!knowledgeTasksOf(task).length"
                        class="helper-text"
                      >该节暂无任务点</p>
                    </template>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </template>

        <!-- 成绩组成（应用内） -->
        <template v-else-if="activeDetailTab === 'score'">
          <TEmptyState v-if="scoreLoading" type="loading" message="正在加载成绩组成…" />
          <section v-else-if="scoreData" class="panel">
            <div class="score-hero">
              <span>综合成绩</span>
              <strong>{{ scoreData.total_score ?? scoreData.score?.score ?? '—' }}</strong>
            </div>
            <ul class="score-list">
              <li
                v-for="(w, wi) in (scoreData.weight_list || scoreData.weightList || [])"
                :key="wi"
              >
                <span>{{ w.name }}</span>
                <strong>{{ w.value }}</strong>
              </li>
            </ul>
            <div v-if="scoreData.weight" class="weight-grid">
              <div class="weight-chip"><span>作业权重</span><b>{{ scoreData.weight.work ?? 0 }}%</b></div>
              <div class="weight-chip"><span>考试权重</span><b>{{ scoreData.weight.test ?? 0 }}%</b></div>
              <div class="weight-chip"><span>视频权重</span><b>{{ scoreData.weight.video ?? 0 }}%</b></div>
              <div class="weight-chip"><span>签到权重</span><b>{{ scoreData.weight.attend ?? 0 }}%</b></div>
            </div>
            <p v-if="scoreData.job" class="helper-text">
              任务点完成率 {{ scoreData.job.jobFinishRate ?? '—' }}%
              （已完成 {{ scoreData.job.job ?? '—' }} / 发布 {{ scoreData.job.publishJobNum ?? '—' }}）
            </p>
            <button type="button" class="ghost-btn solid" @click="loadScore">重新同步成绩</button>
          </section>
          <TEmptyState v-else type="empty" message="暂无成绩数据，请点重新同步" />
        </template>

        <!-- 进度 -->
        <template v-else-if="activeDetailTab === 'progress'">
          <section class="panel">
            <div class="progress-panel">
              <div class="progress-stat">
                <span>进度</span>
                <strong>{{ progress.progress_text || progress.summary || selected.progressText || '暂无' }}</strong>
              </div>
              <div class="progress-stat">
                <span>完成率</span>
                <strong>{{ selected.progressRate || progress.percent || progress.progress_rate || progress.progress_percent || 0 }}%</strong>
              </div>
              <div class="progress-bar large">
                <div
                  class="progress-bar__fill"
                  :style="{
                    width:
                      Math.max(
                        0,
                        Math.min(100, Number(selected.progressRate || progress.percent || progress.progress_rate || progress.progress_percent || 0))
                      ) + '%'
                  }"
                />
              </div>
              <p class="helper-text">
                已完成 {{ progress.completed_count ?? '—' }} /
                共 {{ progress.total_count ?? '—' }} 个知识点
              </p>
              <button type="button" class="ghost-btn solid" @click="loadDetail(selected.id)">刷新进度</button>
            </div>
          </section>
        </template>

        <!-- 应用内视频播放（无外链） -->
        <div v-if="videoPlayer.open" class="video-mask" @click.self="closeVideo">
          <div class="video-sheet">
            <div class="video-sheet__head">
              <strong>{{ videoPlayer.title }}</strong>
              <button type="button" class="ghost-btn" @click="closeVideo">关闭</button>
            </div>
            <p v-if="videoPlayer.loading" class="helper-text">正在获取播放地址…</p>
            <p v-else-if="videoPlayer.error" class="error-text">{{ videoPlayer.error }}</p>
            <video
              v-else-if="videoPlayer.src"
              class="video-el"
              controls
              playsinline
              :poster="videoPlayer.poster || undefined"
              :src="videoPlayer.src"
            />
          </div>
        </div>

      </template>
    </div>
  </div>
</template>

<style scoped>
.cx-hub {
  min-height: 100%;
  background: #f6fafe;
  color: #1e293b;
  padding-bottom: 104px;
}
.cx-hub__body {
  padding: 12px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 16px;
  box-shadow: 0 4px 15px rgba(15, 23, 42, 0.04);
  padding: 14px;
}
.panel-title {
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
}
.panel-title .material-symbols-outlined {
  color: #2563eb;
  font-size: 20px;
}
.ghost-btn {
  border: none;
  background: transparent;
  color: var(--ui-primary, #2563eb);
  font-weight: 600;
  font-size: 14px;
  padding: 8px 10px;
}
.ghost-btn.solid {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 30%, transparent);
  border-radius: 999px;
  background: var(--ui-surface, #fff);
}
.primary-btn {
  border: none;
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 700;
  color: #fff;
  background: #2563eb;
}
.status-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.status-head p,
.helper-text,
.error-text,
.course-teacher {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ui-muted, #64748b);
}
.error-text {
  color: var(--ui-danger, #dc2626);
}
.status-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 10px;
}
.status-chip {
  border-radius: 12px;
  padding: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.status-chip span {
  font-size: 12px;
  color: var(--ui-muted);
}
.status-chip strong {
  font-size: 16px;
}
.search-wrap {
  position: relative;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ui-muted);
  font-size: 20px;
}
.search-input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px 12px 12px 40px;
  background: #ffffff;
  color: inherit;
  font-size: 14px;
}
.course-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.course-card {
  display: grid;
  grid-template-columns: 72px 1fr 24px;
  gap: 12px;
  align-items: center;
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 10px;
  background: #ffffff;
  color: inherit;
  box-shadow: 0 4px 15px rgba(15, 23, 42, 0.04);
}
.course-cover,
.detail-cover {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  background: color-mix(in oklab, var(--ui-primary) 12%, #e2e8f0);
  flex-shrink: 0;
}
.detail-cover {
  width: 88px;
  height: 88px;
}
.course-cover img,
.detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.course-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-primary, #2563eb);
}
.course-badge {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in oklab, #f59e0b 90%, #000);
  color: #fff;
}
.course-title,
.level-1,
.level-2 {
  font-size: 14px;
  line-height: 1.35;
}
.course-progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.progress-bar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-primary) 12%, #e2e8f0);
  overflow: hidden;
}
.progress-bar.large {
  height: 10px;
  margin-top: 10px;
}
.progress-bar__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ui-primary, #2563eb), var(--ui-secondary, #06b6d4));
}
.progress-text {
  font-size: 12px;
  color: var(--ui-muted);
  min-width: 36px;
  text-align: right;
}
.course-chevron {
  color: var(--ui-muted);
}
.detail-hero__row {
  display: flex;
  gap: 12px;
}
.detail-meta {
  flex: 1;
  min-width: 0;
}
.detail-meta strong {
  font-size: 16px;
}
.detail-badges,
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.detail-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 4px;
  border-radius: 14px;
  background: #eef2f7;
  border: 1px solid #e2e8f0;
}
.detail-tab {
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 10px 4px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.detail-tab .material-symbols-outlined {
  font-size: 20px;
}
.detail-tab.active {
  background: #ffffff;
  color: #1e293b;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}
.detail-tab.active .material-symbols-outlined {
  color: #2563eb;
}
.outline-tree {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.outline-section {
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  overflow: hidden;
}
.outline-section__head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: none;
  background: #f8fafc;
  color: inherit;
  text-align: left;
}
.expand-icon {
  font-size: 20px;
  color: var(--ui-primary);
}
.count-chip {
  margin-left: auto;
  font-size: 12px;
  color: var(--ui-muted);
}
.task-block {
  border-top: 1px solid color-mix(in oklab, #94a3b8 20%, transparent);
}
.task-row,
.child-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 12px;
}
.task-row__main {
  min-width: 0;
  flex: 1;
}
.task-row__main p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ui-muted);
}
.task-row__side {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-muted);
}
.task-children {
  padding: 0 12px 10px 28px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.child-row {
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in oklab, var(--ui-primary) 5%, transparent);
}
.child-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-primary);
  flex-shrink: 0;
}
.level-3 {
  flex: 1;
  font-size: 13px;
}
.progress-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progress-stat {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
}
.progress-stat span {
  color: var(--ui-muted);
}
.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.action-tile {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px 12px;
  background: #ffffff;
  color: inherit;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.action-tile .material-symbols-outlined {
  color: #2563eb;
  font-size: 24px;
}
.action-tile p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.score-hero {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}
.score-hero span {
  font-size: 13px;
  color: #64748b;
}
.score-hero strong {
  font-size: 36px;
  font-weight: 800;
  color: #2563eb;
  letter-spacing: -0.03em;
}
.score-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.score-list li {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
  font-size: 14px;
}
.weight-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.weight-chip {
  background: #eff6ff;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
}
.weight-chip b {
  font-size: 18px;
  color: #1e40af;
}
.video-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
}
.video-sheet {
  width: min(520px, 100%);
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 16px;
  padding: 14px;
  max-height: 80vh;
}
.video-sheet__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
}
.video-el {
  width: 100%;
  max-height: 56vh;
  border-radius: 10px;
  background: #000;
}
.error-text {
  color: #fca5a5;
  font-size: 13px;
}
html.dark .score-list li {
  background: #1e293b;
}
html.dark .weight-chip {
  background: #1e293b;
}
html.dark .cx-hub {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .course-card,
html.dark .outline-section,
html.dark .action-tile,
html.dark .search-input,
html.dark .panel {
  background: var(--ui-surface, #111827);
  border-color: #334155;
}
html.dark .detail-tabs {
  background: #1e293b;
  border-color: #334155;
}
html.dark .detail-tab.active {
  background: #0f172a;
  color: #e2e8f0;
}
html.dark .outline-section__head {
  background: #1e293b;
}
</style>
