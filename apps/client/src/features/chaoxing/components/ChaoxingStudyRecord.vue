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
  { key: 'video', labelKey: 'chaoxing.study.tab.video', dims: ['live', 'point', 'cxclass'] },
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

/* ── 作业 / 测验 / 视频 / 其他 ────────────────────────────────── */
const behindTasks = computed(() => listOf('behindTask').filter((item) => item && item.name).slice(0, 8))
const weekTasks = computed(() => listOf('importWeekTask').filter((item) => item && item.name).slice(0, 8))
const nearTasks = computed(() => listOf('nearTask').filter((item) => item && item.name).slice(0, 8))
const videoTestData = computed(() => payloadOf('videoTest'))
const liveData = computed(() => payloadOf('live'))
const pointData = computed(() => payloadOf('point'))
const cxclassData = computed(() => payloadOf('cxclass'))
const aiData = computed(() => payloadOf('ai-evaluate-stat'))
const weekTaskStat = computed(() => payloadOf('weekTask'))

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
            <button type="button" class="is-active">{{ t('chaoxing.study.visit.days7') }}</button>
            <button type="button" disabled :title="t('chaoxing.study.visit.days30Hint')">
              {{ t('chaoxing.study.visit.days30') }}
            </button>
          </div>
        </div>

        <div class="sr-bars">
          <div class="sr-bars__grid" aria-hidden="true"><i /><i /><i /><i /></div>
          <div v-for="item in weekPv" :key="item.date" class="sr-bar" :class="{ 'is-peak': item.peak }">
            <span class="sr-bar__value">{{ item.count }}<i v-if="item.peak" /></span>
            <b :style="{ height: item.height + 'px' }" />
            <span class="sr-bar__date">{{ item.date }}</span>
          </div>
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
        <div class="sr-dist">
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
            <span class="sr-metric__badge is-emerald">{{ pct(videoTestData.finishPer).toFixed(0) }}%</span>
          </div>
          <strong class="sr-metric__value">{{ num(videoTestData.finishCount) }}/{{ num(videoTestData.count) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.test.video') }}</span>
          <i class="sr-metric__bar"><b class="is-emerald" :style="{ width: pct(videoTestData.finishPer) + '%' }" /></i>
        </article>
      </section>
    </template>

    <!-- ⑤ 视频 -->
    <template v-else-if="activeTab === 'video'">
      <section class="sr-grid">
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-rose"><span class="material-symbols-outlined">live_tv</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(liveData.livingTime) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.live') }}</span>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-sky"><span class="material-symbols-outlined">replay</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(liveData.playbackTime) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.playback') }}</span>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-emerald"><span class="material-symbols-outlined">schedule</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(cxclassData.watchTimeMinutes) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.watch') }}</span>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-indigo"><span class="material-symbols-outlined">history</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(cxclassData.lookBackTime) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.lookback') }}</span>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-amber"><span class="material-symbols-outlined">stars</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(pointData.ponits) }}/{{ num(pointData.activeLimit) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.points') }}</span>
          <i class="sr-metric__bar"><b class="is-amber" :style="{ width: Math.min(100, (num(pointData.ponits) / Math.max(1, num(pointData.activeLimit))) * 100) + '%' }" /></i>
        </article>
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-teal"><span class="material-symbols-outlined">local_fire_department</span></span>
          </div>
          <strong class="sr-metric__value">{{ pct(pointData.activityParticipationRate).toFixed(0) }}%</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.video.activity') }}</span>
          <i class="sr-metric__bar"><b class="is-teal" :style="{ width: pct(pointData.activityParticipationRate) + '%' }" /></i>
        </article>
      </section>
    </template>

    <!-- ⑥ 其他 -->
    <template v-else>
      <section class="sr-grid">
        <article class="sr-metric">
          <div class="sr-metric__top">
            <span class="sr-metric__icon is-blue"><span class="material-symbols-outlined">flag</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(weekTaskStat.finishCount) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.other.finished') }}</span>
        </article>
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
            <span class="sr-metric__icon is-sky"><span class="material-symbols-outlined">menu_book</span></span>
          </div>
          <strong class="sr-metric__value">{{ num(aiData.publishLibraryNum) }}</strong>
          <span class="sr-metric__label">{{ t('chaoxing.study.other.library') }}</span>
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

<style scoped>
.sr {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--md-sys-color-on-surface, #1e293b);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', Inter, sans-serif;
}

/* ── 通用卡片 ── */
.sr-card {
  background: var(--md-sys-color-surface-container-lowest, #fff);
  border: 1px solid var(--md-sys-color-surface-variant, #f1f5f9);
  border-radius: 24px;
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.05);
}

/* ── 课程英雄卡 ── */
.sr-hero {
  position: relative;
  overflow: hidden;
  background: var(--md-sys-color-surface-container-lowest, #fff);
  border: 1px solid var(--md-sys-color-surface-variant, #f1f5f9);
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.05);
}
.sr-hero__glow {
  position: absolute;
  right: -32px;
  top: -32px;
  width: 112px;
  height: 112px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(96, 165, 250, 0.28), rgba(99, 102, 241, 0.06));
  filter: blur(18px);
  pointer-events: none;
}
.sr-hero__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.sr-hero__main {
  min-width: 0;
}
.sr-hero__title {
  margin: 6px 0 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--md-sys-color-on-surface, #0f172a);
  line-height: 1.25;
}
.sr-hero__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
}
.sr-hero__meta .material-symbols-outlined {
  font-size: 15px;
}

.sr-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.sr-pill i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  animation: srPulse 1.8s ease-in-out infinite;
}
.sr-pill--blue {
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  border: 1px solid rgba(37, 99, 235, 0.25);
}
.sr-pill--blue-soft {
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  font-size: 10px;
}
.sr-tag {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
}
.sr-tag--amber {
  background: rgba(217, 119, 6, 0.14);
  color: #b45309;
  border: 1px solid rgba(217, 119, 6, 0.3);
}

/* ── Tab ── */
.sr-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 2px 0;
}
.sr-tabs::-webkit-scrollbar {
  display: none;
}
.sr-tab {
  flex: 0 0 auto;
  padding: 10px 18px;
  border-radius: 16px;
  border: 1px solid var(--md-sys-color-surface-variant, #e2e8f0);
  background: var(--md-sys-color-surface-container-lowest, #fff);
  color: var(--md-sys-color-on-surface-variant, #475569);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}
.sr-tab:active {
  transform: scale(0.96);
}
.sr-tab.is-active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
  font-weight: 700;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.25);
}

.sr-tip {
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
}
.sr-tip.is-error {
  color: #ef4444;
}

/* ── 成绩环 ── */
.sr-gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}
.sr-gauge__ring {
  position: relative;
  width: 192px;
  height: 192px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sr-gauge__svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.sr-gauge__arc {
  transition: stroke-dashoffset 1s ease-out;
  filter: drop-shadow(0 4px 14px rgba(245, 158, 11, 0.22));
}
.sr-gauge__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-align: center;
}
.sr-gauge__center strong {
  font-size: 42px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--md-sys-color-on-surface, #1e293b);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.sr-gauge__center span {
  font-size: 11px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
  letter-spacing: 0.08em;
}
.sr-gauge__badge {
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}
.sr-gauge__badge.is-high {
  background: rgba(5, 150, 105, 0.12);
  color: #059669;
  border: 1px solid rgba(5, 150, 105, 0.25);
}
.sr-gauge__badge.is-mid {
  background: rgba(217, 119, 6, 0.14);
  color: #b45309;
  border: 1px solid rgba(217, 119, 6, 0.3);
}
.sr-gauge__badge.is-low {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.25);
}
.sr-gauge__foot {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--md-sys-color-surface-variant, #f1f5f9);
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
}
.sr-gauge__foot-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sr-gauge__foot-left i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #f59e0b;
}
.sr-gauge__foot-right {
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant, #64748b);
}

