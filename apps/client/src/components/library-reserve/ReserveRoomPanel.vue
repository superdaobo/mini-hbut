<script setup>
/**
 * 静音仓 / 研讨室 预约面板（#1056 建，**#1081 改为日期×时段网格**）
 *
 * 用户反馈两条：
 * 1. 「预约时间段不要让用户自己选开始和结束时间，做成像表一样，直接点选那一天的那个时间段」；
 * 2. 「静音仓/研讨室每天都显示没有时段」——根因是前端把**日期范围**当 `start_time/end_time`
 *    下发给接口，服务端按日期过滤成 0 条；正确做法是**不传**这两个参数，走「房间列表」模式。
 *
 * 因此本面板的数据流改为：
 * `library_reserve_time_list`（**不传** start_time/end_time）→ 房间列表（每间自带按星期几的
 * `intervals`）→ 选中房间后按 `intervals` + `advanceDays` 渲染**日期 × 时段网格**
 * （行 = 日期，列 = 时段；`available=0` 的星期几整行置灰）→ 点单元格选中 → 填表 → 提交。
 *
 * 后端命令（Rust 层 `transport/tauri/library_reserve.rs`）：
 * - `library_reserve_item_info`    → 约束（advanceDays / advanceTime / durationLimitMin / 提醒内容）
 * - `library_reserve_time_list`    → **房间列表 + 按星期几的开放窗口**（含 `customFormConfig`）
 * - `library_reserve_item_setting` → **真实时段 ID**（`commonIntervalMap`，提交 `intervalIds` 用）
 * - `library_reserve_submit`       → 提交预约（官方 `reserve/multiple/submit` 契约，实测 2026-10-19）
 *
 * ⚠️ 提交契约（实测）：`reserveUsers` 是 JSON 字符串，元素
 * `{itemId, starttime:"YYYY-MM-DD HH:mm", endtime, remark, today, intervalIds:"[id,…]"}`；
 * `reserveNum` 为房间数（单选固定 1），`cycleType=0`，`wfwEngineEnc` 传空串。
 * 日期 / 时段**不能**直接以 `date/startTime/endTime` 透传（服务端会当作无时段拒绝）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { invokeNative } from '../../platform/native'
import { showToast } from '../../utils/toast'
import { useLocale, tf } from '../../utils/app_i18n'
import { TCollapse, TEmptyState, TModal } from '../templates'
import ReserveFormFields from './ReserveFormFields.vue'
import {
  RESOURCE_CATALOG,
  WEEKDAY_KEYS,
  buildInitialValues,
  formatReserveFailureText,
  normalizeFormFields,
  parseReserveFailure,
  stripHtml,
  summarizeFormValues,
  toDateKey,
  toFormData,
  truncateReserveDetail,
  validateFormValues
} from './catalog'
import {
  buildRoomGrid,
  normalizeRoomIntervalSlots,
  normalizeRoomList,
  normalizeRoomOccupancy,
  resolveAdvanceDays,
  resolveCatalogResource,
  resolveRoomGridDays,
  resolveRoomIntervalIds,
  resolveRoomServerClock,
  roomOpenRange,
  weekdayKeyOfDate
} from './roomCatalog'

const props = defineProps({
  /** 应用标识：quiet_room（静音仓）/ seminar_room（研讨室） */
  app: { type: String, required: true }
})

const { t, locale } = useLocale()

// ── 约束（预约项详情） ──
const loading = ref(true)
const loadError = ref('')
const loadErrorDetail = ref('')
const itemInfo = ref(null)

// ── 房间列表（房间模式 time_list：不传 start_time / end_time） ──
const rooms = ref([])
const roomsLoading = ref(false)
const roomsError = ref('')
const roomsErrorDetail = ref('')
/** 响应顶层 `advanceDays`（与条目内同名字段并存，作为房间级缺失时的回落） */
const topAdvanceDays = ref(null)
/**
 * 服务端时钟（#1082 best-effort：房间接口契约未列服务端时间字段，取不到为 `null`）。
 * `null` 时网格**不做任何时间置灰**（宁可不禁用也不猜本地时间）。
 */
const serverClock = ref(null)

// ── 真实时段 ID（`library_reserve_item_setting`，2026-10-19 实测） ──
/**
 * 提交 `reserve/multiple/submit` 需要 `reserveUsers[].intervalIds`，
 * 而 ID 只能从 `reserve/item/setting` 的 `commonIntervalMap` 拿到（房间列表的
 * `reserveIntervalList` 只有开放窗口，没有 ID）。
 */
const intervalSlots = ref([])
const settingLoading = ref(false)
const settingError = ref('')

