<script setup>
/**
 * 学习通课程中心（纯应用内 · 多级菜单）
 * 课程列表 → 章 → 小节 → 任务点 → 视频 / 成绩
 * 全部走 Tauri invoke，禁止外链
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { showToast } from '../utils/toast'
import { pushDebugLog } from '../utils/debug_logger'
import { TPageHeader, TEmptyState, TStatusBadge } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})
const emit = defineEmits(['back'])

const loading = ref(true)
const refreshing = ref(false)
const pageLoading = ref(false)
const error = ref('')
const courses = ref([])
const semesterTabs = ref(['全部'])
const activeSemester = ref('全部')
const searchQuery = ref('')
const statusMeta = ref({})
const videoError = ref('')
const videoSrcIndex = ref(0)

const PIE_COLORS = ['#2563eb', '#7c3aed', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899']

/**
 * 导航栈
 * list → course → section → knowledge → video | score
 */
const stack = ref([{ level: 'list' }])

const current = computed(() => stack.value[stack.value.length - 1] || { level: 'list' })

const breadcrumbs = computed(() => {
  const items = []
  for (const frame of stack.value) {
    if (frame.level === 'list') items.push({ key: 'list', label: '课程' })
    else if (frame.level === 'course')
      items.push({ key: 'course', label: frame.course?.title || '课程' })
    else if (frame.level === 'section')
      items.push({ key: 'section', label: frame.section?.title || '章' })
    else if (frame.level === 'knowledge')
      items.push({ key: 'knowledge', label: frame.knowledge?.title || '小节' })
    else if (frame.level === 'score') items.push({ key: 'score', label: '成绩' })
    else if (frame.level === 'video')
      items.push({ key: 'video', label: frame.task?.title || '视频' })
  }
  return items
})

const pageTitle = computed(() => {
  const c = current.value
  if (c.level === 'list') return '课程中心'
  if (c.level === 'course') return c.course?.title || '课程'
  if (c.level === 'section') return c.section?.title || '章节'
  if (c.level === 'knowledge') return c.knowledge?.title || '任务'
  if (c.level === 'score') return '成绩组成'
  if (c.level === 'video') return c.task?.title || '视频'
  return '课程中心'
})

const safeText = (v) => String(v ?? '').trim()
const safeNumber = (v, fb = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}

const preferHttps = (url) => {
  const u = safeText(url)
  if (u.startsWith('http://')) return `https://${u.slice(7)}`
  return u
}

const normalizeCourse = (item = {}) => {
  const raw = item && typeof item === 'object' ? item : {}
  const courseId = safeText(raw.course_id || raw.courseId || '')
  const clazzId = safeText(raw.clazz_id || raw.clazzId || '')
  const cpi = safeText(raw.cpi || '')
  return {
    id: safeText(raw.id || `${courseId}:${clazzId}`),
    courseId,
    clazzId,
    cpi,
    title: safeText(raw.title || raw.name || raw.course_name || '未命名课程'),
    teacher: safeText(raw.teacher || raw.teacher_name || raw.teacherfactor || ''),
    imageUrl: safeText(raw.image_url || raw.imageUrl || raw.cover || ''),
    progressText: safeText(raw.progress_text || raw.progressText || ''),
    progressRate: safeNumber(
      raw.progress_rate ?? raw.progressRate ?? raw.progress_percent ?? raw.percent
    ),
    pendingCount: safeNumber(raw.pending_count ?? raw.pendingCount ?? 0),
    courseUrl: safeText(raw.course_url || raw.courseUrl || raw.url || ''),
    semester: safeText(raw.semester || raw.term || '本学期') || '本学期'
  }
}

const typeMetaOf = (typeRaw) => {
  const t = safeText(typeRaw).toLowerCase()
  if (t.includes('video') || t === '视频') return { text: '视频', type: 'info', kind: 'video' }
  if (t.includes('doc') || t.includes('pdf') || t === 'document' || t === '文档')
    return { text: '文档', type: 'warning', kind: 'document' }
  if (t.includes('work') || t === '作业') return { text: '作业', type: 'danger', kind: 'work' }
  if (t === 'knowledge' || t === '章节') return { text: '小节', type: 'primary', kind: 'knowledge' }
  return { text: safeText(typeRaw) || '任务', type: 'muted', kind: 'task' }
}

const normalizeKnowledge = (raw = {}) => ({
  id: safeText(raw.id || raw.knowledge_id || raw.knowledgeId),
  knowledgeId: safeText(raw.knowledge_id || raw.knowledgeId || raw.id),
  title: safeText(raw.title || raw.name || '未命名小节'),
  completed: !!(raw.completed || raw.isPassed),
  courseId: safeText(raw.course_id || raw.courseId),
  clazzId: safeText(raw.clazz_id || raw.clazzId),
  cpi: safeText(raw.cpi || ''),
  layer: safeNumber(raw.layer ?? raw.level ?? 0)
})

const normalizeSection = (raw = {}) => {
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks
    : Array.isArray(raw.children)
      ? raw.children
      : []
  return {
    id: safeText(raw.id || raw.section_id || 'sec'),
    title: safeText(raw.title || raw.name || '章节'),
    knowledges: tasks.map(normalizeKnowledge).filter((k) => k.id || k.title)
  }
}

