<script setup lang="ts">
/**
 * 学习记录 · 6 Tab / 16 个 stat2 维度（P4-C，#1344；视觉按设计稿 v2 重做）。
 *
 * 设计稿：`stitch_dynamic_blue_white_interface`（Tailwind 版移动端设计）——
 * 课程英雄卡 + 分段 Tab + 渐变环形成绩 + 6 宫格指标卡 + 柱状图 + 渐变建议条。
 * 本文件用 scoped CSS 复刻同一套视觉语言（项目不引 Tailwind）。
 *
 * 三条硬约束：
 * - **懒加载**：点哪个 Tab 才请求哪几个维度（后端 5 分钟缓存，切 Tab 不重复打上游）；
 * - **零写操作**：只有「去学习通」一个出口，其它全是只读展示；
 * - **数据缺失就降级**：学分/课程性质等上游没给的字段不编造，缺就整行不渲染。
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
  { key: 'video', labelKey: 'chaoxing.study.tab.video', dims: ['taskSummary', 'videoTest', 'point', 'live', 'cxclass'] },
  { key: 'other', labelKey: 'chaoxing.study.tab.other', dims: ['nearTask', 'weekTask', 'ai-evaluate-stat'] }
]

const activeTab = ref<TabKey>('overview')
const loading = ref(false)
const error = ref('')
const dims = ref<Record<string, Record<string, unknown>>>({})
const errors = ref<Record<string, string>>({})
const loadedTabs = ref<Record<string, boolean>>({})
const coreRef = ref<ChaoxingHubCore | null>(null)

const tabOf = (key: TabKey) => TABS.find((tab) => tab.key === key) || TABS[0]

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

/* ── 取数 ─────────────────────────────────────────────────────── */
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

const bindCore = (core: ChaoxingHubCore) => {
  coreRef.value = core
  void loadTab(activeTab.value)
}

defineExpose({ bindCore, reload: () => loadTab(activeTab.value, true) })

watch(activeTab, (key) => {
  void loadTab(key)
})

/* ── 课程头卡 ─────────────────────────────────────────────────── */
const courseMeta = computed(() => {
  const bits: string[] = []
  if (props.course.teacher) bits.push(props.course.teacher)
  else bits.push(t('chaoxing.hub.teacherMissing'))
  if (props.course.semester) bits.push(props.course.semester)
  return bits
})

/* ── 概览 ─────────────────────────────────────────────────────── */
const scoreData = computed(() => payloadOf('score'))
const scoreDetail = computed(() => (scoreData.value.score as Record<string, unknown>) || {})
const scoreWeight = computed(() => (scoreData.value.weight as Record<string, unknown>) || {})

const totalScore = computed(() => num(scoreDetail.value.score))
/** 综合评定及格线（超星默认 60，权重表里没有显式字段） */
const PASS_LINE = 60

const scoreStatus = computed(() => {
  const score = totalScore.value
  if (score >= 85) return { text: t('chaoxing.study.grade.excellent'), tone: 'high' as const }
  if (score >= PASS_LINE) return { text: t('chaoxing.study.grade.good'), tone: 'mid' as const }
  return { text: t('chaoxing.study.grade.fail'), tone: 'low' as const }
})

/** 班级排位：jobRank / studentCount → 「前 N%」 */
const classRank = computed(() => {
  const job = payloadOf('job')
  const rank = num(job.jobRank)
  const total = num(job.studentCount)
  if (!rank || !total) return ''
  return Math.max(1, Math.round((rank / total) * 100))
})

const weightRate = (key: string): number => {
  const weight = num(scoreWeight.value[key])
  const got = num(scoreDetail.value[key])
  if (weight <= 0) return pct(got)
  return Math.max(0, Math.min(100, (got / weight) * 100))
}

const workRate = computed(() => weightRate('work'))
const testRate = computed(() => pct(payloadOf('test').finishPer))
const groupRate = computed(() => pct(payloadOf('groupTask').taskPer))
const signRate = computed(() => pct(payloadOf('sign').signPer))
const videoRate = computed(() => weightRate('video'))
const visitRate = computed(() => weightRate('visitTime'))

