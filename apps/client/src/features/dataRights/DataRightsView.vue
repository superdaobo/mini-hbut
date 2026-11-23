<script setup lang="ts">
// src/features/dataRights/DataRightsView.vue
//
// Epic #1243（G3-05 / mini-hbut#1258）：数据与授权 → 导出 / 删除。
//
// 红线（与 `dataRightsViewModel.ts` 一致）：
//   - **学校权威域不可删**，且要当场显示原因（不能让用户点了才失败）；
//   - 删除前**二次确认**并列出将删除的域；
//   - 明确「删除不影响学号登录」。
//
// 本组件不发请求：导出/删除由 `onExport` / `onDelete` 注入（仓库既有风格）。

import { computed, ref } from 'vue'

import {
  buildDataRights,
  deleteConfirmText,
  type DataRightsModel
} from './dataRightsViewModel'

const props = withDefaults(
  defineProps<{
    /** 云端存在的域（服务端返回的 domain 列表） */
    domains?: string[]
    /** 加载中 */
    loading?: boolean
    /** 失败机器码 */
    errorCode?: string
    /** 导出（拿到 JSON 文本后由调用方落盘/分享） */
    onExport?: () => void
    /** 删除选中的域 */
    onDelete?: (domains: string[]) => void
  }>(),
  { domains: () => [], loading: false, errorCode: '', onExport: undefined, onDelete: undefined }
)

const selected = ref<Set<string>>(new Set())
const confirming = ref(false)

const model = computed<DataRightsModel>(() => buildDataRights(props.domains, selected.value))

const toggle = (domain: string, deletable: boolean): void => {
  if (!deletable) return // 不可删的域连勾选都不允许
  const next = new Set(selected.value)
  if (next.has(domain)) next.delete(domain)
  else next.add(domain)
  selected.value = next
  confirming.value = false
}

const askConfirm = (): void => {
  if (!model.value.canSubmitDelete) return
  confirming.value = true
}

const confirmDelete = (): void => {
  const targets = model.value.rows.filter((row) => row.selected).map((row) => row.domain)
  confirming.value = false
  if (!targets.length) return
  props.onDelete && props.onDelete(targets)
}

const errorText = computed(() => {
  switch (props.errorCode) {
    case 'identity_required':
      return '登录已失效，请重新登录'
    case 'service_unavailable':
      return '服务暂时不可用，稍后会自动重试'
    case '':
      return ''
    default:
      return '暂时无法加载数据'
  }
})
</script>

<template>
  <section class="rights" aria-labelledby="rights-title">
    <header class="rights__header">
      <h1 id="rights-title" class="rights__title">数据与授权</h1>
      <button type="button" class="rights__export" :disabled="loading" @click="onExport && onExport()">
        导出我的数据
      </button>
    </header>

    <p class="rights__notice">{{ model.notice }}</p>

    <p v-if="errorText" class="rights__error" role="alert">{{ errorText }}</p>
    <p v-if="loading" class="rights__loading">加载中…</p>

    <ul class="rights__list">
      <li v-for="row in model.rows" :key="row.domain" class="rights__row" :data-deletable="row.deletable">
        <label class="rights__label">
          <input
            type="checkbox"
            :checked="row.selected"
            :disabled="!row.deletable"
            :aria-label="row.label"
            @change="toggle(row.domain, row.deletable)"
          />
          <span class="rights__name">{{ row.label }}</span>
        </label>
        <span v-if="!row.deletable" class="rights__reason">{{ row.reason }}</span>
      </li>
    </ul>

    <footer class="rights__footer">
      <button
        v-if="!confirming"
        type="button"
        class="rights__delete"
        :disabled="!model.canSubmitDelete"
        @click="askConfirm"
      >
        删除选中数据
      </button>
      <template v-else>
        <p class="rights__confirm-text" role="alert">{{ deleteConfirmText(model.rows) }}</p>
        <button type="button" class="rights__confirm" @click="confirmDelete">确认删除</button>
        <button type="button" class="rights__cancel" @click="confirming = false">取消</button>
      </template>
    </footer>
  </section>
</template>

<style scoped>
.rights {
  padding: 16px;
}
.rights__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rights__title {
  font-size: 18px;
  font-weight: 600;
}
.rights__notice {
  margin-top: 10px;
  font-size: 13px;
  opacity: 0.8;
}
.rights__error {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-danger, #c0392b);
}
.rights__loading {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.75;
}
.rights__list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rights__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rights__row[data-deletable='false'] {
  opacity: 0.6;
}
.rights__label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rights__name {
  font-size: 14px;
}
.rights__reason {
  font-size: 12px;
  opacity: 0.7;
}
.rights__footer {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.rights__delete,
.rights__confirm,
.rights__cancel {
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
}
.rights__delete[disabled] {
  opacity: 0.5;
}
.rights__confirm-text {
  width: 100%;
  font-size: 13px;
  color: var(--color-danger, #c0392b);
}
</style>
