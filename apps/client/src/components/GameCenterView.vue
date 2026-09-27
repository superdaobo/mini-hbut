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
 * 3. 游戏启动复用既有 module 打开链路（一次性开局意图 → 更多页既有链路），
 *    本组件不复制 manifest/缓存/bundle 状态机；
 * 4. 排行榜渲染前经 PII 白名单过滤（协议 §9.3：禁止展示学号）。
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

const economyEnabled = computed(() => flags.value.game_economy_enabled === true)
const verifiedEnabled = computed(() => flags.value.game_verified_session_enabled === true)
const driftEnabled = computed(() => flags.value.drift_bottle_enabled === true)

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
 * 能力可用性提示（issue #905 降级 UX）：
 * - 未开启验证会话/经济 → 当前就是兼容模式，明确告知「不结算新奖励」；
 * - 已开启时探测 /meta，探测失败同样降级提示（不阻塞任何游戏入口）。
 */
const refreshPlatformAvailability = async () => {
  if (!verifiedEnabled.value && !economyEnabled.value) {
    platformNotice.value = t('gameCenter.status.compatibilityMode')
    return
  }
  try {
    await fetchGamePlatformMeta(flags.value.api_base)
    platformNotice.value = ''
  } catch {
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

const loadWalletIfEnabled = async () => {
  if (!economyEnabled.value) {
    wallet.value = null
    return
  }
  try {
    const payload = await fetchGamePlayerWallet(flags.value.api_base)
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
  try {
    const payload = await fetchGameLeaderboards({
      gameId: selectedGameId.value,
      board: 'verified',
      scope: 'school',
      limit: 20,
      apiBase: flags.value.api_base
    })
    verifiedBoard.value = normalizeGamePlatformLeaderboard(payload, {
      gameId: selectedGameId.value,
      board: 'verified'
    })
    verifiedError.value = ''
  } catch (error) {
    verifiedBoard.value = null
    verifiedError.value = resolveErrorMessage(error)
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
          :recent-games="recentGames"
          :recommended-games="recommendGames"
          @open-game="handleOpenGame"
        />
        <GameCenterGamesTab
          v-else-if="activeTab === 'games'"
          :games="games"
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
