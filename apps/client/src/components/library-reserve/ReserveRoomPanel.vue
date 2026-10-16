<script setup>
/**
 * 静音仓 / 研讨室 预约面板（#1056）
 *
 * 单套应用的完整预约流程：资源列表 → 选日期与时段 → 动态表单 → 二次确认 → 提交。
 * 同一组件按 `app` 参数复用于静音仓（quiet_room）与研讨室（seminar_room）。
 *
 * 后端命令（Rust 层 `transport/tauri/library_reserve.rs`，#1053）：
 * - `library_reserve_item_info`        → 约束（advanceDays / durationLimitMin / 提醒内容）
 * - `library_reserve_time_list`        → 可预约时段（含 customFormConfig 动态表单定义）
 * - `library_reserve_submit`           → 提交预约
 *
 * ⚠️ 契约不确定处（见 #1053）：`customFormConfig` → 提交体映射、取消路径等按已知形态实现，
 * 不做「猜测后伪装成已确定」；失败一律以 Rust 返回的结构化 `kind` 区分业务失败与网络失败。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { invokeNative } from '../../platform/native'
import { showToast } from '../../utils/toast'
import { useLocale, tf } from '../../utils/app_i18n'
import { TEmptyState, TModal } from '../templates'
import ReserveFormFields from './ReserveFormFields.vue'
import {
  FALLBACK_ADVANCE_DAYS,
  RESOURCE_CATALOG,
  WEEKDAY_KEYS,
  buildDateOptions,
  buildInitialValues,
  matchesDate,
  normalizeSlot,
  parseReserveFailure,
  pickRawString,
  stripHtml,
  summarizeFormValues,
  toFormData,
  validateFormValues
} from './catalog'

const props = defineProps({
  /** 应用标识：quiet_room（静音仓）/ seminar_room（研讨室） */
  app: { type: String, required: true }
})

const { t, locale } = useLocale()

// ── 资源目录（静态勘察事实，随语言切换重算插值文案） ──
const resources = computed(() => {
  void locale.value
  const list = RESOURCE_CATALOG[props.app] || []
  return list.map((item) => ({
    ...item,
    name: tf(item.nameKey, { n: item.index }),
    location: t(item.locationKey),
    note: item.noteKey ? t(item.noteKey) : ''
  }))
})

// ── 约束（预约项详情） ──
const loading = ref(true)
const loadError = ref('')
const loadErrorDetail = ref('')
const itemInfo = ref(null)
const noticeDismissed = ref(false)

// ── 资源选择 ──
const selectedResourceId = ref('')
const selectedResource = computed(
  () => resources.value.find((item) => item.id === selectedResourceId.value) || null
)

// ── 时段 ──
const slots = ref([])
const slotsLoading = ref(false)
const slotsError = ref('')
const slotsErrorDetail = ref('')
const selectedDate = ref('')
const selectedSlotId = ref('')

const selectedSlot = computed(
  () => slots.value.find((item) => item.id === selectedSlotId.value) || null
)

// ── 动态表单 ──
const formValues = ref({})
const formErrors = ref({})

// ── 提交 ──
const confirmVisible = ref(false)
const submitting = ref(false)

/** 失败信息 → 可读文案（已知 kind 用 i18n，未知回落后端 / 运行时说明） */
const failureText = (failure) =>
  failure.messageKey ? t(failure.messageKey) : failure.detail || t('library.reserve.error.unknown')

/** 可提前天数：以后端约束为准，缺失时回落勘察值（3 天） */
const advanceDays = computed(() => {
  const raw = Number(itemInfo.value?.advanceDays)
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : FALLBACK_ADVANCE_DAYS
})

const dateOptions = computed(() => buildDateOptions(advanceDays.value))

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
const showNotice = computed(
  () => !noticeDismissed.value && Boolean(notice.value.title || notice.value.body)
)

/** 后端时段是否携带日期维度（有则按所选日期过滤，无则视为全量） */
const slotsHaveDate = computed(() => slots.value.some((slot) => Boolean(slot.date)))

const visibleSlots = computed(() => {
  if (!slotsHaveDate.value) return slots.value
  return slots.value.filter((slot) => matchesDate(slot.date, selectedDate.value))
})