// ── 实时占用（`library_reserve_item_occupancy` → `reserve/item/user/list`，2026-10-19 实测） ──
/**
 * ⚠️ #1080 根因：`reserve/item/setting` 的 `available` 只是**配置层**「该时段被配置开放」，
 * **不是**实时占用 —— 别人已预约的时段在官方页面是灰色不可约，本面板却仍显示「可预约」，
 * 用户点选提交后才收到「当前预约时间段已满，请重新选择」。
 *
 * 因此必须另查「该房间所有用户的预约数据」，并按官方口径判定：
 * `已满 ⇔ 容量(userNum) <= 已占用份数(Σ reserveNum)`。
 */
const occupancyUsed = ref(null)
const occupancyLoading = ref(false)
const occupancyError = ref('')
const occupancyLoaded = ref(false)
/** 后端上报的「无法归属到时段/日期」记录数（> 0 → 统计不完整，必须按未知降级） */
const occupancyUnkeyed = ref(0)

/**
 * 占用状态是否**可信**（决定网格是否允许点选）。
 *
 * 任一条件不满足即视为「未知」，此时整表置灰 ——
 * **绝不能把「未知」显示成「可预约」**（宁可让用户重试，也不让用户白提交一次）。
 */
const occupancyKnown = computed(
  () =>
    occupancyLoaded.value &&
    !occupancyError.value &&
    occupancyUnkeyed.value === 0 &&
    intervalSlots.value.length > 0
)

/** 占用查询日期区间：本地今天前一天 ~ 今天 + 网格天数（±1 天余量，避免服务端/本机日期错位漏数据） */
const occupancyRange = () => {
  const today = new Date()
  const days = Math.max(1, Number(gridDays.value) || 1)
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
  return { start: toDateKey(from), end: toDateKey(to) }
}

/**
 * 失败信息 → 可读文案（#1082：**始终**把服务端原文带出来）。
 * 已知 kind 走 i18n 文案 + 细节后缀 + 服务端原文；未知 kind 直接给服务端原文。
 */
const failureText = (failure) => formatReserveFailureText(failure, t)

/** 房间渲染模型（服务端字段优先，静态目录仅用于补地点 / 提示等展示属性） */
const roomViews = computed(() => {
  void locale.value
  const catalog = RESOURCE_CATALOG[props.app] || []
  return rooms.value.map((room) => {
    const fallback = resolveCatalogResource(catalog, room)
    const range = roomOpenRange(room)
    return {
      key: room.key,
      room,
      name:
        room.name ||
        (fallback ? tf(fallback.nameKey, { n: fallback.index }) : t('library.reserve.booking.roomFallback')),
      capacityMin: room.minUserNum ?? fallback?.capacityMin ?? null,
      capacityMax: room.maxUserNum ?? fallback?.capacityMax ?? null,
      openFrom: range.openFrom || fallback?.openFrom || '',
      openTo: range.openTo || fallback?.openTo || '',
      location: fallback ? t(fallback.locationKey) : '',
      note: fallback?.noteKey ? t(fallback.noteKey) : ''
    }
  })
})

// ── 房间选择 ──
const selectedRoomKey = ref('')
const selectedRoomView = computed(
  () => roomViews.value.find((view) => view.key === selectedRoomKey.value) || null
)
const selectedRoom = computed(() => selectedRoomView.value?.room || null)

/**
 * 可提前天数：**预约项（`reserve/info`）优先**，其次房间条目，最后响应顶层。
 *
 * ⚠️ 顺序不可颠倒（2026-10-19 实测）：房间条目的 `advanceDays` 实测为 **14**，
 * 那是房间自身配置；而真正决定可约窗口的是预约项的 `advanceDays`（实测 **3**）。
 * 官方页面同样取 `reserveData.advanceDays`（= `reserve/info`）。
 * 若优先取房间值，网格会多渲染 10 天，用户选到第 5 天起提交必然被服务端拒绝
 * （「当前预约时间段未开放，请重新选择」）。
 */
const advanceDays = computed(() =>
  resolveAdvanceDays(
    itemInfo.value?.advanceDays,
    selectedRoom.value?.advanceDays,
    topAdvanceDays.value
  )
)

/** 日期 × 时段网格应展示的天数（含今天；按官方 `advanceDays + 放号时间` 规则） */
const gridDays = computed(() =>
  resolveRoomGridDays(advanceDays.value, itemInfo.value?.advanceTime)
)

/** 日期 × 时段网格（行 = 日期，列 = **服务端真实时段**；可用性逐时段判定 + 实时占用 + 服务端时间置灰） */
const grid = computed(() =>
  buildRoomGrid(
    selectedRoom.value,
    // buildRoomGrid 内部按 `advanceDays + 1` 天生成，这里传入「总天数 - 1」
    Math.max(0, gridDays.value - 1),
    selectedRoom.value?.timeUnit ?? null,
    new Date(),
    serverClock.value,
    // 真实时段（含非整点档，如 20:00-21:30）；拿不到时空数组 → 回落到按粒度切分
    intervalSlots.value,
    // #1080：实时占用（`intervalId_date` → 已占用份数）+ 占用是否可信
    occupancyUsed.value,
    occupancyKnown.value
  )
)

