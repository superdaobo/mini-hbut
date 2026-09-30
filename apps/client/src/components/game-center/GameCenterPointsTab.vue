<script setup>
/**
 * 游乐场「积分中心」Tab（#909 契约 §2.1 / §2.4）。
 *
 * 数据流（自加载，不依赖父级预取）：
 * - `utils/game_center/points.ts` 是**唯一**网络入口（组件不直接 import api.ts）；
 * - 三块数据各自独立状态机：钱包（含今日进度 / 每日上限）、每日任务、账本；
 * - 账本用契约的 `limit`/`cursor` 分页，支持「加载更多」并按键去重。
 *
 * 降级（契约 §4.1：禁止白屏、禁止 `--` 占位）：
 * - 能力关闭（双闸门未开）→ 顶部占位提示，**不发任何请求**；
 * - 未登录 / 需重新授权 → 提示登录（不展示重试按钮，重试不会成功）；
 * - 网络 / 服务端失败 → 警告条 + 重试按钮（可重试）；
 * - 每日任务服务端返回 404 FEATURE_DISABLED → 占位文案而不是错误。
 *
 * PII：展示模型由 points.ts 白名单归一化，组件只渲染契约字段
 * （level / xp / coin / 任务进度 / reason_code / 金额 / 时间戳），
 * 绝不渲染 student_id / sub / user_id。
 */
import { computed, onMounted, ref, watch } from 'vue'
import GameCenterNotice from './GameCenterNotice.vue'
import { tf, useI18n } from '../../utils/app_i18n'
import {
  LEDGER_DEFAULT_LIMIT,
  dailyTaskTitleI18nKey,
  fetchPointsDailyTasks,
  fetchPointsLedger,
  fetchPointsWallet,
  formatDelta,
  formatPointsTimestamp,
  isPointsAuthError,
  isPointsFeatureDisabled,
  ledgerEntryTypeI18nKey,
  ledgerReasonI18nKey,
  levelProgressPercent,
  mergeLedgerEntries,
  rewardStatusI18nKey,
  taskProgressPercent
} from '../../utils/game_center/points'

const props = defineProps({
  /** 远程配置下发的 API base（缺省走环境默认源） */
  apiBase: { type: String, default: '' },
  /** 经济双闸门结果（game_economy_enabled && capabilities.wallet），由父级收敛 */
  walletEnabled: { type: Boolean, default: false },
  /** 每日任务双闸门结果（game_daily_tasks_enabled && capabilities.daily_tasks） */
  dailyTasksEnabled: { type: Boolean, default: false },
  /** 账本分页大小（契约默认 20，上限由 points.ts 夹紧到 100） */
  ledgerPageSize: { type: Number, default: LEDGER_DEFAULT_LIMIT }
})

const { t } = useI18n()

const wallet = ref(null)
const walletLoading = ref(false)
const walletError = ref(null)

const tasks = ref(null)
const tasksLoading = ref(false)
const tasksError = ref(null)

const ledgerItems = ref([])
const ledgerLoading = ref(false)
const ledgerError = ref(null)
const ledgerNextCursor = ref('')
const ledgerLoadingMore = ref(false)

/** 把任意抛出物归一化为可渲染的错误视图模型（不泄漏原始异常对象） */
const toViewError = (error) => ({
  code: String(error?.code || ''),
  message: String(error?.message || '').trim(),
  retryable: error?.retryable === true
})

const errorText = (error) => error?.message || t('gameCenter.points.loadFailed')

const walletAuthError = computed(() => !!walletError.value && isPointsAuthError(walletError.value))
const tasksAuthError = computed(() => !!tasksError.value && isPointsAuthError(tasksError.value))
const tasksFeatureDisabled = computed(() => !!tasksError.value && isPointsFeatureDisabled(tasksError.value))
const ledgerAuthError = computed(() => !!ledgerError.value && isPointsAuthError(ledgerError.value))

const levelPercent = computed(() => (wallet.value ? levelProgressPercent(wallet.value.levelCurve) : 0))
const ledgerEmpty = computed(
  () => !ledgerLoading.value && !ledgerError.value && ledgerItems.value.length === 0
)

