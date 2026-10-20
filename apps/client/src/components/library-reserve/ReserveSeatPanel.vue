<script setup>
/**
 * 座位预约 · 面板（#1057 二轮重构，#1081 可视化时间选择 + 本机提交）
 *
 * 信息层级（严格自上而下）：
 * 1. **功能区（置顶）**：区域筛选 + 时间片网格（可视化点选起止）+ 「查找空座位」→ 可用座位；
 * 2. 当前 / 最近预约（紧凑展示）；
 * 3. **通知 / 规则区（置底）**：开放时段 / 放号 / 时长限额 / 违约 / 规则原文 + 签到说明。
 *
 * 后端命令（Rust 层 `transport/tauri/library_reserve.rs`）：
 * - `library_reserve_seat_config`         → 配置 / 当前与最近预约 / `serverNow`
 * - `library_reserve_seat_levels`         → 区域（一级/二级/三级）
 * - `library_reserve_seat_time_range`     → 可选时间范围（当日毫秒偏移）
 * - `library_reserve_seat_match`          → 按时段匹配可用座位（余量查询）
 * - `library_reserve_seat_submit_prepare` → 验证码图片 + `submitEnc`（签名输入）
 * - `library_reserve_seat_submit`         → **提交预约（写操作，成功即预约成功）**
 *
 * ⚠️ **时间选择不再用下拉框**（用户反馈：「不要让用户自己选开始和结束时间，做成像表一样」）：
 * 时间范围按 `timeUnit` 切成**可点时间片网格**，点第一格为起点、再点后面一格为终点（连选成区间），
 * 再点已选起点即取消。交互规则集中在 `./seatCatalog` 的 `resolveSeatTimeCellClick`（有单测）。
 *
 * ⚠️ **提交签名在页面内执行官方脚本**（见 `./seatSigner`）：脚本只读 DOM 里
 * `#submit_enc` 的 `.value`（值来自 `submit_prepare` 的 `submitEnc`），签名失败按
 * `script_load / module_missing / sign_failed` 分别给可读文案，绝不静默。
 *
 * ⚠️ **时间必须用服务端时间**：`serverNow` 缺失时不做开放 / 放号状态推断，
 * 时间行整体不展示（宁可不说，不要说错），详见 `./seatCatalog` 的 `parseSeatClock`。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { invokeNative } from '../../platform/native'
import { showToast } from '../../utils/toast'
import { useLocale, tf } from '../../utils/app_i18n'
import { TCollapse, TEmptyState, TModal } from '../templates'
// 复用既有白名单净化器（`school_inbox_content` 自带单测看守），避免自造第二套 HTML 过滤
import { linkifyPlainText, looksLikeHtml, sanitizeSchoolInboxHtml } from '../../utils/school_inbox_content'
import { parseReserveFailure, WEEKDAY_KEYS, formatReserveFailureText, truncateReserveDetail } from './catalog'
import { SeatSignError, buildSeatEnc } from './seatSigner'
import {
  buildSeatTimeCells,
  buildSeatTimeSlices,
  isSeatCellPast,
  normalizeSeatConfig,
  normalizeSeatLevels,
  normalizeSeatMatch,
  normalizeSeatPrepare,
  normalizeSeatReservations,
  parseSeatClock,
  resolveOpenHourRows,
  resolveOpenState,
  resolveReleaseState,
  resolveSeatDefaultSelection,
  resolveSeatSubmitParams,
  resolveSeatTimeCellClick,
  resolveTodayOpenRange,
  seatCellState,
  seatMatchAreaText,
  seatMatchTimeText,
  seatReservationTime,
  seatSelectionRangeText
} from './seatCatalog'

/** 座位预约应用标识（与 Rust 命令层 `parse_seat_app` 的取值一致） */
const SEAT_APP = 'seat'

const { t } = useLocale()

/**
 * A15：座位提交必须带 cxCaptcha 行为验证 token（需真人点击），纯接口不可行，
 * 因此官方页能力已独立成「预约」模块（`chaoxing_reserve`）。
 * 本面板只负责原生查询，提交入口通过事件冒泡到父级切页。
 */
const emit = defineEmits(['open-official'])

const loading = ref(true)
const error = ref('')
const errorDetail = ref('')
const payload = ref(null)

/**
 * 失败信息 → 可读文案（#1082：**始终**把服务端原文带出来）。
 * 已知 kind 走 i18n 文案 + 细节后缀 + 服务端原文；未知 kind 直接给服务端原文。
 */