/** 动态表单定义（房间条目自带 `customFormConfig`，缺失视为无需填写） */
const roomForm = computed(() => {
  const raw = selectedRoom.value?.raw
  const config = raw ? raw.customFormConfig : null
  if (config === null || config === undefined) return { fields: [], parsed: true }
  return normalizeFormFields(config)
})

// ── 已选单元格 ──
const selectedCell = ref(null)
const formValues = ref({})
const formErrors = ref({})

/** 单元格选中态：`on` 已选 / `off` 可约 / `full` 已满 / `unknown` 占用未知 / `closed` 不可约 */
const cellState = (cell) => {
  if (!cell.available) {
    if (cell.occupied) return 'full'
    if (cell.unknown) return 'unknown'
    return 'closed'
  }
  const picked = selectedCell.value
  if (picked && picked.date === cell.date && picked.start === cell.start && picked.end === cell.end) {
    return 'on'
  }
  return 'off'
}

/** 单元格样式类（行级可用性由 cell.available 决定） */
const cellClass = (cell) => {
  const state = cellState(cell)
  const modifier =
    state === 'on'
      ? 'gcell--on'
      : state === 'full'
        ? 'gcell--full'
        : state === 'unknown'
          ? 'gcell--unknown'
          : state === 'closed'
            ? 'gcell--closed'
            : 'gcell--free'
  return ['gcell', modifier]
}

/** 日期行标记：今天 / 明天 */
const dateTag = (row) => {
  if (row.offset === 0) return t('library.reserve.date.today')
  if (row.offset === 1) return t('library.reserve.date.tomorrow')
  return ''
}

/** 网格列宽（首列为日期列） */
const gridStyle = computed(() => ({
  gridTemplateColumns: `84px repeat(${grid.value.columns.length}, minmax(68px, 1fr))`
}))

/** 选择单元格：不可约给出提示，重复点击取消选择 */
const chooseCell = (cell) => {
  if (!cell.available) {
    // #1080：已满 / 占用未知 / 未开放 三类原因分别给出可读提示
    const key = cell.occupied
      ? 'library.reserve.toast.slotOccupied'
      : cell.unknown
        ? 'library.reserve.booking.occupancyUnknown'
        : 'library.reserve.toast.slotUnavailable'
    showToast(t(key), 'warning')
    return
  }
  const picked = selectedCell.value
  if (picked && picked.date === cell.date && picked.start === cell.start && picked.end === cell.end) {
    selectedCell.value = null
    formValues.value = {}
    formErrors.value = {}
    return
  }
  selectedCell.value = { date: cell.date, start: cell.start, end: cell.end }
  formValues.value = buildInitialValues(roomForm.value.fields)
  formErrors.value = {}
}

/** 时段展示文案 */
const cellTimeText = (cell) => (cell ? `${cell.start}-${cell.end}` : '')

/** 提交前摘要行（确认弹窗展示） */
const confirmRows = computed(() => {
  const view = selectedRoomView.value
  const cell = selectedCell.value
  if (!view || !cell) return []
  return [
    { label: t('library.reserve.confirm.room'), value: view.name },
    { label: t('library.reserve.confirm.date'), value: cell.date },
    { label: t('library.reserve.confirm.time'), value: cellTimeText(cell) },
    ...summarizeFormValues(roomForm.value.fields, formValues.value).map((row) => ({
      label: row.label,
      value: row.value
    }))
  ]
})

/** 单次最长时长（分钟），缺失时不展示该条约束 */
const durationLimit = computed(() => {
  const raw = Number(itemInfo.value?.durationLimitMin)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null
})

/** 后端下发的提醒内容（HTML → 纯文本，避免 v-html 注入风险） */
const notice = computed(() => ({
  title: String(itemInfo.value?.dialogTitle ?? '').trim(),
  body: stripHtml(itemInfo.value?.dialogContent)
}))
/** 是否有可展示的通知内容（决定折叠区是否渲染） */
const hasNotice = computed(
  () =>
    loading.value ||
    Boolean(loadError.value) ||
    Boolean(notice.value.title || notice.value.body) ||
    Boolean(durationLimit.value)
)

/** 提交 ── */
const confirmVisible = ref(false)
const submitting = ref(false)

/** 拉取预约项约束（失败不阻断浏览，仅降级展示） */
const loadConstraints = async () => {
  loading.value = true
  loadError.value = ''
  loadErrorDetail.value = ''
  try {
    const res = await invokeNative('library_reserve_item_info', { req: { app: props.app } })
    itemInfo.value = res?.info || null
  } catch (e) {
    const failure = parseReserveFailure(e)
    itemInfo.value = null
    // 主行给 i18n / 服务端原文，副行（仅已知 kind）附服务端原文细节，避免 detail 重复展示
    loadError.value = failure.messageKey
      ? t(failure.messageKey)
      : failure.detail || t('library.reserve.error.unknown')
    loadErrorDetail.value = failure.messageKey ? truncateReserveDetail(failure.detail) : ''
  } finally {
    loading.value = false
  }
}