/** 6 宫格指标（文案/配色/进度条全部按设计稿） */
const metricCards = computed(() => [
  {
    key: 'work',
    label: t('chaoxing.study.card.work'),
    value: `${num(payloadOf('work').finishCount)}/${num(payloadOf('work').receivedNum)}`,
    badge: `${workRate.value.toFixed(0)}%`,
    badgeTone: 'muted',
    icon: 'assignment',
    iconTone: 'blue',
    barTone: 'blue',
    percent: workRate.value
  },
  {
    key: 'test',
    label: t('chaoxing.study.card.test'),
    // 实测：上游 `receivedNum` 与 `finishPer` 不自洽（46/46 却是 0%），
    // 用 `testNum/totalJob` 与完成率才一致
    value: `${num(payloadOf('test').testNum)}/${num(payloadOf('test').totalJob)}`,
    badge: testRate.value >= 100 ? t('chaoxing.study.badge.done') : `${testRate.value.toFixed(0)}%`,
    badgeTone: testRate.value >= 100 ? 'emerald' : 'muted',
    icon: 'quiz',
    iconTone: 'indigo',
    barTone: 'indigo',
    percent: testRate.value
  },
  {
    key: 'group',
    label: t('chaoxing.study.card.group'),
    value: `${num(payloadOf('groupTask').taskNum)}`,
    badge: num(payloadOf('groupTask').taskNum) > 0 ? `${groupRate.value.toFixed(0)}%` : t('chaoxing.study.badge.none'),
    badgeTone: 'muted',
    icon: 'groups',
    iconTone: 'sky',
    barTone: 'sky',
    percent: groupRate.value
  },
  {
    key: 'sign',
    label: t('chaoxing.study.card.sign'),
    value: `${signRate.value.toFixed(0)}%`,
    badge: signRate.value >= 100 ? t('chaoxing.study.badge.full') : t('chaoxing.study.badge.todo'),
    badgeTone: signRate.value >= 100 ? 'emerald' : 'amber',
    icon: 'how_to_reg',
    iconTone: 'amber',
    barTone: 'amber',
    percent: signRate.value
  },
  {
    key: 'video',
    label: t('chaoxing.study.card.video'),
    value: `${videoRate.value.toFixed(0)}%`,
    badge: videoRate.value >= 90 ? t('chaoxing.study.badge.ahead') : `${videoRate.value.toFixed(0)}%`,
    badgeTone: videoRate.value >= 90 ? 'emerald' : 'muted',
    icon: 'smart_display',
    iconTone: 'emerald',
    barTone: 'emerald',
    percent: videoRate.value
  },
  {
    key: 'visit',
    label: t('chaoxing.study.card.visit'),
    value: `${visitRate.value.toFixed(0)}%`,
    badge: visitRate.value >= 100 ? t('chaoxing.study.badge.full') : `${visitRate.value.toFixed(0)}%`,
    badgeTone: visitRate.value >= 100 ? 'teal' : 'muted',
    icon: 'visibility',
    iconTone: 'teal',
    barTone: 'teal',
    percent: visitRate.value
  }
])

/* ── 近 7 次访问 ──────────────────────────────────────────────── */
const weekPv = computed(() => {
  const data = payloadOf('weekPv')
  const counts = Array.isArray(data.counts) ? (data.counts as unknown[]).map((v) => num(v)) : []
  const dates = Array.isArray(data.dates) ? (data.dates as unknown[]).map((v) => String(v)) : []
  const max = Math.max(1, ...counts)
  const peak = counts.indexOf(max)
  return counts.map((count, index) => ({
    date: dates[index] || '',
    count,
    height: count === 0 ? 4 : Math.max(12, Math.round((count / max) * 128)),
    peak: index === peak && count > 0
  }))
})
const weekPvTotal = computed(() => weekPv.value.reduce((sum, item) => sum + item.count, 0))
const weekPvAvg = computed(() =>
  weekPv.value.length ? (weekPvTotal.value / weekPv.value.length).toFixed(1) : '0.0'
)
/** 学习活跃度：按「日均访问次数」分档 */
const activityLabel = computed(() => {
  const avg = Number(weekPvAvg.value)
  if (avg >= 3) return t('chaoxing.study.visit.high')
  if (avg >= 1) return t('chaoxing.study.visit.mid')
  return t('chaoxing.study.visit.low')
})

/* ── 签到 ─────────────────────────────────────────────────────── */
const signBuckets = computed(() => {
  const data = payloadOf('sign')
  return [
    { key: 'attendance', label: t('chaoxing.study.sign.normal'), value: num(data.attendanceCount), tone: 'emerald' },
    { key: 'late', label: t('chaoxing.study.sign.late'), value: num(data.lateCount), tone: 'amber' },
    { key: 'early', label: t('chaoxing.study.sign.early'), value: num(data.earlyCount), tone: 'orange' },
    { key: 'absence', label: t('chaoxing.study.sign.absence'), value: num(data.absenceCount), tone: 'rose' },
    { key: 'sick', label: t('chaoxing.study.sign.sick'), value: num(data.sickCount), tone: 'sky' },
    { key: 'public', label: t('chaoxing.study.sign.public'), value: num(data.publicCount), tone: 'violet' },
    { key: 'overdue', label: t('chaoxing.study.sign.overdue'), value: num(data.overdueCount), tone: 'slate' }
  ]
})
const signMax = computed(() => Math.max(1, ...signBuckets.value.map((item) => item.value)))