/* ── 6 宫格 ── */
.sr-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.sr-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px;
  background: var(--md-sys-color-surface-container-lowest, #fff);
  border: 1px solid var(--md-sys-color-surface-variant, #f1f5f9);
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  min-width: 0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.sr-metric:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 28px -6px rgba(37, 99, 235, 0.12);
}
.sr-metric__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sr-metric__icon {
  width: 28px;
  height: 28px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.sr-metric__icon .material-symbols-outlined {
  font-size: 16px;
}
.sr-metric__badge {
  font-size: 10px;
  font-weight: 700;
}
.sr-metric__value {
  font-size: 16px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #1e293b);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sr-metric__label {
  font-size: 11px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
  margin-top: 1px;
}
.sr-metric__bar {
  display: block;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  overflow: hidden;
  margin-top: 10px;
}
.sr-metric__bar b {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.7s cubic-bezier(0.34, 1.2, 0.64, 1);
}

/* 色板 */
.sr-metric__icon.is-blue { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
.sr-metric__icon.is-indigo { background: rgba(79, 70, 229, 0.12); color: #4f46e5; }
.sr-metric__icon.is-sky { background: rgba(2, 132, 199, 0.12); color: #0284c7; }
.sr-metric__icon.is-amber { background: rgba(217, 119, 6, 0.14); color: #d97706; }
.sr-metric__icon.is-emerald { background: rgba(5, 150, 105, 0.12); color: #059669; }
.sr-metric__icon.is-teal { background: rgba(13, 148, 136, 0.12); color: #0d9488; }
.sr-metric__icon.is-rose { background: rgba(225, 29, 72, 0.12); color: #e11d48; }
.sr-metric__icon.is-violet { background: rgba(124, 58, 237, 0.12); color: #7c3aed; }
.sr-metric__badge.is-muted { color: var(--md-sys-color-outline, #cbd5e1); }
.sr-metric__badge.is-emerald { color: #059669; }
.sr-metric__badge.is-amber { color: #d97706; }
.sr-metric__badge.is-teal { color: #0d9488; }
.sr-metric__bar b.is-blue { background: #3b82f6; }
.sr-metric__bar b.is-indigo { background: #6366f1; }
.sr-metric__bar b.is-sky { background: #0ea5e9; }
.sr-metric__bar b.is-amber { background: #f59e0b; }
.sr-metric__bar b.is-emerald { background: #10b981; }
.sr-metric__bar b.is-teal { background: #14b8a6; }
.sr-metric__bar b.is-violet { background: #8b5cf6; }

/* ── 柱状图 ── */
.sr-chart {
  padding: 20px;
}
.sr-chart__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.sr-chart__title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sr-chart__title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #1e293b);
  letter-spacing: -0.01em;
}
.sr-chart__sub {
  margin: 6px 0 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
}
.sr-chart__sub b {
  color: #2563eb;
  font-weight: 700;
}
.sr-chart__sub-strong {
  color: #334155 !important;
}
.sr-seg {
  display: inline-flex;
  padding: 2px;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.18);
  font-size: 11px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant, #64748b);
  flex-shrink: 0;
}
.sr-seg button {
  padding: 4px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sr-seg button.is-active {
  background: var(--md-sys-color-surface-container-lowest, #fff);
  color: #2563eb;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.sr-seg button:disabled {
  color: var(--md-sys-color-outline, #cbd5e1);
  cursor: not-allowed;
}

.sr-bars {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 4px;
  height: 190px;
  padding: 18px 4px 0;
  margin-top: 6px;
}
.sr-bars__grid {
  position: absolute;
  inset: 18px 4px 26px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
  opacity: 0.55;
}
.sr-bars__grid i {
  display: block;
  border-bottom: 1px dashed var(--md-sys-color-surface-variant, #e2e8f0);
}
.sr-bars__grid i:last-child {
  border-bottom: 1px solid var(--md-sys-color-surface-variant, #e2e8f0);
}
.sr-bar {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}
.sr-bar__value {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface-variant, #475569);
}
.sr-bar__value i {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: #3b82f6;
}
.sr-bar b {
  display: block;
  width: 24px;
  border-radius: 12px;
  background: linear-gradient(180deg, #38bdf8, #2563eb);
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18);
  transition: height 0.7s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.sr-bar.is-peak b {
  background: linear-gradient(180deg, #7dd3fc, #2563eb);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
  outline: 2px solid rgba(96, 165, 250, 0.3);
  outline-offset: 1px;
}
.sr-bar__date {
  font-size: 10px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
  white-space: nowrap;
}
.sr-bar.is-peak .sr-bar__date {
  color: #2563eb;
  font-weight: 700;
}
.sr-chart__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--md-sys-color-surface-variant, #f1f5f9);
  font-size: 11px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
}
.sr-chart__foot-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sr-chart__foot-left i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #10b981;
}

/* ── 面板 / 分布条 / 列表 ── */
.sr-panel {
  padding: 18px;
}
.sr-panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.sr-panel__head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #1e293b);
}
.sr-panel__count {
  font-size: 11px;
  font-weight: 700;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
  background: rgba(148, 163, 184, 0.18);
  border-radius: 999px;
  padding: 2px 8px;
}
.sr-dist {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sr-dist__row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sr-dist__label {
  width: 64px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant, #64748b);
}
.sr-dist__track {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  overflow: hidden;
}
.sr-dist__track b {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.7s cubic-bezier(0.34, 1.2, 0.64, 1);
}
.sr-dist__track b.is-emerald { background: #10b981; }
.sr-dist__track b.is-amber { background: #f59e0b; }
.sr-dist__track b.is-orange { background: #fb923c; }
.sr-dist__track b.is-rose { background: #f43f5e; }
.sr-dist__track b.is-sky { background: #38bdf8; }
.sr-dist__track b.is-violet { background: #8b5cf6; }
.sr-dist__track b.is-slate { background: #94a3b8; }
.sr-dist__value {
  width: 30px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface-variant, #334155);
  font-variant-numeric: tabular-nums;
}
.sr-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 6px;
  border: 1px solid var(--md-sys-color-surface-variant, #f1f5f9);
  border-radius: 14px;
  background: var(--md-sys-color-surface-container-low, #fbfdff);
  cursor: pointer;
  text-align: left;
  transition: background 0.2s ease;
}
.sr-row:hover {
  background: rgba(148, 163, 184, 0.12);
}
.sr-row__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sr-row__main strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--md-sys-color-on-surface, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sr-row__main small {
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
}
.sr-row .material-symbols-outlined {
  font-size: 18px;
  color: var(--md-sys-color-outline, #cbd5e1);
}
.sr-empty {
  margin: 0;
  padding: 10px 0;
  text-align: center;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
}

/* ── 底部建议条 ── */
.sr-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(90deg, #2563eb, #4f46e5);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.25);
  color: #fff;
}
.sr-cta__text h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.sr-cta__text p {
  margin: 3px 0 0;
  font-size: 11px;
  color: rgba(219, 234, 254, 0.92);
}
.sr-cta__btn {
  flex-shrink: 0;
  padding: 7px 14px;
  border: none;
  border-radius: 12px;
  background: var(--md-sys-color-surface-container-lowest, #fff);
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}
.sr-cta__btn:active {
  transform: scale(0.95);
}

.sr-foot {
  margin: 0;
  padding-bottom: 4px;
  text-align: center;
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant, #94a3b8);
}

@keyframes srPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
</style>
