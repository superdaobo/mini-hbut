<script setup>
/**
 * 游乐场「首页」Tab（#905）。
 * 只展示：玩家摘要、今日任务（真实进度）、推荐/最近游戏；不发任何写请求。
 * 等级 / XP / 湖工币 受 game_economy_enabled + capabilities.wallet 前置控制（关闭即隐藏）；
 * 今日任务受 game_daily_tasks_enabled + capabilities.daily_tasks 前置控制，
 * 能力不可用时**整卡不渲染**（而不是渲染后报错）。
 *
 * #966：今日任务卡接真实数据（#909 数据通路交付后收口空壳卡）——
 * 数据层复用 `utils/game_center/points.ts` 的 `fetchPointsDailyTasks`（唯一网络入口，
 * 组件不直接 import api.ts），状态机与降级模式与 GameCenterPointsTab 一致：
 * 未登录 → 提示登录（不放重试按钮）；网络/服务端失败 → 中文提示 + 重试；
 * 服务端 404 FEATURE_DISABLED → 占位文案而不是错误；任务为空 → 空态提示。
 */
import { computed, onMounted, ref, watch } from 'vue'
import GameCenterNotice from './GameCenterNotice.vue'
import { tf, useI18n } from '../../utils/app_i18n'
import {
  dailyTaskTitleI18nKey,
  fetchPointsDailyTasks,
  isPointsAuthError,
  isPointsFeatureDisabled,
  taskProgressPercent
} from '../../utils/game_center/points'

const props = defineProps({
  profile: { type: Object, default: () => ({}) },
  economyEnabled: { type: Boolean, default: false },
  dailyTasksEnabled: { type: Boolean, default: false },
  /** 远程配置下发的 API base（缺省走环境默认源；透传给 points.ts 请求层） */
  apiBase: { type: String, default: '' },
  recentGames: { type: Array, default: () => [] },
  recommendedGames: { type: Array, default: () => [] }
})

const emit = defineEmits(['open-game'])
const { t } = useI18n()

const tasks = ref(null)
const tasksLoading = ref(false)
const tasksError = ref(null)

/** 把任意抛出物归一化为可渲染的错误视图模型（不泄漏原始异常对象，与 PointsTab 同构） */
const toViewError = (error) => ({
  code: String(error?.code || ''),
  message: String(error?.message || '').trim(),
  retryable: error?.retryable === true
})

const tasksAuthError = computed(() => !!tasksError.value && isPointsAuthError(tasksError.value))
const tasksFeatureDisabled = computed(() => !!tasksError.value && isPointsFeatureDisabled(tasksError.value))
const taskItems = computed(() => (tasks.value ? tasks.value.tasks : []))
const completedCount = computed(() => taskItems.value.filter((task) => task.completed).length)

/** 加载每日任务（能力闸门未开时不发请求；等待期间闸门关闭则丢弃结果） */
const loadTasks = async () => {
  if (!props.dailyTasksEnabled) {
    tasks.value = null
    tasksError.value = null
    return
  }
  tasksLoading.value = true
  tasksError.value = null
  try {
    const snapshot = await fetchPointsDailyTasks({ apiBase: props.apiBase })
    if (!props.dailyTasksEnabled) return
    tasks.value = snapshot
  } catch (error) {
    if (!props.dailyTasksEnabled) return
    tasks.value = null
    tasksError.value = toViewError(error)
  } finally {
    tasksLoading.value = false
  }
}

/** 任务标题：已知 task_id 用本地 i18n，未知回落服务端 title（不展示 task_id） */
const taskTitle = (task) => {
  const key = dailyTaskTitleI18nKey(task?.taskId)
  return key ? t(key) : String(task?.title || '').trim() || t('gameCenter.points.tasksTitle')
}

const taskPercent = (task) => taskProgressPercent(task?.progress, task?.target)

// 闸门打开（能力探测完成 / 远程配置就绪）后补加载此前被挡住的请求
watch(
  () => props.dailyTasksEnabled,
  (enabled) => {
    if (enabled && !tasks.value && !tasksLoading.value) void loadTasks()
  }
)

onMounted(() => {
  void loadTasks()
})
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
      <!-- 经济未开放（flag 关 或 capabilities.wallet !== true）：整块隐藏而不是展示会报错的卡片
           （协议 §5 REWARD_DISABLED client_action） -->
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

    <!-- 每日任务：flag 与服务端能力（/meta.capabilities.daily_tasks）双门；不可用时整卡隐藏。
         #966：卡内接真实数据（fetchPointsDailyTasks），降级模式与积分中心 Tab 一致 -->
    <section v-if="props.dailyTasksEnabled" class="gc-card" data-section="daily-tasks">
      <header class="gc-card__header">
        <h3 class="gc-card__title">{{ t('gameCenter.home.tasksTitle') }}</h3>
        <span v-if="taskItems.length" class="gc-card__meta">
          {{ tf('gameCenter.home.tasksCompletedCount', { done: completedCount, total: taskItems.length }) }}
        </span>
      </header>
      <p v-if="tasksFeatureDisabled" class="gc-card__hint">{{ t('gameCenter.points.tasksDisabled') }}</p>
      <p v-else-if="tasksAuthError" class="gc-card__hint">{{ t('gameCenter.points.signInRequired') }}</p>
      <GameCenterNotice
        v-else-if="tasksError"
        tone="warning"
        :title="t('gameCenter.points.loadFailed')"
        :message="tasksError.message || t('gameCenter.points.loadFailed')"
        :action-text="t('gameCenter.points.retry')"
        :busy="tasksLoading"
        @action="loadTasks"
      />
      <p v-else-if="tasksLoading && !tasks" class="gc-card__hint">{{ t('gameCenter.points.loading') }}</p>
      <ul v-else-if="taskItems.length" class="gc-task-list">
        <li
          v-for="task in taskItems"
          :key="task.taskId"
          class="gc-task"
          :class="{ 'gc-task--done': task.completed }"
        >
          <div class="gc-task__head">
            <span class="gc-task__title">{{ taskTitle(task) }}</span>
            <span class="gc-task__status">
              {{ task.completed ? t('gameCenter.points.rewardGranted') : tf('gameCenter.points.taskProgressValue', { progress: task.progress, target: task.target }) }}
            </span>
          </div>
          <div
            class="gc-task__track"
            role="progressbar"
            :aria-label="taskTitle(task)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="taskPercent(task)"
          >
            <div class="gc-task__fill" :style="{ width: `${taskPercent(task)}%` }"></div>
          </div>
        </li>
      </ul>
      <p v-else-if="tasks" class="gc-card__hint">{{ t('gameCenter.points.tasksEmpty') }}</p>
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

.gc-card__meta {
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.gc-task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gc-task {
  padding: 10px;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.08);
}

.gc-task--done {
  background: color-mix(in oklab, var(--ui-primary-soft, rgba(59, 130, 246, 0.12)) 70%, transparent);
}

.gc-task__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.gc-task__title {
  font-size: calc(13px * var(--ui-font-scale, 1));
  font-weight: 600;
  color: var(--ui-text, #1f2937);
}

.gc-task__status {
  flex: 0 0 auto;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
  font-variant-numeric: tabular-nums;
}

.gc-task--done .gc-task__status {
  color: var(--ui-success, #16a34a);
}

.gc-task__track {
  height: 6px;
  margin-top: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.24);
  overflow: hidden;
}

.gc-task__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--ui-primary, #3b82f6);
  transition: width var(--ui-duration-normal, 0.2s) var(--ui-ease-out, ease-out);
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