const failureText = (failure, fallbackKey = 'library.reserve.error.unknown') =>
  formatReserveFailureText(failure, t, fallbackKey)

// ── 核心配置 ──
const config = computed(() => normalizeSeatConfig(payload.value?.config))

// ── 服务端时间与开放 / 放号状态（全部基于服务端时钟） ──
const clock = computed(() => parseSeatClock(payload.value?.serverNow))
const serverClockText = computed(() =>
  clock.value ? `${clock.value.dateKey} ${clock.value.clock}` : ''
)
/** 时间来源说明（Rust 侧 `serverNowSource`）已于 #1082 移除：属实现细节，对用户无决策价值 */
const todayRange = computed(() => resolveTodayOpenRange(config.value, clock.value))
const openState = computed(() => resolveOpenState(clock.value, todayRange.value))
const openStateText = computed(() => {
  if (openState.value === 'open') return t('library.reserve.seat.open.open')
  if (openState.value === 'before') return t('library.reserve.seat.open.before')
  if (openState.value === 'after') return t('library.reserve.seat.open.after')
  return t('library.reserve.seat.open.unknown')
})
const releaseStateText = computed(() => {
  const state = resolveReleaseState(clock.value, config.value.reserveBeforeTime)
  if (state === 'released') return t('library.reserve.seat.release.released')
  if (state === 'pending') {
    return tf('library.reserve.seat.release.pending', { time: config.value.reserveBeforeTime })
  }
  return t('library.reserve.seat.release.unknown')
})

// ── 区域筛选（一级 / 二级 / 三级，逐级联动；某级为空则隐藏该行） ──
const level1Options = ref([])
const level2Options = ref([])
const level3Options = ref([])
const firstLevel = ref('')
const secondLevel = ref('')
const thirdLevel = ref('')

/** 拉取某一级区域选项（失败回落空列表 → 该级筛选行隐藏，不阻断按时段查询） */
const loadLevels = async (levelType, params = {}) => {
  try {
    // ⚠️ 命令层嵌套字段沿用仓库既有约定 snake_case（同 `library_reserve_time_list` 的 `start_time`），
    // 用 camelCase 会报 `missing field 'level_type'`。
    const req = { app: SEAT_APP, level_type: levelType }
    if (params.firstLevelName) req.first_level_name = params.firstLevelName
    if (params.secondLevelName) req.second_level_name = params.secondLevelName
    const res = await invokeNative('library_reserve_seat_levels', { req })
    return normalizeSeatLevels(res)
  } catch {
    return []
  }
}

// ── 时间选择（按 timeUnit 切片 → 两两组合成可点时间片网格） ──
const timeRange = ref(null)
const timeRangeReady = ref(false)
const slices = computed(() =>
  buildSeatTimeSlices(timeRange.value?.startOffsetMs, timeRange.value?.endOffsetMs, config.value.timeUnit)
)
const cells = computed(() => buildSeatTimeCells(slices.value))
/** 已选区间（切片下标）；`null` = 未选择 */
const selection = ref(null)

/** 该时间片是否已过去（服务端时间判定；服务端时间缺失时恒为 false，不猜本地时间） */
const isCellPast = (cell) =>
  isSeatCellPast(cell, clock.value, config.value.allowReserveNow, timeRange.value?.ymd)

/** 是否还有可点时间片（全部已过去 → 给出「今日已无可约时段」提示并禁用查询） */
const hasSelectableCell = computed(() => cells.value.some((cell) => !isCellPast(cell)))

// 时间范围 / 服务端时钟 / 配置就绪后（重新）应用默认窗口；用户手动改选不会触发（依赖不变）
watch(
  [cells, clock, config],
  () => {
    selection.value = resolveSeatDefaultSelection(
      cells.value,
      clock.value,
      config.value.allowReserveNow,
      timeRange.value?.ymd
    )
  },
  { immediate: true }
)

/** 点选时间片（起点 → 终点 → 再点起点取消；规则见 seatCatalog 单测）；已过去的片不可点 */
const selectCell = (cell) => {
  if (isCellPast(cell)) return
  selection.value = resolveSeatTimeCellClick(selection.value, cell.startIndex)
  resetMatch()
}

const cellClass = (cell) => {
  if (isCellPast(cell)) return 'cell cell--past'
  const state = seatCellState(cell, selection.value)
  if (state === 'anchor') return 'cell cell--anchor'
  if (state === 'on') return 'cell cell--on'
  return 'cell'
}