/** 加载钱包；等待期间闸门关闭则丢弃结果（防止远程回滚后被过期响应写回） */
const loadWallet = async () => {
  if (!props.walletEnabled) {
    wallet.value = null
    walletError.value = null
    return
  }
  walletLoading.value = true
  walletError.value = null
  try {
    const snapshot = await fetchPointsWallet({ apiBase: props.apiBase })
    if (!props.walletEnabled) return
    wallet.value = snapshot
  } catch (error) {
    if (!props.walletEnabled) return
    wallet.value = null
    walletError.value = toViewError(error)
  } finally {
    walletLoading.value = false
  }
}

/** 加载每日任务（能力闸门未开时不发请求） */
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

/** 账本第一页（重试入口）；未登录 / 服务端失败都保留可读错误状态 */
const loadLedger = async () => {
  if (!props.walletEnabled) {
    ledgerItems.value = []
    ledgerNextCursor.value = ''
    ledgerError.value = null
    return
  }
  ledgerLoading.value = true
  ledgerError.value = null
  try {
    const page = await fetchPointsLedger({ apiBase: props.apiBase, limit: props.ledgerPageSize })
    if (!props.walletEnabled) return
    ledgerItems.value = page.items
    ledgerNextCursor.value = page.nextCursor
  } catch (error) {
    if (!props.walletEnabled) return
    ledgerItems.value = []
    ledgerNextCursor.value = ''
    ledgerError.value = toViewError(error)
  } finally {
    ledgerLoading.value = false
  }
}

/** 账本追加页：游标来自服务端（不透明，客户端不解析），合并时按键去重 */
const loadMoreLedger = async () => {
  const cursor = ledgerNextCursor.value
  if (!cursor || ledgerLoadingMore.value || ledgerLoading.value) return
  ledgerLoadingMore.value = true
  ledgerError.value = null
  try {
    const page = await fetchPointsLedger({
      apiBase: props.apiBase,
      limit: props.ledgerPageSize,
      cursor
    })
    ledgerItems.value = mergeLedgerEntries(ledgerItems.value, page.items)
    ledgerNextCursor.value = page.nextCursor
  } catch (error) {
    // 追加失败不清空已加载内容（只提示本次失败，重试按钮复用 loadMoreLedger）
    ledgerError.value = toViewError(error)
  } finally {
    ledgerLoadingMore.value = false
  }
}

/** 任务标题：已知 task_id 用本地 i18n，未知回落服务端 title（不展示 task_id） */
const taskTitle = (task) => {
  const key = dailyTaskTitleI18nKey(task?.taskId)
  return key ? t(key) : String(task?.title || '').trim() || t('gameCenter.points.tasksTitle')
}

/** 奖励发放状态（枚举封闭；未识别按「未发放」处理，绝不显示原始机器码） */
const taskRewardStatusText = (task) => {
  const key = rewardStatusI18nKey(task?.rewardStatus)
  return key ? t(key) : t('gameCenter.points.rewardNone')
}

const taskPercent = (task) => taskProgressPercent(task?.progress, task?.target)

const reasonText = (entry) => {
  const key = ledgerReasonI18nKey(entry?.reasonCode)
  return key ? t(key) : t('gameCenter.points.reason.unknown')
}

const entryTypeText = (entry) => {
  const key = ledgerEntryTypeI18nKey(entry?.entryType)
  return key ? t(key) : t('gameCenter.points.entryType.unknown')
}

/** 金额正负样式（正=成功色 / 负=危险色 / 0=静默） */
const deltaClass = (value) => {
  const num = Number(value) || 0
  if (num > 0) return 'is-positive'
  if (num < 0) return 'is-negative'
  return 'is-zero'
}

const capText = (cap) => (cap === null || cap === undefined ? t('gameCenter.points.capUnlimited') : String(cap))

// 闸门打开（能力探测完成 / 远程配置就绪）后补加载此前被挡住的块
watch(
  () => [props.walletEnabled, props.dailyTasksEnabled],
  ([walletOn, tasksOn]) => {
    if (walletOn && !wallet.value && !walletLoading.value) void loadWallet()
    if (walletOn && !ledgerItems.value.length && !ledgerLoading.value && !ledgerError.value && !ledgerNextCursor.value) {
      void loadLedger()
    }
    if (tasksOn && !tasks.value && !tasksLoading.value) void loadTasks()
  }
)

