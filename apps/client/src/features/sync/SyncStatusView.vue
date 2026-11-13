<script setup lang="ts">
// src/features/sync/SyncStatusView.vue
//
// Epic #1243（G6-01 / mini-hbut#1268）：同步状态页。
//
// 设计红线（与 `syncStatusViewModel.ts` 一致）：**只展示「最后同步时间」与四态**，
// 绝不出现「数据已过期 / 可能过期 / 请刷新」——Epic 已废止按数据年龄的告警与强制刷新。
//
// 数据来源：
//   - `domains`：OCR `/api/app-data/v1/sync-status` 的 domains 数组（由调用方拉取后传入）
//   - `queue`：T10 队列的 `summarize()` 结果（待同步条数）
//
// 本组件**不发请求**：拉取与错误处理在调用方（与仓库既有「注入式控制器」风格一致）。

import { computed } from 'vue'

import {
  buildSyncStatus,
  rowSubtitle,
  type SyncStatusSummary
} from './syncStatusViewModel'

const props = withDefaults(
  defineProps<{
    /** 服务端 sync-status 的 domains 原样数组 */
    domains?: Array<Record<string, unknown>>
    /** 队列计数（summarize 结果） */
    queue?: Record<string, number> | null
    /** 是否正在加载 */
    loading?: boolean
    /** 拉取失败时的机器码（空 = 无错误） */
    errorCode?: string
    /** 用户点击「立即刷新」（手动刷新优先级由 T10 队列保证） */
    onRefresh?: () => void
  }>(),
  { domains: () => [], queue: null, loading: false, errorCode: '', onRefresh: undefined }
)

const summary = computed<SyncStatusSummary>(() =>
  buildSyncStatus({ domains: props.domains, queue: props.queue })
)

const errorText = computed(() => {
  switch (props.errorCode) {
    case 'identity_required':
      return '登录已失效，请重新登录'
    case 'service_unavailable':
      return '同步服务暂时不可用，稍后会自动重试'
    case 'app_not_approved':
      return '当前版本尚未获得同步权限'
    case '':
      return ''
    default:
      return '暂时无法加载同步状态'
  }
})
</script>

<template>
  <section class="sync-status" aria-labelledby="sync-status-title">
    <header class="sync-status__header">
      <h2 id="sync-status-title" class="sync-status__title">数据同步</h2>
      <button
        type="button"
        class="sync-status__refresh"
        :disabled="loading"
        @click="onRefresh && onRefresh()"
      >
        {{ loading ? '刷新中…' : '立即刷新' }}
      </button>
    </header>

    <p v-if="errorText" class="sync-status__error" role="alert">{{ errorText }}</p>

    <p v-if="summary.pendingCount > 0" class="sync-status__pending">
      待同步 {{ summary.pendingCount }} 项
    </p>

    <p v-if="summary.notice" class="sync-status__notice">{{ summary.notice }}</p>

    <ul class="sync-status__list">
      <li v-for="row in summary.rows" :key="row.domain" class="sync-status__row">
        <div class="sync-status__row-main">
          <span class="sync-status__label">{{ row.label }}</span>
          <span class="sync-status__state" :data-state="row.state">{{ row.statusText }}</span>
        </div>
        <!-- 只有「最后同步时间」，没有「可能过期」 -->
        <p class="sync-status__subtitle">{{ rowSubtitle(row) }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.sync-status {
  padding: 16px;
}
.sync-status__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sync-status__title {
  font-size: 16px;
  font-weight: 600;
}
.sync-status__refresh {
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
}
.sync-status__refresh[disabled] {
  opacity: 0.6;
}
.sync-status__error {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-danger, #c0392b);
}
.sync-status__pending {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
}
.sync-status__notice {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
}
.sync-status__list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sync-status__row-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sync-status__label {
  font-size: 14px;
}
.sync-status__state {
  font-size: 12px;
  opacity: 0.8;
}
.sync-status__state[data-state='ok'] {
  color: var(--color-success, #27ae60);
}
.sync-status__state[data-state='unauthorized'] {
  color: var(--color-warning, #e67e22);
}
.sync-status__state[data-state='unavailable'] {
  color: var(--color-danger, #c0392b);
}
.sync-status__subtitle {
  margin-top: 2px;
  font-size: 12px;
  opacity: 0.7;
}
</style>