const selectionText = computed(() => seatSelectionRangeText(slices.value, selection.value))
const startSlice = computed(() =>
  selection.value ? slices.value[selection.value.startIndex] || null : null
)
const endSlice = computed(() =>
  selection.value ? slices.value[selection.value.endIndex] || null : null
)
const canSearch = computed(() => Boolean(startSlice.value && endSlice.value))

// ── 余量查询（查找空座位） ──
const matching = ref(false)
const matchError = ref('')
const match = ref(null)
const searched = ref(false)

/** 查找空座位：把区域 + 起止时刻下发给 `library_reserve_seat_match` */
const findSeat = async () => {
  if (!canSearch.value || matching.value) return
  matching.value = true
  matchError.value = ''
  match.value = null
  submitSummary.value = null
  searched.value = true
  try {
    // ⚠️ 命令层嵌套字段为 snake_case（仓库既有约定），camelCase 会报 `missing field 'start_time'`
    const req = {
      app: SEAT_APP,
      start_time: startSlice.value.label,
      end_time: endSlice.value.label
    }
    if (firstLevel.value) req.first_level_name = firstLevel.value
    if (secondLevel.value) req.second_level_name = secondLevel.value
    if (thirdLevel.value) req.third_level_name = thirdLevel.value
    const res = await invokeNative('library_reserve_seat_match', { req })
    match.value = normalizeSeatMatch(res)
  } catch (e) {
    matchError.value = failureText(parseReserveFailure(e))
  } finally {
    matching.value = false
  }
}

const matchAreaText = computed(() => seatMatchAreaText(match.value))
const matchTimeText = computed(() => seatMatchTimeText(match.value, t('library.reserve.seat.row.timeUnknown')))

// ── 本机提交（prepare → 验证码 → 页面内签名 → submit） ──
const submitVisible = ref(false)
const preparing = ref(false)
const submitting = ref(false)
const prepareError = ref('')
const submitError = ref('')
/** `library_reserve_seat_submit_prepare` 的归一化结果（验证码图 + submitEnc + wfwEngineEnc） */
const prepare = ref(null)
const captcha = ref('')
/** 提交成功摘要（座位 / 区域 / 时段 / 日期），用于替换已失效的匹配结果卡片 */
const submitSummary = ref(null)

/** 签名类失败 → 可读文案 + 底层细节（#1082：`message` 与 code 不同时才附上，避免重复 code） */
const signErrorText = (error) => {
  const base =
    error.code === 'script_load'
      ? t('library.reserve.seat.submit.error.signScript')
      : error.code === 'module_missing'
        ? t('library.reserve.seat.submit.error.signModule')
        : t('library.reserve.seat.submit.error.sign')
  const detail =
    error.message && error.message !== error.code ? truncateReserveDetail(error.message) : ''
  return detail ? `${base}${t('library.reserve.error.detailSuffix')}${detail}` : base
}

/** 打开提交弹窗：立即拉取验证码（用户手输，不代填） */
const openSubmit = () => {
  if (!match.value) return
  submitVisible.value = true
  submitError.value = ''
  prepareError.value = ''
  captcha.value = ''
  void prepareCaptcha()
}

/** 拉取（或换一张）验证码 + `submitEnc` */
const prepareCaptcha = async () => {
  preparing.value = true
  prepareError.value = ''
  try {
    const res = await invokeNative('library_reserve_seat_submit_prepare', { req: { app: SEAT_APP } })
    const view = normalizeSeatPrepare(res)
    prepare.value = view
    if (!view.captchaUrl) prepareError.value = t('library.reserve.seat.submit.error.captcha')
  } catch (e) {
    prepare.value = null
    // #1082：无论是否已知 kind，都把服务端原文带出来；原文也为空才回落验证码通用文案
    prepareError.value = failureText(
      parseReserveFailure(e),
      'library.reserve.seat.submit.error.captcha'
    )
  } finally {
    preparing.value = false
  }
}

