<script setup>
/**
 * 湖工游乐场（Game Center，#905）。
 *
 * 定位：iOS / Android 游戏业务层的**统一入口**，第一阶段与经典游戏入口并存。
 *
 * 关键决策：
 * 1. 能力开关全部来自既有 remote_config 的 `game_platform` 块（见 utils/game_center/flags.ts），
 *    关闭即前置隐藏，不发请求、不出现「可见但必然报错」；
 * 2. 未交付能力：#909（经济/赛季）→ game_economy_enabled / game_verified_session_enabled 默认关；
 *    #910（漂流瓶）→ drift_bottle_enabled 默认关，且整 Tab 不挂载；
 * 3. **capability-driven（P1-1）**：flag 只表达「产品想不想要」，不能用它决定渲染。
 *    UI 显隐一律是 **flag && /meta.capabilities** 的 AND：
 *    拿不到 /meta 或字段缺失 → capabilities 保守 false → 相关入口前置隐藏、不发请求，
 *    而不是「请求后 404 再报错」。经典榜走 Legacy 通道，不受 V2 capabilities 影响。
 * 4. 游戏启动复用既有 module 打开链路（一次性开局意图 → 更多页既有链路），
 *    本组件不复制 manifest/缓存/bundle 状态机；
 * 5. 排行榜渲染前经 PII 白名单过滤（协议 §9.3：禁止展示学号）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { TPageHeader } from './templates'
import GameCenterHomeTab from './game-center/GameCenterHomeTab.vue'
import GameCenterGamesTab from './game-center/GameCenterGamesTab.vue'
import GameCenterRankTab from './game-center/GameCenterRankTab.vue'
import GameCenterDriftTab from './game-center/GameCenterDriftTab.vue'
import GameCenterMeTab from './game-center/GameCenterMeTab.vue'
import GameCenterNotice from './game-center/GameCenterNotice.vue'
import { useI18n } from '../utils/app_i18n'
import { fetchRemoteConfig } from '../utils/remote_config.js'
import { buildModuleCenterCards, normalizeModuleCenterChannel } from '../utils/module_center.js'
import { getLocalModuleState, resolveModuleChannel } from '../utils/more_modules.js'
import {
  DEFAULT_GAME_CENTER_FLAGS,
  resolveEffectiveGameCenterFlags
} from '../utils/game_center/flags'
import { GAME_CENTER_GAME_IDS } from '../utils/game_center/launch'
import { requestGameOpen } from '../utils/game_center/pending_open'
import { readCachedPlayerProfile } from '../utils/game_center/profile'
import {
  EMPTY_GAME_PLATFORM_CAPABILITIES,
  fetchClassicLeaderboard,
  fetchGameLeaderboards,
  fetchGamePlatformMeta,
  fetchGamePlayerWallet
} from '../utils/game_center/api'
import {
  normalizeGamePlatformLeaderboard,
  normalizeLegacyLeaderboard
} from '../utils/game_center/leaderboard'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'navigate'])

const { t } = useI18n()

const DEFAULT_FLAGS = {
  ...DEFAULT_GAME_CENTER_FLAGS,
  api_base: '',
  allowed_game_origins: []
}

const flags = ref({ ...DEFAULT_FLAGS })
/**
 * 服务端能力表（P1-1 双层闸门第二层）。
 * 初值＝保守 false：探测 `/meta` 之前**一切能力都不可用** → 相关入口先隐藏，绝不先发请求。
 */
const capabilities = ref({ ...EMPTY_GAME_PLATFORM_CAPABILITIES })
const flagsLoaded = ref(false)
const activeTab = ref('home')
const games = ref([])
const selectedGameId = ref(GAME_CENTER_GAME_IDS[0])
const profile = ref({ name: '', className: '', schoolName: '' })
const classicBoard = ref(null)
const boardLoading = ref(false)
const boardError = ref('')
const verifiedBoard = ref(null)
const verifiedError = ref('')
const wallet = ref(null)
const platformNotice = ref('')

const safeText = (value) => String(value ?? '').trim()

