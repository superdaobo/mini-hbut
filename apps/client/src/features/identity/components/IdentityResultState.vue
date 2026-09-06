<script setup lang="ts">
// IdentityResultState.vue —— #623 授权结果页。
//
// 覆盖 approved / denied / cancelled / expired / error 五种终态；
// 文案为用户可读中文，不显示任何内部错误细节（stack/crypto/DB detail）。

import { computed } from 'vue'
import type { IdentityResultInfo } from '../types'
// #795：响应式 t（locale 变化后模板即时重渲染）
import { useI18n } from '../../../utils/app_i18n'

const { t } = useI18n()

const props = defineProps<{ result: IdentityResultInfo | null }>()
const emit = defineEmits<{ close: [] }>()

const view = computed<{
  icon: string
  tone: 'ok' | 'warn' | 'err'
  title: string
  desc: string
} | null>(() => {
  const result = props.result
  if (!result) return null
  switch (result.outcome) {
    case 'approved':
      return {
        icon: 'check_circle',
        tone: 'ok',
        title: t('identity.result.approved.title'),
        desc: result.message || t('identity.result.approved.desc.fallback')
      }
    case 'denied':
      return {
        icon: 'cancel',
        tone: 'warn',
        title: t('identity.result.denied.title'),
        desc: result.message || t('identity.result.denied.desc.fallback')
      }
    case 'cancelled':
      return {
        icon: 'close',
        tone: 'warn',
        title: t('identity.result.cancelled.title'),
        desc: result.message || t('identity.result.cancelled.desc.fallback')
      }
    case 'expired':
      return {
        icon: 'schedule',
        tone: 'warn',
        title: t('identity.result.expired.title'),
        desc: result.message || t('identity.result.expired.desc.fallback')
      }
    case 'error':
      return {
        icon: 'error',
        tone: 'err',
        title: t('identity.result.error.title'),
        desc: result.message || t('identity.result.error.desc.fallback')
      }
  }
})
</script>

<template>
  <div v-if="view" class="identity-result" role="status" aria-live="polite">
    <span class="material-symbols-outlined identity-result-icon" :class="`tone-${view.tone}`" aria-hidden="true">
      {{ view.icon }}
    </span>
    <h3 class="identity-result-title">{{ view.title }}</h3>
    <p class="identity-result-desc">{{ view.desc }}</p>
    <div class="identity-result-actions">
      <button class="btn-primary btn-ripple" @click="emit('close')">{{ t('identity.result.action.done') }}</button>
    </div>
  </div>
</template>

<style src="./IdentityResultState.scoped.css" scoped></style>
