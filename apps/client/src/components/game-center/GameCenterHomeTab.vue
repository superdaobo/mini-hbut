<script setup>
/**
 * 游乐场「首页」Tab（#905）。
 * 只展示：玩家摘要、今日任务占位、推荐/最近游戏；不发任何写请求。
 * 等级 / XP / 湖工币 / 今日任务进度全部受 game_economy_enabled 前置控制（关闭即隐藏）。
 */
import { useI18n } from '../../utils/app_i18n'

const props = defineProps({
  profile: { type: Object, default: () => ({}) },
  economyEnabled: { type: Boolean, default: false },
  recentGames: { type: Array, default: () => [] },
  recommendedGames: { type: Array, default: () => [] }
})

const emit = defineEmits(['open-game'])
const { t } = useI18n()
</script>

<template>
  <div class="gc-home">
    <section class="gc-card gc-card--player">
      <div class="gc-player">
        <span class="gc-player__avatar" aria-hidden="true">🎓</span>
        <div class="gc-player__info">
          <strong class="gc-player__name">{{ props.profile.name || t('gameCenter.home.anonymous') }}</strong>
          <span class="gc-player__meta">
            {{ props.profile.className || t('gameCenter.home.classUnknown') }}
            <template v-if="props.profile.schoolName"> · {{ props.profile.schoolName }}</template>
          </span>
        </div>
      </div>
      <!-- 经济未开放：整块隐藏而不是展示会报错的卡片（协议 §5 REWARD_DISABLED client_action） -->
      <div v-if="props.economyEnabled" class="gc-player__wallet">
        <div class="gc-stat">
          <span class="gc-stat__label">{{ t('gameCenter.me.level') }}</span>
          <strong class="gc-stat__value">--</strong>
        </div>
        <div class="gc-stat">
          <span class="gc-stat__label">{{ t('gameCenter.me.xp') }}</span>
          <strong class="gc-stat__value">--</strong>
        </div>
        <div class="gc-stat">
          <span class="gc-stat__label">{{ t('gameCenter.me.coins') }}</span>
          <strong class="gc-stat__value">--</strong>
        </div>
      </div>
    </section>

    <section class="gc-card">
      <header class="gc-card__header">
        <h3 class="gc-card__title">{{ t('gameCenter.home.tasksTitle') }}</h3>
      </header>
      <p class="gc-card__hint">{{ t('gameCenter.home.tasksPlaceholder') }}</p>
    </section>

    <section v-if="props.recentGames.length" class="gc-card">
      <header class="gc-card__header">
        <h3 class="gc-card__title">{{ t('gameCenter.home.recentTitle') }}</h3>
      </header>
      <div class="gc-game-list">
        <button
          v-for="item in props.recentGames"
          :key="`recent-${item.id}`"
          class="gc-game-chip"
          type="button"
          @click="emit('open-game', item.id)"
        >
          <span aria-hidden="true">{{ item.icon || '🎮' }}</span>
          <span>{{ item.name }}</span>
        </button>
      </div>
    </section>

    <section class="gc-card">
      <header class="gc-card__header">
        <h3 class="gc-card__title">{{ t('gameCenter.home.recommendTitle') }}</h3>
      </header>
      <div class="gc-game-list">
        <button
          v-for="item in props.recommendedGames"
          :key="`recommend-${item.id}`"
          class="gc-game-chip"
          type="button"
          @click="emit('open-game', item.id)"
        >
          <span aria-hidden="true">{{ item.icon || '🎮' }}</span>
          <span>{{ item.name }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.gc-home {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gc-card {
  padding: 14px;
  border-radius: calc(16px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, #fff 6%);
  box-shadow: var(--ui-shadow-soft, 0 4px 15px rgba(0, 0, 0, 0.03));
}

.gc-card--player {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gc-player {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gc-player__avatar {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: rgba(59, 130, 246, 0.12);
}

.gc-player__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.gc-player__name {
  font-size: calc(15px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-player__meta {
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-player__wallet {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.gc-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.1);
  text-align: center;
}

.gc-stat__label {
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-stat__value {
  font-size: calc(15px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.gc-card__title {
  margin: 0;
  font-size: calc(14px * var(--ui-font-scale, 1));
  font-weight: 700;
  color: var(--ui-text, #1f2937);
}

.gc-card__hint {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-game-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gc-game-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: color-mix(in oklab, var(--ui-surface, #fff) 88%, #fff 12%);
  color: var(--ui-text, #1f2937);
  font-size: calc(12px * var(--ui-font-scale, 1));
  cursor: pointer;
}
</style>