/** 提交：页面内执行官方签名脚本生成 enc → 调 `library_reserve_seat_submit` */
const confirmSubmit = async () => {
  const target = match.value
  const params = resolveSeatSubmitParams(
    target,
    timeRange.value?.ymd,
    startSlice.value?.label || '',
    endSlice.value?.label || ''
  )
  if (!params) {
    submitError.value = t('library.reserve.seat.submit.error.params')
    return
  }
  const code = captcha.value.trim()
  if (!code) {
    submitError.value = t('library.reserve.seat.submit.captchaRequired')
    return
  }
  if (!prepare.value) {
    submitError.value = prepareError.value || t('library.reserve.seat.submit.error.captcha')
    return
  }
  submitting.value = true
  submitError.value = ''
  try {
    const enc = await buildSeatEnc(
      { ...params, captcha: code, wfwEngineEnc: prepare.value.wfwEngineEnc },
      prepare.value.submitEnc
    )
    // ⚠️ 命令层嵌套字段 snake_case（camelCase 会 missing field）
    await invokeNative('library_reserve_seat_submit', {
      req: {
        app: SEAT_APP,
        room_id: params.roomId,
        seat_num: params.seatNum,
        start_time: params.startTime,
        end_time: params.endTime,
        day: params.day,
        captcha: code,
        enc
      }
    })
    submitSummary.value = {
      seat: params.seatNum,
      area: matchAreaText.value,
      range: `${params.startTime}-${params.endTime}`,
      day: params.day
    }
    submitVisible.value = false
    // 座位已被占用：清掉匹配结果，避免用户对同一座位重复提交
    resetMatch()
    showToast(t('library.reserve.seat.submit.success'), 'success', 3200)
    await loadConfig()
  } catch (e) {
    if (e instanceof SeatSignError) {
      submitError.value = signErrorText(e)
    } else {
      // #1082：始终带出服务端原文（未知 kind 时不再只显示「提交失败，请稍后重试。」）
      submitError.value = failureText(
        parseReserveFailure(e),
        'library.reserve.seat.submit.error.submit'
      )
    }
  } finally {
    submitting.value = false
  }
}

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
  if (c.onlySupportsApiSignIn === true) lines.push(t('library.reserve.seat.rule.signInApiOnly'))
  return lines
})

/**
 * 违约后果（#1082）：**常驻可见，不进折叠区**（唯一「不做会亏」的信息）。
 * 三个阈值齐全才展示，缺失时整行不渲染（宁可不说，不要说错）。
 */
