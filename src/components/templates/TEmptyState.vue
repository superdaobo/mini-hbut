<template>
  <div :class="['t-state', `t-state--${type}`]">
    <div v-if="type === 'loading'" class="t-state__spinner"></div>
    <div v-else class="t-state__icon">{{ resolvedIcon }}</div>
    <p class="t-state__message">{{ message || defaultMessage }}</p>
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, default: 'empty', validator: (v) => ['empty', 'loading', 'error'].includes(v) },
  message: { type: String, default: '' },
  icon: { type: String, default: '' }
})

const defaultMessage = computed(() => {
  if (props.type === 'loading') return '加载中...'
  if (props.type === 'error') return '加载失败，请稍后重试'
  return '暂无数据'
})

const resolvedIcon = computed(() => {
  if (props.icon) return props.icon
  if (props.type === 'error') return '⚠️'
  return '📭'
})
</script>

<style scoped>
.t-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(3rem * var(--ui-space-scale)) calc(1.5rem * var(--ui-space-scale));
  text-align: center;
  color: var(--ui-muted);
}
.t-state__icon {
  font-size: 3rem;
  margin-bottom: calc(12px * var(--ui-space-scale));
  line-height: 1;
}
.t-state__message {
  margin: 0;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 500;
  opacity: 0.8;
}
.t-state__spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(99, 102, 241, 0.18);
  border-top-color: var(--ui-primary);
  border-radius: 50%;
  animation: t-spin 0.7s linear infinite;
  margin-bottom: calc(14px * var(--ui-space-scale));
}
.t-state--error .t-state__message {
  color: var(--ui-danger);
}
@keyframes t-spin {
  to { transform: rotate(360deg); }
}
</style>
