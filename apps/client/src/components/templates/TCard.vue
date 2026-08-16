<template>
  <div :class="['t-card', 'glass-card', { 't-card--hoverable': hoverable, 't-card--compact': compact }]">
    <div v-if="$slots.header" class="t-card__header">
      <slot name="header" />
    </div>
    <div class="t-card__body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="t-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  hoverable: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})
</script>

<style scoped>
.t-card__header {
  padding-bottom: calc(12px * var(--ui-space-scale));
  margin-bottom: calc(12px * var(--ui-space-scale));
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  font-weight: 700;
  font-size: calc(15px * var(--ui-font-scale));
  color: var(--ui-text);
}
.t-card__body {
  color: var(--ui-text);
}
.t-card__footer {
  padding-top: calc(12px * var(--ui-space-scale));
  margin-top: calc(12px * var(--ui-space-scale));
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}
.t-card--compact {
  padding: calc(1rem * var(--ui-space-scale)) !important;
}
</style>