const violationLine = computed(() => {
  const { violateTimes, violationLimitDay, violationLimitDuration } = config.value
  if (
    violateTimes !== null &&
    violateTimes > 0 &&
    violationLimitDay !== null &&
    violationLimitDay > 0 &&
    violationLimitDuration !== null &&
    violationLimitDuration > 0
  ) {
    return tf('library.reserve.seat.rule.violation', {
      times: violateTimes,
      days: violationLimitDay,
      duration: violationLimitDuration
    })
  }
  return ''
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
/** 规则明细是否还有可折叠内容（全空时整块不渲染，避免出现空折叠与「服务端未返回…」技术空态） */
const hasRuleDetails = computed(() => hasRules.value || Boolean(noticeHtml.value))

// ── 我的预约（当前 / 最近） ──
const currentRows = computed(() => normalizeSeatReservations(payload.value?.currentReservations))
const recentRows = computed(() => normalizeSeatReservations(payload.value?.recentReservations))
/** 记录标题：房间名优先，其次座位号，都缺失时用兜底文案 */
const rowTitle = (row) => row.roomName || row.seatNo || t('library.reserve.seat.row.titleFallback')
const rowTime = (row) => seatReservationTime(row) || t('library.reserve.seat.row.timeUnknown')

/** 拉取座位预约总览（切换 Tab 后挂载即拉，重试共用） */
const loadConfig = async () => {
  loading.value = true
  error.value = ''
  errorDetail.value = ''
  try {
    const res = await invokeNative('library_reserve_seat_config', { req: { app: SEAT_APP } })
    payload.value = res || null
  } catch (e) {
    const failure = parseReserveFailure(e)
    payload.value = null
    // 加载失败卡片分两行展示：主行 i18n / 服务端原文，副行（仅已知 kind）附服务端原文细节，
    // 避免把 detail 同时拼进主行导致重复展示。
    error.value = failure.messageKey
      ? t(failure.messageKey)
      : failure.detail || t('library.reserve.error.unknown')
    errorDetail.value = failure.messageKey ? truncateReserveDetail(failure.detail) : ''
  } finally {
    loading.value = false
  }
}

/** 拉取可选时间范围（失败不影响规则展示，功能区给出「时间不可用」提示） */
const loadTimeRange = async () => {
  timeRangeReady.value = false
  try {
    const res = await invokeNative('library_reserve_seat_time_range', { req: { app: SEAT_APP } })
    timeRange.value = res || null
  } catch {
    timeRange.value = null
  } finally {
    timeRangeReady.value = true
  }
}

/** 重置查询结果（区域 / 时间变化后旧结果不再适用） */
const resetMatch = () => {
  match.value = null
  matchError.value = ''
  searched.value = false
  submitSummary.value = null
  submitVisible.value = false
  submitError.value = ''
}

// 区域联动：一级变化 → 重置下级并拉取二级
watch(firstLevel, async (value) => {
  secondLevel.value = ''
  thirdLevel.value = ''
  level3Options.value = []
  resetMatch()
  level2Options.value = value ? await loadLevels(1, { firstLevelName: value }) : []
})
// 区域联动：二级变化 → 重置三级并拉取三级
watch(secondLevel, async (value) => {
  thirdLevel.value = ''
  resetMatch()
  level3Options.value =
    value && firstLevel.value
      ? await loadLevels(2, { firstLevelName: firstLevel.value, secondLevelName: value })
      : []
})
watch(thirdLevel, resetMatch)

/** 刷新：配置 + 时间范围 + 一级区域（重试共用） */
const refresh = async () => {
  await loadConfig()
  if (!error.value) {
    await Promise.all([loadTimeRange(), loadLevels(0).then((list) => (level1Options.value = list))])
  }
}

onMounted(refresh)
</script>

<template>
  <div class="panel">
    <div class="bar span-all">
      <h2 class="bar__title">{{ t('library.reserve.tab.seat') }}</h2>
      <button type="button" class="link" :disabled="loading" @click="refresh">
        {{ t('library.reserve.seat.refresh') }}
      </button>
    </div>

    <!-- 签名脚本只读该元素的 .value（值来自 submit_prepare 的 submitEnc），必须常驻 DOM -->
    <input id="submit_enc" type="hidden" :value="prepare?.submitEnc || ''" />

    <TEmptyState
      v-if="loading"
      class="span-all"
      type="loading"
      :message="t('library.reserve.state.loading')"
    />

    <section v-else-if="error" class="card error-card span-all">
      <p class="err">{{ error }}</p>
      <p v-if="errorDetail" class="hint">{{ errorDetail }}</p>
      <button type="button" class="ghost" @click="refresh">
        {{ t('library.reserve.btn.retry') }}
      </button>
    </section>

    <template v-else>
      <!-- ① 功能区（置顶）：区域筛选 + 时间片网格 + 查找空座位 -->
      <section class="card func span-all">
        <h3 class="card__title">{{ t('library.reserve.seat.find.title') }}</h3>

        <template v-if="timeRangeReady && cells.length">
          <div v-if="level1Options.length" class="field">
            <label class="field__label" for="seat-level1">{{ t('library.reserve.seat.find.level1') }}</label>
            <select id="seat-level1" v-model="firstLevel" class="select">
              <option value="">{{ t('library.reserve.seat.find.all') }}</option>
              <option v-for="option in level1Options" :key="option" :value="option">{{ option }}</option>
            </select>
          </div>
          <div v-if="level2Options.length" class="field">
            <label class="field__label" for="seat-level2">{{ t('library.reserve.seat.find.level2') }}</label>
            <select id="seat-level2" v-model="secondLevel" class="select">
              <option value="">{{ t('library.reserve.seat.find.all') }}</option>
              <option v-for="option in level2Options" :key="option" :value="option">{{ option }}</option>
            </select>
          </div>
          <div v-if="level3Options.length" class="field">
            <label class="field__label" for="seat-level3">{{ t('library.reserve.seat.find.level3') }}</label>
            <select id="seat-level3" v-model="thirdLevel" class="select">
              <option value="">{{ t('library.reserve.seat.find.all') }}</option>
              <option v-for="option in level3Options" :key="option" :value="option">{{ option }}</option>
            </select>
          </div>

          <!-- 时间片网格：点选起点 / 终点（可视化，无下拉框） -->
          <div class="grid-block">
            <div class="grid-block__head">
              <span class="field__label">{{ t('library.reserve.seat.time.label.grid') }}</span>
              <strong class="grid-block__picked">
                <template v-if="selectionText">
                  {{ tf('library.reserve.seat.time.selected', { range: selectionText }) }}
                </template>
                <template v-else>{{ t('library.reserve.seat.time.unselected') }}</template>
              </strong>
            </div>
            <div class="grid" role="group" :aria-label="t('library.reserve.seat.time.label.grid')">
              <button
                v-for="cell in cells"
                :key="cell.label"
                type="button"
                :class="cellClass(cell)"
                :disabled="isCellPast(cell)"
                :aria-pressed="!isCellPast(cell) && seatCellState(cell, selection) !== 'off'"
                @click="selectCell(cell)"
              >
                {{ cell.label }}
              </button>
            </div>
            <p v-if="!hasSelectableCell" class="hint hint--warn">
              {{ t('library.reserve.seat.time.allPast') }}
            </p>
            <!-- 操作说明（一次性阅读）：默认收起，不再占首屏（#1082） -->
            <TCollapse :title="t('library.reserve.collapse.hint')">
              <p class="hint">{{ t('library.reserve.seat.time.gridHint') }}</p>
            </TCollapse>
          </div>

          <button type="button" class="primary" :disabled="!canSearch || matching" @click="findSeat">
            {{ matching ? t('library.reserve.seat.find.searching') : t('library.reserve.seat.find.action') }}
          </button>

          <!-- 查询结果：区域 + 座位号 + 时段 + 本机「确认预约」 -->
          <div v-if="matchError" class="match match--error">
            <p class="err">{{ matchError }}</p>
          </div>
          <div v-else-if="match" class="match">
            <p class="match__title">{{ t('library.reserve.seat.find.result') }}</p>
            <p class="match__row">{{ tf('library.reserve.seat.find.area', { area: matchAreaText || '--' }) }}</p>
            <p class="match__row match__row--seat">
              {{ tf('library.reserve.seat.find.seatNo', { seat: match.seatNum || '--' }) }}
            </p>
            <p class="match__row">{{ tf('library.reserve.seat.find.timeRange', { range: matchTimeText }) }}</p>
            <p class="hint hint--warn">{{ t('library.reserve.seat.find.locked') }}</p>
            <button type="button" class="primary" @click="openSubmit">
              {{ t('library.reserve.seat.find.submit') }}
            </button>
          </div>
          <div v-else-if="submitSummary" class="match match--ok">
            <p class="match__title">{{ t('library.reserve.seat.submit.success') }}</p>
            <p class="match__row">
              {{ tf('library.reserve.seat.find.area', { area: submitSummary.area || '--' }) }}
            </p>
            <p class="match__row match__row--seat">
              {{ tf('library.reserve.seat.find.seatNo', { seat: submitSummary.seat }) }}
            </p>
            <p class="match__row">
              {{ tf('library.reserve.seat.find.timeRange', { range: submitSummary.range }) }}
            </p>
            <p class="match__row">{{ submitSummary.day }}</p>
          </div>
          <p v-else-if="searched" class="hint hint--warn">{{ t('library.reserve.seat.find.empty') }}</p>
        </template>

        <p v-else-if="!timeRangeReady" class="hint">{{ t('library.reserve.state.loading') }}</p>
        <p v-else class="hint">{{ t('library.reserve.seat.find.timeUnavailable') }}</p>
      </section>

      <!-- ② 当前 / 最近预约（紧凑展示） -->
      <section class="card span-all">
        <h3 class="card__title">{{ t('library.reserve.seat.section.current') }}</h3>
        <p v-if="!currentRows.length" class="hint">{{ t('library.reserve.seat.current.empty') }}</p>
        <ul v-else class="records">
          <li v-for="row in currentRows" :key="row.key" class="record">
            <span class="record__name">{{ rowTitle(row) }}</span>
            <span class="record__meta">
              <span v-if="row.seatNo">{{ tf('library.reserve.seat.row.seatNo', { seat: row.seatNo }) }}</span>
              <span v-if="row.date">{{ row.date }} </span>{{ rowTime(row) }}
            </span>
          </li>
        </ul>

        <h3 class="card__title card__title--gap">{{ t('library.reserve.seat.section.recent') }}</h3>
        <p v-if="!recentRows.length" class="hint">{{ t('library.reserve.seat.recent.empty') }}</p>
        <ul v-else class="records">
          <li v-for="row in recentRows" :key="row.key" class="record">
            <span class="record__name">{{ rowTitle(row) }}</span>
            <span class="record__meta">
              <span v-if="row.seatNo">{{ tf('library.reserve.seat.row.seatNo', { seat: row.seatNo }) }}</span>
              <span v-if="row.date">{{ row.date }} </span>{{ rowTime(row) }}
            </span>
          </li>
        </ul>
      </section>

      <!-- ③ 官方页提交入口（A15：内嵌官方页已独立为「预约」模块，这里只做引导） -->
      <section class="card span-all">
        <h3 class="card__title">{{ t('library.reserve.embed.title') }}</h3>
        <p class="hint">{{ t('library.reserve.seat.official.hint') }}</p>
        <button type="button" class="ghost" @click="emit('open-official')">
          {{ t('library.reserve.seat.official.action') }}
        </button>
      </section>

      <!-- ④ 通知 / 规则区（置底）：状态与违约后果常驻，规则明细默认折叠（#1082 文字精简） -->
      <section class="card notice span-all">
        <!-- 服务端时间 + 开放 / 放号状态：压缩为一行小字（时间缺失则整行不展示） -->
        <p v-if="clock" class="notice__time">
          {{ t('library.reserve.seat.time.label') }}：{{ serverClockText }}
          <span class="notice__sep">·</span>{{ openStateText }}
          <span class="notice__sep">·</span>{{ releaseStateText }}
        </p>

        <!-- 违约后果：常驻（折叠会让用户不看就提交） -->
        <p v-if="violationLine" class="notice__violation">{{ violationLine }}</p>

        <!-- 规则明细（每日开放时段 / 限额 / 服务端原文）：默认收起，折叠标题即区块标题 -->
        <TCollapse v-if="hasRuleDetails" :title="t('library.reserve.seat.section.notice')">
          <template v-if="hasRules">
            <template v-if="openHours.length">
              <p class="notice__label">{{ t('library.reserve.seat.rule.openTime') }}</p>
              <ul class="notice__list">
                <li v-for="row in openHours" :key="row.key">{{ openHourText(row) }}</li>
              </ul>
            </template>
            <ul v-if="ruleLines.length" class="notice__list">
              <li v-for="(line, i) in ruleLines" :key="`rule-${i}`">{{ line }}</li>
            </ul>
          </template>
          <template v-if="noticeHtml">
            <h4 class="notice__subtitle">{{ noticeTitle }}</h4>
            <div class="rich" v-html="noticeHtml"></div>
          </template>
        </TCollapse>

        <p class="hint notice__unsupported">{{ t('library.reserve.seat.unsupported.hint') }}</p>
      </section>
    </template>

    <!-- 提交确认（验证码 + 签名在本机完成，无需跳超星） -->
    <TModal
      :visible="submitVisible"
      :title="t('library.reserve.seat.submit.title')"
      width="420px"
      :closable="!submitting"
      :close-on-overlay="!submitting"
      @close="submitVisible = false"
    >
      <div v-if="match" class="confirm__rows">
        <p class="confirm__line">{{ tf('library.reserve.seat.find.area', { area: matchAreaText || '--' }) }}</p>
        <p class="confirm__line">{{ tf('library.reserve.seat.find.seatNo', { seat: match.seatNum || '--' }) }}</p>
        <p class="confirm__line">{{ tf('library.reserve.seat.find.timeRange', { range: matchTimeText }) }}</p>
      </div>
      <p class="confirm__warn">{{ t('library.reserve.seat.submit.warn') }}</p>

      <p v-if="preparing" class="hint">{{ t('library.reserve.seat.submit.preparing') }}</p>
      <template v-else-if="prepareError">
        <p class="err">{{ prepareError }}</p>
        <button type="button" class="ghost" :disabled="preparing" @click="prepareCaptcha">
          {{ t('library.reserve.btn.retry') }}
        </button>
      </template>
      <template v-else>
        <img
          v-if="prepare && prepare.captchaUrl"
          class="captcha__img"
          :src="prepare.captchaUrl"
          :alt="t('library.reserve.seat.submit.captchaAlt')"
        />
        <div class="field">
          <label class="field__label" for="seat-captcha">
            {{ t('library.reserve.seat.submit.captchaLabel') }}
          </label>
          <input
            id="seat-captcha"
            v-model="captcha"
            class="input"
            type="text"
            autocomplete="off"
            :placeholder="t('library.reserve.seat.submit.captchaPlaceholder')"
          />
        </div>
        <button type="button" class="link link--left" :disabled="preparing" @click="prepareCaptcha">
          {{ t('library.reserve.seat.submit.reload') }}
        </button>
      </template>

      <p v-if="submitError" class="err">{{ submitError }}</p>

      <template #footer>
        <button type="button" class="ghost" :disabled="submitting" @click="submitVisible = false">
          {{ t('library.reserve.btn.cancel') }}
        </button>
        <button
          type="button"
          class="primary"
          :disabled="submitting || preparing || Boolean(prepareError)"
          @click="confirmSubmit"
        >
          {{ submitting ? t('library.reserve.btn.submitting') : t('library.reserve.seat.submit.action') }}
        </button>
      </template>
    </TModal>
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
  margin: 0 0 12px;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 800;
  color: var(--ui-text);
}
.card__title--gap {
  margin-top: 18px;
}

/* 功能区：区域筛选 + 时间片网格 */
.func {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field__label {
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-muted);
}
.select,
.input {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(12px * var(--ui-radius-scale));
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: calc(14px * var(--ui-font-scale));
}
.input {
  box-sizing: border-box;
}

/* 时间片网格（可视化点选，替代起止下拉） */
.grid-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.grid-block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.grid-block__picked {
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-primary);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 6px;
}
.cell {
  min-height: 40px;
  padding: 4px 6px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(10px * var(--ui-radius-scale));
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 600;
  cursor: pointer;
}
.cell--anchor {
  border-color: var(--ui-primary);
  background: var(--ui-primary);
  color: #fff;
}
.cell--on {
  border-color: color-mix(in oklab, var(--ui-primary) 55%, var(--ui-surface-border));
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
}
/* 已过去的时间片（服务端时间判定）：置灰不可点 */
.cell--past {
  border-color: transparent;
  background: color-mix(in oklab, var(--ui-muted) 12%, transparent);
  color: var(--ui-muted);
  opacity: 0.6;
  cursor: not-allowed;
}

