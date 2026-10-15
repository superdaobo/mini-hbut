<script setup>
/**
 * 座位预约 · 查询面板（#1057）
 *
 * 只做**查询**：开放时段 / 放号时间 / 时长与限额 / 规则原文 / 当前与最近预约。
 * 选座、提交、签到、取消的契约尚未取得（见 #1054 / `data/library-reserve-recon/01-api-contract.md`：
 * 座位预约二级页依赖超星 App 原生桥接，纯浏览器走不通），因此**不提供这些入口**，
 * 只在页面内给出「暂不支持」说明与引导，避免死按钮或"假装可用"。
 *
 * 后端命令（Rust 层 `transport/tauri/library_reserve.rs`，#1054）：
 * - `library_reserve_seat_config` → `{ config, currentReservations, recentReservations,
 *   serverNow, serverNowSource, raw }`
 *
 * ⚠️ **时间必须用服务端时间**：`serverNow` 由 Rust 侧从响应字段或页面注入值提取，
 * 两者都没有时为 `null`。此时一律**不展示**开放 / 放号状态推断（宁可不说，不要说错），
 * 详见 `./seatCatalog` 的 `parseSeatClock`。
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative } from '../../platform/native'
import { useLocale, tf } from '../../utils/app_i18n'
import { TEmptyState } from '../templates'
// 复用既有白名单净化器（`school_inbox_content` 自带单测看守），避免自造第二套 HTML 过滤
import { linkifyPlainText, looksLikeHtml, sanitizeSchoolInboxHtml } from '../../utils/school_inbox_content'
import { parseReserveFailure, WEEKDAY_KEYS } from './catalog'
import {
  normalizeSeatConfig,
  normalizeSeatReservations,
  parseSeatClock,
  resolveOpenHourRows,
  resolveOpenState,
  resolveReleaseState,
  resolveTodayOpenRange,
  seatReservationTime
} from './seatCatalog'

/** 座位预约应用标识（与 Rust 命令层 `parse_seat_app` 的取值一致） */
const SEAT_APP = 'seat'

const { t } = useLocale()

const loading = ref(true)
const error = ref('')
const errorDetail = ref('')
const payload = ref(null)

/** 失败信息 → 可读文案（已知 kind 走 i18n，未知回落后端 / 运行时说明） */
const failureText = (failure) =>
  failure.messageKey ? t(failure.messageKey) : failure.detail || t('library.reserve.error.unknown')

// ── 核心配置 ──
const config = computed(() => normalizeSeatConfig(payload.value?.config))

// ── 服务端时间与开放 / 放号状态（全部基于服务端时钟） ──
const clock = computed(() => parseSeatClock(payload.value?.serverNow))
const serverClockText = computed(() =>
  clock.value ? `${clock.value.dateKey} ${clock.value.clock}` : ''
)
/** 时间来源说明（Rust 侧 `serverNowSource`：response / page） */
const timeSourceText = computed(() => {
  const source = payload.value?.serverNowSource
  if (source === 'response') return t('library.reserve.seat.time.sourceResponse')
  if (source === 'page') return t('library.reserve.seat.time.sourcePage')
  return ''
})
const todayRange = computed(() => resolveTodayOpenRange(config.value, clock.value))
const openState = computed(() => resolveOpenState(clock.value, todayRange.value))
const openStateText = computed(() => {
  if (openState.value === 'open') return t('library.reserve.seat.open.open')
  if (openState.value === 'before') return t('library.reserve.seat.open.before')
  if (openState.value === 'after') return t('library.reserve.seat.open.after')
  return t('library.reserve.seat.open.unknown')
})
const openStateClass = computed(() => ({
  'status__value--ok': openState.value === 'open',
  'status__value--off': openState.value === 'before' || openState.value === 'after'
}))
const releaseStateText = computed(() => {
  const state = resolveReleaseState(clock.value, config.value.reserveBeforeTime)
  if (state === 'released') return t('library.reserve.seat.release.released')
  if (state === 'pending') {
    return tf('library.reserve.seat.release.pending', { time: config.value.reserveBeforeTime })
  }
  return t('library.reserve.seat.release.unknown')
})