/* ── 视频 ────────────────────────────────────────────────────── */
/**
 * 观看时长来自 `taskSummary`（`stat2/task/s/index` 服务端渲染页）：
 * 实测 累计观看 2059.7 分钟 / 总时长 2528 分钟 / 任务点 311/374 / 阅读 102.8 分钟。
 * 该页用的是统计首页里的 **jobEnc**（不是 pEnc），后端已处理。
 */
const taskSummary = computed(() => payloadOf('taskSummary'))
const watchedMinutes = computed(() => num(taskSummary.value.video_watched_minutes))
const totalMinutes = computed(() => num(taskSummary.value.video_total_minutes))
const readMinutes = computed(() => num(taskSummary.value.read_minutes))
const taskDone = computed(() => num(taskSummary.value.completed))
const taskTotal = computed(() => num(taskSummary.value.task_points))
const taskPercent = computed(() =>
  taskTotal.value > 0 ? (taskDone.value / taskTotal.value) * 100 : 0
)
/** 视频观看进度（累计观看 / 总时长），与「视频得分率」是两个不同口径 */
const videoWatchRate = computed(() => pct(taskSummary.value.video_percent))
/**
 * 视频口径（审计结论）：
 * - stat2 的 `live` / `cxclass` 是**直播/回放**时长，不是视频任务点观看时长；
 * - 真正的「视频完成情况」在 `score.data.score.video`（得分）与 `score.data.weight.video`（权重）；
 * - stat2 没有「观看分钟数」字段，所以不编造，只用得分率表达完成度。
 */
const videoScore = computed(() => num(scoreDetail.value.video))
const videoWeight = computed(() => num(scoreWeight.value.video))
const hasLiveData = computed(
  () =>
    num(liveData.value.livingTime) +
      num(liveData.value.playbackTime) +
      num(cxclassData.value.watchTimeMinutes) +
      num(cxclassData.value.lookBackTime) >
    0
)

/* ── 访问视图（7 天 / 30 天）───────────────────────────────────── */
/**
 * 审计结论：`weekPv` **只返回 7 个点**，加 `days/type/week/period` 参数都无变化，
 * 也没有 `monthPv` 等 30 天维度（11 个候选名全部 404）。因此「30 天」不画假图，
 * 改为展示真实可得的口径：访问得分（score.visitTime / weight.visitTime）+ 说明。
 */
const visitView = ref<'7d' | '30d'>('7d')
const visitScore = computed(() => num(scoreDetail.value.visitTime))
const visitWeight = computed(() => num(scoreWeight.value.visitTime))

/* ── 其他 ────────────────────────────────────────────────────── */
const behindTasks = computed(() => listOf('behindTask').filter((item) => item && item.name).slice(0, 8))
const weekTasks = computed(() => listOf('importWeekTask').filter((item) => item && item.name).slice(0, 8))
const nearTasks = computed(() => listOf('nearTask').filter((item) => item && item.name).slice(0, 8))
const videoTestData = computed(() => payloadOf('videoTest'))
const liveData = computed(() => payloadOf('live'))
const pointData = computed(() => payloadOf('point'))
const cxclassData = computed(() => payloadOf('cxclass'))
const aiData = computed(() => payloadOf('ai-evaluate-stat'))

/* ── 环形（SVG 渐变 + stroke-dasharray）──────────────────────── */
const RING_SIZE = 160
const RING_RADIUS = 62
const RING_CIRC = 2 * Math.PI * RING_RADIUS
const ringOffset = (percent: number) => RING_CIRC * (1 - pct(percent) / 100)

/* ── 数字递增（rAF 300ms，easeOutCubic）──────────────────────── */
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
    const eased = 1 - Math.pow(1 - progress, 3)
    const next: Record<string, number> = {}
    Object.keys(targets).forEach((key) => {
      next[key] = from[key] + (targets[key] - from[key]) * eased
    })
    animated.value = next
    if (progress < 1) rafId = requestAnimationFrame(step)
  }
  rafId = requestAnimationFrame(step)
}
const shown = (key: string, fallback = 0) => {
  const value = animated.value[key]
  return value === undefined ? fallback : value
}

