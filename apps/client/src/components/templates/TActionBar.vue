<template>
  <div class="t-action-bar glass-card">
    <slot />
  </div>
</template>

<style scoped>
.t-action-bar {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(12px * var(--ui-space-scale));
  padding: calc(12px * var(--ui-space-scale)) calc(16px * var(--ui-space-scale)) calc(12px * var(--ui-space-scale) + env(safe-area-inset-bottom)) !important;
  border-radius: calc(16px * var(--ui-radius-scale)) calc(16px * var(--ui-radius-scale)) 0 0 !important;
  border-bottom: none !important;
}
</style>