// ── 规则（只用服务端返回的字段，缺失项整条不展示） ──
const openHours = computed(() => resolveOpenHourRows(config.value))
const ruleLines = computed(() => {
  const c = config.value
  const lines = []
  if (c.reserveBeforeDay !== null && c.reserveBeforeDay > 0) {
    lines.push(tf('library.reserve.seat.rule.advance', { n: c.reserveBeforeDay }))
  }
  if (c.reserveBeforeTime) {
    lines.push(tf('library.reserve.seat.rule.release', { time: c.reserveBeforeTime }))
  }
  if (c.reserveDuration !== null && c.reserveDuration > 0) {
    lines.push(tf('library.reserve.seat.rule.duration', { n: c.reserveDuration }))
  }
  if (c.reserveNumLimit !== null && c.reserveNumLimit > 0) {
    lines.push(tf('library.reserve.seat.rule.limit', { n: c.reserveNumLimit }))
  }
  if (c.timeUnit !== null && c.timeUnit > 0) {
    lines.push(tf('library.reserve.seat.rule.timeUnit', { n: c.timeUnit }))
  }
  const { violateTimes, violationLimitDay, violationLimitDuration } = c
  if (
    violateTimes !== null &&
    violateTimes > 0 &&
    violationLimitDay !== null &&
    violationLimitDay > 0 &&
    violationLimitDuration !== null &&
    violationLimitDuration > 0
  ) {
    lines.push(
      tf('library.reserve.seat.rule.violation', {
        times: violateTimes,
        days: violationLimitDay,
        duration: violationLimitDuration
      })
    )
  }
  if (c.onlySupportsApiSignIn === true) lines.push(t('library.reserve.seat.rule.signInApiOnly'))
  return lines
})
const hasRules = computed(() => openHours.value.length > 0 || ruleLines.value.length > 0)
/** 每日时段展示：星期名走 i18n（无法判定星期时用服务端给出的星期名原文），单侧缺失用占位符 */
const openHourText = (row) =>
  tf('library.reserve.seat.rule.dayRange', {
    day: row.weekday === null ? row.label : t(WEEKDAY_KEYS[row.weekday]),
    range: `${row.start || '--:--'}-${row.end || '--:--'}`
  })

// ── 规则原文（HTML 富文本，经白名单净化后再 v-html，防 XSS） ──
const noticeHtml = computed(() => {
  const raw = config.value.noticeContent.trim()
  if (!raw) return ''
  return looksLikeHtml(raw) ? sanitizeSchoolInboxHtml(raw) : linkifyPlainText(raw)
})
const noticeTitle = computed(() => config.value.noticeName || t('library.reserve.seat.section.notice'))

// ── 我的预约（当前 / 最近） ──
const currentRows = computed(() => normalizeSeatReservations(payload.value?.currentReservations))
const recentRows = computed(() => normalizeSeatReservations(payload.value?.recentReservations))
/** 记录标题：房间名优先，其次座位号，都缺失时用兜底文案 */
const rowTitle = (row) => row.roomName || row.seatNo || t('library.reserve.seat.row.titleFallback')
const rowTime = (row) => seatReservationTime(row) || t('library.reserve.seat.row.timeUnknown')