onMounted(() => {
  void loadWallet()
  void loadTasks()
  void loadLedger()
})
</script>

<template>
  <div class="gc-points">
    <!-- 能力关闭：前置占位，不发任何请求（契约 §4.1 禁止「可见但必然报错」） -->
    <GameCenterNotice
      v-if="!props.walletEnabled"
      tone="info"
      :title="t('gameCenter.points.title')"
      :message="t('gameCenter.points.walletDisabled')"
    />

    <template v-else>
      <!-- 钱包失败：认证类只提示登录；其余给重试 -->
      <GameCenterNotice
        v-if="walletAuthError"
        tone="info"
        :title="t('gameCenter.points.loadFailed')"
        :message="t('gameCenter.points.signInRequired')"
      />
      <GameCenterNotice
        v-else-if="walletError"
        tone="warning"
        :title="t('gameCenter.points.loadFailed')"
        :message="errorText(walletError)"
        :action-text="t('gameCenter.points.retry')"
        :busy="walletLoading"
        @action="loadWallet"
      />

      <p v-if="walletLoading && !wallet" class="gc-card__hint">{{ t('gameCenter.points.loading') }}</p>

      <!-- 1) 总览：Level / XP 总量 / 湖工币 / 升级进度 -->
      <section v-if="wallet" class="gc-card" data-section="points-overview">
        <header class="gc-card__header">
          <h3 class="gc-card__title">{{ t('gameCenter.points.title') }}</h3>
          <span class="gc-card__meta">{{ t('gameCenter.points.totalXp') }}</span>
        </header>
        <div class="gc-stat-grid">
          <div class="gc-stat">
            <span class="gc-stat__label">{{ t('gameCenter.points.level') }}</span>
            <strong class="gc-stat__value">Lv.{{ wallet.level }}</strong>
          </div>
          <div class="gc-stat">
            <span class="gc-stat__label">{{ t('gameCenter.points.totalXp') }}</span>
            <strong class="gc-stat__value">{{ wallet.xpTotal }}</strong>
          </div>
          <div class="gc-stat">
            <span class="gc-stat__label">{{ t('gameCenter.points.coins') }}</span>
            <strong class="gc-stat__value">{{ wallet.coinBalance }}</strong>
          </div>
        </div>
        <div class="gc-progress" data-role="level-progress">
          <span class="gc-progress__label">{{ t('gameCenter.points.levelProgress') }}</span>
          <div
            class="gc-progress__track"
            role="progressbar"
            :aria-label="t('gameCenter.points.levelProgress')"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="levelPercent"
          >
            <div class="gc-progress__fill" :style="{ width: `${levelPercent}%` }"></div>
          </div>
          <span class="gc-progress__value">
            {{ tf('gameCenter.points.xpProgressValue', { into: wallet.levelCurve.xpIntoLevel, span: wallet.levelCurve.xpSpan }) }}
          </span>
        </div>
        <p v-if="wallet.levelCurve.xpForNext > 0" class="gc-card__note">
          {{ tf('gameCenter.points.xpForNextValue', { n: wallet.levelCurve.xpForNext }) }}
        </p>
        <!-- 服务端声明经济关闭：只提示，不隐藏历史余额（历史数据依然有效） -->
        <p v-if="!wallet.economyEnabled" class="gc-card__note">{{ t('gameCenter.points.walletDisabled') }}</p>
      </section>

      <!-- 2) 今日进度与每日上限 -->
      <section v-if="wallet" class="gc-card" data-section="points-today">
        <header class="gc-card__header">
          <h3 class="gc-card__title">{{ t('gameCenter.points.todayTitle') }}</h3>
          <span v-if="wallet.today.date" class="gc-card__meta">{{ wallet.today.date }}</span>
        </header>
        <div class="gc-stat-grid">
          <div class="gc-stat">
            <span class="gc-stat__label">{{ t('gameCenter.points.todayXp') }}</span>
            <strong class="gc-stat__value">{{ wallet.today.xpGained }}</strong>
          </div>
          <div class="gc-stat">
            <span class="gc-stat__label">{{ t('gameCenter.points.todayCoins') }}</span>
            <strong class="gc-stat__value">{{ wallet.today.coinGained }}</strong>
          </div>
          <div class="gc-stat">
            <span class="gc-stat__label">{{ t('gameCenter.points.todayRuns') }}</span>
            <strong class="gc-stat__value">{{ wallet.today.runCount }}</strong>
          </div>
        </div>
        <dl class="gc-points__caps">
          <div class="gc-points__cap">
            <dt>{{ t('gameCenter.points.capXp') }}</dt>
            <dd>{{ capText(wallet.dailyCaps.xpCap) }}</dd>
          </div>
          <div class="gc-points__cap">
            <dt>{{ t('gameCenter.points.capCoins') }}</dt>
            <dd>{{ capText(wallet.dailyCaps.coinCap) }}</dd>
          </div>
          <div class="gc-points__cap">
            <dt>{{ t('gameCenter.points.capRuns') }}</dt>
            <dd>{{ capText(wallet.dailyCaps.runCap) }}</dd>
          </div>
        </dl>
      </section>

      <!-- 3) 每日任务（能力双闸门；服务端 404 时是占位而不是错误） -->
      <section v-if="props.dailyTasksEnabled" class="gc-card" data-section="points-tasks">
        <header class="gc-card__header">
          <h3 class="gc-card__title">{{ t('gameCenter.points.tasksTitle') }}</h3>
          <span v-if="tasks && tasks.date" class="gc-card__meta">{{ tasks.date }}</span>
        </header>
        <p v-if="tasksFeatureDisabled" class="gc-card__hint">{{ t('gameCenter.points.tasksDisabled') }}</p>
        <p v-else-if="tasksAuthError" class="gc-card__hint">{{ t('gameCenter.points.signInRequired') }}</p>
        <GameCenterNotice
          v-else-if="tasksError"
          tone="warning"
          :title="t('gameCenter.points.loadFailed')"
          :message="errorText(tasksError)"
          :action-text="t('gameCenter.points.retry')"
          :busy="tasksLoading"
          @action="loadTasks"
        />
        <p v-else-if="tasksLoading && !tasks" class="gc-card__hint">{{ t('gameCenter.points.loading') }}</p>
        <ul v-else-if="tasks && tasks.tasks.length" class="gc-task-list">
          <li
            v-for="task in tasks.tasks"
            :key="task.taskId"
            class="gc-task"
            :class="{ 'gc-task--done': task.completed }"
          >
            <div class="gc-task__head">
              <span class="gc-task__title">{{ taskTitle(task) }}</span>
              <span class="gc-task__status">{{ taskRewardStatusText(task) }}</span>
            </div>
            <div class="gc-progress gc-progress--compact">
              <div
                class="gc-progress__track"
                role="progressbar"
                :aria-label="taskTitle(task)"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="taskPercent(task)"
              >
                <div class="gc-progress__fill" :style="{ width: `${taskPercent(task)}%` }"></div>
              </div>
              <span class="gc-progress__value">
                {{ tf('gameCenter.points.taskProgressValue', { progress: task.progress, target: task.target }) }}
              </span>
            </div>
            <div class="gc-task__reward">
              <span class="gc-task__reward-label">{{ t('gameCenter.points.taskReward') }}</span>
              <span class="gc-task__reward-value">+{{ task.rewardXp }} XP</span>
              <span class="gc-task__reward-value">+{{ task.rewardCoin }} {{ t('gameCenter.points.coins') }}</span>
            </div>
          </li>
        </ul>
        <p v-else-if="tasks" class="gc-card__hint">{{ t('gameCenter.points.tasksEmpty') }}</p>
      </section>

      <!-- 4) 最近账本（limit/cursor 分页；reason_code 中文化 + 正负号清晰） -->
      <section v-if="wallet" class="gc-card" data-section="points-ledger">
        <header class="gc-card__header">
          <h3 class="gc-card__title">{{ t('gameCenter.points.ledgerTitle') }}</h3>
          <span v-if="ledgerItems.length" class="gc-card__meta">
            {{ tf('gameCenter.points.ledgerCount', { n: ledgerItems.length }) }}
          </span>
        </header>
        <p v-if="ledgerLoading && !ledgerItems.length" class="gc-card__hint">{{ t('gameCenter.points.loading') }}</p>
        <p v-else-if="ledgerAuthError" class="gc-card__hint">{{ t('gameCenter.points.signInRequired') }}</p>
        <GameCenterNotice
          v-else-if="ledgerError && !ledgerItems.length"
          tone="warning"
          :title="t('gameCenter.points.loadFailed')"
          :message="errorText(ledgerError)"
          :action-text="t('gameCenter.points.retry')"
          :busy="ledgerLoading"
          @action="loadLedger"
        />
        <p v-else-if="ledgerEmpty" class="gc-card__hint">{{ t('gameCenter.points.ledgerEmpty') }}</p>
        <template v-else>
          <ul class="gc-ledger">
            <li v-for="entry in ledgerItems" :key="entry.key" class="gc-ledger__row">
              <div class="gc-ledger__main">
                <span class="gc-ledger__reason">{{ reasonText(entry) }}</span>
                <span class="gc-ledger__type">{{ entryTypeText(entry) }}</span>
              </div>
              <div class="gc-ledger__deltas">
                <span class="gc-ledger__delta" :class="deltaClass(entry.xpDelta)">
                  {{ formatDelta(entry.xpDelta) }} XP
                </span>
                <span class="gc-ledger__delta" :class="deltaClass(entry.coinDelta)">
                  {{ formatDelta(entry.coinDelta) }} {{ t('gameCenter.points.coins') }}
                </span>
              </div>
              <span class="gc-ledger__time">{{ formatPointsTimestamp(entry.createdAt) }}</span>
            </li>
          </ul>
          <!-- 追加页失败：保留已加载行，只提示本次失败 -->
          <GameCenterNotice
            v-if="ledgerError"
            tone="warning"
            :title="t('gameCenter.points.loadFailed')"
            :message="errorText(ledgerError)"
            :action-text="t('gameCenter.points.retry')"
            :busy="ledgerLoadingMore"
            @action="loadMoreLedger"
          />
          <button
            v-if="ledgerNextCursor"
            class="gc-points__more"
            type="button"
            :disabled="ledgerLoadingMore"
            @click="loadMoreLedger"
          >
            {{ ledgerLoadingMore ? t('gameCenter.points.ledgerLoadingMore') : t('gameCenter.points.ledgerLoadMore') }}
          </button>
        </template>
      </section>

      <p class="gc-points__policy">{{ t('gameCenter.points.piiNote') }}</p>
    </template>
  </div>