/**
 * 拉取房间列表 + 时段可用性。
 *
 * ⚠️ **必须不传 `start_time` / `end_time`**：传日期范围会让服务端按日期过滤成 0 条
 * （用户上报的「每天都显示没有时段」）。不传才进入「房间列表」模式，返回按星期几的 `intervals`。
 */
const loadRooms = async () => {
  roomsLoading.value = true
  roomsError.value = ''
  roomsErrorDetail.value = ''
  try {
    const res = await invokeNative('library_reserve_time_list', { req: { app: props.app } })
    rooms.value = normalizeRoomList(res?.items)
    topAdvanceDays.value = res?.advanceDays ?? null
    // 服务端时钟 best-effort（契约未列该字段，取不到保持 null → 网格不做时间置灰）
    serverClock.value = resolveRoomServerClock(res)
  } catch (e) {
    const failure = parseReserveFailure(e)
    rooms.value = []
    serverClock.value = null
    // 主行给 i18n / 服务端原文，副行（仅已知 kind）附服务端原文细节，避免 detail 重复展示
    roomsError.value = failure.messageKey
      ? t(failure.messageKey)
      : failure.detail || t('library.reserve.error.unknown')
    roomsErrorDetail.value = failure.messageKey ? truncateReserveDetail(failure.detail) : ''
  } finally {
    roomsLoading.value = false
  }
}

/**
 * 拉取房间的真实时段 ID（`reserve/item/setting`）。
 *
 * 该请求失败**不阻断**浏览（网格仍按开放窗口渲染），但提交时必须拿到 ID，
 * 否则给出明确提示而不是盲目提交。
 */
const loadRoomSetting = async (itemId) => {
  intervalSlots.value = []
  settingError.value = ''
  if (!itemId) return
  settingLoading.value = true
  try {
    const res = await invokeNative('library_reserve_item_setting', {
      req: { app: props.app, item_id: Number(itemId) }
    })
    intervalSlots.value = normalizeRoomIntervalSlots(res?.intervals)
    if (!intervalSlots.value.length) {
      settingError.value = t('library.reserve.booking.settingEmpty')
    }
  } catch (e) {
    const failure = parseReserveFailure(e)
    settingError.value = failureText(failure)
  } finally {
    settingLoading.value = false
  }
}

/** 清空已选单元格与表单状态（切换房间 / 提交成功后复用） */
const resetCellSelection = () => {
  selectedCell.value = null
  formValues.value = {}
  formErrors.value = {}
}

/**
 * 拉取该房间的**实时占用**（`reserve/item/user/list`，2026-10-19 实测）。
 *
 * 失败 / 统计不完整 → `occupancyKnown=false` → 网格整表置灰并给出重试入口
 * （**不允许**把「占用未知」显示成「可预约」，否则用户又会白提交一次）。
 * 顺带用响应里的服务端时间 `serverNow` 校准「今天已过去的时段」。
 */
const loadRoomOccupancy = async (itemId) => {
  occupancyUsed.value = null
  occupancyError.value = ''
  occupancyUnkeyed.value = 0
  occupancyLoaded.value = false
  if (!itemId) return
  occupancyLoading.value = true
  try {
    const range = occupancyRange()
    const res = await invokeNative('library_reserve_item_occupancy', {
      req: {
        app: props.app,
        item_id: Number(itemId),
        start_time: range.start,
        end_time: range.end
      }
    })
    const view = normalizeRoomOccupancy(res)
    occupancyUsed.value = view.used
    occupancyUnkeyed.value = view.unkeyed
    occupancyLoaded.value = true
    // 服务端时钟：优先于 best-effort 的顶层解析（房间接口契约并未提供该字段）
    if (view.clock) serverClock.value = view.clock
  } catch (e) {
    const failure = parseReserveFailure(e)
    occupancyError.value = failureText(failure)
  } finally {
    occupancyLoading.value = false
  }
}

/** 选择房间（网格来自该房间自带的 intervals；真实时段 ID 与实时占用另拉） */
const selectRoom = (view) => {
  selectedRoomKey.value = view.key
  resetCellSelection()
  void loadRoomSetting(view.room.itemId)
  void loadRoomOccupancy(view.room.itemId)
}

/** 返回房间列表 */
const backToList = () => {
  selectedRoomKey.value = ''
  resetCellSelection()
  intervalSlots.value = []
  settingError.value = ''
  occupancyUsed.value = null
  occupancyError.value = ''
  occupancyUnkeyed.value = 0
  occupancyLoaded.value = false
}

