<script setup lang="ts">
/**
 * 学习记录 · 6 Tab / 16 个 stat2 维度（P4-C，#1344）。
 *
 * 设计要点：
 * - **懒加载**：点哪个 Tab 才请求哪几个维度（后端按 5 分钟缓存，切 Tab 不重复打上游）；
 * - **可视化**：SVG `stroke-dasharray` 环形 + 纯 CSS 柱状图 / 分布条，**不引第三方图表库**；
 * - **配色随完成率变化**：<30% 红 / 30–70% 橙 / >70% 绿；
 * - **数字递增**：`requestAnimationFrame` 300ms 从 0 滚到目标值；
 * - **零写操作**：只有「打开学习通」一个出口，其它全是只读展示。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { tf, useLocale } from '../../../utils/app_i18n'
import type { ChaoxingCourse } from '../types'
import type { ChaoxingHubCore } from '../composables/useChaoxingHubCore'

const props = defineProps({
  course: { type: Object as () => ChaoxingCourse, required: true }
})

const emit = defineEmits(['open-official'])

const { t } = useLocale()

type TabKey = 'overview' | 'sign' | 'work' | 'test' | 'video' | 'other'

const TABS: Array<{ key: TabKey; labelKey: string; dims: string[] }> = [
  { key: 'overview', labelKey: 'chaoxing.study.tab.overview', dims: ['score', 'job', 'test', 'work', 'groupTask', 'point', 'sign', 'weekPv'] },
  { key: 'sign', labelKey: 'chaoxing.study.tab.sign', dims: ['sign'] },
  { key: 'work', labelKey: 'chaoxing.study.tab.work', dims: ['job', 'work', 'behindTask', 'importWeekTask'] },
  { key: 'test', labelKey: 'chaoxing.study.tab.test', dims: ['test', 'videoTest'] },
  { key: 'video', labelKey: 'chaoxing.study.tab.video', dims: ['live', 'point', 'cxclass'] },
  { key: 'other', labelKey: 'chaoxing.study.tab.other', dims: ['nearTask', 'weekTask', 'ai-evaluate-stat'] }
]

const activeTab = ref<TabKey>('overview')
const loading = ref(false)
const error = ref('')
/** dimension → 原始响应（同一维度在多个 Tab 复用） */
const dims = ref<Record<string, Record<string, unknown>>>({})
const errors = ref<Record<string, string>>({})
const loadedTabs = ref<Record<string, boolean>>({})

const tabOf = (key: TabKey) => TABS.find((tab) => tab.key === key) || TABS[0]

/** 取维度响应里的 data（stat2 有的维度有 data 包裹，有的直接在顶层） */
const payloadOf = (dim: string): Record<string, unknown> => {
  const raw = dims.value[dim] || {}
  const data = (raw as Record<string, unknown>).data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return raw as Record<string, unknown>
}

const listOf = (dim: string): Array<Record<string, unknown>> => {
  const raw = dims.value[dim] || {}
  const data = (raw as Record<string, unknown>).data
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  const resultList = (data as Record<string, unknown> | undefined)?.resultList
  if (Array.isArray(resultList)) return resultList as Array<Record<string, unknown>>
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>
  return []
}

const num = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const pct = (value: unknown): number => Math.max(0, Math.min(100, num(value)))

/** 完成率配色：<30 红 / 30–70 橙 / >70 绿 */
const rateColor = (percent: number): string =>
  percent >= 70 ? '#10b981' : percent >= 30 ? '#f59e0b' : '#ef4444'

/* ── 环形（SVG stroke-dasharray）───────────────────────────────── */
const RING_SIZE = 132
const RING_STROKE = 12
const ringRadius = (RING_SIZE - RING_STROKE) / 2
const ringCircumference = 2 * Math.PI * ringRadius

const ringStyle = (percent: number) => {
  const value = pct(percent)
  return {
    strokeDasharray: `${ringCircumference} ${ringCircumference}`,
    strokeDashoffset: `${ringCircumference * (1 - value / 100)}`,
    stroke: rateColor(value)
  }
}

/* ── 数字递增（rAF 300ms）────────────────────────────────────── */
const animated = ref<Record<string, number>>({})
let rafId = 0