/**
 * 双层闸门：flag（产品开关，远程可回滚）AND capability（端点**真的实现了**）。
 *
 * 关键决策：不做成两个 prop 让子组件自己判断 —— 由本组件收敛为单一布尔，
 * 子组件只负责「不可用就不渲染」，避免同一判据在多处漂移。
 * 注意：下面这些名字沿用了既有 prop 契约（economyEnabled / verifiedEnabled），
 * 语义已升级为 AND 结果。
 */
const economyEnabled = computed(
  () => flags.value.game_economy_enabled === true && capabilities.value.wallet === true
)
const verifiedEnabled = computed(
  () => flags.value.game_verified_session_enabled === true && capabilities.value.leaderboards === true
)
const driftEnabled = computed(
  () => flags.value.drift_bottle_enabled === true && capabilities.value.drift_bottle === true
)
const dailyTasksEnabled = computed(
  () => flags.value.game_daily_tasks_enabled === true && capabilities.value.daily_tasks === true
)
const gomokuCompetitiveEnabled = computed(
  () => flags.value.gomoku_competitive_enabled === true && capabilities.value.gomoku_match === true
)
const verifiedRewardEnabled = computed(
  () => flags.value.verified_reward_enabled === true && capabilities.value.verified_reward === true
)

/**
 * 是否需要探测 `/meta`：仅当任一 V2 能力 flag 打开时才需要。
 * 纯经典模式（全部 V2 flag 关闭）不产生额外请求，保持既有「兼容模式」提示。
 */
const requiresCapabilities = computed(
  () =>
    flags.value.game_verified_session_enabled === true ||
    flags.value.game_economy_enabled === true ||
    flags.value.game_daily_tasks_enabled === true ||
    flags.value.gomoku_competitive_enabled === true ||
    flags.value.drift_bottle_enabled === true ||
    flags.value.verified_reward_enabled === true
)

/** 五个 Tab；漂流瓶未交付时**整项不出现**（feature-gate 隐藏而非可见后报错） */
const tabs = computed(() => {
  const list = [
    { key: 'home', label: t('gameCenter.tabs.home'), icon: '🏠' },
    { key: 'games', label: t('gameCenter.tabs.games'), icon: '🎮' },
    { key: 'rank', label: t('gameCenter.tabs.rank'), icon: '🏆' }
  ]
  if (driftEnabled.value) {
    list.push({ key: 'drift', label: t('gameCenter.tabs.drift'), icon: '🍾' })
  }
  list.push({ key: 'me', label: t('gameCenter.tabs.me'), icon: '👤' })
  return list
})

const resolveErrorMessage = (error) => {
  const message = safeText(error?.message)
  return message || t('gameCenter.rank.loadFailed')
}

const gameCardStatus = (moduleId) => {
  const local = getLocalModuleState(moduleId)
  return safeText(local?.version) ? t('more.status.ready') : t('more.status.notDownloaded')
}

const recommendGames = computed(() => games.value.slice(0, 3))
const recentGames = computed(() =>
  games.value.filter((item) => safeText(getLocalModuleState(item.id)?.version)).slice(0, 3)
)

const applyFlags = (config) => {
  flags.value = resolveEffectiveGameCenterFlags(config)
  flagsLoaded.value = true
}

/**
 * 能力可用性探测（issue #905 降级 UX + P1-1 双层闸门）：
 * - 没有任何 V2 flag 打开 → 当前就是兼容模式，不产生额外请求；
 * - 有 V2 flag → 读 `/meta.capabilities`：拿到后刷新当前 Tab 此前被闸门挡住的按需加载；
 *   探测失败 / 字段缺失 → 能力表保持保守 false，相关入口继续**前置隐藏**（不发必然失败的请求）。
 */
const refreshPlatformAvailability = async () => {
  if (!requiresCapabilities.value) {
    platformNotice.value = t('gameCenter.status.compatibilityMode')
    return
  }
  try {
    const meta = await fetchGamePlatformMeta(flags.value.api_base)
    capabilities.value = { ...meta.capabilities }
    platformNotice.value = ''
    // 能力表到位后补齐当前 Tab 的按需数据（此前被 capability 闸门挡住的请求在这里补发一次）
    if (activeTab.value === 'rank') await loadVerifiedBoard()
    if (activeTab.value === 'me') await loadWalletIfEnabled()
  } catch {
    capabilities.value = { ...EMPTY_GAME_PLATFORM_CAPABILITIES }
    platformNotice.value = t('gameCenter.status.compatibilityMode')
  }
}