/** 表单值变更（子组件回抛） */
const onFormValues = (next) => {
  formValues.value = next
}

/** 提交入口：先本地校验，通过后弹二次确认 */
const requestSubmit = () => {
  // #1080：占用状态不可信时不得提交（否则必然被服务端以「时间段已满」拒绝）
  if (!occupancyKnown.value) {
    showToast(t('library.reserve.booking.occupancyUnknown'), 'warning')
    return
  }
  if (!selectedCell.value) {
    showToast(t('library.reserve.toast.selectSlot'), 'warning')
    return
  }
  const validation = validateFormValues(roomForm.value.fields, formValues.value)
  formErrors.value = validation.errors
  if (!validation.valid) {
    showToast(t('library.reserve.toast.formInvalid'), 'warning')
    return
  }
  confirmVisible.value = true
}

/** 确认后真正提交（官方 `reserve/multiple/submit` 契约，2026-10-19 实测） */
const confirmSubmit = async () => {
  const room = selectedRoom.value
  const cell = selectedCell.value
  if (!room || !cell) {
    confirmVisible.value = false
    return
  }
  // 真实时段 ID 必须命中：拿不到就别提交（服务端会当作「无时段」拒绝）
  const intervalIds = resolveRoomIntervalIds(
    intervalSlots.value,
    weekdayKeyOfDate(cell.date),
    cell.start,
    cell.end
  )
  if (!intervalIds.length) {
    confirmVisible.value = false
    showToast(t('library.reserve.toast.intervalMissing'), 'error', 3400)
    return
  }
  submitting.value = true
  try {
    // 官方契约：reserveUsers 是 JSON 字符串，元素含 today/starttime/endtime/intervalIds
    // （intervalIds 本身也是 JSON 字符串），reserveNum 为房间数（单选固定 1）。
    const reserveUsers = [
      {
        itemId: Number(room.itemId),
        starttime: `${cell.date} ${cell.start}`,
        endtime: `${cell.date} ${cell.end}`,
        remark: '',
        today: cell.date,
        intervalIds: JSON.stringify(intervalIds)
      }
    ]
    const req = {
      app: props.app,
      cycle_type: 0,
      form_data: toFormData(roomForm.value.fields, formValues.value),
      extra: {
        itemId: room.itemId,
        reserveUsers: JSON.stringify(reserveUsers),
        reserveNum: '1',
        // 与官方页面一致：风控关闭，wfwEngineEnc 传空串
        wfwEngineEnc: ''
      }
    }

    const res = await invokeNative('library_reserve_submit', { req })
    confirmVisible.value = false
    showToast(res?.message || t('library.reserve.toast.submitSuccess'), 'success')
    resetCellSelection()
    // 提交成功后刷新房间时段可用性 + 实时占用，避免展示过期状态
    // （刚提交成功的时段必须立刻变成「已满/已约」，否则用户会重复点选）
    await Promise.all([loadRooms(), loadRoomOccupancy(room.itemId)])
  } catch (e) {
    confirmVisible.value = false
    const failure = parseReserveFailure(e)
    // 网络失败与业务失败给出不同文案与停留时长
    showToast(failureText(failure), failure.network ? 'warning' : 'error', failure.network ? 2600 : 3400)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void loadConstraints()
  void loadRooms()
})
// app 变化（静音仓 ⇄ 研讨室）时重置并重新加载
watch(
  () => props.app,
  () => {
    backToList()
    rooms.value = []
    topAdvanceDays.value = null
    serverClock.value = null
    intervalSlots.value = []
    settingError.value = ''
    occupancyUsed.value = null
    occupancyError.value = ''
    occupancyUnkeyed.value = 0
    occupancyLoaded.value = false
    void loadConstraints()
    void loadRooms()
  }
)
</script>

