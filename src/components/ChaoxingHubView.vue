<script setup>
/**
 * 学习通课程中心 — 复用 /v2/chaoxing/courses 与 outline/progress
 * Issue: #437
 */
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'
import { TPageHeader, TEmptyState, TStatusBadge } from './templates'

const props = defineProps({
  studentId: { type: String, default: '' }
})
const emit = defineEmits(['back'])

const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const loading = ref(true)
const detailLoading = ref(false)
const error = ref('')
const courses = ref([])
const selectedId = ref('')
const outline = ref([])
const progress = ref({})
const statusMeta = ref({})

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
  return {
    id: safeText(raw.id || raw.course_id || raw.courseId || raw.clazzid || raw.cpi),
    courseId: safeText(raw.course_id || raw.courseId || raw.courseid || ''),
    clazzId: safeText(raw.clazz_id || raw.clazzId || raw.clazzid || ''),
    cpi: safeText(raw.cpi || ''),
    title: safeText(raw.title || raw.name || raw.course_name || raw.courseName || '未命名课程'),
    teacher: safeText(raw.teacher || raw.teacher_name || raw.teacherName || ''),
    progressText: safeText(raw.progress_text || raw.progressText || raw.progress || ''),
    progressRate: safeNumber(raw.progress_rate ?? raw.progressRate ?? raw.progress_percent ?? raw.percent),
    pendingCount: safeNumber(raw.pending_count ?? raw.pendingCount ?? raw.todo_count),
    courseUrl: safeText(raw.url || raw.course_url || raw.courseUrl || ''),
    raw
  }
}

const selected = computed(() => courses.value.find((c) => c.id === selectedId.value) || null)
const sessionOk = computed(() => {
  if (statusMeta.value?.connected === true) return true
  const t = safeText(statusMeta.value.status || statusMeta.value.state).toLowerCase()
  return /(connected|ready|已连接|可用|success|ok)/.test(t)
})

const loadList = async () => {
  loading.value = true
  error.value = ''
  try {
    const [statusRes, courseRes] = await Promise.all([
      axios.post(`${API_BASE}/v2/chaoxing/session_status`, { student_id: props.studentId || '' }),
      axios.post(`${API_BASE}/v2/chaoxing/courses`, { student_id: props.studentId || '' })
    ])
    const statusPayload = statusRes?.data || {}
    const coursePayload = courseRes?.data || {}
    if (statusPayload?.success === false) throw new Error(statusPayload?.error || '会话状态失败')
    if (coursePayload?.success === false) throw new Error(coursePayload?.error || '课程列表失败')
    statusMeta.value = unwrap(statusPayload) || {}
    const data = unwrap(coursePayload)
    const list = Array.isArray(data?.courses) ? data.courses : Array.isArray(data) ? data : []
    courses.value = list.map(normalizeCourse).filter((c) => c.id)
    if (!selectedId.value && courses.value.length) {
      selectedId.value = courses.value[0].id
      await loadDetail(selectedId.value)
    }
  } catch (e) {
    error.value = safeText(e?.message || e) || '加载失败'
  } finally {
    loading.value = false
  }
}

