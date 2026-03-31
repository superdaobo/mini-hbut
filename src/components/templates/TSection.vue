<template>
  <div :class="['t-section', { 't-section--flush': flush }]">
    <h4 v-if="title" class="t-section__title">
      <span v-if="icon" class="t-section__icon">{{ icon }}</span>
      {{ title }}
      <span v-if="$slots.badge" class="t-section__badge"><slot name="badge" /></span>
    </h4>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  icon: { type: String, default: '' },
  flush: { type: Boolean, default: false }
})
</script>

<style scoped>
.t-section {
  margin-bottom: calc(16px * var(--ui-space-scale));
}
.t-section--flush {
  margin-bottom: 0;
}
.t-section__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 calc(10px * var(--ui-space-scale));
  font-size: calc(15px * var(--ui-font-scale));
  font-weight: 800;
  color: var(--ui-text);
  letter-spacing: 0.2px;
}
.t-section__icon {
  font-size: 1.1em;
}
.t-section__badge {
  margin-left: auto;
}
</style>