<template>
  <div class="panel">
    <!-- ① 功能区（置顶）：房间列表 -->
    <template v-if="!selectedRoomView">
      <h2 class="section-title">{{ t('library.reserve.resource.title') }}</h2>

      <TEmptyState
        v-if="roomsLoading"
        type="loading"
        :message="t('library.reserve.state.loading')"
      />

      <section v-else-if="roomsError" class="card error-card">
        <p class="err">{{ roomsError }}</p>
        <p v-if="roomsErrorDetail" class="hint">{{ roomsErrorDetail }}</p>
        <button type="button" class="ghost" @click="loadRooms">
          {{ t('library.reserve.btn.retry') }}
        </button>
      </section>

      <TEmptyState
        v-else-if="!roomViews.length"
        type="empty"
        :message="t('library.reserve.booking.roomsEmpty')"
      />

      <div v-else class="res-list">
        <button
          v-for="view in roomViews"
          :key="view.key"
          type="button"
          class="res-card"
          @click="selectRoom(view)"
        >
          <div class="res-card__top">
            <h3 class="res-card__name">{{ view.name }}</h3>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </div>
          <p v-if="view.openFrom && view.openTo" class="res-card__meta">
            {{ tf('library.reserve.resource.openTime', { range: `${view.openFrom}-${view.openTo}` }) }}
          </p>
          <p v-if="view.location" class="res-card__meta">
            {{ tf('library.reserve.resource.location', { place: view.location }) }}
          </p>
          <p v-if="view.capacityMin !== null && view.capacityMax !== null" class="res-card__meta">
            {{ tf('library.reserve.resource.capacity', { min: view.capacityMin, max: view.capacityMax }) }}
          </p>
          <p v-if="view.note" class="res-card__note">{{ view.note }}</p>
        </button>
      </div>
    </template>

    <!-- ② 预约（日期 × 时段网格 → 填表 → 提交） -->
    <template v-else>
      <button type="button" class="back-link" @click="backToList">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        {{ selectedRoomView.name }}
      </button>

      <section class="card res-summary">
        <p v-if="selectedRoomView.openFrom && selectedRoomView.openTo" class="res-card__meta">
          {{ tf('library.reserve.resource.openTime', { range: `${selectedRoomView.openFrom}-${selectedRoomView.openTo}` }) }}
        </p>
        <p v-if="selectedRoomView.location" class="res-card__meta">
          {{ tf('library.reserve.resource.location', { place: selectedRoomView.location }) }}
        </p>
        <p
          v-if="selectedRoomView.capacityMin !== null && selectedRoomView.capacityMax !== null"
          class="res-card__meta"
        >
          {{ tf('library.reserve.resource.capacity', { min: selectedRoomView.capacityMin, max: selectedRoomView.capacityMax }) }}
        </p>
      </section>

      <!-- 日期 × 时段网格（可视化点选，替代「选日期 + 选时段」两步） -->
      <h3 class="section-title">{{ t('library.reserve.booking.grid') }}</h3>

      <p v-if="settingLoading" class="hint">{{ t('library.reserve.booking.settingLoading') }}</p>
      <p v-else-if="settingError" class="hint hint--warn">{{ settingError }}</p>

      <!-- 实时占用（#1080）：加载中 / 失败都必须明说，失败时整表置灰并提供重试 -->
      <p v-if="occupancyLoading" class="hint">{{ t('library.reserve.booking.occupancyLoading') }}</p>
      <template v-else-if="!occupancyKnown && grid.columns.length">
        <p class="hint hint--warn">{{ t('library.reserve.booking.occupancyUnknown') }}</p>
        <p v-if="occupancyError" class="hint">{{ occupancyError }}</p>
        <button
          type="button"
          class="ghost"
          :disabled="occupancyLoading || !selectedRoomView"
          @click="loadRoomOccupancy(selectedRoomView.room.itemId)"
        >
          {{ t('library.reserve.btn.retry') }}
        </button>
      </template>

      <p v-if="!grid.columns.length" class="hint">{{ t('library.reserve.booking.noIntervals') }}</p>
      <template v-else>
        <div class="grid-scroll">
          <div class="grid grid--head" :style="gridStyle">
            <span class="grid__corner">{{ t('library.reserve.booking.gridDate') }}</span>
            <span v-for="column in grid.columns" :key="column.key" class="grid__col">
              {{ column.label }}
            </span>
          </div>
          <div
            v-for="row in grid.rows"
            :key="row.key"
            class="grid grid--row"
            :class="{ 'grid--off': row.disabled }"
            :style="gridStyle"
          >
            <span class="grid__date">
              <span class="grid__week">{{ t(WEEKDAY_KEYS[row.weekday]) }}</span>
              <strong class="grid__md">{{ row.date.slice(5) }}</strong>
              <em v-if="dateTag(row)" class="grid__tag">{{ dateTag(row) }}</em>
            </span>
            <button
              v-for="cell in row.cells"
              :key="cell.key"
              type="button"
              :class="cellClass(cell)"
              :disabled="!cell.available"
              :aria-pressed="cellState(cell) === 'on'"
              @click="chooseCell(cell)"
            >
              <span class="gcell__label">{{ cell.label }}</span>
            </button>
          </div>
        </div>
        <div class="legend">
          <span><i class="dot dot--free" />{{ t('library.reserve.booking.legendFree') }}</span>
          <span><i class="dot dot--full" />{{ t('library.reserve.booking.legendFull') }}</span>
          <span><i class="dot dot--closed" />{{ t('library.reserve.booking.legendClosed') }}</span>
          <span><i class="dot dot--on" />{{ t('library.reserve.booking.legendSelected') }}</span>
        </div>
      </template>

      <!-- 动态表单 -->
      <template v-if="selectedCell">
        <h3 class="section-title">{{ t('library.reserve.booking.form') }}</h3>
        <section class="card">
          <p
            v-if="selectedRoomView.capacityMin !== null && selectedRoomView.capacityMax !== null"
            class="hint"
          >
            {{ tf('library.reserve.booking.capacityHint', { min: selectedRoomView.capacityMin, max: selectedRoomView.capacityMax }) }}
          </p>
          <ReserveFormFields
            v-if="roomForm.fields.length"
            :fields="roomForm.fields"
            :values="formValues"
            :errors="formErrors"
            :disabled="submitting"
            @update:values="onFormValues"
          />
          <p v-else-if="!roomForm.parsed" class="hint">
            {{ t('library.reserve.booking.formUnparsed') }}
          </p>
          <p v-else class="hint">{{ t('library.reserve.booking.formEmpty') }}</p>
        </section>
      </template>

      <!-- 提交条 -->
      <div class="submit-bar">
        <div class="submit-bar__info">
          <template v-if="selectedCell">
            <strong>{{ cellTimeText(selectedCell) }}</strong>
            <span class="muted">{{ selectedCell.date }}</span>
          </template>
          <span v-else class="muted">{{ t('library.reserve.booking.selectHint') }}</span>
        </div>
        <button
          type="button"
          class="primary"
          :disabled="!selectedCell || submitting || settingLoading || occupancyLoading || !occupancyKnown"
          @click="requestSubmit"
        >
          {{ submitting ? t('library.reserve.btn.submitting') : t('library.reserve.btn.submit') }}
        </button>
      </div>
    </template>

    <!-- ③ 预约须知 / 特别提醒（置底）：违约后果常驻，其余明细默认折叠（#1082 文字精简） -->
    <section v-if="hasNotice" class="card notice">
      <!-- 违约后果：常驻（折叠会让用户不看就提交） -->
      <p class="notice__body notice__body--danger">{{ t('library.reserve.notice.violation') }}</p>

      <!-- 约束加载失败：同样常驻（藏进折叠区会让重试入口一起消失） -->
      <p v-if="loadError" class="notice__body notice__body--danger">
        {{ loadError }}<span v-if="loadErrorDetail"> {{ loadErrorDetail }}</span>
      </p>
      <button v-if="loadError" type="button" class="ghost" @click="loadConstraints">
        {{ t('library.reserve.btn.retry') }}
      </button>

      <TCollapse :title="t('library.reserve.notice.title')">
        <p v-if="notice.title" class="notice__body notice__body--strong">{{ notice.title }}</p>
        <p v-if="notice.body" class="notice__body">{{ notice.body }}</p>
        <p v-if="loading" class="notice__body">{{ t('library.reserve.state.loading') }}</p>
        <template v-else>
          <ul class="notice__list">
            <li>{{ tf('library.reserve.notice.advance', { n: advanceDays }) }}</li>
            <li v-if="durationLimit">{{ tf('library.reserve.notice.duration', { n: durationLimit }) }}</li>
          </ul>
        </template>
      </TCollapse>
    </section>

    <!-- 二次确认（必须：含违约后果） -->
    <TModal
      :visible="confirmVisible"
      :title="t('library.reserve.confirm.title')"
      width="420px"
      @close="confirmVisible = false"
    >
      <dl class="confirm__list">
        <div v-for="(row, i) in confirmRows" :key="i" class="confirm__row">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
      <p class="confirm__warn">{{ t('library.reserve.confirm.violation') }}</p>
      <template #footer>
        <button type="button" class="ghost" :disabled="submitting" @click="confirmVisible = false">
          {{ t('library.reserve.btn.cancel') }}
        </button>
        <button type="button" class="primary" :disabled="submitting" @click="confirmSubmit">
          {{ submitting ? t('library.reserve.btn.submitting') : t('library.reserve.btn.confirm') }}
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
.section-title {
  margin: 4px 0 0;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 800;
  color: var(--ui-text);
}

