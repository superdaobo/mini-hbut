<script setup>
/**
 * 游乐场「总排行榜」Tab（#909 契约 §2.3）。
 *
 * 与「排行」Tab（GameCenterRankTab）的区别：本组件是**跨游戏的全局 XP 榜**
 * （`board=global_xp`），默认直接请求，**不要求用户先选游戏**，也不涉及
 * Legacy 单游戏榜 / 赛季榜；两者互不影响。
 *
 * 关键行为：
 * - 「我」始终置顶展示（我的排名卡），列表中我的行同时高亮；未进 top-N 时
 *   服务端仍返回正确 `me.rank`，因此顶部卡片照常显示真实名次；
 * - 未登录也能看榜（服务端 `me=null`），此时显示登录提示而不是错误；
 * - `cursor` 分页「加载更多」按键去重（`mergeGlobalRankRows`）；
 * - PII：只渲染契约字段 `rank / display_name / xp_total / level`，
 *   绝不渲染 student_id / sub / user_id。
 */
import { computed, onMounted, ref, watch } from 'vue'
import GameCenterNotice from './GameCenterNotice.vue'
import { tf, useI18n } from '../../utils/app_i18n'
import {
  GLOBAL_RANK_DEFAULT_LIMIT,
  fetchGlobalXpLeaderboard,
  formatPointsTimestamp,
  isPointsAuthError,
  mergeGlobalRankRows
} from '../../utils/game_center/points'

const props = defineProps({
  /** 远程配置下发的 API base（缺省走环境默认源） */
  apiBase: { type: String, default: '' },
  /** 榜单双闸门结果（game_verified_session_enabled && capabilities.leaderboards） */
  leaderboardsEnabled: { type: Boolean, default: false },
  /** 首屏分页大小（契约默认 50，上限由 points.ts 夹紧到 100） */
  pageSize: { type: Number, default: GLOBAL_RANK_DEFAULT_LIMIT }
})

const { t } = useI18n()

const board = ref(null)
const loading = ref(false)
const error = ref(null)
const loadingMore = ref(false)
const nextCursor = ref('')

/** 把任意抛出物归一化为可渲染的错误视图模型（不泄漏原始异常对象） */
const toViewError = (error) => ({
  code: String(error?.code || ''),
  message: String(error?.message || '').trim(),
  retryable: error?.retryable === true
})

const errorText = computed(() => error.value?.message || t('gameCenter.globalRank.loadFailed'))
const authError = computed(() => !!error.value && isPointsAuthError(error.value))
/** 我的名次：rank<=0 视为服务端未给出有效位置（契约允许 0） */
const myRankText = computed(() => {
  const rank = Number(board.value?.me?.rank) || 0
  return rank > 0 ? String(rank) : t('gameCenter.globalRank.notRanked')
})
const generatedAtText = computed(() => formatPointsTimestamp(board.value?.generatedAt))

const loadBoard = async () => {
  if (!props.leaderboardsEnabled) {
    board.value = null
    nextCursor.value = ''
    error.value = null
    return
  }
  loading.value = true
  error.value = null
  try {
    const page = await fetchGlobalXpLeaderboard({ apiBase: props.apiBase, limit: props.pageSize })
    // 等待期间闸门若被关闭（远程回滚 / 能力探测失败），丢弃本次结果
    if (!props.leaderboardsEnabled) return
    board.value = page
    nextCursor.value = page.nextCursor
  } catch (caught) {
    if (!props.leaderboardsEnabled) return
    board.value = null
    nextCursor.value = ''
    error.value = toViewError(caught)
  } finally {
    loading.value = false
  }
}

/** 追加页：游标来自服务端（不透明），合并时按 player_ref 去重防重复行 */
const loadMore = async () => {
  const cursor = nextCursor.value
  if (!cursor || loadingMore.value || loading.value) return
  loadingMore.value = true
  error.value = null
  try {
    const page = await fetchGlobalXpLeaderboard({
      apiBase: props.apiBase,
      limit: props.pageSize,
      cursor
    })
    if (!props.leaderboardsEnabled) return
    board.value = {
      ...(board.value || page),
      items: mergeGlobalRankRows(board.value?.items || [], page.items),
      me: page.me || board.value?.me || null,
      generatedAt: page.generatedAt || board.value?.generatedAt || '',
      ruleVersion: page.ruleVersion || board.value?.ruleVersion || ''
    }
    nextCursor.value = page.nextCursor
  } catch (caught) {
    // 追加失败不清空已加载内容（只提示本次失败）
    error.value = toViewError(caught)
  } finally {
    loadingMore.value = false
  }
}

watch(
  () => props.leaderboardsEnabled,
  (enabled) => {
    if (enabled && !board.value && !loading.value) void loadBoard()
  }
)

onMounted(() => {
  void loadBoard()
})
</script>

