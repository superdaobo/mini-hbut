/**
 * #905 湖工游乐场接线契约（仓库门禁）。
 *
 * 覆盖五类不可回退的约束：
 * 1. SDK 消息类型 / ticket query 参数与 `website/modules-src/_sdk` **逐字一致**（防止两侧漂移）；
 * 2. 宿主必须有 origin 校验（复制粘贴回来的旧实现会立刻失败）；
 * 3. 视图注册 / 导航 / app_store_policy 必须覆盖 `game_center`（防漏过滤）；
 * 4. 三语字典 key 集合一致（新增文案不得只加一种语言）；
 * 5. **capability-driven（P1-1）**：UI 显隐必须是 flag AND `/meta.capabilities`，
 *    未实现能力前置隐藏（不渲染、不发请求），而不是请求后 404 报错。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages, ensureLocaleMessages } from './app_i18n'
import { HOST_MESSAGE_TYPES } from './game_center/host_bridge'
import { GAME_CENTER_FLAG_KEYS } from './game_center/flags'

const repoRoot = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const sdkVersionSource = () => read('../../website/modules-src/_sdk/src/version.js')
const sdkHostBridgeSource = () => read('../../website/modules-src/_sdk/src/host-bridge.js')

describe('game center 接线契约（#905）', () => {
  it('宿主握手消息类型与 SDK HOST_MESSAGE_TYPES 逐字一致', () => {
    const sdk = sdkVersionSource()
    for (const value of Object.values(HOST_MESSAGE_TYPES)) {
      expect(sdk, `SDK 缺少消息类型 ${value}`).toContain(`'${value}'`)
    }
    expect(sdk).toContain("hello: 'mini-hbut:game-sdk:hello'")
    expect(sdk).toContain("welcome: 'mini-hbut:game-sdk:welcome'")
    expect(sdk).toContain("ticketRequest: 'mini-hbut:game-sdk:request-ticket'")
    expect(sdk).toContain("mode: 'mini-hbut:game-sdk:mode'")
    expect(sdk).toContain("LAUNCH_TICKET_QUERY_KEYS = Object.freeze(['gpt', 'ticket'])")
    // SDK 侧同样要求 origin 校验（两侧对称，任何一侧缺失都应失败）
    expect(sdkHostBridgeSource()).toContain('createHostOriginGuard')
    expect(sdkHostBridgeSource()).toContain('origin_rejected')
  })

  it('宿主 iframe 消息必须校验 event.origin（不能只看 event.source）', () => {
    const host = read('src/components/MoreModuleHostView.vue')
    expect(host).toContain('isGameFrameOriginAllowed')
    expect(host).toContain('event.source !== frameWindow')
    expect(host).toContain('frameAllowedOrigins')
    expect(host).toContain('resolveGameFrameAllowedOrigins')
    expect(host).toContain('createModuleHostBridge')
    expect(host).toContain('rebuildHostBridge')
    // 回应会话过期的恢复路径（协议 §6.2.3 策略 A）
    expect(host).toContain('refreshLaunchTicketForResume')
    expect(host).toContain('fetchGameLaunchTicket')
    // 远端失败可 retry / 切经典兼容模式
    expect(host).toContain('tryClassicFallback')
    expect(host).toContain('以兼容模式打开')
    // 原有安全嵌入约束不得回退
    expect(host).toContain('referrerpolicy="no-referrer-when-downgrade"')
    expect(host).toContain('loading="eager"')
    expect(host).toContain('mini-hbut:module-size')
  })

  it('local HTTP bridge 未被删除（非游戏业务仍依赖它）', () => {
    const core = read('src/utils/more_modules/core.js')
    expect(core).toContain('isLocalModuleBridgePreviewUrl')
    expect(core).toContain('module_bundle')
    // 桥地址形态仍是 127.0.0.1/localhost + /module_bundle/content/（未被 HTTPS-first 删除）
    expect(core).toMatch(/127\\\.0\\\.0\\\.1|localhost/)
    const escapedSlash = String.fromCharCode(92) + '/'
    expect(core).toContain(`module_bundle${escapedSlash}content`)
    const hostView = read('src/components/MoreModuleHostView.vue')
    expect(hostView).toContain('canUseLocalModuleBridgePreview')
    expect(hostView).toContain('recoverSchoolWebsiteBridgeOnResume')
  })

  it('#1002 更多页 = 总面板入口：经典游戏并入面板，不再在 App 内分类展示', () => {
    const more = read('src/components/MoreView.vue')
    // 点「更多」直接进入面板（复用既有模块打开链路，不复制状态机）
    expect(more).toContain("const PANEL_MODULE_ID = 'more_panel'")
    expect(more).toContain('launchPanel')
    expect(more).toContain('handleModuleClick')
    // 旧的分类展示已全部移除：游乐场主入口 / 快捷入口 / 可折叠经典宫格
    expect(more).not.toContain('data-module-id="game_center"')
    expect(more).not.toContain('data-module-id="classic_games"')
    expect(more).not.toContain('GameCenterQuickEntries')
    expect(more).not.toContain('classicExpanded')
    // 开局意图仍复用既有链路（面板宫格点击 → 宿主回退本页 → 打开目标游戏）
    expect(more).toContain('peekGameOpen')
    expect(more).toContain('consumeGameOpen')
    expect(more).toContain("activeLaunchSurface.value = 'game_center'")
    expect(more).toContain('launch_surface')
    // 转发骨架必须有明确失败态（不是无限转圈）
    expect(more).toContain('panelForwardFailed')
    expect(more).toContain("t('more.panel.failed')")
  })

  it('GameCenterView 五个 Tab，且未交付能力是 feature-gated（#910 漂流瓶已交付为真实 UI）', () => {
    const view = read('src/components/GameCenterView.vue')
    for (const tab of ['home', 'games', 'rank', 'drift', 'me']) {
      expect(view, `缺少 Tab ${tab}`).toContain(`'${tab}'`)
    }
    expect(view).toContain('driftEnabled')
    expect(view).toContain('economyEnabled')
    expect(view).toContain('verifiedEnabled')
    // 紧急回滚：开关关闭时自身收敛回「更多」页（深链 / 历史恢复也能兜住）
    expect(view).toMatch(/game_center_enabled !== true[\s\S]{0,80}emit\('navigate', 'more'\)/)
    // 未交付 / 未声明 Tab 整块不挂载（而不是可见后报错）
    expect(view).toMatch(/activeTab === 'drift' && driftEnabled/)

    const home = read('src/components/game-center/GameCenterHomeTab.vue')
    expect(home).toMatch(/v-if="props\.economyEnabled"/)
    const rank = read('src/components/game-center/GameCenterRankTab.vue')
    expect(rank).toContain('verifiedEnabled')
    expect(rank).toContain('verifiedPlaceholder')
    const me = read('src/components/game-center/GameCenterMeTab.vue')
    expect(me).toContain('economyDisabledNote')
    // #910 漂流瓶已从占位替换为真实 UI：看守闭环动作锚点与前置闸门（UGC 策略 + 登录态），
    // 且不得回退成占位文案。
    const drift = read('src/components/game-center/GameCenterDriftTab.vue')
    expect(drift).not.toContain('placeholderTitle')
    for (const anchor of [
      'data-action="draw"',
      'data-action="publish"',
      'data-action="claim"',
      'data-action="report-submit"',
      'data-action="hide"'
    ]) {
      expect(drift, `漂流瓶缺少动作锚点 ${anchor}`).toContain(anchor)
    }
    expect(drift).toContain('userGeneratedContent')
    expect(drift).toContain('gameCenter.drift.guestTitle')
  })

  it('视图注册 / 导航 / 预取均已覆盖 game_center', () => {
    const registry = read('src/app/viewRegistry.ts')
    expect(registry).toContain("const loadGameCenterView: Loader = () => import('../components/GameCenterView.vue')")
    expect(registry).toContain('game_center: createAsyncPage(loadGameCenterView)')
    expect(registry).toContain('game_center: loadGameCenterView')

    const app = read('src/App.vue')
    expect(app).toContain('game_center: GameCenterView')
    expect(app).toContain("v-else-if=\"currentView === 'game_center'\"")

    const nav = read('src/navigation/app_navigation.ts')
    expect(nav).toMatch(/ME_SUB_VIEWS\s*=\s*\[[\s\S]*'game_center'/)
    expect(nav).toMatch(/HIERARCHICAL_PARENT_VIEW_MAP[\s\S]*game_center:\s*'more'/)
  })

  it('app_store_policy 把 game_center 列入黑名单并给出理由', () => {
    const policy = read('src/config/app_store_policy.ts')
    expect(policy).toContain("'game_center'")
    expect(policy).toMatch(/APP_STORE_BLOCKED_MODULE_IDS[\s\S]*'game_center'/)
    expect(policy).toMatch(/#905 湖工游乐场[\s\S]*remoteModules/)
  })

  it('remote_config 走既有体系承载 game_platform 配置块', () => {
    const defaults = read('src/utils/remote_config_defaults.ts')
    expect(defaults).toContain("'game_platform'")
    expect(defaults).toContain('normalizeGamePlatformConfig')
    const config = read('src/utils/remote_config.ts')
    expect(config).toContain('game_platform: normalizeGamePlatformConfig(cfg.game_platform)')
    // 合规 guest/demo 下远程配置不得把游乐场重新打开
    expect(config).toMatch(/next\.game_platform\s*=\s*{[\s\S]*?enabled: false/)
  })

  it('五语言 key 集合一致：新增文案三语齐全', async () => {
    // #993：非默认语言字典改为按需加载，断言前显式预热
    await ensureLocaleMessages('en')
    await ensureLocaleMessages('ja')
    const zhKeys = Object.keys(messages['zh-CN'])
    const enKeys = Object.keys(messages.en)
    const jaKeys = Object.keys(messages.ja)
    const newKeys = zhKeys.filter((key) => key.startsWith('gameCenter.') || key === 'more.classic.count' || key === 'more.classic.title')
    expect(newKeys.length).toBeGreaterThan(20)
    for (const key of newKeys) {
      expect(enKeys, `en 缺少 ${key}`).toContain(key)
      expect(jaKeys, `ja 缺少 ${key}`).toContain(key)
    }
  })

  it('capability-driven（P1-1）：显隐是 flag AND /meta.capabilities，未实现能力前置隐藏', () => {
    const view = read('src/components/GameCenterView.vue')
    // 能力表初值保守 false（探测前一律不可用）→ 由 /meta 填充
    expect(view).toContain('EMPTY_GAME_PLATFORM_CAPABILITIES')
    expect(view).toContain('fetchGamePlatformMeta')
    expect(view).toContain('meta.capabilities')
    // 六条双层闸门：flag === true && capabilities.value.<key> === true
    for (const [flagKey, capabilityKey] of [
      ['game_verified_session_enabled', 'leaderboards'],
      ['game_economy_enabled', 'wallet'],
      ['drift_bottle_enabled', 'drift_bottle'],
      ['game_daily_tasks_enabled', 'daily_tasks'],
      ['gomoku_competitive_enabled', 'gomoku_match'],
      ['verified_reward_enabled', 'verified_reward']
    ] as const) {
      expect(view, `${flagKey} 必须与 capabilities.${capabilityKey} 取 AND`).toMatch(
        new RegExp(`flags\\.value\\.${flagKey} === true && capabilities\\.value\\.${capabilityKey} === true`)
      )
    }
    // 请求函数自己再判一次闸门（防止调用方绕过；闸门关闭时零请求）
    expect(view).toMatch(/const loadVerifiedBoard[\s\S]{0,160}!verifiedEnabled\.value/)
    expect(view).toMatch(/const loadWalletIfEnabled[\s\S]{0,160}!economyEnabled\.value/)
    // 探测失败 / 无 V2 flag 时不产生额外请求，且能力表回落保守值
    expect(view).toMatch(/catch \{[\s\S]{0,200}EMPTY_GAME_PLATFORM_CAPABILITIES/)
    // 经典榜走 Legacy 通道，**不受** V2 capabilities 影响（不得误伤已上线能力）
    expect(view).toContain('fetchClassicLeaderboard')
    expect(view).toMatch(/const loadClassicBoard[\s\S]{0,240}fetchClassicLeaderboard/)
    expect(view).not.toMatch(/classicEnabled|classicBoardAvailable/)

    // 宿主 api 层透出 capabilities（保守 fail closed；UI 只读 capabilities 作用域）
    const api = read('src/utils/game_center/api.ts')
    expect(api).toContain('readGamePlatformCapabilities')
    expect(api).toContain('EMPTY_GAME_PLATFORM_CAPABILITIES')
    expect(api).toContain('capabilitiesDeclared')
    expect(api).toContain('GAME_PLATFORM_CAPABILITY_KEYS')

    // 子组件：能力不可用时「不渲染」，而不是渲染后报错
    const home = read('src/components/game-center/GameCenterHomeTab.vue')
    expect(home).toMatch(/v-if="props\.dailyTasksEnabled"/)
    const gamesTab = read('src/components/game-center/GameCenterGamesTab.vue')
    expect(gamesTab).toMatch(/v-if="props\.gomokuCompetitiveEnabled"/)
    const rank = read('src/components/game-center/GameCenterRankTab.vue')
    expect(rank).toContain('verifiedRewardEnabled')
    // 占位/隐藏替代报错：三个 Tab 都不存在「先请求再显示错误」的 verified/drift/wallet 入口
    expect(rank).toMatch(/v-if="!props\.verifiedEnabled"/)
    expect(view).toMatch(/activeTab === 'drift' && driftEnabled/)
  })

  it('feature flag key 与协议 / issue 约定完全一致（含 W3 三个新开关）', () => {
    expect([...GAME_CENTER_FLAG_KEYS]).toEqual([
      'game_center_enabled',
      'game_verified_session_enabled',
      'game_economy_enabled',
      'drift_bottle_enabled',
      'classic_game_entries_visible',
      'game_daily_tasks_enabled',
      'gomoku_competitive_enabled',
      'verified_reward_enabled'
    ])
    const flagsSource = read('src/utils/game_center/flags.ts')
    for (const key of GAME_CENTER_FLAG_KEYS) {
      expect(flagsSource).toContain(key)
    }
  })

  it('Integration 接线（#909）：积分中心 / 总排行榜 Tab 与可见条件', () => {
    const view = read('src/components/GameCenterView.vue')
    // Tab 项存在，且位置在 rank 之后、me 之前（不插到 me 之后）
    expect(view).toContain("{ key: 'globalRank', label: t('gameCenter.tabs.globalRank')")
    expect(view).toContain("{ key: 'points', label: t('gameCenter.tabs.points')")
    const tankIndex = view.indexOf("{ key: 'rank'")
    const globalRankIndex = view.indexOf("{ key: 'globalRank'")
    const pointsIndex = view.indexOf("{ key: 'points'")
    const meIndex = view.indexOf("{ key: 'me'")
    expect(tankIndex).toBeGreaterThan(-1)
    expect(tankIndex).toBeLessThan(globalRankIndex)
    expect(globalRankIndex).toBeLessThan(pointsIndex)
    expect(pointsIndex).toBeLessThan(meIndex)
    // 可见条件：总榜 = 榜单双闸门；积分 = 经济 OR 每日任务任一可用
    expect(view).toMatch(/if \(verifiedEnabled\.value\) \{[\s\S]{0,120}'globalRank'/)
    expect(view).toMatch(/if \(economyEnabled\.value \|\| dailyTasksEnabled\.value\) \{[\s\S]{0,200}'points'/)
    // 组件挂载 + props 与 defineProps 一一对应
    expect(view).toContain("v-else-if=\"activeTab === 'globalRank'\"")
    expect(view).toContain(':leaderboards-enabled="verifiedEnabled"')
    expect(view).toContain("v-else-if=\"activeTab === 'points'\"")
    expect(view).toContain(':wallet-enabled="economyEnabled"')
    expect(view).toContain(':daily-tasks-enabled="dailyTasksEnabled"')
    expect(view).toContain("import GameCenterPointsTab from './game-center/GameCenterPointsTab.vue'")
    expect(view).toContain("import GameCenterGlobalRankTab from './game-center/GameCenterGlobalRankTab.vue'")
  })

  it('Integration 接线（#910）：快捷入口深链落位用一次性意图 + 存在性守卫', () => {
    const view = read('src/components/GameCenterView.vue')
    expect(view).toContain("import { consumeGameCenterTab } from '../utils/game_center/quick_entries'")
    // 一次性消费：只允许一处调用（consume 即清空，二次进入不会重复跳 Tab）
    expect(view.match(/consumeGameCenterTab\(\)/g)).toHaveLength(1)
    // 落位必须在能力表就绪（tabs 已按双层闸门算完）之后，并用 tabs 存在性守卫
    expect(view).toMatch(
      /await refreshPlatformAvailability\(\)[\s\S]{0,600}requestedTab[\s\S]{0,300}tabs\.value\.some\(\(tab\) => tab\.key === requestedTab\)/
    )
    expect(view).toMatch(
      /requestedTab && tabs\.value\.some\(\(tab\) => tab\.key === requestedTab\)[\s\S]{0,160}activeTab\.value = requestedTab/
    )
    // 漂流瓶 Tab 仍按 flag && capability 双层闸门挂载（真实 UI，不是占位）
    expect(view).toMatch(/activeTab === 'drift' && driftEnabled/)
    expect(view).toContain(':api-base="flags.api_base"')

    // 「更多」页已改为总面板入口（#1002）：快捷入口不再在 App 内分类展示，
    // 改由面板承担；这里守住「不再挂载」与「开局意图仍走既有一次性通道」。
    const more = read('src/components/MoreView.vue')
    expect(more).not.toContain('GameCenterQuickEntries')
    expect(more).toContain('peekGameOpen')
    expect(more).toContain('consumeGameOpen')
    // 快捷入口组件与纯函数仍保留（面板侧复用），DOM 锚点不变
    expect(read('src/components/game-center/GameCenterQuickEntries.vue')).toContain(
      'data-section="game-center-quick-entries"'
    )
    // 经典入口链路零改动（开局意图 / 远端 base 解析仍是同一套）
    expect(more).toContain('resolveGameRankApiBase')
  })
})