/** 日期展示：星期 + 月-日 + 今天 / 明天标记 */
const dateLabel = (option) => ({
  weekday: t(WEEKDAY_KEYS[option.date.getDay()]),
  md: `${String(option.date.getMonth() + 1).padStart(2, '0')}-${String(option.date.getDate()).padStart(2, '0')}`,
  tag:
    option.offset === 0
      ? t('library.reserve.date.today')
      : option.offset === 1
        ? t('library.reserve.date.tomorrow')
        : ''
})

/** 时段展示文案 */
const slotTimeText = (slot) =>
  slot.end ? `${slot.start}-${slot.end}` : slot.start || t('library.reserve.booking.slotUnknown')

/** 时段样式类 */
const slotClass = (slot) => [
  'slot',
  slot.state === 'free' ? 'slot--free' : slot.state === 'taken' ? 'slot--taken' : 'slot--closed',
  { 'slot--on': slot.id === selectedSlotId.value }
]

/** 提交前摘要行（确认弹窗展示） */
const confirmRows = computed(() => {
  const resource = selectedResource.value
  const slot = selectedSlot.value
  if (!resource || !slot) return []
  return [
    // 房间名优先取后端时段自带的 itemName（权威来源）；缺失时回落所选房间
    { label: t('library.reserve.confirm.room'), value: slot.itemName || resource.name },
    { label: t('library.reserve.confirm.date'), value: selectedDate.value },
    { label: t('library.reserve.confirm.time'), value: slotTimeText(slot) },
    ...summarizeFormValues(slot.fields, formValues.value).map((row) => ({
      label: row.label,
      value: row.value
    }))
  ]
})

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
    loadError.value = failureText(failure)
    loadErrorDetail.value = failure.messageKey ? failure.detail : ''
  } finally {
    loading.value = false
    if (!selectedDate.value) selectedDate.value = dateOptions.value[0]?.value || ''
  }
}

/** 拉取可预约时段（与实测契约一致：不传起止时间，日期在前端过滤） */
const loadSlots = async () => {
  const resource = selectedResource.value
  if (!resource) return
  slotsLoading.value = true
  slotsError.value = ''
  slotsErrorDetail.value = ''
  try {
    const res = await invokeNative('library_reserve_time_list', { req: { app: props.app } })
    const items = Array.isArray(res?.items) ? res.items : []
    slots.value = items
      .map((item, index) => normalizeSlot(item, index, resource))
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))
  } catch (e) {
    const failure = parseReserveFailure(e)
    slots.value = []
    slotsError.value = failureText(failure)
    slotsErrorDetail.value = failure.messageKey ? failure.detail : ''
  } finally {
    slotsLoading.value = false
  }
}

/** 进入某房间的预约页 */
const selectResource = async (resource) => {
  selectedResourceId.value = resource.id
  selectedSlotId.value = ''
  formValues.value = {}
  formErrors.value = {}
  selectedDate.value = dateOptions.value[0]?.value || ''
  await loadSlots()
}

/** 返回资源列表 */
const backToList = () => {
  selectedResourceId.value = ''
  selectedSlotId.value = ''
  slots.value = []
  slotsError.value = ''
  formValues.value = {}
  formErrors.value = {}
}

/** 选择时段：不可约给出提示，重复点击取消选择 */
const chooseSlot = (slot) => {
  if (slot.state !== 'free') {
    showToast(t('library.reserve.toast.slotUnavailable'), 'warning')
    return
  }
  if (selectedSlotId.value === slot.id) {
    selectedSlotId.value = ''
    return
  }
  selectedSlotId.value = slot.id
  formValues.value = buildInitialValues(slot.fields)
  formErrors.value = {}
}

/** 表单值变更（子组件回抛） */
const onFormValues = (next) => {
  formValues.value = next
}

/** 提交入口：先本地校验，通过后弹二次确认 */
const requestSubmit = () => {
  const slot = selectedSlot.value
  if (!slot) {
    showToast(t('library.reserve.toast.selectSlot'), 'warning')
    return
  }
  const validation = validateFormValues(slot.fields, formValues.value)
  formErrors.value = validation.errors
  if (!validation.valid) {
    showToast(t('library.reserve.toast.formInvalid'), 'warning')
    return
  }
  confirmVisible.value = true
}