/* 提醒 / 约束（置底可折叠） */
.notice {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notice__body {
  margin: 0;
  font-size: calc(13px * var(--ui-font-scale));
  line-height: 1.6;
  color: var(--ui-muted);
}
.notice__body--strong {
  font-weight: 700;
  color: var(--ui-text);
}
.notice__body--danger {
  color: var(--ui-danger);
  font-weight: 600;
}
.notice__list {
  margin: 0;
  padding-left: 18px;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-muted);
  line-height: 1.7;
}

/* 房间列表 */
.res-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.res-card {
  text-align: left;
  border: 1px solid var(--ui-surface-border);
  background: var(--ui-surface);
  border-radius: calc(16px * var(--ui-radius-scale));
  padding: 14px;
  cursor: pointer;
  color: inherit;
  transition: transform calc(0.14s * var(--ui-motion-scale)) ease;
}
.res-card:active {
  transform: scale(0.99);
}
.res-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ui-muted);
}
.res-card__name {
  margin: 0;
  font-size: calc(15px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-text);
}
.res-card__meta {
  margin: 6px 0 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}
.res-card__note {
  margin: 8px 0 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-danger);
  line-height: 1.6;
}

/* 返回 + 摘要 */
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  border: 0;
  background: transparent;
  padding: 0;
  font-size: calc(15px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-text);
  cursor: pointer;
}
.res-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 日期 × 时段网格 */
.grid-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}
.grid {
  display: grid;
  gap: 6px;
  align-items: stretch;
  min-width: 100%;
  width: max-content;
}
.grid + .grid {
  margin-top: 6px;
}
.grid--head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding-bottom: 2px;
  background: var(--ui-surface);
}
.grid__corner,
.grid__col {
  font-size: calc(11px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-muted);
  text-align: center;
  padding: 2px 0;
}
.grid__corner {
  text-align: left;
}
.grid__date {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 1px;
  padding: 4px 0;
}
.grid__week {
  font-size: calc(11px * var(--ui-font-scale));
  color: var(--ui-muted);
}
.grid__md {
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-text);
}
.grid__tag {
  font-size: calc(10px * var(--ui-font-scale));
  font-style: normal;
  color: var(--ui-primary);
}
.grid--off .grid__date {
  opacity: 0.55;
}
.gcell {
  min-height: 38px;
  padding: 4px 6px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(10px * var(--ui-radius-scale));
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: calc(11px * var(--ui-font-scale));
  font-weight: 600;
  cursor: pointer;
}
.gcell__label {
  white-space: nowrap;
}
.gcell--free:active {
  transform: scale(0.97);
}
.gcell--on {
  border-color: var(--ui-primary);
  background: var(--ui-primary);
  color: #fff;
}
.gcell--closed {
  border-color: transparent;
  background: color-mix(in oklab, var(--ui-muted) 12%, transparent);
  color: var(--ui-muted);
  opacity: 0.6;
  cursor: not-allowed;
}
/* 已满（#1080）：与「未开放」区分——用危险色描边，明确表达「别人已约满」 */
.gcell--full {
  border-color: color-mix(in oklab, var(--ui-danger) 40%, transparent);
  background: color-mix(in oklab, var(--ui-danger) 12%, transparent);
  color: var(--ui-danger);
  opacity: 0.75;
  cursor: not-allowed;
}
/* 占用未知（#1080）：不显示为可预约；虚线边框表达「状态待确认」 */
.gcell--unknown {
  border-style: dashed;
  border-color: color-mix(in oklab, var(--ui-muted) 45%, transparent);
  background: transparent;
  color: var(--ui-muted);
  opacity: 0.6;
  cursor: not-allowed;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-top: 8px;
  font-size: calc(11px * var(--ui-font-scale));
  color: var(--ui-muted);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border: 1px solid var(--ui-surface-border);
}
.dot--free {
  background: var(--ui-surface);
}
.dot--closed {
  background: color-mix(in oklab, var(--ui-muted) 30%, transparent);
}
.dot--full {
  background: color-mix(in oklab, var(--ui-danger) 45%, transparent);
  border-color: color-mix(in oklab, var(--ui-danger) 55%, transparent);
}
.dot--on {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
}