const loadDetail = async (id) => {
  const cur = courses.value.find((c) => c.id === id)
  if (!cur?.courseId || !cur?.clazzId) return
  detailLoading.value = true
  try {
    const [outlineRes, progressRes] = await Promise.all([
      axios.post(`${API_BASE}/v2/chaoxing/course_outline`, {
        student_id: props.studentId || '',
        course_id: cur.courseId,
        clazz_id: cur.clazzId,
        cpi: cur.cpi,
        course_url: cur.courseUrl || ''
      }),
      axios.post(`${API_BASE}/v2/chaoxing/course_progress`, {
        student_id: props.studentId || '',
        course_id: cur.courseId,
        clazz_id: cur.clazzId,
        cpi: cur.cpi,
        course_url: cur.courseUrl || ''
      })
    ])
    const outlineData = unwrap(outlineRes?.data)
    const sections = Array.isArray(outlineData?.sections)
      ? outlineData.sections
      : Array.isArray(outlineData?.outline)
        ? outlineData.outline
        : Array.isArray(outlineData?.nodes)
          ? outlineData.nodes
          : []
    outline.value = sections
    progress.value = unwrap(progressRes?.data) || {}
  } catch (e) {
    showToast(safeText(e?.message || e) || '详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

const selectCourse = async (id) => {
  selectedId.value = id
  await loadDetail(id)
}

const openCourseWeb = async () => {
  const cur = selected.value
  if (!cur) return
  try {
    const res = await axios.post(`${API_BASE}/v2/chaoxing/launch_url`, {
      student_id: props.studentId || '',
      course_id: cur.courseId,
      clazz_id: cur.clazzId,
      cpi: cur.cpi,
      course_url: cur.courseUrl || ''
    })
    const data = unwrap(res?.data)
    const url = safeText(data?.url || data?.launch_url || cur.courseUrl)
    if (url) await openExternal(url)
    else showToast('暂无可用课程链接')
  } catch (e) {
    if (cur.courseUrl) await openExternal(cur.courseUrl)
    else showToast(safeText(e?.message || e) || '打开失败')
  }
}

onMounted(loadList)
</script>

<template>
  <div class="cx-hub-page" data-theme="graphite_night">
    <TPageHeader title="课程中心" subtitle="学习通课程与进度" @back="emit('back')" />

    <div class="cx-hub-body">
      <div class="cx-hub-toolbar">
        <TStatusBadge
          :type="sessionOk ? 'success' : 'warning'"
          :text="sessionOk ? '会话可用' : '会话待恢复'"
        />
        <button type="button" class="cx-hub-btn" :disabled="loading" @click="loadList">
          {{ loading ? '加载中…' : '刷新' }}
        </button>
      </div>

      <p v-if="error" class="cx-hub-error">{{ error }}</p>

      <TEmptyState
        v-if="!loading && !courses.length && !error"
        title="暂无课程"
        description="登录融合门户并完成学习通 SSO 后，将显示课程列表。"
      />

      <div v-else class="cx-hub-layout">
        <section class="cx-hub-list card-surface">
          <h3 class="cx-hub-section-title">我的课程</h3>
          <button
            v-for="c in courses"
            :key="c.id"
            type="button"
            class="cx-hub-item"
            :class="{ active: c.id === selectedId }"
            @click="selectCourse(c.id)"
          >
            <div class="cx-hub-item-title">{{ c.title }}</div>
            <div class="cx-hub-item-meta">
              <span v-if="c.teacher">{{ c.teacher }}</span>
              <span v-if="c.progressText">{{ c.progressText }}</span>
              <span v-if="c.pendingCount">待办 {{ c.pendingCount }}</span>
            </div>
          </button>
        </section>

        <section class="cx-hub-detail card-surface">
          <template v-if="selected">
            <div class="cx-hub-detail-head">
              <div>
                <h3>{{ selected.title }}</h3>
                <p v-if="selected.teacher">{{ selected.teacher }}</p>
              </div>
              <button type="button" class="cx-hub-btn primary" @click="openCourseWeb">打开课程</button>
            </div>
            <p v-if="detailLoading" class="cx-hub-muted">正在加载章节…</p>
            <ul v-else-if="outline.length" class="cx-hub-outline">
              <li v-for="(sec, idx) in outline.slice(0, 40)" :key="sec.id || idx">
                {{ sec.title || sec.name || `章节 ${idx + 1}` }}
              </li>
            </ul>
            <p v-else class="cx-hub-muted">暂无章节大纲，可点「打开课程」在学习通查看通知与作业。</p>
          </template>
          <TEmptyState v-else title="选择课程" description="左侧点选一门课程查看详情。" />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cx-hub-page {
  min-height: 100%;
  background: var(--ui-bg, #f5f7fb);
  color: var(--ui-text, #0f172a);
}
.cx-hub-body {
  padding: 12px 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cx-hub-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.cx-hub-btn {
  border: 1px solid var(--ui-border, #d0d7e2);
  background: var(--ui-surface, #fff);
  color: var(--ui-text, #0f172a);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
}
.cx-hub-btn.primary {
  background: var(--ui-primary, #2563eb);
  border-color: transparent;
  color: #fff;
}
.cx-hub-error {
  color: #dc2626;
  font-size: 13px;
}
.cx-hub-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 12px;
}
@media (max-width: 860px) {
  .cx-hub-layout {
    grid-template-columns: 1fr;
  }
}
.card-surface {
  background: var(--ui-surface, #fff);
  border: 1px solid var(--ui-border, #e2e8f0);
  border-radius: 14px;
  padding: 12px;
}
.cx-hub-section-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
}
.cx-hub-item {
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 6px;
  color: inherit;
  cursor: pointer;
}
.cx-hub-item.active,
.cx-hub-item:hover {
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 10%, transparent);
  border-color: color-mix(in srgb, var(--ui-primary, #2563eb) 30%, transparent);
}
.cx-hub-item-title {
  font-weight: 600;
  font-size: 14px;
}
.cx-hub-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--ui-muted, #64748b);
}
.cx-hub-detail-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
}
.cx-hub-detail-head h3 {
  margin: 0;
  font-size: 16px;
}
.cx-hub-detail-head p,
.cx-hub-muted {
  margin: 4px 0 0;
  color: var(--ui-muted, #64748b);
  font-size: 13px;
}
.cx-hub-outline {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.6;
}
html.dark .cx-hub-page,
[data-theme='graphite_night'] .cx-hub-page {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .card-surface,
[data-theme='graphite_night'] .card-surface {
  background: var(--ui-surface, #111827);
  border-color: var(--ui-border, #1f2937);
}
</style>