const animateNumbers = (targets: Record<string, number>) => {
  if (rafId) cancelAnimationFrame(rafId)
  const start = performance.now()
  const from: Record<string, number> = {}
  Object.keys(targets).forEach((key) => {
    from[key] = animated.value[key] || 0
  })
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / 300)
    // easeOutCubic：末尾收得慢一点，数字更像「落定」
    const eased = 1 - Math.pow(1 - progress, 3)
    const next: Record<string, number> = {}
    Object.keys(targets).forEach((key) => {
      next[key] = from[key] + (targets[key] - from[key]) * eased
    })
    animated.value = next
    if (progress < 1) {
      rafId = requestAnimationFrame(step)
    }
  }
  rafId = requestAnimationFrame(step)
}

const shown = (key: string, fallback = 0) => {
  const value = animated.value[key]
  return value === undefined ? fallback : value
}

/* ── 取数 ─────────────────────────────────────────────────────── */
const coreRef = ref<ChaoxingHubCore | null>(null)

const loadTab = async (key: TabKey, force = false) => {
  if (!force && loadedTabs.value[key]) return
  const tab = tabOf(key)
  const missing = tab.dims.filter((dim) => force || !dims.value[dim])
  if (!missing.length) {
    loadedTabs.value[key] = true
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await coreRef.value?.cxInvoke('chaoxing_fetch_study_record', {
      courseId: props.course.courseId,
      clazzId: props.course.clazzId,
      cpi: props.course.cpi || '',
      dimensions: missing,
      force
    })
    if (res?.dimensions && typeof res.dimensions === 'object') {
      dims.value = { ...dims.value, ...(res.dimensions as Record<string, Record<string, unknown>>) }
    }
    if (res?.errors && typeof res.errors === 'object') {
      errors.value = { ...errors.value, ...(res.errors as Record<string, string>) }
    }
    loadedTabs.value[key] = true
    const firstError = Object.values(errors.value)[0]
    if (firstError && !Object.keys(dims.value).length) error.value = String(firstError)
  } catch (e) {
    error.value = String((e as Error)?.message || e || t('chaoxing.study.loadFailed'))
  } finally {
    loading.value = false
  }
}

/** 父组件把 core 传进来（复用其 cxInvoke 统一错误处理） */
const bindCore = (core: ChaoxingHubCore) => {
  coreRef.value = core
  void loadTab(activeTab.value)
}

defineExpose({ bindCore, reload: () => loadTab(activeTab.value, true) })

watch(activeTab, (key) => {
  void loadTab(key)
})

/* ── 概览 ─────────────────────────────────────────────────────── */
const scoreData = computed(() => payloadOf('score'))
const scoreDetail = computed(() => (scoreData.value.score as Record<string, unknown>) || {})
const scoreWeight = computed(() => (scoreData.value.weight as Record<string, unknown>) || {})

const totalScore = computed(() => num(scoreDetail.value.score))
const videoRate = computed(() => {
  const weight = num(scoreWeight.value.video)
  const got = num(scoreDetail.value.video)
  return weight > 0 ? (got / weight) * 100 : pct(got)
})
const workRate = computed(() => {
  const weight = num(scoreWeight.value.work)
  const got = num(scoreDetail.value.work)
  return weight > 0 ? (got / weight) * 100 : pct(got)
})
const testRate = computed(() => pct(payloadOf('test').finishPer))
const groupRate = computed(() => pct(payloadOf('groupTask').taskPer))
const signRate = computed(() => pct(payloadOf('sign').signPer))
const visitScore = computed(() => {
  const weight = num(scoreWeight.value.visitTime)
  const got = num(scoreDetail.value.visitTime)
  return weight > 0 ? (got / weight) * 100 : pct(got)
})