const normalizeTaskItem = (raw = {}) => {
  const typeRaw = raw.type || raw.task_type || ''
  const meta = typeMetaOf(typeRaw)
  const objectId = safeText(
    raw.objectId || raw.object_id || raw.property?.objectid || raw.property?.objectId
  )
  // 有 objectId 且类型未知时按视频处理
  const kind = meta.kind === 'task' && objectId ? 'video' : meta.kind
  return {
    id: safeText(raw.id || raw.jobid || raw.objectId || raw.object_id || Math.random()),
    title: safeText(raw.title || raw.name || '未命名任务'),
    objectId,
    jobid: safeText(raw.jobid || raw.jobId),
    completed: !!(raw.completed || raw.isPassed),
    status: safeText(raw.status || (raw.completed || raw.isPassed ? '已完成' : '未完成')),
    typeMeta: kind === 'video' ? { text: '视频', type: 'info', kind: 'video' } : meta,
    kind,
    empty_hint: !!(raw.empty_hint || raw.emptyHint)
  }
}

const filteredCourses = computed(() => {
  let list = courses.value
  if (activeSemester.value && activeSemester.value !== '全部') {
    list = list.filter((c) => c.semester === activeSemester.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (c) => c.title.toLowerCase().includes(q) || c.teacher.toLowerCase().includes(q)
  )
})

/** 成绩饼图切片（权重） */
const scoreSlices = computed(() => {
  const score = current.value?.score
  if (!score) return []
  const list = Array.isArray(score.weight_list) ? score.weight_list : []
  const raw = []
  if (list.length) {
    for (const w of list) {
      const value = safeNumber(w.value ?? w.score ?? w.weight ?? 0)
      const name = safeText(w.name || w.key || '项目')
      if (value > 0) raw.push({ name, value })
    }
  } else if (score.weight && typeof score.weight === 'object') {
    const labels = {
      work: '作业',
      test: '考试',
      video: '视频',
      attend: '签到',
      bbs: '讨论',
      live: '直播',
      read: '阅读',
      task: '任务点'
    }
    for (const [k, v] of Object.entries(score.weight)) {
      const value = safeNumber(v)
      if (value > 0) raw.push({ name: labels[k] || k, value })
    }
  }
  const total = raw.reduce((s, x) => s + x.value, 0) || 1
  let acc = 0
  return raw.map((item, i) => {
    const pct = (item.value / total) * 100
    const start = acc
    acc += pct
    return {
      ...item,
      pct,
      color: PIE_COLORS[i % PIE_COLORS.length],
      // conic-gradient 用
      start,
      end: acc
    }
  })
})

const pieGradient = computed(() => {
  const slices = scoreSlices.value
  if (!slices.length) return 'conic-gradient(#e2e8f0 0 100%)'
  const parts = slices.map((s) => `${s.color} ${s.start}% ${s.end}%`)
  return `conic-gradient(${parts.join(', ')})`
})

const totalPending = computed(() =>
  courses.value.reduce((s, c) => s + (c.pendingCount || 0), 0)
)

const badgeType = computed(() => {
  if (statusMeta.value?.connected === true) return 'success'
  if (courses.value.length) return 'warning'
  return 'muted'
})
const badgeText = computed(() => {
  if (statusMeta.value?.connected === true) return '会话可用'
  if (courses.value.length) return '缓存/部分'
  return '未连接'
})

const activeVideoSrc = computed(() => {
  const urls = current.value?.playUrls || []
  if (!urls.length) return current.value?.src || ''
  return urls[Math.min(videoSrcIndex.value, urls.length - 1)] || ''
})

/**
 * 统一 invoke：只传 snake_case 字段。
 * 切勿同时传 clazz_id + clazzId：Rust #[serde(alias)] 会报 duplicate field。
 */
const cxInvoke = async (cmd, body = {}) => {
  if (!isTauriRuntime()) throw new Error('请在客户端内使用')
  const raw = { student_id: props.studentId || '', ...body }
  // 规范化：camelCase → snake_case，并删除 camel 别名，避免重复键
  const map = [
    ['courseId', 'course_id'],
    ['clazzId', 'clazz_id'],
    ['classId', 'clazz_id'],
    ['knowledgeId', 'knowledge_id'],
    ['objectId', 'object_id'],
    ['courseUrl', 'course_url'],
    ['studentId', 'student_id']
  ]
  for (const [camel, snake] of map) {
    if (raw[camel] != null && (raw[snake] == null || raw[snake] === '')) {
      raw[snake] = raw[camel]
    }
    delete raw[camel]
  }
  return invokeNative(cmd, { req: raw })
}

const loadList = async ({ silent = false, force = false } = {}) => {
  if (!silent) loading.value = true
  else refreshing.value = true
  error.value = ''
  const t0 = Date.now()
  // 首次进入 force=false 走后端缓存；显式刷新 force=true
  const doForce = force || false
  pushDebugLog('ChaoxingHub', `加载课程列表 silent=${silent} force=${doForce}`, 'info')
  try {
    // 列表优先拉课程（可缓存）；会话状态并行，不阻塞有缓存时的首屏
    const coursePromise = cxInvoke('chaoxing_fetch_courses', { force: doForce })
    const statusPromise = cxInvoke('chaoxing_get_session_status', {}).catch((e) => ({
      success: false,
      error: String(e?.message || e)
    }))
    const [courseRes, statusRes] = await Promise.all([coursePromise, statusPromise])
    if (courseRes?.success === false) throw new Error(courseRes?.error || '课程列表失败')
    statusMeta.value = statusRes || {}
    const list = Array.isArray(courseRes?.courses) ? courseRes.courses : []
    courses.value = list.map(normalizeCourse).filter((c) => c.courseId && c.clazzId)
    pushDebugLog(
      'ChaoxingHub',
      `课程列表完成 count=${courses.value.length} from_cache=${!!courseRes?.from_cache} (${Date.now() - t0}ms)`,
      'info',
      { sync_time: courseRes?.sync_time, platform_status: courseRes?.platform_status }
    )

    const fromApi = Array.isArray(courseRes?.semesters)
      ? courseRes.semesters.map((s) => safeText(s)).filter(Boolean)
      : []
    const fromCourses = [...new Set(courses.value.map((c) => c.semester).filter(Boolean))]
    const merged = []
    for (const s of [...fromApi, ...fromCourses]) {
      if (!merged.includes(s)) merged.push(s)
    }
    // 本学期优先
    merged.sort((a, b) => {
      if (a === '本学期') return -1
      if (b === '本学期') return 1
      return String(b).localeCompare(String(a), 'zh')
    })
    semesterTabs.value = ['全部', ...merged]
    if (!semesterTabs.value.includes(activeSemester.value)) {
      activeSemester.value = '全部'
    }
  } catch (e) {
    error.value = safeText(e?.message || e) || '加载失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

/** 模块内翻页：滚到顶部，不跟首页滚动位置同步 */
const scrollModuleToTop = () => {
  nextTick(() => {
    try {
      const shell = document.querySelector('.app-shell')
      if (shell) shell.scrollTop = 0
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      // 本组件根节点若可滚也归零
      const root = document.querySelector('.cx-hub')
      if (root) root.scrollTop = 0
    } catch {
      // ignore
    }
  })
}

const push = (frame) => {
  stack.value = [...stack.value, frame]
  scrollModuleToTop()
}

const pop = () => {
  if (stack.value.length <= 1) {
    emit('back')
    return
  }
  stack.value = stack.value.slice(0, -1)
  videoError.value = ''
  videoSrcIndex.value = 0
  scrollModuleToTop()
}

/** 点面包屑跳到某一层 */
const jumpTo = (index) => {
  if (index < 0 || index >= stack.value.length) return
  stack.value = stack.value.slice(0, index + 1)
  videoError.value = ''
  videoSrcIndex.value = 0
  scrollModuleToTop()
}

const openCourse = async (course, { force = false } = {}) => {
  pageLoading.value = true
  try {
    // 默认走缓存；仅点「刷新章节」时 force
    const outlineRes = await cxInvoke('chaoxing_fetch_course_outline', {
      course_id: course.courseId,
      clazz_id: course.clazzId,
      cpi: course.cpi || '',
      course_url: course.courseUrl || '',
      force: !!force
    })
    if (outlineRes?.success === false) throw new Error(outlineRes?.error || '大纲失败')

    let sectionList = Array.isArray(outlineRes?.sections) ? outlineRes.sections : []
    if (!sectionList.length && Array.isArray(outlineRes?.nodes)) {
      sectionList = [{ id: 'all', title: '全部章节', tasks: outlineRes.nodes }]
    }
    const sections = sectionList.map(normalizeSection).filter((s) => s.knowledges.length || s.title)

    const frame = {
      level: 'course',
      course,
      sections,
      progress: {}
    }
    // 刷新时替换当前课程层，避免栈叠加
    if (current.value.level === 'course') {
      const base = stack.value.slice(0, -1)
      stack.value = [...base, frame]
    } else {
      push(frame)
    }

    // 进度后台拉取，不阻塞进入章列表
    void cxInvoke('chaoxing_fetch_course_progress', {
      course_id: course.courseId,
      clazz_id: course.clazzId,
      cpi: course.cpi || '',
      course_url: course.courseUrl || '',
      force: false
    })
      .then((progressRes) => {
        const top = stack.value[stack.value.length - 1]
        if (top?.level === 'course' && top.course?.courseId === course.courseId) {
          top.progress = progressRes || {}
          stack.value = [...stack.value.slice(0, -1), { ...top }]
        }
      })
      .catch(() => {})
  } catch (e) {
    showToast(safeText(e?.message || e) || '打开课程失败')
  } finally {
    pageLoading.value = false
  }
}

const openSection = (course, section) => {
  push({ level: 'section', course, section })
}

const openKnowledge = async (course, section, knowledge) => {
  pageLoading.value = true
  try {
    // 优先用小节自带 course/clazz（大纲解析结果更准）
    const courseId = knowledge.courseId || course.courseId
    const clazzId = knowledge.clazzId || course.clazzId
    const cpi = knowledge.cpi || course.cpi || ''
    const kid = knowledge.knowledgeId || knowledge.id
    const res = await cxInvoke('chaoxing_get_knowledge_cards', {
      course_id: courseId,
      clazz_id: clazzId,
      knowledge_id: kid,
      cpi
    })
    if (res?.success === false) throw new Error(res?.error || '任务点加载失败')
    const list = Array.isArray(res?.tasks)
      ? res.tasks
      : Array.isArray(res?.attachments)
        ? res.attachments
        : Array.isArray(res?.videos)
          ? res.videos
          : []
    // 过滤纯占位提示，若仅有占位则仍展示
    const mapped = list.map(normalizeTaskItem)
    const real = mapped.filter((t) => !t.empty_hint && (t.objectId || t.kind !== 'task'))
    push({
      level: 'knowledge',
      course,
      section,
      knowledge,
      tasks: real.length ? real : mapped,
      meta: {
        fid: safeText(res?.fid || ''),
        reportUrl: safeText(res?.reportUrl || res?.report_url || ''),
        userid: safeText(res?.userid || '')
      }
    })
  } catch (e) {
    showToast(safeText(e?.message || e) || '打开小节失败')
  } finally {
    pageLoading.value = false
  }
}

const openScore = async (course) => {
  pageLoading.value = true
  try {
    const res = await cxInvoke('chaoxing_fetch_course_score', {
      course_id: course.courseId,
      clazz_id: course.clazzId,
      cpi: course.cpi || ''
    })
    if (res?.success === false) throw new Error(res?.error || res?.message || '成绩加载失败')
    // 若已在成绩页则替换，避免栈叠加
    if (current.value.level === 'score') {
      const base = stack.value.slice(0, -1)
      stack.value = [...base, { level: 'score', course, score: res }]
    } else {
      push({ level: 'score', course, score: res })
    }
  } catch (e) {
    const msg = safeText(e?.message || e) || '成绩加载失败'
    if (msg.includes('Unknown POST endpoint')) {
      showToast('成绩接口未就绪，请完全退出应用后重新打开')
    } else if (msg.includes('duplicate field')) {
      showToast('参数冲突已修复，请完全重启应用后再试')
    } else {
      showToast(msg)
    }
  } finally {
    pageLoading.value = false
  }
}

const collectPlayUrls = (st = {}, top = {}) => {
  const list = []
  const push = (u) => {
    const https = preferHttps(u)
    if (!https || !https.startsWith('http')) return
    if (!list.includes(https)) list.push(https)
  }
  if (Array.isArray(top.play_urls)) top.play_urls.forEach(push)
  if (Array.isArray(st.play_urls)) st.play_urls.forEach(push)
  ;['https', 'hd', 'http', 'play_url', 'download', 'mp3', 'url', 'sd'].forEach((k) => {
    push(st[k])
    push(top[k])
  })
  return list
}

const openVideo = async (course, section, knowledge, task, meta) => {
  if (!task.objectId) {
    showToast('该任务没有可播放资源')
    return
  }
  pageLoading.value = true
  videoError.value = ''
  videoSrcIndex.value = 0
  try {
    const res = await cxInvoke('chaoxing_get_video_status', {
      object_id: task.objectId,
      fid: meta?.fid || '0'
    })
    if (res?.success === false) throw new Error(res?.error || '视频状态失败')
    const st = res?.data && typeof res.data === 'object' ? res.data : res
    const playUrls = collectPlayUrls(st, res || {})
    if (!playUrls.length) {
      throw new Error(
        st.status && st.status !== 'success'
          ? `视频不可用（${st.status}）`
          : '未返回播放地址，请确认学习通会话有效'
      )
    }
    push({
      level: 'video',
      course,
      section,
      knowledge,
      task,
      src: playUrls[0],
      playUrls,
      poster: preferHttps(safeText(st.screenshot || st.thumb || '')),
      filename: safeText(st.filename || task.title),
      duration: safeNumber(st.duration)
    })
  } catch (e) {
    showToast(safeText(e?.message || e) || '视频打开失败')
  } finally {
    pageLoading.value = false
  }
}

const onVideoError = () => {
  const urls = current.value?.playUrls || []
  if (videoSrcIndex.value + 1 < urls.length) {
    videoSrcIndex.value += 1
    videoError.value = `线路 ${videoSrcIndex.value} 失败，切换备用地址…`
    return
  }
  // 优先展示后端/播放器给出的具体原因，避免永远笼统「CDN/会话」
  const detail = safeText(e?.message || e || '')
  videoError.value = detail
    ? `视频播放失败：${detail}`
    : '视频播放失败：无法解析播放地址或被 CDN 拒绝。请重试，或重新登录学习通后再打开'
}

const retryVideo = () => {
  const frame = current.value
  if (frame?.level !== 'video' || !frame.task) return
  const task = frame.task
  const course = frame.course
  const section = frame.section
  const knowledge = frame.knowledge
  const knowFrame = [...stack.value].reverse().find((f) => f.level === 'knowledge')
  const meta = knowFrame?.meta || { fid: '0' }
  // 先退出视频层再重新打开，避免栈叠加
  if (stack.value.length > 1 && current.value.level === 'video') {
    stack.value = stack.value.slice(0, -1)
  }
  videoError.value = ''
  videoSrcIndex.value = 0
  void openVideo(course, section, knowledge, task, meta)
}

const onTaskClick = (frame, task) => {
  if (task.empty_hint || task.status === '无可播放任务') {
    showToast('该小节没有视频任务点')
    return
  }
  if (task.kind === 'video' || task.objectId) {
    void openVideo(frame.course, frame.section, frame.knowledge, task, frame.meta)
    return
  }
  showToast(`${task.typeMeta?.text || '任务'}：${task.title}`)
}

const onCoverError = (e) => {
  if (e?.target) {
    e.target.style.display = 'none'
    const fallback = e.target.nextElementSibling
    if (fallback) fallback.style.display = 'flex'
  }
}

const handleHeaderBack = () => pop()

const formatDuration = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

watch(
  () => props.studentId,
  () => {
    stack.value = [{ level: 'list' }]
    void loadList()
  }
)

onMounted(() => {
  scrollModuleToTop()
  void loadList()
})
</script>

<template>
  <div class="cx-hub">
    <TPageHeader :title="pageTitle" icon="school" @back="handleHeaderBack">
      <template #actions>
        <button
          v-if="current.level === 'list'"
          class="ghost-btn"
          type="button"
          :disabled="refreshing || loading"
          @click="loadList({ silent: true, force: true })"
        >
          {{ refreshing ? '…' : '刷新' }}
        </button>
      </template>
    </TPageHeader>

    <div class="cx-hub__body">
      <!-- 面包屑：多级导航 -->
      <nav v-if="stack.length > 1" class="crumbs" aria-label="路径">
        <template v-for="(bc, i) in breadcrumbs" :key="bc.key + i">
          <button
            type="button"
            class="crumb-btn"
            :class="{ current: i === breadcrumbs.length - 1 }"
            :disabled="i === breadcrumbs.length - 1"
            @click="jumpTo(i)"
          >
            {{ bc.label }}
          </button>
          <span v-if="i < breadcrumbs.length - 1" class="crumb-sep">/</span>
        </template>
      </nav>

      <div v-if="pageLoading" class="page-loading">
        <span class="material-symbols-outlined spin">progress_activity</span>
        <span>加载中…</span>
      </div>

      <!-- 1. 课程列表 -->
      <template v-if="current.level === 'list'">
        <section class="panel hero">
          <div class="hero-row">
            <div>
              <strong>我的课程</strong>
              <p>{{ courses.length }} 门 · {{ semesterTabs.length > 1 ? semesterTabs.length - 1 + ' 个学期' : '本学期' }}</p>
            </div>
            <TStatusBadge :type="badgeType" :text="badgeText" />
          </div>
          <div class="stat-row">
            <div class="stat"><span>课程</span><b>{{ filteredCourses.length }}</b></div>
            <div class="stat"><span>待办</span><b>{{ totalPending }}</b></div>
          </div>
          <p v-if="error" class="err">{{ error }}</p>
        </section>

        <div v-if="semesterTabs.length > 1" class="sem-scroll" role="tablist">
          <button
            v-for="sem in semesterTabs"
            :key="sem"
            type="button"
            class="sem-chip"
            :class="{ active: activeSemester === sem }"
            role="tab"
            :aria-selected="activeSemester === sem"
            @click="activeSemester = sem"
          >
            {{ sem }}
          </button>
        </div>

        <div class="search-wrap">
          <span class="material-symbols-outlined">search</span>
          <input v-model="searchQuery" type="search" placeholder="搜索课程 / 教师" />
        </div>

        <TEmptyState v-if="loading" type="loading" message="正在读取课程…" />
        <TEmptyState
          v-else-if="!filteredCourses.length"
          type="empty"
          :message="error || '暂无课程'"
        />

        <button
          v-for="c in filteredCourses"
          :key="c.id"
          type="button"
          class="row-card course"
          @click="openCourse(c)"
        >
          <div class="cover">
            <img
              v-if="c.imageUrl"
              :src="c.imageUrl"
              alt=""
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="onCoverError"
            />
            <div class="cover-fb" :style="c.imageUrl ? { display: 'none' } : undefined">
              <span class="material-symbols-outlined">menu_book</span>
            </div>
          </div>
          <div class="row-main">
            <strong>{{ c.title }}</strong>
            <p>
              <span v-if="c.semester" class="sem-tag">{{ c.semester }}</span>
              {{ c.teacher || '教师暂缺' }}
            </p>
            <div class="mini-bar">
              <i :style="{ width: Math.min(100, c.progressRate || 0) + '%' }" />
            </div>
          </div>
          <span class="material-symbols-outlined chev">chevron_right</span>
        </button>
      </template>

      <!-- 2. 课程 → 章列表 -->
      <template v-else-if="current.level === 'course'">
        <section class="panel course-head">
          <div class="course-head__top">
            <div class="course-head__meta">
              <span class="pill">章节目录</span>
              <strong>{{ current.course.title }}</strong>
              <p>{{ current.course.teacher || '教师暂缺' }}</p>
            </div>
          </div>
          <div class="btn-row">
            <button type="button" class="chip-btn" @click="openScore(current.course)">
              <span class="material-symbols-outlined">grade</span>
              成绩组成
            </button>
            <button
              type="button"
              class="chip-btn ghost"
              @click="openCourse(current.course, { force: true })"
            >
              <span class="material-symbols-outlined">refresh</span>
              刷新
            </button>
          </div>
          <p v-if="current.progress?.progress_text" class="hint">
            {{ current.progress.progress_text }}
          </p>
        </section>

        <div class="section-head">
          <span class="section-head__title">全部章节</span>
          <span class="section-head__count">{{ current.sections?.length || 0 }} 章</span>
        </div>

        <TEmptyState
          v-if="!current.sections?.length"
          type="empty"
          message="暂无章节，请点刷新或检查学习通会话"
        />

        <div class="menu-list">
          <button
            v-for="(sec, sIdx) in current.sections"
            :key="sec.id || sIdx"
            type="button"
            class="menu-item"
            @click="openSection(current.course, sec)"
          >
            <div class="menu-item__rail">
              <span class="menu-item__num">{{ String(sIdx + 1).padStart(2, '0') }}</span>
              <i v-if="sIdx < (current.sections?.length || 0) - 1" class="menu-item__line" />
            </div>
            <div class="menu-item__body">
              <strong>{{ sec.title }}</strong>
              <div class="menu-item__meta">
                <span class="dot">{{ sec.knowledges.length }} 个小节</span>
                <span class="dot soft">继续学习</span>
              </div>
            </div>
            <span class="material-symbols-outlined menu-item__chev">chevron_right</span>
          </button>
        </div>
      </template>

      <!-- 3. 章 → 小节列表 -->
      <template v-else-if="current.level === 'section'">
        <section class="panel soft-panel">
          <span class="pill slate">当前章节</span>
          <strong class="soft-panel__title">{{ current.section?.title }}</strong>
        </section>

        <div class="section-head">
          <span class="section-head__title">小节列表</span>
          <span class="section-head__count">{{ current.section?.knowledges?.length || 0 }}</span>
        </div>

        <TEmptyState
          v-if="!current.section.knowledges?.length"
          type="empty"
          message="该章暂无小节"
        />

        <div class="menu-list">
          <button
            v-for="(k, kIdx) in current.section.knowledges"
            :key="k.id || kIdx"
            type="button"
            class="menu-item"
            :class="{ done: k.completed }"
            @click="openKnowledge(current.course, current.section, k)"
          >
            <div class="menu-item__icon" :class="k.completed ? 'ok' : 'todo'">
              <span class="material-symbols-outlined">
                {{ k.completed ? 'check_circle' : 'play_lesson' }}
              </span>
            </div>
            <div class="menu-item__body">
              <strong>{{ k.title }}</strong>
              <div class="menu-item__meta">
                <span class="dot" :class="k.completed ? 'ok' : ''">
                  {{ k.completed ? '已完成' : '未完成' }}
                </span>
              </div>
            </div>
            <span class="material-symbols-outlined menu-item__chev">chevron_right</span>
          </button>
        </div>
      </template>

      <!-- 4. 小节 → 任务点 -->
      <template v-else-if="current.level === 'knowledge'">
        <section class="panel soft-panel">
          <span class="pill violet">任务点</span>
          <strong class="soft-panel__title">{{ current.knowledge?.title }}</strong>
          <p class="hint">{{ current.section?.title }}</p>
        </section>

        <div class="section-head">
          <span class="section-head__title">本页内容</span>
          <span class="section-head__count">{{ current.tasks?.length || 0 }} 项</span>
        </div>

        <TEmptyState
          v-if="!current.tasks?.length"
          type="empty"
          message="暂无任务"
        />

        <div class="menu-list">
          <button
            v-for="t in current.tasks"
            :key="t.id"
            type="button"
            class="menu-item task"
            @click="onTaskClick(current, t)"
          >
            <div
              class="menu-item__icon"
              :class="t.kind === 'video' ? 'vid' : t.kind === 'document' ? 'doc' : 'todo'"
            >
              <span class="material-symbols-outlined">
                {{
                  t.kind === 'video'
                    ? 'play_circle'
                    : t.kind === 'document'
                      ? 'description'
                      : 'task'
                }}
              </span>
            </div>
            <div class="menu-item__body">
              <strong>{{ t.title }}</strong>
              <div class="menu-item__meta">
                <TStatusBadge :type="t.typeMeta.type" :text="t.typeMeta.text" />
                <span class="dot">{{ t.status }}</span>
              </div>
            </div>
            <span class="material-symbols-outlined menu-item__chev accent">
              {{ t.kind === 'video' ? 'play_arrow' : 'chevron_right' }}
            </span>
          </button>
        </div>
      </template>

      <!-- 5. 成绩组成 -->
      <template v-else-if="current.level === 'score'">
        <section class="panel score-panel">
          <div class="score-total">
            <div>
              <span>综合成绩</span>
              <p v-if="current.score?.user_name" class="hint">{{ current.score.user_name }}</p>
            </div>
            <strong>{{ current.score?.total_score ?? current.score?.score?.score ?? '—' }}</strong>
          </div>

          <div v-if="scoreSlices.length" class="pie-wrap">
            <div class="pie" :style="{ background: pieGradient }" aria-hidden="true">
              <div class="pie-hole">
                <span>权重</span>
              </div>
            </div>
            <ul class="pie-legend">
              <li v-for="(s, i) in scoreSlices" :key="i">
                <i :style="{ background: s.color }" />
                <span>{{ s.name }}</span>
                <b>{{ s.value }}%</b>
              </li>
            </ul>
          </div>

          <ul v-if="(current.score?.weight_list || []).length" class="score-list">
            <li
              v-for="(w, i) in current.score.weight_list"
              :key="i"
            >
              <span>{{ w.name || w.key || '项目' }}</span>
              <b>{{ w.value ?? w.score ?? '—' }}{{ typeof w.value === 'number' ? '%' : '' }}</b>
            </li>
          </ul>
          <div v-else-if="current.score?.weight" class="weight-grid">
            <div class="wchip"><span>作业</span><b>{{ current.score.weight.work ?? 0 }}%</b></div>
            <div class="wchip"><span>考试</span><b>{{ current.score.weight.test ?? 0 }}%</b></div>
            <div class="wchip"><span>视频</span><b>{{ current.score.weight.video ?? 0 }}%</b></div>
            <div class="wchip"><span>签到</span><b>{{ current.score.weight.attend ?? 0 }}%</b></div>
          </div>
          <p v-if="current.score?.job" class="hint">
            任务点完成率 {{ current.score.job.jobFinishRate ?? '—' }}%
          </p>
          <button type="button" class="chip-btn" @click="openScore(current.course)">
            重新同步
          </button>
        </section>
      </template>

      <!-- 6. 应用内视频 -->
      <template v-else-if="current.level === 'video'">
        <section class="panel video-panel">
          <p class="crumb">{{ current.knowledge?.title }}</p>
          <h3 class="video-title">{{ current.filename || current.task?.title }}</h3>
          <p v-if="current.duration" class="hint">时长 {{ formatDuration(current.duration) }}</p>
          <video
            :key="activeVideoSrc"
            class="video-el"
            controls
            playsinline
            autoplay
            preload="metadata"
            :poster="current.poster || undefined"
            :src="activeVideoSrc"
            @error="onVideoError"
          />
          <p v-if="videoError" class="video-err">{{ videoError }}</p>
          <div class="btn-row video-actions">
            <button type="button" class="chip-btn ghost light" @click="retryVideo">
              <span class="material-symbols-outlined">refresh</span>
              重新加载
            </button>
            <button
              v-if="(current.playUrls || []).length > 1"
              type="button"
              class="chip-btn ghost light"
              @click="
                videoSrcIndex = (videoSrcIndex + 1) % current.playUrls.length;
                videoError = ''
              "
            >
              切换线路 {{ videoSrcIndex + 1 }}/{{ current.playUrls.length }}
            </button>
          </div>
          <p class="hint">播放在应用内完成，不跳转浏览器</p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cx-hub {
  min-height: 100%;
  background: #f4f7fb;
  color: #0f172a;
  padding-bottom: 100px;
}
.cx-hub__body {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 2px 2px 4px;
}
.crumb-btn {
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
}
.crumb-btn.current {
  color: #64748b;
  cursor: default;
}
.crumb-btn:not(.current):active {
  background: #e2e8f0;
}
.crumb-sep {
  color: #cbd5e1;
  font-size: 12px;
}
.page-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #64748b;
  padding: 4px 0;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px;
}
.hero-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.hero-row strong {
  font-size: 16px;
}
.hero-row p,
.hint,
.crumb {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 2px 0;
}
.section-head__title {
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.02em;
}
.section-head__count {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 2px 10px;
}
.pill {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 999px;
  padding: 3px 10px;
  margin-bottom: 8px;
}
.pill.slate {
  color: #475569;
  background: #e2e8f0;
}
.pill.violet {
  color: #6d28d9;
  background: #ede9fe;
}
.course-head {
  background: linear-gradient(145deg, #eff6ff 0%, #ffffff 55%);
  border-color: #bfdbfe;
}
.course-head__meta strong {
  display: block;
  font-size: 17px;
  line-height: 1.35;
}
.soft-panel {
  background: linear-gradient(160deg, #f8fafc, #fff);
}
.soft-panel__title {
  display: block;
  font-size: 16px;
  line-height: 1.4;
}
.menu-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
.menu-item {
  display: flex;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  padding: 14px 14px 14px 12px;
  cursor: pointer;
  color: inherit;
  transition: background 0.15s ease;
}
.menu-item:last-child {
  border-bottom: 0;
}
.menu-item:active {
  background: #f8fafc;
}
.menu-item.done .menu-item__body strong {
  color: #64748b;
}
.menu-item__rail {
  width: 36px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}
.menu-item__num {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(145deg, #2563eb, #3b82f6);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.28);
  z-index: 1;
}
.menu-item__line {
  flex: 1;
  width: 2px;
  background: #e2e8f0;
  margin-top: 4px;
  min-height: 12px;
}
.menu-item__icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  align-self: center;
}
.menu-item__icon.todo {
  background: #f1f5f9;
  color: #64748b;
}
.menu-item__icon.ok {
  background: #dcfce7;
  color: #16a34a;
}
.menu-item__icon.vid {
  background: #ede9fe;
  color: #7c3aed;
}
.menu-item__icon.doc {
  background: #fef3c7;
  color: #d97706;
}
.menu-item__body {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}
.menu-item__body strong {
  font-size: 14px;
  line-height: 1.4;
  font-weight: 700;
}
.menu-item__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.menu-item__meta .dot {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}
.menu-item__meta .dot.soft {
  color: #94a3b8;
  font-weight: 500;
}
.menu-item__meta .dot.ok {
  color: #16a34a;
}
.menu-item__chev {
  align-self: center;
  color: #cbd5e1;
  flex-shrink: 0;
}
.menu-item__chev.accent {
  color: #7c3aed;
}
.stat-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.stat {
  flex: 1;
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat span {
  font-size: 11px;
  color: #64748b;
}
.stat b {
  font-size: 18px;
}
.search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0 12px;
}
.search-wrap input {
  flex: 1;
  border: 0;
  outline: none;
  height: 42px;
  background: transparent;
  font-size: 14px;
}
.row-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  color: inherit;
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
}
.row-card:active {
  transform: scale(0.985);
}
.row-card.menu:hover {
  border-color: #93c5fd;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.08);
}
.row-card.course .cover {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  background: #e2e8f0;
}
.row-card.course .cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-fb {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
}
.icon-box {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.icon-box .idx {
  font-weight: 800;
  font-size: 15px;
}
.icon-box.blue {
  background: #dbeafe;
  color: #2563eb;
}
.icon-box.green {
  background: #dcfce7;
  color: #16a34a;
}
.icon-box.slate {
  background: #f1f5f9;
  color: #64748b;
}
.icon-box.violet {
  background: #ede9fe;
  color: #7c3aed;
}
.icon-box.amber {
  background: #fef3c7;
  color: #d97706;
}
.row-main {
  flex: 1;
  min-width: 0;
}
.row-main strong {
  display: block;
  font-size: 14px;
  line-height: 1.35;
}
.row-main p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.chev {
  color: #cbd5e1;
  flex-shrink: 0;
}
.mini-bar {
  margin-top: 8px;
  height: 4px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}
.mini-bar i {
  display: block;
  height: 100%;
  background: #2563eb;
  border-radius: 999px;
}
.btn-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: #2563eb;
  color: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.chip-btn.ghost {
  background: #eff6ff;
  color: #1d4ed8;
}
.chip-btn.ghost.light {
  background: rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
}
.chip-btn .material-symbols-outlined {
  font-size: 18px;
}
.ghost-btn {
  border: 0;
  background: transparent;
  color: #2563eb;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.err {
  color: #dc2626;
  font-size: 13px;
  margin: 8px 0 0;
}
.sem-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 2px 0 4px;
}
.sem-scroll::-webkit-scrollbar {
  display: none;
}
.sem-chip {
  flex: 0 0 auto;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.sem-chip.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.sem-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: #2563eb;
  background: #eff6ff;
  border-radius: 6px;
  padding: 1px 6px;
  margin-right: 4px;
}
.pie-wrap {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 8px 0;
}
.pie {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.12);
}
.pie-hole {
  position: absolute;
  inset: 28px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: #64748b;
}
.pie-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.pie-legend li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.pie-legend i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
.pie-legend span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #334155;
}
.pie-legend b {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.score-total {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 14px;
  gap: 12px;
}
.score-total span {
  font-size: 13px;
  color: #64748b;
}
.score-total strong {
  font-size: 40px;
  color: #2563eb;
  letter-spacing: -0.03em;
  line-height: 1;
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
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
}
.weight-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.wchip {
  background: #eff6ff;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
}
.wchip b {
  font-size: 18px;
  color: #1d4ed8;
}
.video-panel {
  background: #0f172a;
  color: #e2e8f0;
  border-color: #1e293b;
}
.video-title {
  margin: 8px 0 8px;
  font-size: 16px;
}
.video-el {
  width: 100%;
  border-radius: 12px;
  background: #000;
  max-height: 50vh;
  margin-top: 8px;
}
.video-err {
  color: #fca5a5;
  font-size: 12px;
  margin: 8px 0 0;
}
.video-actions {
  margin-top: 12px;
}
.video-panel .hint,
.video-panel .crumb {
  color: #94a3b8;
}
html.dark .cx-hub {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .panel,
html.dark .row-card,
html.dark .search-wrap,
html.dark .menu-list {
  background: var(--ui-surface, #111827);
  border-color: #334155;
}
html.dark .menu-item {
  background: var(--ui-surface, #111827);
  border-bottom-color: #1e293b;
}
html.dark .menu-item:active {
  background: #1e293b;
}
html.dark .section-head__title {
  color: #e2e8f0;
}
html.dark .section-head__count {
  background: #1e293b;
  color: #94a3b8;
}
html.dark .stat,
html.dark .score-list li {
  background: #1e293b;
}
html.dark .crumb-btn {
  color: #60a5fa;
}
html.dark .crumb-btn.current {
  color: #94a3b8;
}
html.dark .course-head,
html.dark .soft-panel {
  background: linear-gradient(145deg, #0f172a, #111827);
  border-color: #334155;
}
</style>