/* 提交条 */
/* 提交条：**固定贴屏幕底部**（用户反馈：原 sticky 停在内容中段，挡住网格）。
   ⚠️ `library_reserve` 不是主 Tab，页面无底部导航栏（见 appState.showTabBar），
   故可直接贴底，仅留安全区与 12px 呼吸位。 */
.submit-bar {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(12px + var(--app-safe-bottom, 0px));
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(16px * var(--ui-radius-scale));
  box-shadow: var(--ui-shadow-soft);
}
.submit-bar__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.submit-bar__info strong {
  font-size: calc(14px * var(--ui-font-scale));
  color: var(--ui-text);
}
.muted {
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

/* 确认弹窗 */
.confirm__list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.confirm__row {
  display: flex;
  gap: 10px;
  font-size: calc(13px * var(--ui-font-scale));
}
.confirm__row dt {
  flex: 0 0 72px;
  color: var(--ui-muted);
}
.confirm__row dd {
  margin: 0;
  flex: 1;
  color: var(--ui-text);
  font-weight: 600;
  word-break: break-all;
}
.confirm__warn {
  margin: 12px 0 0;
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

/* 宽屏（≥768 主断点）：房间多列排布 */
@media (min-width: 768px) {
  .res-list {
    grid-template-columns: repeat(2, 1fr);
  }
  /* 固定条在宽屏下居中限宽，避免横跨整屏 */
  .submit-bar {
    left: 50%;
    right: auto;
    width: min(720px, calc(100% - 32px));
    transform: translateX(-50%);
  }
}
</style>