/** 确认后真正提交 */
const confirmSubmit = async () => {
  const slot = selectedSlot.value
  if (!slot) {
    confirmVisible.value = false
    return
  }
  submitting.value = true
  try {
    const cycleType = Number(itemInfo.value?.cycleType)
    const req = {
      app: props.app,
      // aprvId 来自时段条目（实测可能为 0，原样透传；缺失则交由后端推导）
      aprv_id: slot.aprvId === null ? undefined : String(slot.aprvId),
      // 以下两项契约未实测，按常见键名从原始条目兜底提取（取不到则不传）
      aprv_status_type_id: pickRawString(slot.raw, [
        'aprvStatusTypeId',
        'statusTypeId',
        'aprvStatusType'
      ]),
      form_user_id: pickRawString(slot.raw, ['formUserId', 'formUser', 'userId', 'applyUserId']),
      cycle_type: Number.isFinite(cycleType) ? cycleType : 0,
      form_data: toFormData(slot.fields, formValues.value)
    }
    const res = await invokeNative('library_reserve_submit', { req })
    confirmVisible.value = false
    showToast(res?.message || t('library.reserve.toast.submitSuccess'), 'success')
    selectedSlotId.value = ''
    formValues.value = {}
    formErrors.value = {}
    // 提交成功后刷新时段余量，避免展示过期状态
    await loadSlots()
  } catch (e) {
    confirmVisible.value = false
    const failure = parseReserveFailure(e)
    // 网络失败与业务失败给出不同文案与停留时长
    showToast(failureText(failure), failure.network ? 'warning' : 'error', failure.network ? 2600 : 3400)
  } finally {
    submitting.value = false
  }
}

onMounted(loadConstraints)
// app 变化（静音仓 ⇄ 研讨室）时重置并重新加载
watch(
  () => props.app,
  () => {
    backToList()
    noticeDismissed.value = false
    selectedDate.value = ''
    void loadConstraints()
  }
)
</script>