const overviewCards = computed(() => [
  {
    key: 'work',
    icon: 'assignment',
    label: t('chaoxing.study.card.work'),
    value: `${num(payloadOf('work').finishCount)}/${num(payloadOf('work').receivedNum)}`,
    percent: workRate.value
  },
  {
    key: 'test',
    icon: 'quiz',
    label: t('chaoxing.study.card.test'),
    value: `${num(payloadOf('test').receivedNum)}/${num(payloadOf('test').totalJob)}`,
    percent: testRate.value
  },
  {
    key: 'group',
    icon: 'groups',
    label: t('chaoxing.study.card.group'),
    value: `${num(payloadOf('groupTask').taskNum)}`,
    percent: groupRate.value
  },
  {
    key: 'sign',
    icon: 'how_to_reg',
    label: t('chaoxing.study.card.sign'),
    value: `${signRate.value.toFixed(0)}%`,
    percent: signRate.value
  },
  {
    key: 'video',
    icon: 'smart_display',
    label: t('chaoxing.study.card.video'),
    value: `${videoRate.value.toFixed(0)}%`,
    percent: videoRate.value
  },
  {
    key: 'visit',
    icon: 'visibility',
    label: t('chaoxing.study.card.visit'),
    value: `${visitScore.value.toFixed(0)}%`,
    percent: visitScore.value
  }
])

/** 近 7 次访问柱状图 */
const weekPv = computed(() => {
  const data = payloadOf('weekPv')
  const counts = Array.isArray(data.counts) ? (data.counts as unknown[]).map((v) => num(v)) : []
  const dates = Array.isArray(data.dates) ? (data.dates as unknown[]).map((v) => String(v)) : []
  const max = Math.max(1, ...counts)
  return counts.map((count, index) => ({
    date: dates[index] || '',
    count,
    height: Math.max(4, Math.round((count / max) * 100))
  }))
})
const weekPvTotal = computed(() => weekPv.value.reduce((sum, item) => sum + item.count, 0))
const weekPvAvg = computed(() =>
  weekPv.value.length ? (weekPvTotal.value / weekPv.value.length).toFixed(1) : '0.0'
)

/* ── 签到 ─────────────────────────────────────────────────────── */
const signBuckets = computed(() => {
  const data = payloadOf('sign')
  return [
    { key: 'attendance', label: t('chaoxing.study.sign.normal'), value: num(data.attendanceCount), color: '#10b981' },
    { key: 'late', label: t('chaoxing.study.sign.late'), value: num(data.lateCount), color: '#f59e0b' },
    { key: 'early', label: t('chaoxing.study.sign.early'), value: num(data.earlyCount), color: '#fb923c' },
    { key: 'absence', label: t('chaoxing.study.sign.absence'), value: num(data.absenceCount), color: '#ef4444' },
    { key: 'sick', label: t('chaoxing.study.sign.sick'), value: num(data.sickCount), color: '#38bdf8' },
    { key: 'public', label: t('chaoxing.study.sign.public'), value: num(data.publicCount), color: '#8b5cf6' },
    { key: 'overdue', label: t('chaoxing.study.sign.overdue'), value: num(data.overdueCount), color: '#94a3b8' }
  ]
})
const signMax = computed(() => Math.max(1, ...signBuckets.value.map((item) => item.value)))

/* ── 作业 / 测验 ──────────────────────────────────────────────── */
const behindTasks = computed(() =>
  listOf('behindTask').filter((item) => item && item.name).slice(0, 8)
)
const weekTasks = computed(() =>
  listOf('importWeekTask').filter((item) => item && item.name).slice(0, 8)
)
const videoTestData = computed(() => payloadOf('videoTest'))

/* ── 视频 / 其他 ──────────────────────────────────────────────── */
const liveData = computed(() => payloadOf('live'))
const pointData = computed(() => payloadOf('point'))
const cxclassData = computed(() => payloadOf('cxclass'))
const aiData = computed(() => payloadOf('ai-evaluate-stat'))
const nearTasks = computed(() => listOf('nearTask').filter((item) => item && item.name).slice(0, 8))
const weekTaskStat = computed(() => payloadOf('weekTask'))

