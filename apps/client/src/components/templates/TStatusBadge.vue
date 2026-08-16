<template>
  <span :class="['t-badge', `t-badge--${type}`]">
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup>
defineProps({
  type: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'success', 'danger', 'warning', 'info', 'muted'].includes(v)
  },
  text: { type: String, default: '' }
})
</script>

<style scoped>
.t-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}
.t-badge--primary {
  border: 1px solid color-mix(in oklab, var(--ui-primary) 26%, transparent);
  background: color-mix(in oklab, var(--ui-primary) 12%, #fff 88%);
  color: var(--ui-primary);
}
.t-badge--success {
  border: 1px solid color-mix(in oklab, var(--ui-success) 26%, transparent);
  background: color-mix(in oklab, var(--ui-success) 12%, #fff 88%);
  color: var(--ui-success);
}
.t-badge--danger {
  border: 1px solid color-mix(in oklab, var(--ui-danger) 26%, transparent);
  background: color-mix(in oklab, var(--ui-danger) 12%, #fff 88%);
  color: var(--ui-danger);
}
.t-badge--warning {
  border: 1px solid color-mix(in oklab, #f59e0b 26%, transparent);
  background: color-mix(in oklab, #f59e0b 12%, #fff 88%);
  color: #b45309;
}
.t-badge--info {
  border: 1px solid color-mix(in oklab, #06b6d4 26%, transparent);
  background: color-mix(in oklab, #06b6d4 12%, #fff 88%);
  color: #0e7490;
}
.t-badge--muted {
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(148, 163, 184, 0.1);
  color: var(--ui-muted);
}
</style>