/* 查询结果卡片 */
.match {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid color-mix(in oklab, var(--ui-primary) 45%, var(--ui-surface-border));
  border-radius: calc(14px * var(--ui-radius-scale));
  background: var(--ui-primary-soft);
}
.match--error {
  border-color: color-mix(in oklab, var(--ui-danger) 45%, var(--ui-surface-border));
  background: color-mix(in oklab, var(--ui-danger) 10%, transparent);
}
.match--ok {
  border-color: color-mix(in oklab, var(--ui-success, #16a34a) 45%, var(--ui-surface-border));
}
.match__title {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-primary);
}
.match__row {
  margin: 0;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-text);
}
.match__row--seat {
  font-size: calc(16px * var(--ui-font-scale));
  font-weight: 800;
}

/* 预约记录（紧凑） */
.records {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.record {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid color-mix(in oklab, var(--ui-surface-border) 60%, transparent);
}
.record:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.record__name {
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-text);
}
.record__meta {
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

/* 通知 / 规则区 */
.notice {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notice__time {
  margin: 0;
  font-size: calc(11px * var(--ui-font-scale));
  color: var(--ui-muted);
  opacity: 0.9;
}
.notice__sep {
  margin: 0 6px;
}
/* 违约后果：常驻可见（#1082 不折叠） */
.notice__violation {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 600;
  line-height: 1.6;
  color: var(--ui-danger);
}
.notice__label {
  margin: 4px 0 4px;
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-muted);
}
.notice__list {
  margin: 0;
  padding-left: 18px;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-muted);
  line-height: 1.7;
}
.notice__list + .notice__list {
  margin-top: 6px;
}
.notice__subtitle {
  margin: 10px 0 0;
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-muted);
}
.notice__unsupported {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--ui-surface-border);
}

