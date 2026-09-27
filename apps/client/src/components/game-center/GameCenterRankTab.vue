<script setup>
/**
 * 游乐场「排行」Tab（#905）。
 * - 经典榜：读 Legacy `/api/game-rank/leaderboard`（兼容契约 2，只读展示）；渲染前经
 *   leaderboard.ts 白名单过滤，**学号等 PII 不会进入 DOM**（协议 §9.3）。
 * - Verified 赛季榜：受 game_verified_session_enabled 前置控制；关闭时只显示占位说明，
 *   **不发起任何 V2 请求**（不出现「可见但必然报错」）。
 */
import GameCenterNotice from './GameCenterNotice.vue'
import { useI18n } from '../../utils/app_i18n'

const props = defineProps({
  games: { type: Array, default: () => [] },
  selectedGameId: { type: String, default: '' },
  classicBoard: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
  verifiedEnabled: { type: Boolean, default: false },
  verifiedBoard: { type: Object, default: null },
  verifiedError: { type: String, default: '' }
})

const emit = defineEmits(['select-game', 'retry'])
const { t } = useI18n()
</script>

<template>
  <div class="gc-rank">
    <div class="gc-rank__games">
      <button
        v-for="item in props.games"
        :key="item.id"
        class="gc-rank__game"
        :class="{ 'gc-rank__game--active': item.id === props.selectedGameId }"
        type="button"
        :data-game-id="item.id"
        @click="emit('select-game', item.id)"
      >
        <span aria-hidden="true">{{ item.icon || '🎮' }}</span>
        <span>{{ item.name }}</span>
      </button>
    </div>

    <GameCenterNotice
      v-if="props.errorMessage"
      tone="warning"
      :title="t('gameCenter.rank.loadFailed')"
      :message="props.errorMessage"
      :action-text="t('gameCenter.rank.retry')"
      :busy="props.loading"
      @action="emit('retry')"
    />

    <section class="gc-card">
      <header class="gc-card__header">
        <h3 class="gc-card__title">{{ t('gameCenter.rank.classicTitle') }}</h3>
        <span class="gc-card__meta">{{ t('gameCenter.rank.classicSource') }}</span>
      </header>
      <p v-if="props.loading" class="gc-card__hint">{{ t('gameCenter.rank.loading') }}</p>
      <p v-else-if="!props.classicBoard || !props.classicBoard.entries.length" class="gc-card__hint">
        {{ t('gameCenter.rank.empty') }}
      </p>
      <ol v-else class="gc-rank__list">
        <li
          v-for="entry in props.classicBoard.entries"
          :key="entry.key"
          class="gc-rank__row"
          :class="{ 'gc-rank__row--self': entry.isSelf }"
        >
          <span class="gc-rank__pos">{{ entry.rank }}</span>
          <span class="gc-rank__name">{{ entry.playerName }}</span>
          <span class="gc-rank__score">{{ entry.score }}</span>
          <span v-if="entry.isSelf" class="gc-rank__tag">{{ t('gameCenter.rank.selfTag') }}</span>
        </li>
      </ol>
      <p class="gc-card__note">{{ t('gameCenter.rank.piiNote') }}</p>
    </section>

    <section class="gc-card">
      <header class="gc-card__header">
        <h3 class="gc-card__title">{{ t('gameCenter.rank.verifiedTitle') }}</h3>
      </header>
      <!-- feature-gate：未交付（#909）时只展示占位，不发请求 -->
      <p v-if="!props.verifiedEnabled" class="gc-card__hint">{{ t('gameCenter.rank.verifiedPlaceholder') }}</p>
      <template v-else>
        <p v-if="props.verifiedError" class="gc-card__hint">{{ props.verifiedError }}</p>
        <p v-else-if="!props.verifiedBoard || !props.verifiedBoard.entries.length" class="gc-card__hint">
          {{ t('gameCenter.rank.empty') }}
        </p>
        <ol v-else class="gc-rank__list">
          <li v-for="entry in props.verifiedBoard.entries" :key="entry.key" class="gc-rank__row">
            <span class="gc-rank__pos">{{ entry.rank }}</span>
            <span class="gc-rank__name">{{ entry.playerName }}</span>
            <span class="gc-rank__score">{{ entry.score }}</span>
          </li>
        </ol>
      </template>
    </section>
  </div>
</template>

<style scoped>
.gc-rank {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gc-rank__games {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.gc-rank__game {
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

.gc-rank__game--active {
  border-color: var(--ui-primary, #3b82f6);
  color: var(--ui-primary, #3b82f6);
  font-weight: 700;
}

.gc-card {
  padding: 14px;
  border-radius: calc(16px * var(--ui-radius-scale, 1));
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, #fff 6%);
}

.gc-card__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.gc-card__title {
  margin: 0;
  font-size: calc(14px * var(--ui-font-scale, 1));
  font-weight: 700;
  color: var(--ui-text, #1f2937);
}

.gc-card__meta,
.gc-card__note {
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
}

.gc-card__note {
  margin: 10px 0 0;
}

.gc-card__hint {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-rank__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gc-rank__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.08);
  font-size: calc(13px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-rank__row--self {
  background: rgba(59, 130, 246, 0.12);
  font-weight: 700;
}

.gc-rank__pos {
  width: 26px;
  text-align: center;
  color: var(--ui-muted, #64748b);
  flex: 0 0 auto;
}

.gc-rank__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gc-rank__score {
  font-variant-numeric: tabular-nums;
}

.gc-rank__tag {
  font-size: calc(11px * var(--ui-font-scale, 1));
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ui-primary, #3b82f6);
  color: #fff;
}
</style>