const loadGames = async () => {
  const channel = normalizeModuleCenterChannel(await resolveModuleChannel(), 'main')
  games.value = buildModuleCenterCards({ channel })
    .filter((item) => GAME_CENTER_GAME_IDS.includes(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      icon: item.icon,
      description: item.description,
      statusText: gameCardStatus(item.id),
      kind: item.kind
    }))
}

/** 钱包 / Verified 榜的在途标记：能力表到位补发 + Tab 切换可能并发触发，避免重复请求 */
let walletInFlight = false
let verifiedInFlight = false

const loadWalletIfEnabled = async () => {
  if (!economyEnabled.value) {
    wallet.value = null
    return
  }
  if (walletInFlight) return
  walletInFlight = true
  try {
    const payload = await fetchGamePlayerWallet(flags.value.api_base)
    // 等待期间闸门若被关闭（远程配置回滚 / 能力探测失败），丢弃本次结果
    if (!economyEnabled.value) {
      wallet.value = null
      return
    }
    const source =
      payload.wallet && typeof payload.wallet === 'object'
        ? payload.wallet
        : payload.data && typeof payload.data === 'object'
          ? payload.data
          : payload
    wallet.value = {
      level: source.level ?? source.player_level ?? null,
      xp: source.xp ?? source.xp_total ?? null,
      coins: source.coins ?? source.coin_balance ?? null
    }
  } catch {
    // 经济不可用不应阻塞游戏：保持隐藏，不进错误态
    wallet.value = null
  } finally {
    walletInFlight = false
  }
}

const loadClassicBoard = async () => {
  boardLoading.value = true
  boardError.value = ''
  try {
    const className = safeText(profile.value.className)
    const payload = await fetchClassicLeaderboard({
      gameId: selectedGameId.value,
      scope: className ? 'class' : 'school',
      studentId: safeText(props.studentId),
      className,
      schoolName: safeText(profile.value.schoolName) || '湖北工业大学',
      limit: 20
    })
    classicBoard.value = normalizeLegacyLeaderboard(payload, {
      gameId: selectedGameId.value,
      selfStudentId: safeText(props.studentId),
      selfPlayerName: safeText(profile.value.name)
    })
  } catch (error) {
    classicBoard.value = null
    boardError.value = resolveErrorMessage(error)
  } finally {
    boardLoading.value = false
  }
}

const loadVerifiedBoard = async () => {
  if (!verifiedEnabled.value) {
    verifiedBoard.value = null
    verifiedError.value = ''
    return
  }
  if (verifiedInFlight) return
  verifiedInFlight = true
  try {
    const payload = await fetchGameLeaderboards({
      gameId: selectedGameId.value,
      board: 'verified',
      scope: 'school',
      limit: 20,
      apiBase: flags.value.api_base
    })
    // 等待期间闸门若被关闭（能力探测失败 / flag 回滚），丢弃本次结果
    if (!verifiedEnabled.value) {
      verifiedBoard.value = null
      verifiedError.value = ''
      return
    }
    verifiedBoard.value = normalizeGamePlatformLeaderboard(payload, {
      gameId: selectedGameId.value,
      board: 'verified'
    })
    verifiedError.value = ''
  } catch (error) {
    verifiedBoard.value = null
    verifiedError.value = resolveErrorMessage(error)
  } finally {
    verifiedInFlight = false
  }
}

const loadBoards = async () => {
  await loadClassicBoard()
  await loadVerifiedBoard()
}

const handleSelectGame = async (gameId) => {
  const next = safeText(gameId)
  if (!next || next === selectedGameId.value) return
  selectedGameId.value = next
  await loadBoards()
}

const handleRetry = async () => {
  await loadBoards()
}

/**
 * 打开游戏：登记一次性意图 + 回到「更多」页，由既有链路完成打开。
 * 复用而非复制，保证与经典入口 100% 同行为（含缓存/降级/埋点）。
 */
const handleOpenGame = (gameId) => {
  if (!requestGameOpen(gameId)) return
  emit('navigate', 'more')
}

