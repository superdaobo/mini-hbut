<script setup>
/**
 * 游乐场「游戏」Tab（#905）。
 * 11 个经典游戏入口：点击后**复用既有 module 打开链路**（见 pending_open.ts 的决策说明），
 * 不在本组件内复制 manifest/缓存/bundle 状态机。
 */
import { useI18n } from '../../utils/app_i18n'

const props = defineProps({
  games: { type: Array, default: () => [] },
  busyGameId: { type: String, default: '' }
})

const emit = defineEmits(['open-game'])
const { t } = useI18n()
</script>

<template>
  <div class="gc-games">
    <p class="gc-games__hint">{{ t('gameCenter.games.hint') }}</p>
    <div class="gc-games__grid">
      <button
        v-for="item in props.games"
        :key="item.id"
        class="gc-games__card"
        type="button"
        :data-game-id="item.id"
        :disabled="props.busyGameId === item.id"
        @click="emit('open-game', item.id)"
      >
        <span class="gc-games__icon" aria-hidden="true">{{ item.icon || '🎮' }}</span>
        <strong class="gc-games__name">{{ item.name }}</strong>
        <span class="gc-games__desc">{{ item.description || t('gameCenter.games.noDesc') }}</span>
        <span class="gc-games__status">{{ item.statusText || t('gameCenter.games.ready') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.gc-games {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gc-games__hint {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-games__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.gc-games__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: calc(16px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, #fff 6%);
  text-align: left;
  cursor: pointer;
}

.gc-games__card:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gc-games__card:active {
  transform: scale(0.98);
}

.gc-games__icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: rgba(59, 130, 246, 0.12);
}

.gc-games__name {
  font-size: calc(13px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-games__desc {
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gc-games__status {
  margin-top: 4px;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-primary, #3b82f6);
}
</style>
