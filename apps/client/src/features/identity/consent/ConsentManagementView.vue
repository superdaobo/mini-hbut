<script setup lang="ts">
// src/features/identity/consent/ConsentManagementView.vue
//
// Epic #1243（G3-03 / mini-hbut#1256）：授权管理页。
//
// 设计红线（与 `consentManagementViewModel.ts` 一致）：
//   - **逐项独立**：一行一个数据类别，没有「全部开启」；
//   - **撤销不影响学号登录** —— 页面必须显式说明；
//   - 重新申请只由**用户主动点击**触发（无定时器、无自动弹窗）。
//
// 本组件不发请求：`onGrant` / `onRevoke` / `onRevokeAll` 由调用方注入。

import { computed, ref } from 'vue'

import {
  buildConsentManagement,
  selectedDomains,
  summaryText,
  type ConsentManagementModel,
  type ConsentRow
} from './consentManagementViewModel'

const props = withDefaults(
  defineProps<{
    /** 服务端 `/identity/app-consents` 的 domains 数组 */
    domains?: unknown[]
    /** 加载中 */
    loading?: boolean
    /** 失败机器码 */
    errorCode?: string
    onGrant?: (domains: string[]) => void
    onRevoke?: (domains: string[]) => void
    onRevokeAll?: () => void
  }>(),
  { domains: () => [], loading: false, errorCode: '', onGrant: undefined, onRevoke: undefined, onRevokeAll: undefined }
)

const model = computed<ConsentManagementModel>(() => buildConsentManagement(props.domains))

/** 勾选态（只存内存；默认跟随服务端已授权状态） */
const selected = ref<Set<string>>(
  new Set(model.value.rows.filter((row) => row.granted).map((row) => row.domain))
)

const toggle = (row: ConsentRow): void => {
  const next = new Set(selected.value)
  if (next.has(row.domain)) next.delete(row.domain)
  else next.add(row.domain)
  selected.value = next
}

const submitGrant = (): void => {
  const domains = selectedDomains(model.value.rows, selected.value)
  if (!domains.length) return // 空选 = 全部拒绝，走「撤销」而不是「授予」
  props.onGrant && props.onGrant(domains)
}

const revokeRow = (row: ConsentRow): void => {
  props.onRevoke && props.onRevoke([row.domain])
}

const errorText = computed(() => {
  switch (props.errorCode) {
    case 'identity_required':
      return '登录已失效，请重新登录'
    case 'service_unavailable':
      return '授权服务暂时不可用，稍后会自动重试'
    case '':
      return ''
    default:
      return '暂时无法加载授权状态'
  }
})
</script>

<template>
  <section class="consent" aria-labelledby="consent-title">
    <header class="consent__header">
      <h1 id="consent-title" class="consent__title">数据授权</h1>
      <span class="consent__summary">{{ summaryText(model) }}</span>
    </header>

    <!-- 产品硬要求：撤销不影响学号登录 -->
    <p class="consent__notice">{{ model.notice }}</p>

    <p v-if="errorText" class="consent__error" role="alert">{{ errorText }}</p>
    <p v-if="loading" class="consent__loading">加载中…</p>

    <ul class="consent__list">
      <li v-for="row in model.rows" :key="row.domain" class="consent__row" :data-state="row.state">
        <label class="consent__label">
          <input
            type="checkbox"
            :checked="selected.has(row.domain)"
            :aria-label="row.label"
            @change="toggle(row)"
          />
          <span class="consent__name">{{ row.label }}</span>
        </label>
        <div class="consent__row-right">
          <span class="consent__state">{{ row.stateText }}</span>
          <button
            v-if="row.granted"
            type="button"
            class="consent__revoke"
            @click="revokeRow(row)"
          >
            {{ row.actionText }}
          </button>
        </div>
      </li>
    </ul>

    <footer class="consent__footer">
      <button type="button" class="consent__save" @click="submitGrant">保存勾选</button>
      <button
        type="button"
        class="consent__revoke-all"
        :disabled="!model.canRevokeAll"
        @click="onRevokeAll && onRevokeAll()"
      >
        撤销全部
      </button>
    </footer>
  </section>
</template>

<style scoped>
.consent {
  padding: 16px;
}
.consent__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.consent__title {
  font-size: 18px;
  font-weight: 600;
}
.consent__summary {
  font-size: 12px;
  opacity: 0.75;
}
.consent__notice {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.8;
}
.consent__error {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-danger, #c0392b);
}
.consent__loading {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.75;
}
.consent__list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.consent__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.consent__label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.consent__name {
  font-size: 14px;
}
.consent__row-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.consent__state {
  font-size: 12px;
  opacity: 0.7;
}
.consent__revoke {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
}
.consent__footer {
  margin-top: 16px;
  display: flex;
  gap: 12px;
}
.consent__save,
.consent__revoke-all {
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
}
.consent__revoke-all[disabled] {
  opacity: 0.5;
}
</style>