<template>
  <div class="panel">
    <!-- ① 资源列表 -->
    <template v-if="!selectedResource">
      <section v-if="showNotice" class="card notice">
        <div class="notice__head">
          <strong>{{ notice.title || t('library.reserve.notice.title') }}</strong>
          <button type="button" class="icon-btn" :aria-label="t('common.close')" @click="noticeDismissed = true">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <p v-if="notice.body" class="notice__body">{{ notice.body }}</p>
      </section>

      <!-- 约束 / 违约后果：必须提示 -->
      <section class="card notice notice--warn">
        <strong>{{ t('library.reserve.notice.title') }}</strong>
        <p v-if="loading" class="notice__body">{{ t('library.reserve.state.loading') }}</p>
        <template v-else>
          <ul class="notice__list">
            <li>{{ tf('library.reserve.notice.advance', { n: advanceDays }) }}</li>
            <li v-if="durationLimit">{{ tf('library.reserve.notice.duration', { n: durationLimit }) }}</li>
          </ul>
          <p class="notice__body notice__body--danger">{{ t('library.reserve.notice.violation') }}</p>
          <p v-if="loadError" class="notice__body notice__body--danger">
            {{ loadError }}<span v-if="loadErrorDetail"> {{ loadErrorDetail }}</span>
          </p>
          <button v-if="loadError" type="button" class="ghost" @click="loadConstraints">
            {{ t('library.reserve.btn.retry') }}
          </button>
        </template>
      </section>

      <h2 class="section-title">{{ t('library.reserve.resource.title') }}</h2>

      <div class="res-list">
        <button
          v-for="resource in resources"
          :key="resource.id"
          type="button"
          class="res-card"
          @click="selectResource(resource)"
        >
          <div class="res-card__top">
            <h3 class="res-card__name">{{ resource.name }}</h3>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </div>
          <p class="res-card__meta">
            {{ tf('library.reserve.resource.openTime', { range: `${resource.openFrom}-${resource.openTo}` }) }}
          </p>
          <p class="res-card__meta">{{ tf('library.reserve.resource.location', { place: resource.location }) }}</p>
          <p class="res-card__meta">
            {{ tf('library.reserve.resource.capacity', { min: resource.capacityMin, max: resource.capacityMax }) }}
          </p>
          <p v-if="resource.note" class="res-card__note">{{ resource.note }}</p>
        </button>
      </div>
    </template>

    <!-- ② 预约（选日期 / 时段 / 填表 / 提交） -->
    <template v-else>
      <button type="button" class="back-link" @click="backToList">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        {{ selectedResource.name }}
      </button>

      <section class="card res-summary">
        <p class="res-card__meta">
          {{ tf('library.reserve.resource.openTime', { range: `${selectedResource.openFrom}-${selectedResource.openTo}` }) }}
        </p>
        <p class="res-card__meta">
          {{ tf('library.reserve.resource.location', { place: selectedResource.location }) }}
        </p>
        <p class="res-card__meta">
          {{ tf('library.reserve.resource.capacity', { min: selectedResource.capacityMin, max: selectedResource.capacityMax }) }}
        </p>
        <p v-if="selectedResource.note" class="res-card__note">{{ selectedResource.note }}</p>
        <p class="notice__body notice__body--danger">{{ t('library.reserve.notice.violation') }}</p>
      </section>

      <!-- 日期 -->
      <h3 class="section-title">{{ t('library.reserve.booking.date') }}</h3>
      <div class="dates">
        <button
          v-for="option in dateOptions"
          :key="option.value"
          type="button"
          class="date"
          :class="{ 'date--on': option.value === selectedDate }"
          :aria-pressed="option.value === selectedDate"
          @click="selectedDate = option.value"
        >
          <span class="date__week">{{ dateLabel(option).weekday }}</span>
          <strong class="date__md">{{ dateLabel(option).md }}</strong>
          <span v-if="dateLabel(option).tag" class="date__tag">{{ dateLabel(option).tag }}</span>
        </button>
      </div>

      <!-- 时段 -->
      <h3 class="section-title">{{ t('library.reserve.booking.slot') }}</h3>

      <TEmptyState
        v-if="slotsLoading"
        type="loading"
        :message="t('library.reserve.state.loading')"
      />

      <section v-else-if="slotsError" class="card error-card">
        <p class="err">{{ slotsError }}</p>
        <p v-if="slotsErrorDetail" class="hint">{{ slotsErrorDetail }}</p>
        <button type="button" class="ghost" @click="loadSlots">
          {{ t('library.reserve.btn.retry') }}
        </button>
      </section>

      <TEmptyState
        v-else-if="!visibleSlots.length"
        type="empty"
        :message="t('library.reserve.booking.slotEmpty')"
      />

      <template v-else>
        <div class="slots">
          <button
            v-for="slot in visibleSlots"
            :key="slot.id"
            type="button"
            :class="slotClass(slot)"
            :aria-disabled="slot.state !== 'free'"
            :aria-pressed="slot.id === selectedSlotId"
            @click="chooseSlot(slot)"
          >
            <span class="slot__time">{{ slotTimeText(slot) }}</span>
            <span v-if="slot.itemName" class="slot__name">{{ slot.itemName }}</span>
            <span v-if="slot.remaining !== null" class="slot__sub">
              {{ tf('library.reserve.booking.remaining', { n: slot.remaining }) }}
            </span>
          </button>
        </div>
        <div class="legend">
          <span><i class="dot dot--free" />{{ t('library.reserve.booking.legendFree') }}</span>
          <span><i class="dot dot--taken" />{{ t('library.reserve.booking.legendTaken') }}</span>
          <span><i class="dot dot--closed" />{{ t('library.reserve.booking.legendClosed') }}</span>
          <span><i class="dot dot--on" />{{ t('library.reserve.booking.legendSelected') }}</span>
        </div>
      </template>

      <!-- 动态表单 -->
      <template v-if="selectedSlot">
        <h3 class="section-title">{{ t('library.reserve.booking.form') }}</h3>
        <section class="card">
          <p class="hint">
            {{ tf('library.reserve.booking.capacityHint', { min: selectedResource.capacityMin, max: selectedResource.capacityMax }) }}
          </p>
          <ReserveFormFields
            v-if="selectedSlot.fields.length"
            :fields="selectedSlot.fields"
            :values="formValues"
            :errors="formErrors"
            :disabled="submitting"
            @update:values="onFormValues"
          />
          <p v-else-if="!selectedSlot.formParsed" class="hint">
            {{ t('library.reserve.booking.formUnparsed') }}
          </p>
          <p v-else class="hint">{{ t('library.reserve.booking.formEmpty') }}</p>
        </section>
      </template>

      <!-- 提交条 -->
      <div class="submit-bar">
        <div class="submit-bar__info">
          <template v-if="selectedSlot">
            <strong>{{ slotTimeText(selectedSlot) }}</strong>
            <span class="muted">{{ selectedDate }}</span>
          </template>
          <span v-else class="muted">{{ t('library.reserve.booking.selectHint') }}</span>
        </div>
        <button
          type="button"
          class="primary"
          :disabled="!selectedSlot || submitting"
          @click="requestSubmit"
        >
          {{ submitting ? t('library.reserve.btn.submitting') : t('library.reserve.btn.submit') }}
        </button>
      </div>
    </template>

    <!-- 二次确认（必须：含违约后果） -->
    <TModal
      :visible="confirmVisible"
      :title="t('library.reserve.confirm.title')"
      width="420px"
      @close="confirmVisible = false"
    >
      <p class="confirm__lead">{{ t('library.reserve.confirm.body') }}</p>
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

