<script setup>
/**
 * 我的预约 · 静音仓 / 研讨室（#1056）
 *
 * 合并两套应用（静音仓 / 研讨室）的预约记录，支持取消（取消前二次确认）。
 * 后端命令（Rust 层 `transport/tauri/library_reserve.rs`，#1053）：
 * - `library_reserve_my_reservations` → 我的预约列表
 * - `library_reserve_cancel`         → 取消预约（`aprv_id` 必填）
 *
 * ⚠️ 列表与取消接口的完整契约未实测（见 #1053）：字段按已知形态解析并保留 `raw` 兜底；
 * 取消按钮对全部记录可见，由服务端裁决是否可取消，失败时给出可读文案。
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative } from '../../platform/native'
import { showToast } from '../../utils/toast'
import { useLocale, tf } from '../../utils/app_i18n'
import { TEmptyState, TModal } from '../templates'
import { extractHm, parseReserveFailure, sortKeyOf } from './catalog'

/** 需要合并展示的两套应用（与 Rust 命令层 parse_pc_app 的取值一致） */
const APPS = ['quiet_room', 'seminar_room']

const { t } = useLocale()

const loading = ref(true)
const error = ref('')
const errorDetail = ref('')
const partialError = ref('')
const items = ref([])

const cancelVisible = ref(false)
const cancelling = ref(false)
const pendingCancel = ref(null)

/** 失败信息 → 可读文案 */
const failureText = (failure) =>
  failure.messageKey ? t(failure.messageKey) : failure.detail || t('library.reserve.error.unknown')

/** 应用 → 通用名称（后端未返回房间名时的兜底展示） */
const appName = (app) =>
  app === 'quiet_room' ? t('library.reserve.tab.quiet') : t('library.reserve.tab.room')

/** 归一化单条记录 */
const normalizeItem = (raw, app, index) => {
  const record = raw && typeof raw === 'object' ? raw : {}
  const aprvId =
    record.aprvId === null || record.aprvId === undefined || record.aprvId === ''
      ? ''
      : String(record.aprvId)
  return {
    key: `${app}-${aprvId || 'row'}-${index}`,
    app,
    aprvId,
    name: String(record.itemName ?? '').trim() || appName(app),
    statusName: String(record.statusName ?? '').trim(),
    date: String(record.date ?? '').trim(),
    start: extractHm(record.startTime),
    end: extractHm(record.endTime)
  }
}

const timeText = (item) => {
  if (item.start && item.end) return `${item.start}-${item.end}`
  return item.start || item.end || ''
}

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

  merged.sort((a, b) => sortKeyOf(a).localeCompare(sortKeyOf(b)))
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

/** 打开取消确认 */
const askCancel = (item) => {
  if (!item.aprvId) {
    showToast(t('library.reserve.mine.noAprvId'), 'warning')
    return
  }
  pendingCancel.value = item
  cancelVisible.value = true
}

/** 确认取消 */
const confirmCancel = async () => {
  const item = pendingCancel.value
  if (!item || !item.aprvId) {
    cancelVisible.value = false
    return
  }
  cancelling.value = true
  try {
    const res = await invokeNative('library_reserve_cancel', {
      req: { app: item.app, aprv_id: String(item.aprvId) }
    })
    cancelVisible.value = false
    showToast(res?.message || t('library.reserve.toast.cancelSuccess'), 'success')
    await load()
  } catch (e) {
    cancelVisible.value = false
    const failure = parseReserveFailure(e)
    showToast(failureText(failure), failure.network ? 'warning' : 'error', failure.network ? 2600 : 3400)
  } finally {
    cancelling.value = false
  }
}

const cancelBody = computed(() => {
  const item = pendingCancel.value
  if (!item) return ''
  return tf('library.reserve.cancel.body', {
    name: item.name,
    date: item.date,
    time: timeText(item)
  })
})

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

    <TEmptyState
      v-else-if="!items.length"
      class="span-all"
      type="empty"
      :message="t('library.reserve.mine.empty')"
    >
      <p class="hint">{{ t('library.reserve.mine.hint') }}</p>
    </TEmptyState>

    <template v-else>
      <article v-for="item in items" :key="item.key" class="card order">
        <div class="order__top">
          <strong class="order__name">{{ item.name }}</strong>
          <span class="badge">{{ item.statusName || t('library.reserve.mine.statusFallback') }}</span>
        </div>
        <p class="meta">{{ item.date }} {{ timeText(item) }}</p>
        <div class="order__actions">
          <button type="button" class="ghost" @click="askCancel(item)">
            {{ t('library.reserve.cancel.action') }}
          </button>
        </div>
      </article>
    </template>

    <!-- 取消二次确认 -->
    <TModal
      :visible="cancelVisible"
      :title="t('library.reserve.cancel.title')"
      width="400px"
      @close="cancelVisible = false"
    >
      <p class="confirm__body">{{ cancelBody }}</p>
      <template #footer>
        <button type="button" class="ghost" :disabled="cancelling" @click="cancelVisible = false">
          {{ t('library.reserve.btn.back') }}
        </button>
        <button type="button" class="danger" :disabled="cancelling" @click="confirmCancel">
          {{ cancelling ? t('library.reserve.btn.submitting') : t('library.reserve.btn.confirm') }}
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
.order__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
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
.confirm__body {
  margin: 0;
  font-size: calc(13px * var(--ui-font-scale));
  line-height: 1.7;
  color: var(--ui-text);
}
.ghost,
.danger {
  min-height: 44px;
  padding: 0 20px;
  border-radius: calc(14px * var(--ui-radius-scale));
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
}
.ghost {
  border: 1px solid var(--ui-surface-border);
  background: transparent;
  color: var(--ui-text);
}
.danger {
  border: 0;
  background: var(--ui-danger);
  color: #fff;
}
.ghost:disabled,
.danger:disabled {
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