/* ── 递增动画触发点 ───────────────────────────────────────────── */
watch(
  () => [activeTab.value, totalScore.value, signRate.value, weekPvTotal.value],
  () => {
    animateNumbers({
      score: totalScore.value,
      sign: signRate.value,
      weekPv: weekPvTotal.value
    })
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <section class="study">
    <!-- Tab 栏 -->
    <div class="study__tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        class="study__tab"
        :class="{ 'is-active': activeTab === tab.key }"
        :aria-selected="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ t(tab.labelKey) }}
      </button>
    </div>

    <div v-if="loading" class="study__tip">{{ t('chaoxing.study.loading') }}</div>
    <div v-else-if="error" class="study__tip is-error">{{ error }}</div>

    <!-- ① 概览 -->
    <template v-if="activeTab === 'overview'">
      <div class="study__ring-card">
        <svg class="study__ring" :width="RING_SIZE" :height="RING_SIZE" :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`">
          <circle class="study__ring-track" :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="ringRadius" :stroke-width="RING_STROKE" />
          <circle
            class="study__ring-value"
            :cx="RING_SIZE / 2"
            :cy="RING_SIZE / 2"
            :r="ringRadius"
            :stroke-width="RING_STROKE"
            :style="ringStyle(totalScore)"
            transform-origin="center"
          />
        </svg>
        <div class="study__ring-text">
          <strong>{{ shown('score', totalScore).toFixed(1) }}</strong>
          <span>{{ t('chaoxing.study.totalScore') }}</span>
        </div>
      </div>

      <div class="study__grid">
        <div v-for="card in overviewCards" :key="card.key" class="study__card">
          <span class="material-symbols-outlined">{{ card.icon }}</span>
          <strong>{{ card.value }}</strong>
          <span class="study__card-label">{{ card.label }}</span>
          <i class="study__mini-bar"><b :style="{ width: card.percent + '%', background: rateColor(card.percent) }" /></i>
        </div>
      </div>

      <div class="study__panel">
        <div class="study__panel-head">
          <strong>{{ t('chaoxing.study.visit.title') }}</strong>
          <span>{{ tf('chaoxing.study.visit.summary', { n: shown('weekPv', weekPvTotal).toFixed(0), a: weekPvAvg }) }}</span>
        </div>
        <div class="study__bars">
          <div v-for="item in weekPv" :key="item.date" class="study__bar">
            <span class="study__bar-value">{{ item.count }}</span>
            <i :style="{ height: item.height + '%' }" />
            <span class="study__bar-label">{{ item.date }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- ② 签到 -->
    <template v-else-if="activeTab === 'sign'">
      <div class="study__ring-card">
        <svg class="study__ring" :width="RING_SIZE" :height="RING_SIZE" :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`">
          <circle class="study__ring-track" :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="ringRadius" :stroke-width="RING_STROKE" />
          <circle
            class="study__ring-value"
            :cx="RING_SIZE / 2"
            :cy="RING_SIZE / 2"
            :r="ringRadius"
            :stroke-width="RING_STROKE"
            :style="ringStyle(signRate)"
          />
        </svg>
        <div class="study__ring-text">
          <strong>{{ shown('sign', signRate).toFixed(1) }}%</strong>
          <span>{{ t('chaoxing.study.sign.rate') }}</span>
        </div>
      </div>

      <div class="study__panel">
        <div class="study__panel-head">
          <strong>{{ t('chaoxing.study.sign.distribution') }}</strong>
          <span>{{ tf('chaoxing.study.sign.total', { n: num(payloadOf('sign').allCount) }) }}</span>
        </div>
        <div class="study__dist">
          <div v-for="bucket in signBuckets" :key="bucket.key" class="study__dist-row">
            <span class="study__dist-label">{{ bucket.label }}</span>
            <i class="study__dist-track">
              <b :style="{ width: (bucket.value / signMax) * 100 + '%', background: bucket.color }" />
            </i>
            <span class="study__dist-value">{{ bucket.value }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- ③ 作业 -->
    <template v-else-if="activeTab === 'work'">
      <div class="study__grid">
        <div class="study__card">
          <span class="material-symbols-outlined">assignment_turned_in</span>
          <strong>{{ num(payloadOf('work').finishCount) }}/{{ num(payloadOf('work').receivedNum) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.card.work') }}</span>
          <i class="study__mini-bar"><b :style="{ width: workRate + '%', background: rateColor(workRate) }" /></i>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">percent</span>
          <strong>{{ pct(payloadOf('work').finishPer).toFixed(0) }}%</strong>
          <span class="study__card-label">{{ t('chaoxing.study.work.rate') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">star</span>
          <strong>{{ num(payloadOf('work').workScore) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.work.score') }}</span>
        </div>
      </div>

      <div class="study__panel">
        <div class="study__panel-head">
          <strong>{{ t('chaoxing.study.work.overdue') }}</strong>
          <span>{{ behindTasks.length }}</span>
        </div>
        <p v-if="!behindTasks.length" class="study__empty">{{ t('chaoxing.study.work.noOverdue') }}</p>
        <button
          v-for="item in behindTasks"
          :key="String(item.id)"
          type="button"
          class="study__row"
          @click="emit('open-official', item)"
        >
          <span class="study__row-main">
            <strong>{{ item.name }}</strong>
            <small>{{ item.chapterName || item.endDate || '' }}</small>
          </span>
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      <div class="study__panel">
        <div class="study__panel-head">
          <strong>{{ t('chaoxing.study.work.thisWeek') }}</strong>
          <span>{{ weekTasks.length }}</span>
        </div>
        <p v-if="!weekTasks.length" class="study__empty">{{ t('chaoxing.study.work.noWeek') }}</p>
        <button
          v-for="item in weekTasks"
          :key="String(item.id)"
          type="button"
          class="study__row"
          @click="emit('open-official', item)"
        >
          <span class="study__row-main">
            <strong>{{ item.name }}</strong>
            <small>{{ item.endTimeStr || '' }}</small>
          </span>
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
    </template>

    <!-- ④ 测验 -->
    <template v-else-if="activeTab === 'test'">
      <div class="study__ring-card">
        <svg class="study__ring" :width="RING_SIZE" :height="RING_SIZE" :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`">
          <circle class="study__ring-track" :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="ringRadius" :stroke-width="RING_STROKE" />
          <circle
            class="study__ring-value"
            :cx="RING_SIZE / 2"
            :cy="RING_SIZE / 2"
            :r="ringRadius"
            :stroke-width="RING_STROKE"
            :style="ringStyle(testRate)"
          />
        </svg>
        <div class="study__ring-text">
          <strong>{{ testRate.toFixed(1) }}%</strong>
          <span>{{ t('chaoxing.study.test.rate') }}</span>
        </div>
      </div>

      <div class="study__grid">
        <div class="study__card">
          <span class="material-symbols-outlined">task_alt</span>
          <strong>{{ num(payloadOf('test').receivedNum) }}/{{ num(payloadOf('test').totalJob) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.test.done') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">grade</span>
          <strong>{{ num(payloadOf('test').testAvgScore) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.test.avg') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">play_lesson</span>
          <strong>{{ pct(videoTestData.finishPer).toFixed(0) }}%</strong>
          <span class="study__card-label">{{ t('chaoxing.study.test.video') }}</span>
        </div>
      </div>

      <div class="study__panel">
        <div class="study__panel-head">
          <strong>{{ t('chaoxing.study.test.videoDetail') }}</strong>
          <span>{{ num(videoTestData.finishCount) }}/{{ num(videoTestData.count) }}</span>
        </div>
        <div class="study__dist">
          <div class="study__dist-row">
            <span class="study__dist-label">{{ t('chaoxing.study.test.videoQuestions') }}</span>
            <i class="study__dist-track">
              <b :style="{ width: pct(videoTestData.finishPer) + '%', background: rateColor(pct(videoTestData.finishPer)) }" />
            </i>
            <span class="study__dist-value">{{ num(videoTestData.finishQuestionCount) }}/{{ num(videoTestData.questionCount) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- ⑤ 视频 -->
    <template v-else-if="activeTab === 'video'">
      <div class="study__grid">
        <div class="study__card">
          <span class="material-symbols-outlined">live_tv</span>
          <strong>{{ num(liveData.livingTime) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.video.live') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">replay</span>
          <strong>{{ num(liveData.playbackTime) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.video.playback') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">schedule</span>
          <strong>{{ num(cxclassData.watchTimeMinutes) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.video.watch') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">history</span>
          <strong>{{ num(cxclassData.lookBackTime) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.video.lookback') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">stars</span>
          <strong>{{ num(pointData.ponits) }}/{{ num(pointData.activeLimit) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.video.points') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">local_fire_department</span>
          <strong>{{ pct(pointData.activityParticipationRate).toFixed(0) }}%</strong>
          <span class="study__card-label">{{ t('chaoxing.study.video.activity') }}</span>
        </div>
      </div>
    </template>

    <!-- ⑥ 其他 -->
    <template v-else>
      <div class="study__grid">
        <div class="study__card">
          <span class="material-symbols-outlined">flag</span>
          <strong>{{ num(weekTaskStat.finishCount) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.other.finished') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">psychology</span>
          <strong>{{ pct(aiData.aiEvaluatePer).toFixed(0) }}%</strong>
          <span class="study__card-label">{{ t('chaoxing.study.other.ai') }}</span>
        </div>
        <div class="study__card">
          <span class="material-symbols-outlined">menu_book</span>
          <strong>{{ num(aiData.publishLibraryNum) }}</strong>
          <span class="study__card-label">{{ t('chaoxing.study.other.library') }}</span>
        </div>
      </div>

      <div class="study__panel">
        <div class="study__panel-head">
          <strong>{{ t('chaoxing.study.other.near') }}</strong>
          <span>{{ nearTasks.length }}</span>
        </div>
        <p v-if="!nearTasks.length" class="study__empty">{{ t('chaoxing.study.other.noNear') }}</p>
        <button
          v-for="item in nearTasks"
          :key="String(item.id)"
          type="button"
          class="study__row"
          @click="emit('open-official', item)"
        >
          <span class="study__row-main">
            <strong>{{ item.name }}</strong>
            <small>{{ item.endDate || item.endTimeStr || '' }}</small>
          </span>
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
    </template>

    <p class="study__foot">{{ t('chaoxing.study.footnote') }}</p>
  </section>
</template>

<style scoped>
.study {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.study__tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}
.study__tabs::-webkit-scrollbar {
  display: none;
}
.study__tab {
  flex: 0 0 auto;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
}
.study__tab.is-active {
  background: #0058be;
  border-color: #0058be;
  color: #fff;
}

.study__tip {
  padding: 12px;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}
.study__tip.is-error {
  color: #ef4444;
}

/* 大环 */
.study__ring-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
}
.study__ring {
  transform: rotate(-90deg);
}
.study__ring-track {
  fill: none;
  stroke: #eef2f7;
}
.study__ring-value {
  fill: none;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.6s ease, stroke 0.3s ease;
}
.study__ring-text {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.study__ring-text strong {
  font-size: 26px;
  line-height: 1;
  color: #0f172a;
}
.study__ring-text span {
  font-size: 11px;
  color: #64748b;
}

/* 数字卡 2×3 */
.study__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.study__card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  min-width: 0;
}
.study__card .material-symbols-outlined {
  font-size: 18px;
  color: #0058be;
}
.study__card strong {
  font-size: 17px;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.study__card-label {
  font-size: 11px;
  color: #64748b;
}
.study__mini-bar {
  display: block;
  height: 4px;
  border-radius: 999px;
  background: #eef2f7;
  overflow: hidden;
  margin-top: 4px;
}
.study__mini-bar b {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s ease;
}

/* 面板 */
.study__panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
}
.study__panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.study__panel-head strong {
  font-size: 13px;
  color: #0f172a;
}
.study__panel-head span {
  font-size: 11px;
  color: #94a3b8;
}

/* 柱状图（纯 CSS） */
.study__bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 120px;
  padding-top: 8px;
}
.study__bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 100%;
}
.study__bar i {
  display: block;
  width: 100%;
  max-width: 26px;
  border-radius: 6px 6px 2px 2px;
  background: linear-gradient(180deg, #38bdf8, #0058be);
  transition: height 0.6s ease;
}
.study__bar-value {
  font-size: 10px;
  color: #64748b;
}
.study__bar-label {
  font-size: 9px;
  color: #94a3b8;
  white-space: nowrap;
}

/* 分布条 */
.study__dist {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.study__dist-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.study__dist-label {
  width: 64px;
  flex-shrink: 0;
  font-size: 11px;
  color: #64748b;
}
.study__dist-track {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: #eef2f7;
  overflow: hidden;
}
.study__dist-track b {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s ease;
}
.study__dist-value {
  width: 34px;
  text-align: right;
  font-size: 11px;
  color: #0f172a;
}

/* 列表行 */
.study__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border: 1px solid #eef2f7;
  border-radius: 12px;
  background: #fbfdff;
  cursor: pointer;
  text-align: left;
}
.study__row-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.study__row-main strong {
  font-size: 13px;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.study__row-main small {
  font-size: 11px;
  color: #94a3b8;
}
.study__row .material-symbols-outlined {
  font-size: 18px;
  color: #cbd5e1;
}
.study__empty {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
  padding: 8px 0;
}
.study__foot {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}
</style>
