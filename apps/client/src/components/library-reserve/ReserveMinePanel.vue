<script setup>
/**
 * 我的预约 · 静音仓 / 研讨室（#1056 / #1076 / 2026-10-19 取消接入）
 *
 * 合并两套应用（静音仓 / 研讨室）的预约记录，支持取消。
 * 后端命令（Rust 层 `transport/tauri/library_reserve.rs`）：
 * - `library_reserve_my_reservations` → 我的预约列表
 * - `library_reserve_cancel`         → 取消预约（**契约已实测**）
 *
 * #1076：列表字段映射按 `reservepc/user/histroy` 实测字段修正
 * （`name / today / starttime(ms) / endtime(ms) / status / isCancel / id / itemId`）。
 *
 * 2026-10-19 实测：取消端点为 `reserve/item/user/cancel`，主键是记录 `id`（`aprvId` 恒为 0，
 * **不是**主键），body `{id, allCancel}`；成功后该条 `status=7`、`isCancel=true`。
 */
import { onMounted, ref } from 'vue'
import { invokeNative } from '../../platform/native'
import { showToast } from '../../utils/toast'
import { useLocale } from '../../utils/app_i18n'
import { TEmptyState, TModal } from '../templates'
import { normalizeMyReservation, parseReserveFailure, sortKeyOf } from './catalog'

/** 需要合并展示的两套应用（与 Rust 命令层 parse_pc_app 的取值一致） */
const APPS = ['quiet_room', 'seminar_room']

const { t } = useLocale()

const loading = ref(true)
const error = ref('')
const errorDetail = ref('')
const partialError = ref('')
const items = ref([])

/** 取消确认弹窗状态 */
const cancelTarget = ref(null)
const cancelVisible = ref(false)
const cancelling = ref(false)
const cancelError = ref('')

/** 失败信息 → 可读文案 */
const failureText = (failure) =>
  failure.messageKey ? t(failure.messageKey) : failure.detail || t('library.reserve.error.unknown')

/** 应用 → 通用名称（后端未返回房间名时的兜底展示） */
const appName = (app) =>
  app === 'quiet_room' ? t('library.reserve.tab.quiet') : t('library.reserve.tab.room')

/**
 * 归一化单条记录（#1076：字段映射修正）。
 *
 * 真实字段为 `name / today / starttime(ms) / endtime(ms) / status / isCancel / id / itemId`，
 * 纯映射逻辑集中在 `normalizeMyReservation`，此处只补应用名兜底。
 */
const normalizeItem = (raw, app, index) => {
  const item = normalizeMyReservation(raw, app, index)
  return { ...item, name: item.name || appName(app) }
}

const timeText = (item) => {
  if (item.start && item.end) return `${item.start}-${item.end}`
  return item.start || item.end || ''
}

/** 只有「有记录 id 且未取消」的预约才可取消 */
const canCancel = (item) => Boolean(item.recordId) && !item.cancelled

/** 加载两套应用的预约记录（单套失败不阻断另一套） */
const load = async () => {
  loading.value = true
  error.value = ''
  errorDetail.value = ''
  partialError.value = ''
  const results = await Promise.allSettled(
    APPS.map((app) => invokeNative('library_reserve_my_reservations', { req: { app } }))
  )

  const merged = []
  const failures = []
  results.forEach((result, i) => {
    const app = APPS[i]
    if (result.status === 'fulfilled') {
      const list = Array.isArray(result.value?.items) ? result.value.items : []
      list.forEach((item, index) => merged.push(normalizeItem(item, app, index)))
    } else {
      failures.push(parseReserveFailure(result.reason))
    }
  })

  // 最近的预约排前面（日期 + 起始时间倒序），避免历史记录压住当前预约
  merged.sort((a, b) => sortKeyOf(b).localeCompare(sortKeyOf(a)))
  items.value = merged

  if (failures.length && !merged.length) {
    // 两套都失败：整体错误态
    error.value = failureText(failures[0])
    errorDetail.value = failures[0].messageKey ? failures[0].detail : ''
  } else if (failures.length) {
    // 部分失败：保留成功数据并提示
    partialError.value = t('library.reserve.mine.partialError')
  }
  loading.value = false
}

/** 打开取消确认弹窗 */
const askCancel = (item) => {
  if (!canCancel(item)) return
  cancelTarget.value = item
  cancelError.value = ''
  cancelVisible.value = true
}

