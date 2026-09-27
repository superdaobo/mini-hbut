<script setup>
/**
 * 游乐场「漂流瓶」Tab（#905 占位）。
 *
 * 关键决策：#910（UGC 漂流瓶）未交付，本 Tab **只在
 * `drift_bottle_enabled=true` 且 `/meta.capabilities.drift_bottle=true` 时挂载**（双层闸门），
 * 且当前阶段仅展示占位说明，不发起任何请求 —— 保证「不可用能力被前置隐藏」，
 * 而不是「可见后必然报错」。
 */
import { useI18n } from '../../utils/app_i18n'

const { t } = useI18n()
</script>

<template>
  <div class="gc-drift">
    <div class="gc-drift__hero" aria-hidden="true">🍾</div>
    <h3 class="gc-drift__title">{{ t('gameCenter.drift.placeholderTitle') }}</h3>
    <p class="gc-drift__body">{{ t('gameCenter.drift.placeholderBody') }}</p>
    <p class="gc-drift__policy">{{ t('gameCenter.drift.policyNote') }}</p>
  </div>
</template>

<style scoped>
.gc-drift {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 32px 18px;
  border-radius: calc(16px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, #fff 6%);
  text-align: center;
}

.gc-drift__hero {
  font-size: 44px;
}

.gc-drift__title {
  margin: 0;
  font-size: calc(15px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-drift__body {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
  line-height: 1.6;
}

.gc-drift__policy {
  margin: 0;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
}
</style>