/* 规则原文（后端 HTML，已净化） */
.rich {
  font-size: calc(13px * var(--ui-font-scale));
  line-height: 1.75;
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

/* 提交弹窗（验证码 + 摘要） */
.captcha__img {
  display: block;
  width: 100%;
  max-width: 220px;
  height: auto;
  margin: 0 auto 10px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(10px * var(--ui-radius-scale));
  background: #fff;
}
.confirm__rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.confirm__line {
  margin: 0;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-text);
  font-weight: 600;
  word-break: break-all;
}
.confirm__warn {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: calc(12px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-danger) 12%, transparent);
  font-size: calc(12px * var(--ui-font-scale));
  line-height: 1.6;
  color: var(--ui-danger);
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
.hint--warn {
  color: var(--ui-danger);
}
.primary,
.ghost {
  min-height: 44px;
  padding: 0 20px;
  border-radius: calc(14px * var(--ui-radius-scale));
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
}
.primary {
  border: 0;
  background: var(--ui-primary);
  color: #fff;
}
.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ghost {
  border: 1px solid var(--ui-surface-border);
  background: transparent;
  color: var(--ui-text);
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
.link--left {
  align-self: flex-start;
  padding: 0;
}

/* 宽屏（≥768 主断点）：整行块横跨，时间片更舒展 */
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
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  }
}
</style>