<template>
  <div class="gc-global-rank">
    <!-- 能力关闭：前置占位，不发请求（契约 §4.1） -->
    <GameCenterNotice
      v-if="!props.leaderboardsEnabled"
      tone="info"
      :title="t('gameCenter.globalRank.title')"
      :message="t('gameCenter.globalRank.disabled')"
    />

    <template v-else>
      <GameCenterNotice
        v-if="authError"
        tone="info"
        :title="t('gameCenter.globalRank.loadFailed')"
        :message="t('gameCenter.globalRank.signInHint')"
      />
      <GameCenterNotice
        v-else-if="error && !board"
        tone="warning"
        :title="t('gameCenter.globalRank.loadFailed')"
        :message="errorText"
        :action-text="t('gameCenter.globalRank.retry')"
        :busy="loading"
        @action="loadBoard"
      />

      <p v-if="loading && !board" class="gc-card__hint">{{ t('gameCenter.globalRank.loading') }}</p>

      <!-- 我的排名：始终置顶（未进前 N / 未登录都能正确表达） -->
      <section v-if="board && board.me" class="gc-card gc-card--me" data-section="global-rank-me">
        <header class="gc-card__header">
          <h3 class="gc-card__title">{{ t('gameCenter.globalRank.myRankTitle') }}</h3>
          <span class="gc-card__meta">{{ t('gameCenter.globalRank.metricName') }}</span>
        </header>
        <div class="gc-my-rank">
          <span class="gc-my-rank__pos">{{ myRankText }}</span>
          <span class="gc-my-rank__name">{{ board.me.displayName }}</span>
          <span class="gc-my-rank__level">{{ tf('gameCenter.globalRank.levelLabel', { level: board.me.level }) }}</span>
          <strong class="gc-my-rank__xp">{{ board.me.xpTotal }}</strong>
        </div>
      </section>
      <p v-else-if="board" class="gc-card__note">{{ t('gameCenter.globalRank.signInHint') }}</p>

      <section v-if="board" class="gc-card" data-section="global-rank-list">
        <header class="gc-card__header">
          <h3 class="gc-card__title">{{ t('gameCenter.globalRank.title') }}</h3>
          <span class="gc-card__meta">{{ t('gameCenter.globalRank.subtitle') }}</span>
        </header>
        <p v-if="!board.items.length" class="gc-card__hint">{{ t('gameCenter.globalRank.empty') }}</p>
        <ol v-else class="gc-rank-list">
          <li
            v-for="row in board.items"
            :key="row.playerRef || `rank-${row.rank}`"
            class="gc-rank-list__row"
            :class="{ 'gc-rank-list__row--self': row.isSelf }"
          >
            <span class="gc-rank-list__pos">{{ row.rank }}</span>
            <span class="gc-rank-list__name">{{ row.displayName }}</span>
            <span class="gc-rank-list__level">{{ tf('gameCenter.globalRank.levelLabel', { level: row.level }) }}</span>
            <span class="gc-rank-list__xp">{{ row.xpTotal }}</span>
            <span v-if="row.isSelf" class="gc-rank-list__tag">{{ t('gameCenter.globalRank.selfTag') }}</span>
          </li>
        </ol>
        <!-- 追加页失败：保留已加载行，只提示本次失败 -->
        <GameCenterNotice
          v-if="error && board"
          tone="warning"
          :title="t('gameCenter.globalRank.loadFailed')"
          :message="errorText"
          :action-text="t('gameCenter.globalRank.retry')"
          :busy="loadingMore"
          @action="loadMore"
        />
        <button
          v-if="nextCursor"
          class="gc-global-rank__more"
          type="button"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? t('gameCenter.globalRank.loadingMore') : t('gameCenter.globalRank.loadMore') }}
        </button>
        <p v-if="generatedAtText" class="gc-card__note">
          {{ tf('gameCenter.globalRank.generatedAt', { time: generatedAtText }) }}
        </p>
      </section>

      <p class="gc-global-rank__policy">{{ t('gameCenter.globalRank.piiNote') }}</p>
    </template>
  </div>
</template>

<style scoped>
.gc-global-rank {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gc-card {
  padding: 14px;
  border-radius: calc(16px * var(--ui-radius-scale, 1));
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.22));
  background: color-mix(in oklab, var(--ui-surface, #fff) 94%, #fff 6%);
}

.gc-card--me {
  border-color: color-mix(in oklab, var(--ui-primary, #3b82f6) 38%, transparent);
  background: color-mix(in oklab, var(--ui-primary-soft, rgba(59, 130, 246, 0.1)) 55%, var(--ui-surface, #fff) 45%);
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
  margin: 8px 0 0;
}

.gc-card__hint {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-my-rank {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.gc-my-rank__pos {
  flex: 0 0 auto;
  min-width: 34px;
  font-size: calc(18px * var(--ui-font-scale, 1));
  font-weight: 700;
  color: var(--ui-primary, #3b82f6);
  font-variant-numeric: tabular-nums;
}

.gc-my-rank__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--ui-text, #1f2937);
}

.gc-my-rank__level {
  flex: 0 0 auto;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-my-rank__xp {
  flex: 0 0 auto;
  color: var(--ui-text, #1f2937);
  font-variant-numeric: tabular-nums;
}

.gc-rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gc-rank-list__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.08);
  font-size: calc(13px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-rank-list__row--self {
  background: color-mix(in oklab, var(--ui-primary-soft, rgba(59, 130, 246, 0.12)) 80%, transparent);
  font-weight: 700;
}

.gc-rank-list__pos {
  width: 30px;
  text-align: center;
  flex: 0 0 auto;
  color: var(--ui-muted, #64748b);
  font-variant-numeric: tabular-nums;
}

.gc-rank-list__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gc-rank-list__level {
  flex: 0 0 auto;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-rank-list__xp {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.gc-rank-list__tag {
  flex: 0 0 auto;
  font-size: calc(10px * var(--ui-font-scale, 1));
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ui-primary, #3b82f6);
  color: #fff;
}

.gc-global-rank__more {
  margin-top: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--ui-surface-border, rgba(148, 163, 184, 0.28));
  background: transparent;
  color: var(--ui-primary, #3b82f6);
  font-size: calc(12px * var(--ui-font-scale, 1));
  font-weight: 600;
  cursor: pointer;
}

.gc-global-rank__more:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gc-global-rank__policy {
  margin: 0;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
  line-height: 1.6;
}
</style>