const handleTabChange = (tabKey) => {
  if (tabKey === activeTab.value) return
  activeTab.value = tabKey
}

watch(activeTab, (next) => {
  if (next === 'rank' || next === 'me') {
    if (!classicBoard.value && !boardLoading.value) void loadBoards()
    if (next === 'me') void loadWalletIfEnabled()
  }
})

onMounted(async () => {
  profile.value = readCachedPlayerProfile(props.studentId, GAME_CENTER_GAME_IDS)
  // 先用本地渠道把游戏列表渲染出来（不阻塞首屏），再拉远程配置更新能力开关
  await loadGames()
  void (async () => {
    try {
      applyFlags(await fetchRemoteConfig({ force: false }))
    } catch {
      applyFlags(null)
    }
    // 紧急回滚：开关关闭时不再停留（深链 / 历史恢复也能收敛回「更多」页）
    if (flags.value.game_center_enabled !== true) {
      emit('navigate', 'more')
      return
    }
    await refreshPlatformAvailability()
    if (activeTab.value === 'rank' || activeTab.value === 'me') await loadBoards()
  })()
})
</script>

<template>
  <div class="game-center-view">
    <TPageHeader :title="t('gameCenter.title')" @back="emit('back')" />

    <div class="game-center-view__body">
      <GameCenterNotice
        v-if="platformNotice"
        tone="info"
        :title="t('gameCenter.status.noticeTitle')"
        :message="platformNotice"
      />
      <p v-if="!flagsLoaded" class="game-center-view__loading">{{ t('gameCenter.loading') }}</p>

      <nav class="game-center-tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="game-center-tabs__item"
          :class="{ 'game-center-tabs__item--active': tab.key === activeTab }"
          type="button"
          role="tab"
          :aria-selected="tab.key === activeTab ? 'true' : 'false'"
          :data-tab="tab.key"
          @click="handleTabChange(tab.key)"
        >
          <span aria-hidden="true">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </nav>

      <div class="game-center-view__panel">
        <GameCenterHomeTab
          v-if="activeTab === 'home'"
          :profile="profile"
          :economy-enabled="economyEnabled"
          :daily-tasks-enabled="dailyTasksEnabled"
          :recent-games="recentGames"
          :recommended-games="recommendGames"
          @open-game="handleOpenGame"
        />
        <GameCenterGamesTab
          v-else-if="activeTab === 'games'"
          :games="games"
          :gomoku-competitive-enabled="gomokuCompetitiveEnabled"
          @open-game="handleOpenGame"
        />
        <GameCenterRankTab
          v-else-if="activeTab === 'rank'"
          :games="games"
          :selected-game-id="selectedGameId"
          :classic-board="classicBoard"
          :loading="boardLoading"
          :error-message="boardError"
          :verified-enabled="verifiedEnabled"
          :verified-reward-enabled="verifiedRewardEnabled"
          :verified-board="verifiedBoard"
          :verified-error="verifiedError"
          @select-game="handleSelectGame"
          @retry="handleRetry"
        />
        <GameCenterDriftTab v-else-if="activeTab === 'drift' && driftEnabled" />
        <GameCenterMeTab
          v-else-if="activeTab === 'me'"
          :profile="profile"
          :games="games"
          :selected-game-id="selectedGameId"
          :self-best="classicBoard?.self || null"
          :wallet="wallet"
          :economy-enabled="economyEnabled"
          :loading="boardLoading"
          :error-message="boardError"
          @select-game="handleSelectGame"
          @retry="handleRetry"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-center-view {
  min-height: calc(var(--app-vh, 1vh) * 100);
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-gradient, #f0f4f8);
  padding-bottom: 80px;
}

.game-center-view__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 16px 0;
}

.game-center-view__loading {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale, 1));
  color: var(--ui-muted, #64748b);
}

.game-center-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface, #fff) 92%, #fff 8%);
}

.game-center-tabs__item {
  flex: 1 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-muted, #64748b);
  font-size: calc(12px * var(--ui-font-scale, 1));
  font-weight: 600;
  cursor: pointer;
}

.game-center-tabs__item--active {
  background: var(--ui-primary, #3b82f6);
  color: #fff;
}

.game-center-view__panel {
  display: flex;
  flex-direction: column;
}
</style>