watch(
  () => [activeTab.value, totalScore.value, signRate.value, weekPvTotal.value],
  () => {
    animateNumbers({ score: totalScore.value, sign: signRate.value, weekPv: weekPvTotal.value })
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <section class="sr">
    <!-- 课程英雄卡 -->
    <section class="sr-hero">
      <div class="sr-hero__glow" aria-hidden="true" />
      <div class="sr-hero__head">
        <div class="sr-hero__main">
          <span class="sr-pill sr-pill--blue"><i />{{ t('chaoxing.hub.studyRecord') }}</span>
          <h2 class="sr-hero__title">{{ course?.title || t('chaoxing.study.title') }}</h2>
          <p class="sr-hero__meta">
            <span class="material-symbols-outlined">person</span>
            {{ courseMeta.join(' · ') }}
          </p>
        </div>
      </div>
    </section>

    <!-- 分段 Tab -->
    <nav class="sr-tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        class="sr-tab"
        :class="{ 'is-active': activeTab === tab.key }"
        :aria-selected="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ t(tab.labelKey) }}
      </button>
    </nav>

    <div v-if="loading" class="sr-tip">{{ t('chaoxing.study.loading') }}</div>
    <div v-else-if="error" class="sr-tip is-error">{{ error }}</div>

    <!-- ① 概览 -->
    <template v-if="activeTab === 'overview'">
      <!-- 成绩环 -->
      <section class="sr-card sr-gauge">
        <div class="sr-gauge__ring">
          <svg :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`" class="sr-gauge__svg">
            <defs>
              <linearGradient id="srRingAmber" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#F59E0B" />
                <stop offset="60%" stop-color="#F97316" />
                <stop offset="100%" stop-color="#EA580C" />
              </linearGradient>
            </defs>
            <circle
              :cx="RING_SIZE / 2"
              :cy="RING_SIZE / 2"
              :r="RING_RADIUS"
              fill="none"
              stroke="var(--md-sys-color-surface-variant, #F1F5F9)"
              :stroke-width="12"
              stroke-linecap="round"
            />
            <circle
              class="sr-gauge__arc"
              :cx="RING_SIZE / 2"
              :cy="RING_SIZE / 2"
              :r="RING_RADIUS"
              fill="none"
              stroke="url(#srRingAmber)"
              :stroke-width="13"
              stroke-linecap="round"
              :stroke-dasharray="RING_CIRC"
              :stroke-dashoffset="ringOffset(shown('score', totalScore))"
            />
          </svg>
          <div class="sr-gauge__center">
            <strong>{{ shown('score', totalScore).toFixed(1) }}</strong>
            <span>{{ t('chaoxing.study.totalScore') }}</span>
            <em class="sr-gauge__badge" :class="`is-${scoreStatus.tone}`">{{ scoreStatus.text }}</em>
          </div>
        </div>
        <div class="sr-gauge__foot">
          <span class="sr-gauge__foot-left"><i />{{ tf('chaoxing.study.passLine', { n: PASS_LINE.toFixed(1) }) }}</span>
          <span v-if="classRank" class="sr-gauge__foot-right">{{ tf('chaoxing.study.classRank', { n: classRank }) }}</span>
        </div>
      </section>

      <!-- 6 宫格指标 -->
      <section class="sr-grid">
        <article v-for="card in metricCards" :key="card.key" class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon" :class="`is-${card.iconTone}`">
              <span class="material-symbols-outlined">{{ card.icon }}</span>
            </span>
            <span class="sr-metric__badge" :class="`is-${card.badgeTone}`">{{ card.badge }}</span>
          </div>
          <strong class="sr-metric__value">{{ card.value }}</strong>
          <span class="sr-metric__label">{{ card.label }}</span>
          <i class="sr-metric__bar"><b :class="`is-${card.barTone}`" :style="{ width: card.percent + '%' }" /></i>
        </article>
      </section>

      <!-- 近 7 次访问 -->
      <section class="sr-card sr-chart">
        <div class="sr-chart__head">
          <div>
            <div class="sr-chart__title">
              <h3>{{ t('chaoxing.study.visit.title') }}</h3>
              <span class="sr-pill sr-pill--blue-soft">{{ t('chaoxing.study.visit.badge') }}</span>
            </div>
            <p class="sr-chart__sub">
              {{ t('chaoxing.study.visit.total') }}
              <b>{{ shown('weekPv', weekPvTotal).toFixed(0) }}</b>
              {{ t('chaoxing.study.visit.times') }} ·
              {{ t('chaoxing.study.visit.avg') }}
              <b class="sr-chart__sub-strong">{{ weekPvAvg }}</b>
              {{ t('chaoxing.study.visit.perDay') }}
            </p>
          </div>
          <div class="sr-seg" role="group">
            <button
              type="button"
              :class="{ 'is-active': visitView === '7d' }"
              @click="visitView = '7d'"
            >
              {{ t('chaoxing.study.visit.days7') }}
            </button>
            <button
              type="button"
              :class="{ 'is-active': visitView === '30d' }"
              @click="visitView = '30d'"
            >
              {{ t('chaoxing.study.visit.days30') }}
            </button>
          </div>
        </div>

        <div v-if="visitView === '7d'" class="sr-bars">
          <div class="sr-bars__grid" aria-hidden="true"><i /><i /><i /><i /></div>
          <div v-for="item in weekPv" :key="item.date" class="sr-bar" :class="{ 'is-peak': item.peak }">
            <span class="sr-bar__value">{{ item.count }}<i v-if="item.peak" /></span>
            <b :style="{ height: item.height + 'px' }" />
            <span class="sr-bar__date">{{ item.date }}</span>
          </div>
        </div>
        <!-- 30 天视图：学习通只提供 7 天明细，这里展示真实可得的「访问得分」口径 -->
        <div v-else class="sr-visit30">
          <div class="sr-visit30__row">
            <span>{{ t('chaoxing.study.visit.score') }}</span>
            <strong>{{ visitScore }} / {{ visitWeight }}</strong>
          </div>
          <i class="sr-dist__track">
            <b :class="`is-${visitRate >= 70 ? 'emerald' : visitRate >= 30 ? 'amber' : 'rose'}`" :style="{ width: visitRate + '%' }" />
          </i>
          <p class="sr-visit30__hint">{{ t('chaoxing.study.visit.days30Hint') }}</p>
        </div>

        <div class="sr-chart__foot">
          <span class="sr-chart__foot-left"><i />{{ t('chaoxing.study.visit.activity') }}{{ activityLabel }}</span>
        </div>
      </section>
    </template>

    <!-- ② 签到 -->
    <template v-else-if="activeTab === 'sign'">
      <section class="sr-card sr-gauge">
        <div class="sr-gauge__ring">
          <svg :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`" class="sr-gauge__svg">
            <defs>
              <linearGradient id="srRingSign" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#34D399" />
                <stop offset="100%" stop-color="#10B981" />
              </linearGradient>
            </defs>
            <circle :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="RING_RADIUS" fill="none" stroke="var(--md-sys-color-surface-variant, #F1F5F9)" :stroke-width="12" stroke-linecap="round" />
            <circle
              class="sr-gauge__arc"
              :cx="RING_SIZE / 2"
              :cy="RING_SIZE / 2"
              :r="RING_RADIUS"
              fill="none"
              stroke="url(#srRingSign)"
              :stroke-width="13"
              stroke-linecap="round"
              :stroke-dasharray="RING_CIRC"
              :stroke-dashoffset="ringOffset(shown('sign', signRate))"
            />
          </svg>
          <div class="sr-gauge__center">
            <strong>{{ shown('sign', signRate).toFixed(1) }}%</strong>
            <span>{{ t('chaoxing.study.sign.rate') }}</span>
          </div>
        </div>
        <div class="sr-gauge__foot">
          <span class="sr-gauge__foot-left"><i />{{ tf('chaoxing.study.sign.total', { n: num(payloadOf('sign').allCount) }) }}</span>
          <span class="sr-gauge__foot-right">{{ tf('chaoxing.study.sign.overdueCount', { n: num(payloadOf('sign').overdueCount) }) }}</span>
        </div>
      </section>

      <section class="sr-card sr-panel">
        <div class="sr-panel__head">
          <h3>{{ t('chaoxing.study.sign.distribution') }}</h3>
        </div>
        <p v-if="num(payloadOf('sign').allCount) === 0" class="sr-empty">
          {{ t('chaoxing.study.sign.empty') }}
        </p>
        <div v-else class="sr-dist">
          <div v-for="bucket in signBuckets" :key="bucket.key" class="sr-dist__row">
            <span class="sr-dist__label">{{ bucket.label }}</span>
            <i class="sr-dist__track"><b :class="`is-${bucket.tone}`" :style="{ width: (bucket.value / signMax) * 100 + '%' }" /></i>
            <span class="sr-dist__value">{{ bucket.value }}</span>
          </div>
        </div>
      </section>
    </template>

    <!-- ③ 作业 -->
    <template v-else-if="activeTab === 'work'">
      <section class="sr-grid">
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-blue"><span class="material-symbols-outlined">assignment_turned_in</span></span>
            <span class="sr-metric__badge is-muted">{{ workRate.toFixed(0) }}%</span>
          </div>
          <strong class="sr-metric__value">{{ num(payloadOf('work').finishCount) }}/{{ num(payloadOf('work').receivedNum) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.card.work') }}</span>
          <i class="sr-metric__bar"><b class="is-blue" :style="{ width: workRate + '%' }" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-indigo"><span class="material-symbols-outlined">percent</span></span>
          </div>
          <strong class="sr-metric__value">{{ pct(payloadOf('work').finishPer).toFixed(0) }}%</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.work.rate') }}</span>
          <i class="sr-metric__bar"><b class="is-indigo" :style="{ width: pct(payloadOf('work').finishPer) + '%' }" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-amber"><span class="material-symbols-outlined">star</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(payloadOf('work').workScore) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.work.score') }}</span>
          <i class="sr-metric__bar"><b class="is-amber" style="width: 100%" /></i>
        </article>
      </section>

      <section class="sr-card sr-panel">
        <div class="sr-panel__head">
          <h3>{{ t('chaoxing.study.work.overdue') }}</h3>
          <span class="sr-panel__count">{{ behindTasks.length }}</span>
        </div>
        <p v-if="!behindTasks.length" class="sr-empty">{{ t('chaoxing.study.work.noOverdue') }}</p>
        <button v-for="item in behindTasks" :key="String(item.id)" type="button" class="sr-row" @click="emit('open-official', item)">
          <span class="sr-row__main">
            <strong>{{ item.name }}</strong>
            <small>{{ item.chapterName || item.endDate || '' }}</small>
          </span>
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </section>

      <section class="sr-card sr-panel">
        <div class="sr-panel__head">
          <h3>{{ t('chaoxing.study.work.thisWeek') }}</h3>
          <span class="sr-panel__count">{{ weekTasks.length }}</span>
        </div>
        <p v-if="!weekTasks.length" class="sr-empty">{{ t('chaoxing.study.work.noWeek') }}</p>
        <button v-for="item in weekTasks" :key="String(item.id)" type="button" class="sr-row" @click="emit('open-official', item)">
          <span class="sr-row__main">
            <strong>{{ item.name }}</strong>
            <small>{{ item.endTimeStr || '' }}</small>
          </span>
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </section>
    </template>

    <!-- ④ 测验 -->
    <template v-else-if="activeTab === 'test'">
      <section class="sr-card sr-gauge">
        <div class="sr-gauge__ring">
          <svg :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`" class="sr-gauge__svg">
            <defs>
              <linearGradient id="srRingTest" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#818CF8" />
                <stop offset="100%" stop-color="#4F46E5" />
              </linearGradient>
            </defs>
            <circle :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="RING_RADIUS" fill="none" stroke="var(--md-sys-color-surface-variant, #F1F5F9)" :stroke-width="12" stroke-linecap="round" />
            <circle
              class="sr-gauge__arc"
              :cx="RING_SIZE / 2"
              :cy="RING_SIZE / 2"
              :r="RING_RADIUS"
              fill="none"
              stroke="url(#srRingTest)"
              :stroke-width="13"
              stroke-linecap="round"
              :stroke-dasharray="RING_CIRC"
              :stroke-dashoffset="ringOffset(testRate)"
            />
          </svg>
          <div class="sr-gauge__center">
            <strong>{{ testRate.toFixed(1) }}%</strong>
            <span>{{ t('chaoxing.study.test.rate') }}</span>
          </div>
        </div>
        <div class="sr-gauge__foot">
          <span class="sr-gauge__foot-left"><i />{{ tf('chaoxing.study.test.done', { a: num(payloadOf('test').testNum), b: num(payloadOf('test').totalJob) }) }}</span>
          <span class="sr-gauge__foot-right">{{ tf('chaoxing.study.test.avg', { n: num(payloadOf('test').testAvgScore) }) }}</span>
        </div>
      </section>

      <section class="sr-grid">
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-indigo"><span class="material-symbols-outlined">task_alt</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(payloadOf('test').testNum) }}/{{ num(payloadOf('test').totalJob) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.test.doneLabel') }}</span>
          <i class="sr-metric__bar"><b class="is-indigo" :style="{ width: testRate + '%' }" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-amber"><span class="material-symbols-outlined">grade</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(payloadOf('test').testAvgScore) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.test.avgLabel') }}</span>
          <i class="sr-metric__bar"><b class="is-amber" style="width: 100%" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-emerald"><span class="material-symbols-outlined">play_lesson</span></span>
            <span v-if="num(videoTestData.count) > 0" class="sr-metric__badge is-emerald">
              {{ pct(videoTestData.finishPer).toFixed(0) }}%
            </span>
            <span v-else class="sr-metric__badge is-muted">{{ t('chaoxing.study.badge.none') }}</span>
          </div>
          <strong class="sr-metric__value">
            {{ num(videoTestData.count) > 0 ? `${num(videoTestData.finishCount)}/${num(videoTestData.count)}` : '—' }}
          </strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.test.video') }}</span>
          <i class="sr-metric__bar"><b class="is-emerald" :style="{ width: pct(videoTestData.finishPer) + '%' }" /></i>
        </article>
      </section>
    </template>

    <!-- ⑤ 视频（观看时长来自 taskSummary；直播/回放来自 live/cxclass） -->
    <template v-else-if="activeTab === 'video'">
      <section class="sr-card sr-gauge">
        <div class="sr-gauge__ring">
          <svg :viewBox="`0 0 ${RING_SIZE} ${RING_SIZE}`" class="sr-gauge__svg">
            <defs>
              <linearGradient id="srRingVideo" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#34D399" />
                <stop offset="100%" stop-color="#059669" />
              </linearGradient>
            </defs>
            <circle :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="RING_RADIUS" fill="none" stroke="var(--md-sys-color-surface-variant, #F1F5F9)" :stroke-width="12" stroke-linecap="round" />
            <circle
              class="sr-gauge__arc"
              :cx="RING_SIZE / 2"
              :cy="RING_SIZE / 2"
              :r="RING_RADIUS"
              fill="none"
              stroke="url(#srRingVideo)"
              :stroke-width="13"
              stroke-linecap="round"
              :stroke-dasharray="RING_CIRC"
              :stroke-dashoffset="ringOffset(videoWatchRate)"
            />
          </svg>
          <div class="sr-gauge__center">
            <strong>{{ videoWatchRate.toFixed(1) }}%</strong>
            <span>{{ t('chaoxing.study.video.rate') }}</span>
          </div>
        </div>
        <div class="sr-gauge__foot">
          <span class="sr-gauge__foot-left">
            <i />{{ tf('chaoxing.study.video.watchedLine', { a: watchedMinutes, b: totalMinutes }) }}
          </span>
          <span class="sr-gauge__foot-right">{{ tf('chaoxing.study.video.readLine', { n: readMinutes }) }}</span>
        </div>
      </section>

      <section class="sr-grid">
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-emerald"><span class="material-symbols-outlined">smart_display</span></span>
            <span class="sr-metric__badge is-emerald">{{ videoWatchRate.toFixed(0) }}%</span>
          </div>
          <strong class="sr-metric__value">{{ watchedMinutes }} <small>{{ t('chaoxing.study.video.minuteUnit') }}</small></strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.watched') }}</span>
          <i class="sr-metric__bar"><b class="is-emerald" :style="{ width: videoWatchRate + '%' }" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-sky"><span class="material-symbols-outlined">schedule</span></span>
          </div>
          <strong class="sr-metric__value">{{ totalMinutes }} <small>{{ t('chaoxing.study.video.minuteUnit') }}</small></strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.total') }}</span>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-indigo"><span class="material-symbols-outlined">menu_book</span></span>
            <span class="sr-metric__badge is-muted">{{ num(taskSummary.read_required_minutes) }} {{ t('chaoxing.study.video.minuteUnit') }}</span>
          </div>
          <strong class="sr-metric__value">{{ readMinutes }} <small>{{ t('chaoxing.study.video.minuteUnit') }}</small></strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.read') }}</span>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-amber"><span class="material-symbols-outlined">task_alt</span></span>
            <span class="sr-metric__badge" :class="taskPercent >= 70 ? 'is-emerald' : 'is-muted'">{{ taskPercent.toFixed(0) }}%</span>
          </div>
          <strong class="sr-metric__value">{{ taskDone }}/{{ taskTotal }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.taskPoints') }}</span>
          <i class="sr-metric__bar"><b class="is-amber" :style="{ width: taskPercent + '%' }" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-blue"><span class="material-symbols-outlined">grade</span></span>
            <span class="sr-metric__badge is-muted">{{ videoRate.toFixed(0) }}%</span>
          </div>
          <strong class="sr-metric__value">{{ videoScore }}/{{ videoWeight }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.score') }}</span>
          <i class="sr-metric__bar"><b class="is-blue" :style="{ width: videoRate + '%' }" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-violet"><span class="material-symbols-outlined">play_lesson</span></span>
            <span v-if="num(videoTestData.count) > 0" class="sr-metric__badge is-emerald">{{ pct(videoTestData.finishPer).toFixed(0) }}%</span>
            <span v-else class="sr-metric__badge is-muted">{{ t('chaoxing.study.badge.none') }}</span>
          </div>
          <strong class="sr-metric__value">
            {{ num(videoTestData.count) > 0 ? `${num(videoTestData.finishCount)}/${num(videoTestData.count)}` : '—' }}
          </strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.videoTest') }}</span>
          <i class="sr-metric__bar"><b class="is-violet" :style="{ width: pct(videoTestData.finishPer) + '%' }" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-teal"><span class="material-symbols-outlined">stars</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(pointData.ponits) }}/{{ num(pointData.activeLimit) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.points') }}</span>
          <i class="sr-metric__bar"><b class="is-teal" :style="{ width: Math.min(100, (num(pointData.ponits) / Math.max(1, num(pointData.activeLimit))) * 100) + '%' }" /></i>
        </article>
      </section>

      <section class="sr-card sr-panel">
        <div class="sr-panel__head">
          <h3>{{ t('chaoxing.study.video.liveSection') }}</h3>
          <span class="sr-panel__count">{{ hasLiveData ? t('chaoxing.study.badge.done') : t('chaoxing.study.badge.none') }}</span>
        </div>
        <p v-if="!hasLiveData" class="sr-empty">{{ t('chaoxing.study.video.noLive') }}</p>
        <div v-else class="sr-dist">
          <div class="sr-dist__row">
            <span class="sr-dist__label">{{ t('chaoxing.study.video.live') }}</span>
            <span class="sr-dist__value">{{ num(liveData.livingTime) }}</span>
          </div>
          <div class="sr-dist__row">
            <span class="sr-dist__label">{{ t('chaoxing.study.video.playback') }}</span>
            <span class="sr-dist__value">{{ num(liveData.playbackTime) }}</span>
          </div>
          <div class="sr-dist__row">
            <span class="sr-dist__label">{{ t('chaoxing.study.video.watch') }}</span>
            <span class="sr-dist__value">{{ num(cxclassData.watchTimeMinutes) }}</span>
          </div>
          <div class="sr-dist__row">
            <span class="sr-dist__label">{{ t('chaoxing.study.video.lookback') }}</span>
            <span class="sr-dist__value">{{ num(cxclassData.lookBackTime) }}</span>
          </div>
        </div>
      </section>
    </template>

    <!-- ⑥ 其他 -->
    <template v-else>
      <section class="sr-grid">
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-violet"><span class="material-symbols-outlined">psychology</span></span>
            <span class="sr-metric__badge is-emerald">{{ pct(aiData.aiEvaluatePer).toFixed(0) }}%</span>
          </div>
          <strong class="sr-metric__value">{{ pct(aiData.aiEvaluatePer).toFixed(0) }}%</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.other.ai') }}</span>
          <i class="sr-metric__bar"><b class="is-violet" :style="{ width: pct(aiData.aiEvaluatePer) + '%' }" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-emerald"><span class="material-symbols-outlined">task_alt</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(aiData.aiEvaluateReachCount) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.other.aiReach') }}</span>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-blue"><span class="material-symbols-outlined">edit_note</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(aiData.practiceCount) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.other.practice') }}</span>
        </article>
      </section>

      <section class="sr-card sr-panel">
        <div class="sr-panel__head">
          <h3>{{ t('chaoxing.study.other.near') }}</h3>
          <span class="sr-panel__count">{{ nearTasks.length }}</span>
        </div>
        <p v-if="!nearTasks.length" class="sr-empty">{{ t('chaoxing.study.other.noNear') }}</p>
        <button v-for="item in nearTasks" :key="String(item.id)" type="button" class="sr-row" @click="emit('open-official', item)">
          <span class="sr-row__main">
            <strong>{{ item.name }}</strong>
            <small>{{ item.endDate || item.endTimeStr || '' }}</small>
          </span>
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </section>
    </template>

    <!-- 底部建议条（设计稿：考勤预警 + 行动按钮） -->
    <footer v-if="activeTab === 'overview' || activeTab === 'sign'" class="sr-cta">
      <div class="sr-cta__text">
        <h4>{{ t('chaoxing.study.cta.title') }}</h4>
        <p>{{ tf('chaoxing.study.cta.desc', { n: signRate.toFixed(0) }) }}</p>
      </div>
      <button type="button" class="sr-cta__btn" @click="emit('open-official', null)">
        {{ t('chaoxing.tasks.openChaoxing') }}
      </button>
    </footer>

    <p class="sr-foot">{{ t('chaoxing.study.footnote') }}</p>
  </section>
</template>

<style src="../../../styles/views/ChaoxingStudyRecord.scoped.css" scoped></style>
