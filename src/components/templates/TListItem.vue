<template>
  <div :class="['t-list-item', { 't-list-item--clickable': clickable }]" @click="clickable && $emit('click')">
    <div v-if="$slots.icon" class="t-list-item__icon">
      <slot name="icon" />
    </div>
    <div class="t-list-item__content">
      <slot />
    </div>
    <div v-if="$slots.action" class="t-list-item__action">
      <slot name="action" />
    </div>
    <span v-else-if="clickable" class="t-list-item__arrow">›</span>
  </div>
</template>

<script setup>
defineProps({
  clickable: { type: Boolean, default: false }
})
defineEmits(['click'])
</script>

<style scoped>
.t-list-item {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--ui-space-scale));
  padding: calc(14px * var(--ui-space-scale)) calc(16px * var(--ui-space-scale));
  border-radius: var(--ux-card-radius-sm, 12px);
  transition: background calc(0.15s * var(--ui-motion-scale)) ease;
}
.t-list-item--clickable {
  cursor: pointer;
}
.t-list-item--clickable:hover {
  background: var(--ui-primary-soft);
}
.t-list-item--clickable:active {
  background: var(--ui-primary-soft-strong);
}
.t-list-item__icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--ui-primary-soft);
  color: var(--ui-primary);
  font-size: 18px;
}
.t-list-item__content {
  flex: 1;
  min-width: 0;
}
.t-list-item__action {
  flex-shrink: 0;
}
.t-list-item__arrow {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--ui-muted);
  opacity: 0.5;
  font-weight: 300;
}
</style>