/** 拉取座位预约总览（切换 Tab 后挂载即拉，重试共用） */
const load = async () => {
  loading.value = true
  error.value = ''
  errorDetail.value = ''
  try {
    const res = await invokeNative('library_reserve_seat_config', { req: { app: SEAT_APP } })
    payload.value = res || null
  } catch (e) {
    const failure = parseReserveFailure(e)
    payload.value = null
    error.value = failureText(failure)
    errorDetail.value = failure.messageKey ? failure.detail : ''
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="panel">
    <div class="bar span-all">
      <h2 class="bar__title">{{ t('library.reserve.tab.seat') }}</h2>
      <button type="button" class="link" :disabled="loading" @click="load">
        {{ t('library.reserve.seat.refresh') }}
      </button>
    </div>

    <TEmptyState
      v-if="loading"
      class="span-all"
      type="loading"
      :message="t('library.reserve.seat.loading')"
    />

    <section v-else-if="error" class="card error-card span-all">
      <p class="err">{{ error }}</p>
      <p v-if="errorDetail" class="hint">{{ errorDetail }}</p>
      <button type="button" class="ghost" @click="load">
        {{ t('library.reserve.btn.retry') }}
      </button>
    </section>

    <template v-else>
      <!-- ① 服务端时间 + 今日开放 / 放号状态（服务端时间缺失时不做任何推断） -->
      <section v-if="clock" class="card status span-all">
        <div class="status__row">
          <span class="status__label">{{ t('library.reserve.seat.time.label') }}</span>
          <strong class="status__value">{{ serverClockText }}</strong>
        </div>
        <p v-if="timeSourceText" class="status__source">{{ timeSourceText }}</p>
        <div class="status__row">
          <span class="status__label">{{ t('library.reserve.seat.open.label') }}</span>
          <strong class="status__value" :class="openStateClass">{{ openStateText }}</strong>
        </div>
        <div class="status__row">
          <span class="status__label">{{ t('library.reserve.seat.release.label') }}</span>
          <strong class="status__value">{{ releaseStateText }}</strong>
        </div>
        <p class="hint">{{ t('library.reserve.seat.time.hint') }}</p>
      </section>
      <section v-else class="card status status--muted span-all">
        <p class="hint">{{ t('library.reserve.seat.time.unavailable') }}</p>
      </section>

      <!-- ② 规则：开放时段 / 放号 / 时长与限额 / 违约 -->
      <section class="card rules span-all">
        <h3 class="card__title">{{ t('library.reserve.seat.section.rules') }}</h3>
        <template v-if="hasRules">
          <template v-if="openHours.length">
            <p class="rules__label">{{ t('library.reserve.seat.rule.openTime') }}</p>
            <ul class="rules__list">
              <li v-for="row in openHours" :key="row.key">{{ openHourText(row) }}</li>
            </ul>
          </template>
          <ul v-if="ruleLines.length" class="rules__list">
            <li v-for="(line, i) in ruleLines" :key="`rule-${i}`">{{ line }}</li>
          </ul>
        </template>
        <p v-else class="hint">{{ t('library.reserve.seat.rulesEmpty') }}</p>
      </section>

      <!-- ③ 规则原文（noticeContent，HTML 富文本，已净化） -->
      <section class="card span-all">
        <h3 class="card__title">{{ noticeTitle }}</h3>
        <div v-if="noticeHtml" class="rich" v-html="noticeHtml"></div>
        <p v-else class="hint">{{ t('library.reserve.seat.notice.empty') }}</p>
      </section>

      <!-- ④ 当前预约 -->
      <section class="group">
        <h3 class="section-title">{{ t('library.reserve.seat.section.current') }}</h3>
        <TEmptyState
          v-if="!currentRows.length"
          type="empty"
          :message="t('library.reserve.seat.current.empty')"
        />
        <article v-for="row in currentRows" :key="row.key" class="card order">
          <div class="order__top">
            <strong class="order__name">{{ rowTitle(row) }}</strong>
            <span v-if="row.statusName" class="badge">{{ row.statusName }}</span>
          </div>
          <p v-if="row.roomName && row.seatNo" class="meta">
            {{ tf('library.reserve.seat.row.seatNo', { seat: row.seatNo }) }}
          </p>
          <p class="meta">
            <span v-if="row.date">{{ row.date }} </span>{{ rowTime(row) }}
          </p>
        </article>
      </section>

      <!-- ⑤ 最近预约 -->
      <section class="group">
        <h3 class="section-title">{{ t('library.reserve.seat.section.recent') }}</h3>
        <TEmptyState
          v-if="!recentRows.length"
          type="empty"
          :message="t('library.reserve.seat.recent.empty')"
        />
        <article v-for="row in recentRows" :key="row.key" class="card order">
          <div class="order__top">
            <strong class="order__name">{{ rowTitle(row) }}</strong>
            <span v-if="row.statusName" class="badge">{{ row.statusName }}</span>
          </div>
          <p v-if="row.roomName && row.seatNo" class="meta">
            {{ tf('library.reserve.seat.row.seatNo', { seat: row.seatNo }) }}
          </p>
          <p class="meta">
            <span v-if="row.date">{{ row.date }} </span>{{ rowTime(row) }}
          </p>
        </article>
      </section>

      <!-- ⑥ 暂不支持的操作（契约未取得：明确说明 + 引导，不放死按钮） -->
      <section class="card unsupported span-all">
        <h3 class="card__title">{{ t('library.reserve.seat.section.unsupported') }}</h3>
        <ul class="unsupported__list">
          <li>{{ t('library.reserve.seat.unsupported.availability') }}</li>
          <li>{{ t('library.reserve.seat.unsupported.select') }}</li>
          <li>{{ t('library.reserve.seat.unsupported.signIn') }}</li>
        </ul>
        <p class="hint">{{ t('library.reserve.seat.unsupported.guide') }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(16px * var(--ui-radius-scale));
  padding: 16px;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bar__title {
  margin: 0;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 800;
  color: var(--ui-text);
}
.card__title {
  margin: 0 0 10px;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 800;
  color: var(--ui-text);
}
.section-title {
  margin: 4px 0 8px;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 800;
  color: var(--ui-text);
}

/* 服务端时间 / 状态 */
.status {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.status--muted {
  border-style: dashed;
}
.status__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.status__label {
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}
.status__value {
  font-size: calc(14px * var(--ui-font-scale));
  color: var(--ui-text);
}
.status__value--ok {
  color: var(--ui-primary);
}
.status__value--off {
  color: var(--ui-muted);
}
.status__source {
  margin: 0;
  font-size: calc(11px * var(--ui-font-scale));
  color: var(--ui-muted);
  opacity: 0.85;
}

/* 规则 */
.rules__label {
  margin: 0 0 6px;
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-muted);
}
.rules__list {
  margin: 0;
  padding-left: 18px;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-muted);
  line-height: 1.8;
}
.rules__list + .rules__list {
  margin-top: 8px;
}

/* 规则原文（后端 HTML，已净化） */
.rich {
  font-size: calc(13px * var(--ui-font-scale));
  line-height: 1.8;
  color: var(--ui-muted);
  word-break: break-word;
}
.rich :deep(p) {
  margin: 0 0 8px;
}
.rich :deep(p:last-child) {
  margin-bottom: 0;
}
.rich :deep(ul),
.rich :deep(ol) {
  margin: 0 0 8px;
  padding-left: 18px;
}
.rich :deep(strong),
.rich :deep(b) {
  color: var(--ui-text);
}
.rich :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}

/* 预约记录 */
.group {
  display: flex;
  flex-direction: column;
}
.order {
  margin-bottom: 8px;
}
.order:last-child {
  margin-bottom: 0;
}
.order__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.order__name {
  font-size: calc(15px * var(--ui-font-scale));
  color: var(--ui-text);
}
.badge {
  flex: 0 0 auto;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: calc(11px * var(--ui-font-scale));
  font-weight: 700;
}
.meta {
  margin: 8px 0 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

/* 暂不支持说明 */
.unsupported__list {
  margin: 0;
  padding-left: 18px;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-muted);
  line-height: 1.8;
}
.unsupported__list + .hint {
  margin-top: 10px;
}

/* 状态 / 按钮 */
.error-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.err {
  margin: 0;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-danger);
}
.hint {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
  line-height: 1.6;
}
.ghost {
  min-height: 44px;
  padding: 0 20px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(14px * var(--ui-radius-scale));
  background: transparent;
  color: var(--ui-text);
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
}
.ghost:disabled {
  opacity: 0.6;
}
.link {
  border: 0;
  background: transparent;
  color: var(--ui-primary);
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
}
.link:disabled {
  opacity: 0.6;
}

/* 宽屏（≥768 主断点）：状态 / 规则 / 原文整行，当前与最近预约并排 */
@media (min-width: 768px) {
  .panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }
  .span-all {
    grid-column: 1 / -1;
  }
}
</style>
