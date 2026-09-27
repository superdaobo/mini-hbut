<script setup>
/**
 * 游乐场「我的」Tab（#905）。
 *
 * 数据来源与 feature-gate：
 * - 玩家摘要 / 历史最好成绩：本地缓存 + Legacy 只读榜（既有数据，始终可用）；
 * - 等级 / XP / 湖工币 / 钱包流水 / 今日任务进度：受 game_economy_enabled 前置控制，
 *   关闭时整块隐藏（协议 §5 REWARD_DISABLED client_action），不展示会报错的卡片。
 */
import { useI18n } from '../../utils/app_i18n'

const props = defineProps({
  profile: { type: Object, default: () => ({}) },
  games: { type: Array, default: () => [] },
  selectedGameId: { type: String, default: '' },
  selfBest: { type: Object, default: null },
  wallet: { type: Object, default: null },
  economyEnabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' }
})

const emit = defineEmits(['select-game', 'retry'])
const { t } = useI18n()
</script>

<template>
  <div class="gc-me">
    <section class="gc-card">
      <header class="gc-card__header">
        <h3 class="gc-card__title">{{ t('gameCenter.me.profileTitle') }}</h3>
      </header>
      <dl class="gc-me__fields">
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.nickname') }}</dt>
          <dd>{{ props.profile.name || t('gameCenter.home.anonymous') }}</dd>
        </div>
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.className') }}</dt>
          <dd>{{ props.profile.className || t('gameCenter.home.classUnknown') }}</dd>
        </div>
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.schoolName') }}</dt>
          <dd>{{ props.profile.schoolName || t('gameCenter.me.schoolUnknown') }}</dd>
        </div>
      </dl>
    </section>

    <!-- 经济未开放：等级/XP/湖工币/钱包流水/任务摘要整块隐藏 -->
    <section v-if="props.economyEnabled" class="gc-card">
      <header class="gc-card__header">
        <h3 class="gc-card__title">{{ t('gameCenter.me.walletTitle') }}</h3>
      </header>
      <dl class="gc-me__fields">
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.level') }}</dt>
          <dd>{{ props.wallet?.level ?? '--' }}</dd>
        </div>
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.xp') }}</dt>
          <dd>{{ props.wallet?.xp ?? '--' }}</dd>
        </div>
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.coins') }}</dt>
          <dd>{{ props.wallet?.coins ?? '--' }}</dd>
        </div>
      </dl>
    </section>
    <p v-else class="gc-me__gated">{{ t('gameCenter.me.economyDisabledNote') }}</p>

    <section class="gc-card">
      <header class="gc-card__header">
        <h3 class="gc-card__title">{{ t('gameCenter.me.historyTitle') }}</h3>
      </header>
      <div class="gc-me__games">
        <button
          v-for="item in props.games"
          :key="item.id"
          class="gc-me__game"
          :class="{ 'gc-me__game--active': item.id === props.selectedGameId }"
          type="button"
          :data-game-id="item.id"
          @click="emit('select-game', item.id)"
        >
          <span aria-hidden="true">{{ item.icon || '🎮' }}</span>
          <span>{{ item.name }}</span>
        </button>
      </div>
      <p v-if="props.loading" class="gc-card__hint">{{ t('gameCenter.me.loading') }}</p>
      <p v-else-if="props.errorMessage" class="gc-card__hint">{{ props.errorMessage }}</p>
      <p v-else-if="!props.selfBest" class="gc-card__hint">{{ t('gameCenter.me.noHistory') }}</p>
      <dl v-else class="gc-me__fields">
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.bestScore') }}</dt>
          <dd>{{ props.selfBest.score }}</dd>
        </div>
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.bestMaxLevel') }}</dt>
          <dd>{{ props.selfBest.maxLevel }}</dd>
        </div>
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.classRank') }}</dt>
          <dd>{{ props.selfBest.classRank || '--' }}</dd>
        </div>
        <div class="gc-me__field">
          <dt>{{ t('gameCenter.me.schoolRank') }}</dt>
          <dd>{{ props.selfBest.schoolRank || '--' }}</dd>
        </div>
      </dl>
    </section>

    <p class="gc-me__policy">{{ t('gameCenter.me.piiNote') }}</p>
  </div>
</template>

<style scoped>
.gc-me {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gc-card {
  padding: 14px;
  border-radius: calc(16px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, #fff 6%);
}

.gc-card__header {
  margin-bottom: 8px;
}

.gc-card__title {
  margin: 0;
  font-size: calc(14px * var(--ui-font-scale, 1));
  font-weight: 700;
  color: var(--ui-text, #1f2937);
}

.gc-card__hint {
  margin: 8px 0 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-me__fields {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gc-me__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: calc(13px * var(--ui-font-scale, 1));
}

.gc-me__field dt {
  color: var(--ui-muted, #64748b);
}

.gc-me__field dd {
  margin: 0;
  color: var(--ui-text, #1f2937);
  font-weight: 600;
}

.gc-me__games {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 4px;
}

.gc-me__game {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: color-mix(in oklab, var(--ui-surface, #fff) 90%, #fff 10%);
  color: var(--ui-text, #1f2937);
  font-size: calc(12px * var(--ui-font-scale, 1));
  cursor: pointer;
}

.gc-me__game--active {
  border-color: var(--ui-primary, #3b82f6);
  color: var(--ui-primary, #3b82f6);
  font-weight: 700;
}

.gc-me__gated,
.gc-me__policy {
  margin: 0;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
  line-height: 1.6;
}
</style>
