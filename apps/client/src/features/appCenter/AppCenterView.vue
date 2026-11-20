<script setup lang="ts">
// src/features/appCenter/AppCenterView.vue
//
// Epic #1243（G2-04 / mini-hbut#1253）：应用中心全屏页。
//
// 设计红线（与 `appCenterViewModel.ts` 一致）：
//   - `status !== 'active'` 显示「已下架」且**不可点击**（不能给 SSO）；
//   - 未提供隐私说明要**明说**，不能隐藏；
//   - `allowed_origins` 为空 = **不可内嵌**（不是「不限制」）。
//
// 本组件不发请求：拉取与错误处理在调用方（仓库既有的「注入式控制器」风格）。

import { computed } from 'vue'

import {
  buildAppCenter,
  canOpenCard,
  cardSubtitle,
  privacyText,
  type AppCard,
  type AppCenterModel
} from './appCenterViewModel'

const props = withDefaults(
  defineProps<{
    /** 服务端 `/api/app-catalog/v1/apps` 的 apps 数组 */
    apps?: unknown[]
    /** 是否加载中 */
    loading?: boolean
    /** 拉取失败机器码（空 = 无错误） */
    errorCode?: string
    /** 点开某个应用 */
    onOpen?: (clientId: string) => void
    /** 返回上一页 */
    onBack?: () => void
  }>(),
  { apps: () => [], loading: false, errorCode: '', onOpen: undefined, onBack: undefined }
)

const model = computed<AppCenterModel>(() => buildAppCenter(props.apps))

const errorText = computed(() => {
  switch (props.errorCode) {
    case 'service_unavailable':
      return '暂时无法加载应用列表，稍后会自动重试'
    case 'identity_required':
      return '登录已失效，请重新登录'
    case '':
      return ''
    default:
      return '暂时无法加载应用列表'
  }
})

const open = (card: AppCard): void => {
  if (!canOpenCard(card)) return
  props.onOpen && props.onOpen(card.clientId)
}
</script>

<template>
  <section class="app-center" aria-labelledby="app-center-title">
    <header class="app-center__header">
      <button type="button" class="app-center__back" @click="onBack && onBack()">返回</button>
      <h1 id="app-center-title" class="app-center__title">应用中心</h1>
    </header>

    <p v-if="errorText" class="app-center__error" role="alert">{{ errorText }}</p>
    <p v-if="loading" class="app-center__loading">加载中…</p>
    <p v-else-if="model.notice" class="app-center__notice">{{ model.notice }}</p>

    <ul class="app-center__list">
      <li
        v-for="card in model.cards"
        :key="card.clientId"
        class="app-center__card"
        :data-state="card.state"
      >
        <div class="app-center__card-head">
          <span class="app-center__card-title">{{ card.label }}</span>
          <span class="app-center__badge" :data-state="card.state">{{ card.badge }}</span>
        </div>
        <p class="app-center__card-sub">{{ cardSubtitle(card) }}</p>
        <div class="app-center__card-foot">
          <span class="app-center__privacy">{{ privacyText(card) }}</span>
          <button
            type="button"
            class="app-center__open"
            :disabled="!card.actionable"
            @click="open(card)"
          >
            {{ card.actionable ? '打开' : '不可用' }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.app-center {
  padding: 16px;
}
.app-center__header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.app-center__title {
  font-size: 18px;
  font-weight: 600;
}
.app-center__error {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-danger, #c0392b);
}
.app-center__notice,
.app-center__loading {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.75;
}
.app-center__list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.app-center__card {
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 10px;
  padding: 12px;
}
.app-center__card[data-state='disabled'] {
  opacity: 0.6;
}
.app-center__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.app-center__card-title {
  font-size: 15px;
  font-weight: 600;
}
.app-center__badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-fill, #f2f2f2);
}
.app-center__card-sub {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.75;
}
.app-center__card-foot {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.app-center__privacy {
  font-size: 12px;
  opacity: 0.75;
}
.app-center__open {
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 13px;
}
.app-center__open[disabled] {
  opacity: 0.5;
}
</style>