/* 提醒 / 约束 */
.notice {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notice--warn {
  border-color: color-mix(in oklab, var(--ui-danger) 40%, var(--ui-surface-border));
}
.notice__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.notice__head strong {
  font-size: calc(14px * var(--ui-font-scale));
  color: var(--ui-text);
}
.notice__body {
  margin: 0;
  font-size: calc(13px * var(--ui-font-scale));
  line-height: 1.6;
  color: var(--ui-muted);
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

/* 资源列表 */
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

/* 日期 */
.dates {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}
.date {
  flex: 0 0 auto;
  min-width: 62px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(12px * var(--ui-radius-scale));
  background: var(--ui-surface);
  color: var(--ui-text);
  cursor: pointer;
}
.date--on {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
  color: #fff;
}
.date__week {
  font-size: calc(11px * var(--ui-font-scale));
  opacity: 0.85;
}
.date__md {
  font-size: calc(13px * var(--ui-font-scale));
}
.date__tag {
  font-size: calc(10px * var(--ui-font-scale));
  opacity: 0.9;
}

/* 时段 */
.slots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.slot {
  min-height: 52px;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(12px * var(--ui-radius-scale));
  background: var(--ui-surface);
  color: var(--ui-text);
  cursor: pointer;
  transition: transform calc(0.12s * var(--ui-motion-scale)) ease;
}
.slot__time {
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 700;
}
.slot__sub {
  font-size: calc(10px * var(--ui-font-scale));
  opacity: 0.8;
}
/* 后端时段自带的房间名（契约提供时展示，便于核对预约对象） */
.slot__name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(10px * var(--ui-font-scale));
  opacity: 0.85;
}
.slot--free:active {
  transform: scale(0.97);
}
.slot--taken {
  background: color-mix(in oklab, var(--ui-danger) 14%, transparent);
  border-color: color-mix(in oklab, var(--ui-danger) 40%, var(--ui-surface-border));
  color: var(--ui-danger);
  cursor: not-allowed;
}
.slot--closed {
  background: color-mix(in oklab, var(--ui-muted) 12%, transparent);
  color: var(--ui-muted);
  cursor: not-allowed;
  opacity: 0.75;
}
.slot--on {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
  color: #fff;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
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
.dot--taken {
  background: color-mix(in oklab, var(--ui-danger) 45%, transparent);
}
.dot--closed {
  background: color-mix(in oklab, var(--ui-muted) 30%, transparent);
}
.dot--on {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
}

/* 提交条 */
.submit-bar {
  position: sticky;
  bottom: 72px;
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
.confirm__lead {
  margin: 0 0 10px;
  font-size: calc(13px * var(--ui-font-scale));
  color: var(--ui-muted);
}
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
.icon-btn {
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--ui-muted);
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn .material-symbols-outlined {
  font-size: 18px;
}

/* 宽屏（≥768 主断点）：资源与时段多列排布 */
@media (min-width: 768px) {
  .res-list {
    grid-template-columns: repeat(2, 1fr);
  }
  .slots {
    grid-template-columns: repeat(6, 1fr);
  }
  .submit-bar {
    bottom: 24px;
  }
}
</style>