/** 确认取消：契约 `{id, allCancel}`（aprvId 恒为 0，不能用） */
const confirmCancel = async () => {
  const item = cancelTarget.value
  if (!item?.recordId) {
    cancelVisible.value = false
    return
  }
  cancelling.value = true
  cancelError.value = ''
  try {
    await invokeNative('library_reserve_cancel', {
      req: { app: item.app, id: item.recordId }
    })
    cancelVisible.value = false
    showToast(t('library.reserve.mine.cancelSuccess'), 'success')
    await load()
  } catch (e) {
    const failure = parseReserveFailure(e)
    cancelError.value = failureText(failure)
  } finally {
    cancelling.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="panel">
    <div class="bar span-all">
      <h2 class="bar__title">{{ t('library.reserve.mine.title') }}</h2>
      <button type="button" class="link" :disabled="loading" @click="load">
        {{ t('library.reserve.mine.refresh') }}
      </button>
    </div>

    <p v-if="partialError" class="warn span-all">{{ partialError }}</p>

    <TEmptyState
      v-if="loading"
      class="span-all"
      type="loading"
      :message="t('library.reserve.mine.loading')"
    />

    <section v-else-if="error" class="card error-card span-all">
      <p class="err">{{ error }}</p>
      <p v-if="errorDetail" class="hint">{{ errorDetail }}</p>
      <button type="button" class="ghost" @click="load">
        {{ t('library.reserve.btn.retry') }}
      </button>
    </section>

    <!-- 空态：不再补一行「你还没有预约任何…」（与「暂无预约记录」重复，#1082） -->
    <TEmptyState
      v-else-if="!items.length"
      class="span-all"
      type="empty"
      :message="t('library.reserve.mine.empty')"
    />

    <template v-else>
      <article v-for="item in items" :key="item.key" class="card order">
        <div class="order__top">
          <strong class="order__name">{{ item.name }}</strong>
          <span class="badge" :class="{ 'badge--off': item.cancelled }">
            {{ item.statusName || t(item.statusKey) }}
          </span>
        </div>
        <p class="meta">{{ item.date }} {{ timeText(item) }}</p>
        <div class="order__foot">
          <span class="tag">{{ appName(item.app) }}</span>
          <button
            v-if="canCancel(item)"
            type="button"
            class="danger-link"
            @click="askCancel(item)"
          >
            {{ t('library.reserve.mine.cancel') }}
          </button>
        </div>
      </article>
    </template>

    <!-- 取消确认（契约已实测：{id, allCancel}） -->
    <TModal
      :visible="cancelVisible"
      :title="t('library.reserve.mine.cancelTitle')"
      width="380px"
      @close="cancelVisible = false"
    >
      <p class="hint">{{ t('library.reserve.mine.cancelHint') }}</p>
      <dl v-if="cancelTarget" class="confirm__list">
        <div class="confirm__row">
          <dt>{{ t('library.reserve.confirm.room') }}</dt>
          <dd>{{ cancelTarget.name }}</dd>
        </div>
        <div class="confirm__row">
          <dt>{{ t('library.reserve.confirm.date') }}</dt>
          <dd>{{ cancelTarget.date }}</dd>
        </div>
        <div class="confirm__row">
          <dt>{{ t('library.reserve.confirm.time') }}</dt>
          <dd>{{ timeText(cancelTarget) }}</dd>
        </div>
      </dl>
      <p v-if="cancelError" class="warn">{{ cancelError }}</p>
      <template #footer>
        <button type="button" class="ghost" :disabled="cancelling" @click="cancelVisible = false">
          {{ t('library.reserve.mine.cancelKeep') }}
        </button>
        <button type="button" class="danger" :disabled="cancelling" @click="confirmCancel">
          {{ cancelling ? t('library.reserve.mine.cancelling') : t('library.reserve.mine.cancelConfirm') }}
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
.card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-surface-border);
  border-radius: calc(16px * var(--ui-radius-scale));
  padding: 14px 16px;
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
.order__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}
.tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ui-surface-border);
  color: var(--ui-muted);
  font-size: calc(11px * var(--ui-font-scale));
  font-weight: 700;
}
.badge--off {
  background: var(--ui-surface-border);
  color: var(--ui-muted);
}
.danger-link {
  border: 0;
  background: transparent;
  color: var(--ui-danger);
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
  padding: 6px 0;
}
.danger {
  min-height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: calc(14px * var(--ui-radius-scale));
  background: var(--ui-danger);
  color: #fff;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
}
.danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.confirm__list {
  margin: 10px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.confirm__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: calc(13px * var(--ui-font-scale));
}
.confirm__row dt {
  color: var(--ui-muted);
}
.confirm__row dd {
  margin: 0;
  color: var(--ui-text);
  font-weight: 700;
  text-align: right;
}
.warn {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-danger);
}
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
  cursor: not-allowed;
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

@media (min-width: 768px) {
  .panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  /* 标题栏 / 提示 / 状态块横跨整行，避免被挤进单列 */
  .span-all {
    grid-column: 1 / -1;
  }
}
</style>
