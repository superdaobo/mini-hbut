<script setup>
import { TStatusBadge } from '../templates'

defineProps({
  connected: { type: Boolean, default: false }
})
</script>

<template>
  <div v-if="!connected" class="session-banner">
    <div class="session-banner__icon">⚠️</div>
    <div class="session-banner__content">
      <p class="session-banner__title">学习通未连接</p>
      <p class="session-banner__desc">请先在「在线学习」模块登录学习通账号，签到功能依赖已有会话。</p>
    </div>
    <TStatusBadge type="warning" text="未连接" />
  </div>
</template>

<style scoped>
.session-banner {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--ui-space-scale));
  padding: calc(14px * var(--ui-space-scale));
  border-radius: calc(14px * var(--ui-radius-scale));
  border: 1px solid rgba(245, 158, 11, 0.24);
  background: color-mix(in oklab, var(--ui-surface) 92%, rgba(245, 158, 11, 0.08));
}

.session-banner__icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.session-banner__content {
  flex: 1;
  min-width: 0;
}

.session-banner__title {
  margin: 0;
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 700;
  color: var(--ui-text);
}

.session-banner__desc {
  margin: 4px 0 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
  line-height: 1.4;
}
</style>
