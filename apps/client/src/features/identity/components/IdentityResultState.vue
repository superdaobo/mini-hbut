<script setup lang="ts">
// IdentityResultState.vue —— #623 授权结果页。
//
// 覆盖 approved / denied / cancelled / expired / error 五种终态；
// 文案为用户可读中文，不显示任何内部错误细节（stack/crypto/DB detail）。

import { computed } from 'vue'
import type { IdentityResultInfo } from '../types'

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
        title: '已允许登录',
        desc: result.message || '网页将自动完成登录，你可以返回浏览器'
      }
    case 'denied':
      return { icon: 'cancel', tone: 'warn', title: '已拒绝授权', desc: result.message || '已拒绝此次授权' }
    case 'cancelled':
      return { icon: 'close', tone: 'warn', title: '已取消授权', desc: result.message || '已取消此次授权' }
    case 'expired':
      return {
        icon: 'schedule',
        tone: 'warn',
        title: '请求已过期',
        desc: result.message || '应用请求已过期，请从网页重新发起'
      }
    case 'error':
      return { icon: 'error', tone: 'err', title: '授权失败', desc: result.message || '授权处理失败，请稍后重试' }
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
      <button class="btn-primary btn-ripple" @click="emit('close')">完成</button>
    </div>
  </div>
</template>

<style src="./IdentityResultState.scoped.css" scoped></style>