</template>

<style scoped>
.gc-points {
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

.gc-stat-grid {
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
  font-variant-numeric: tabular-nums;
}

.gc-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-progress--compact {
  margin-top: 6px;
}

.gc-progress__label {
  flex: 0 0 auto;
}

.gc-progress__track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.24);
  overflow: hidden;
}

.gc-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--ui-primary, #3b82f6);
  transition: width var(--ui-duration-normal, 0.2s) var(--ui-ease-out, ease-out);
}

.gc-progress__value {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text, #1f2937);
}

.gc-points__caps {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 10px 0 0;
}

.gc-points__cap {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: calc(11px * var(--ui-font-scale, 1));
}

.gc-points__cap dt {
  color: var(--ui-muted, #64748b);
}

.gc-points__cap dd {
  margin: 0;
  color: var(--ui-text, #1f2937);
  font-weight: 600;
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
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.gc-task__reward {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 6px;
  font-size: calc(11px * var(--ui-font-scale, 1));
}

.gc-task__reward-label {
  color: var(--ui-muted, #64748b);
}

.gc-task__reward-value {
  color: var(--ui-success, #16a34a);
  font-variant-numeric: tabular-nums;
}

.gc-ledger {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gc-ledger__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.08);
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-text, #1f2937);
}

.gc-ledger__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.gc-ledger__reason {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gc-ledger__type {
  font-size: calc(10px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
}

.gc-ledger__deltas {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.gc-ledger__delta.is-positive {
  color: var(--ui-success, #16a34a);
}

.gc-ledger__delta.is-negative {
  color: var(--ui-danger, #ef4444);
}

.gc-ledger__delta.is-zero {
  color: var(--ui-muted, #94a3b8);
}

.gc-ledger__time {
  flex: 0 0 auto;
  font-size: calc(10px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.gc-points__more {
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

.gc-points__more:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gc-points__policy {
  margin: 0;
  font-size: calc(11px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #94a3b8);
  line-height: 1.6;
}
</style>
