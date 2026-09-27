<script setup>
/**
 * 游乐场统一状态提示条（#905）。
 * 只做展示：文案全部由父级传入（已 i18n），不发起任何请求。
 */
const props = defineProps({
  tone: { type: String, default: 'info' },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  actionText: { type: String, default: '' },
  busy: { type: Boolean, default: false }
})

const emit = defineEmits(['action'])
</script>

<template>
  <div class="gc-notice" :class="`gc-notice--${props.tone}`" role="status">
    <div class="gc-notice__text">
      <strong v-if="props.title" class="gc-notice__title">{{ props.title }}</strong>
      <span v-if="props.message" class="gc-notice__message">{{ props.message }}</span>
    </div>
    <button
      v-if="props.actionText"
      class="gc-notice__action"
      type="button"
      :disabled="props.busy"
      @click="emit('action')"
    >
      {{ props.actionText }}
    </button>
  </div>
</template>

<style scoped>
.gc-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: calc(12px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: color-mix(in oklab, var(--ui-surface, #fff) 92%, #fff 8%);
  font-size: calc(12px * var(--ui-font-scale, 1));
  line-height: 1.5;
}

.gc-notice--info {
  border-color: rgba(59, 130, 246, 0.28);
  background: rgba(59, 130, 246, 0.08);
  color: color-mix(in oklab, var(--ui-primary, #3b82f6) 74%, #1e293b 26%);
}

.gc-notice--warning {
  border-color: rgba(245, 158, 11, 0.32);
  background: rgba(245, 158, 11, 0.1);
  color: #92400e;
}

.gc-notice--danger {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
  color: var(--ui-danger, #ef4444);
}

.gc-notice__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.gc-notice__title {
  font-weight: 700;
}

.gc-notice__message {
  opacity: 0.92;
}

.gc-notice__action {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-size: inherit;
  font-weight: 600;
  cursor: pointer;
}

.gc-notice__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
