<script setup>
/**
 * 游乐场「游戏」Tab（#905）。
 * 11 个经典游戏入口：点击后**复用既有 module 打开链路**（见 pending_open.ts 的决策说明），
 * 不在本组件内复制 manifest/缓存/bundle 状态机。
 *
 * W3：五子棋竞技入口受 `gomoku_competitive_enabled` + `/meta.capabilities.gomoku_match`
 * 双层控制；能力未就绪时**整块不渲染**（P1-1：不显示一个点了必然失败的入口）。
 */
import { useI18n } from '../../utils/app_i18n'

/** 竞技入口指向的五子棋模块（与 module_center / launch.ts 的 id 一致） */
const COMPETITIVE_GOMOKU_MODULE_ID = 'hbut_gomoku'

const props = defineProps({
  games: { type: Array, default: () => [] },
  busyGameId: { type: String, default: '' },
  gomokuCompetitiveEnabled: { type: Boolean, default: false }
})

const emit = defineEmits(['open-game'])
const { t } = useI18n()
</script>

<template>
  <div class="gc-games">
    <!-- 五子棋竞技：capability-gated，未就绪整块隐藏 -->
    <section v-if="props.gomokuCompetitiveEnabled" class="gc-competitive" data-section="gomoku-competitive">
      <strong class="gc-competitive__title">{{ t('gameCenter.games.competitiveTitle') }}</strong>
      <span class="gc-competitive__desc">{{ t('gameCenter.games.competitiveBody') }}</span>
      <button
        class="gc-competitive__action"
        type="button"
        @click="emit('open-game', COMPETITIVE_GOMOKU_MODULE_ID)"
      >
        {{ t('gameCenter.games.competitiveAction') }}
      </button>
    </section>

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

.gc-competitive {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: calc(16px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.08);
}

.gc-competitive__title {
  font-size: calc(13px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-competitive__desc {
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-competitive__action {
  align-self: flex-start;
  margin-top: 2px;
  padding: 7px 14px;
  border: 0;
  border-radius: 999px;
  background: var(--ui-primary, #3b82f6);
  color: #fff;
  font-size: calc(12px * var(--ui-font-scale, 1));
  font-weight: 600;
  cursor: pointer;
}
</style>
