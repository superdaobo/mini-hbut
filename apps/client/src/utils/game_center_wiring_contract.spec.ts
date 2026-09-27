/**
 * #905 湖工游乐场接线契约（仓库门禁）。
 *
 * 覆盖四类不可回退的约束：
 * 1. SDK 消息类型 / ticket query 参数与 `website/modules-src/_sdk` **逐字一致**（防止两侧漂移）；
 * 2. 宿主必须有 origin 校验（复制粘贴回来的旧实现会立刻失败）；
 * 3. 视图注册 / 导航 / app_store_policy 必须覆盖 `game_center`（防漏过滤）；
 * 4. 三语字典 key 集合一致（新增文案不得只加一种语言）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages } from './app_i18n'
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

  it('更多页：新增游乐场主入口 + 经典游戏折叠，11 个游戏入口零破坏', () => {
    const more = read('src/components/MoreView.vue')
    expect(more).toContain('data-module-id="game_center"')
    expect(more).toContain('openGameCenter')
    expect(more).toContain("t('more.gameCenter.title')")
    // 折叠入口 + 展开态
    expect(more).toContain('data-module-id="classic_games"')
    expect(more).toContain('classicExpanded')
    expect(more).toContain('v-show="classicExpanded"')
    // 开关驱动的可见性（远程即可回滚）
    expect(more).toContain('gameCenterEntryVisible')
    expect(more).toContain('classicEntriesVisible')
    expect(more).toContain('resolveEffectiveGameCenterFlags')
    // 开局意图复用既有链路
    expect(more).toContain('consumeGameOpen')
    expect(more).toContain("activeLaunchSurface.value = 'game_center'")
    expect(more).toContain('launch_surface')
  })

  it('GameCenterView 五个 Tab，且未交付能力是 feature-gated 占位', () => {
    const view = read('src/components/GameCenterView.vue')
    for (const tab of ['home', 'games', 'rank', 'drift', 'me']) {
      expect(view, `缺少 Tab ${tab}`).toContain(`'${tab}'`)
    }
    expect(view).toContain('driftEnabled')
    expect(view).toContain('economyEnabled')
    expect(view).toContain('verifiedEnabled')
    // 紧急回滚：开关关闭时自身收敛回「更多」页（深链 / 历史恢复也能兜住）
    expect(view).toMatch(/game_center_enabled !== true[\s\S]{0,80}emit\('navigate', 'more'\)/)
    // 未交付 Tab 整块不挂载（而不是可见后报错）
    expect(view).toMatch(/activeTab === 'drift' && driftEnabled/)

    const home = read('src/components/game-center/GameCenterHomeTab.vue')
    expect(home).toMatch(/v-if="props\.economyEnabled"/)
    const rank = read('src/components/game-center/GameCenterRankTab.vue')
    expect(rank).toContain('verifiedEnabled')
    expect(rank).toContain('verifiedPlaceholder')
    const me = read('src/components/game-center/GameCenterMeTab.vue')
    expect(me).toContain('economyDisabledNote')
    const drift = read('src/components/game-center/GameCenterDriftTab.vue')
    expect(drift).toContain('placeholderTitle')
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

  it('五语言 key 集合一致：新增文案三语齐全', () => {
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

  it('feature flag key 与协议 / issue 约定完全一致', () => {
    expect([...GAME_CENTER_FLAG_KEYS]).toEqual([
      'game_center_enabled',
      'game_verified_session_enabled',
      'game_economy_enabled',
      'drift_bottle_enabled',
      'classic_game_entries_visible'
    ])
    const flagsSource = read('src/utils/game_center/flags.ts')
    for (const key of GAME_CENTER_FLAG_KEYS) {
      expect(flagsSource).toContain(key)
    }
  })
})
