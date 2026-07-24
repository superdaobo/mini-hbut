/**
 * iOS TestFlight / App Store 合规构建的功能策略中枢。
 *
 * - 仅当编译期 `VITE_APP_STORE_BUILD === '1'` 时可能收紧（由 ios-testflight.yml 注入）。
 * - 默认构建 / release / dev / Android / Desktop：全部允许，行为与现网一致。
 * - 合规包按**会话**收紧：
 *   - 未登录 / 演示账号（reviewer）：应用 APP_STORE_POLICY 与模块黑名单（审核路径）
 *   - 真实教务/学习通等已登录：全功能（与现网一致），含赞助入口
 * - 远程配置不能在 guest/demo 下改写编译期收紧判定。
 */

import { isTestAccountSession } from '../utils/test_account.js'

/** 编译期注入（见 vite.config.ts define） */
export const IS_APP_STORE_BUILD: boolean = String(
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_APP_STORE_BUILD || ''
) === '1'

/** 测试用覆盖；生产路径勿调用 */
let appStoreBuildOverride: boolean | null = null

/** 测试用会话覆盖；生产路径勿调用 */
let appStoreSessionOverride: { isLoggedIn: boolean; isDemoSession: boolean } | null = null

export function setAppStoreBuildOverrideForTests(value: boolean | null): void {
  appStoreBuildOverride = value
}

export function setAppStoreSessionOverrideForTests(
  value: { isLoggedIn: boolean; isDemoSession: boolean } | null
): void {
  appStoreSessionOverride = value
}

/** 当前是否处于 App Store / TestFlight 合规构建 */
export function isAppStoreBuild(): boolean {
  if (appStoreBuildOverride !== null) return appStoreBuildOverride
  return IS_APP_STORE_BUILD
}

/**
 * 是否允许软件内 GitHub / CDN 更新与旁加载安装包。
 * 必须挂在 isAppStoreBuild()：真实登录后 session 收紧会放开，不能用来关更新。
 */
export function allowsInAppGithubUpdater(): boolean {
  return !isAppStoreBuild()
}

/** 检查更新路径：合规包走苹果商店，其它构建走 GitHub/CDN */
export type UpdateCheckMode = 'github_cdn' | 'apple_storefront'

export function getUpdateCheckMode(): UpdateCheckMode {
  return isAppStoreBuild() ? 'apple_storefront' : 'github_cdn'
}

const readStoredUsername = (): string => {
  try {
    return String(globalThis.localStorage?.getItem('hbu_username') || '').trim()
  } catch {
    return ''
  }
}

/**
 * 解析当前会话（可注入，便于单测；默认读 localStorage + 演示标记）。
 */
export function resolveAppStoreSession(session?: {
  isLoggedIn?: boolean
  isDemoSession?: boolean
}): { isLoggedIn: boolean; isDemoSession: boolean } {
  if (appStoreSessionOverride) {
    return {
      isLoggedIn: Boolean(appStoreSessionOverride.isLoggedIn),
      isDemoSession: Boolean(appStoreSessionOverride.isDemoSession)
    }
  }
  if (session && (session.isLoggedIn !== undefined || session.isDemoSession !== undefined)) {
    return {
      isLoggedIn:
        session.isLoggedIn !== undefined
          ? Boolean(session.isLoggedIn)
          : Boolean(readStoredUsername()),
      isDemoSession:
        session.isDemoSession !== undefined
          ? Boolean(session.isDemoSession)
          : isTestAccountSession()
    }
  }
  return {
    isLoggedIn: Boolean(readStoredUsername()),
    isDemoSession: isTestAccountSession()
  }
}

/**
 * 合规包是否应对当前会话应用收紧策略。
 * - 非合规构建：false
 * - 合规 + 演示会话：true
 * - 合规 + 真实已登录：false（全功能）
 * - 合规 + 未登录：true
 */
export function shouldApplyAppStoreRestrictions(session?: {
  isLoggedIn?: boolean
  isDemoSession?: boolean
}): boolean {
  if (!isAppStoreBuild()) return false
  const { isLoggedIn, isDemoSession } = resolveAppStoreSession(session)
  if (isDemoSession) return true
  if (isLoggedIn) return false
  return true
}

/**
 * 合规构建下的能力开关。
 * true = 允许；false = 全员禁用（UI + 导航 + 深链 + 运行时）。
 */
export interface AppStoreFeaturePolicy {
  /** 远程可执行代码 / 热更新替换前端 */
  remoteCode: boolean
  /** 远程模块中心、bundle.zip、动态小游戏 */
  remoteModules: boolean
  /** 自定义 JS 注入 */
  customJavaScript: boolean
  /** 任意/学校官网内嵌浏览、快捷网页集合 */
  arbitraryWebBrowsing: boolean
  /** 选课/退课等写入校园系统 */
  campusWriteOperations: boolean
  /** 学习通签到 / 自动签到 */
  attendanceAutomation: boolean
  /** 校园码与高能二维码 */
  campusCredentialCode: boolean
  /** 小塔出行等实时定位 */
  liveMobilityLocation: boolean
  /** 外部 AI 对话 */
  externalAI: boolean
  /** 论坛 / UGC */
  userGeneratedContent: boolean
  /** 绩点排名 */
  ranking: boolean
  /** 学校消息聚合 */
  schoolInbox: boolean
  /** 全校课表 */
  qxzkb: boolean
  /** 电费 */
  electricity: boolean
  /** 校园卡交易流水 */
  transactions: boolean
  /** 校园网自动登录 */
  campusNetwork: boolean
  /** 服务统计管理页 */
  serviceStats: boolean
  /** 配置工具 / 调试 */
  debugTools: boolean
  /** 图书等只读检索 */
  library: boolean
  /** 校园地图 POI（无实时定位） */
  campusMap: boolean
  /** WebDAV 资料分享 */
  resourceShare: boolean
  /** 学习通入班资料 */
  chaoxingClass: boolean
  /** 培养方案 / 学业 / 校历等只读学业 */
  academicReadonly: boolean
  /** 智慧迎新只读 */
  smartOrientation: boolean
}

const FULL_POLICY: AppStoreFeaturePolicy = Object.freeze({
  remoteCode: true,
  remoteModules: true,
  customJavaScript: true,
  arbitraryWebBrowsing: true,
  campusWriteOperations: true,
  attendanceAutomation: true,
  campusCredentialCode: true,
  liveMobilityLocation: true,
  externalAI: true,
  userGeneratedContent: true,
  ranking: true,
  schoolInbox: true,
  qxzkb: true,
  electricity: true,
  transactions: true,
  campusNetwork: true,
  serviceStats: true,
  debugTools: true,
  library: true,
  campusMap: true,
  resourceShare: true,
  chaoxingClass: true,
  academicReadonly: true,
  smartOrientation: true
})

const APP_STORE_POLICY: AppStoreFeaturePolicy = Object.freeze({
  remoteCode: false,
  remoteModules: false,
  customJavaScript: false,
  arbitraryWebBrowsing: false,
  campusWriteOperations: false,
  attendanceAutomation: false,
  campusCredentialCode: false,
  liveMobilityLocation: false,
  externalAI: false,
  userGeneratedContent: false,
  ranking: false,
  schoolInbox: false,
  qxzkb: false,
  electricity: false,
  transactions: false,
  campusNetwork: false,
  serviceStats: false,
  debugTools: false,
  library: true,
  campusMap: true,
  resourceShare: false,
  chaoxingClass: false,
  academicReadonly: true,
  smartOrientation: false
})

export function getFeaturePolicy(session?: {
  isLoggedIn?: boolean
  isDemoSession?: boolean
}): AppStoreFeaturePolicy {
  return shouldApplyAppStoreRestrictions(session) ? APP_STORE_POLICY : FULL_POLICY
}

/**
 * 合规构建下禁止的 module / view id（与 Dashboard / App 路由对齐）。
 * 未列入白名单的 id 默认也会拒绝；此处显式列出学习通 / 一码通 / 敏感能力，
 * 避免新增入口漏过滤，并保证单测与审核清单可逐项核对。
 */
export const APP_STORE_BLOCKED_MODULE_IDS: ReadonlySet<string> = Object.freeze(
  new Set([
    // 教务写入 / 敏感学业
    'course_selection',
    'ranking',
    'qxzkb',
    'school_inbox',
    'teaching_eval',
    // 一码通与校园生活写操作
    'campus_code',
    'electricity',
    'transactions',
    'broadband',
    'sports_venue',
    'campus_network',
    // 学习通（含签到与资料）
    'chaoxing_hub',
    'chaoxing_inbox',
    'chaoxing_class',
    'more_chaoxing_checkin',
    // 远程代码 / 出行 / 其它高风险
    'resource_share',
    'towergo',
    'smart_orientation',
    'ai',
    'forum',
    'more',
    'more_module_host',
    'service_stats',
    'config',
    'school_website',
    'quick_links'
  ])
)

/** 始终允许的主路径（合规与否） */
export const APP_STORE_ALLOWED_CORE_IDS: ReadonlySet<string> = Object.freeze(
  new Set([
    'home',
    'schedule',
    'grades',
    'exams',
    'classroom',
    'academic',
    'training',
    'calendar',
    'library',
    'campus_map',
    'notifications',
    'me',
    'settings',
    'export_center',
    'official',
    'feedback',
    'studentinfo',
    'privacy_data',
    '__more__'
  ])
)

const normalizeId = (id: unknown): string => String(id ?? '').trim()

/**
 * 模块宫格 / 业务 module id 是否允许展示与打开。
 * 非合规或真实登录：全部 true。
 * 合规 guest/demo：黑名单拒绝；其余白名单；未知 id 默认拒绝。
 */
export function isModuleAllowed(
  moduleId: unknown,
  session?: { isLoggedIn?: boolean; isDemoSession?: boolean }
): boolean {
  const id = normalizeId(moduleId)
  if (!id) return false
  if (id === '__more__') {
    // 首页「展开更多分类」按钮，不是远程模块中心
    return true
  }
  if (!shouldApplyAppStoreRestrictions(session)) return true
  if (APP_STORE_BLOCKED_MODULE_IDS.has(id)) return false
  if (APP_STORE_ALLOWED_CORE_IDS.has(id)) return true
  // 未知 id 在合规收紧会话默认拒绝，避免远程/缓存注入新入口
  return false
}

/**
 * 应用 view 名是否允许导航（含 Me 子页、深链目标）。
 */
export function isViewAllowed(
  view: unknown,
  session?: { isLoggedIn?: boolean; isDemoSession?: boolean }
): boolean {
  const id = normalizeId(view)
  if (!id) return false
  if (!shouldApplyAppStoreRestrictions(session)) return true
  if (APP_STORE_BLOCKED_MODULE_IDS.has(id)) return false
  if (APP_STORE_ALLOWED_CORE_IDS.has(id)) return true
  // 主 Tab 等
  if (['home', 'schedule', 'notifications', 'me'].includes(id)) return true
  return false
}

export function isDeepLinkAllowed(
  viewOrModule: unknown,
  session?: { isLoggedIn?: boolean; isDemoSession?: boolean }
): boolean {
  return isViewAllowed(viewOrModule, session) && isModuleAllowed(viewOrModule, session)
}

export function filterAllowedModules<T extends { id?: string }>(
  modules: T[],
  session?: { isLoggedIn?: boolean; isDemoSession?: boolean }
): T[] {
  return (modules || []).filter((m) => isModuleAllowed(m?.id, session))
}

/** 合规构建下是否允许实时定位 API */
export function isLiveLocationAllowed(): boolean {
  return getFeaturePolicy().liveMobilityLocation
}

/** 合规构建下是否允许自定义 JS */
export function isCustomJavaScriptAllowed(): boolean {
  return getFeaturePolicy().customJavaScript
}

/** 合规构建下是否允许远程模块 / 热更执行 */
export function isRemoteExecutableAllowed(): boolean {
  const p = getFeaturePolicy()
  return p.remoteCode || p.remoteModules
}

export function isHotUpdateAllowed(): boolean {
  return getFeaturePolicy().remoteCode
}

export function isRemoteModulesAllowed(): boolean {
  return getFeaturePolicy().remoteModules
}

/**
 * 赞助 / 微信赞赏码入口是否允许展示。
 *
 * - 非合规包：始终允许（与现网一致）。
 * - 合规包（TestFlight / App Store）：仅「已登录且非演示会话」允许。
 *   未登录与 reviewer 演示会话隐藏，避免审核路径触 Guideline 3.1.1。
 *
 * 调用方传入会话态，避免本模块依赖 localStorage。
 */
export function isSponsorEntryAllowed(options: {
  isLoggedIn: boolean
  isDemoSession: boolean
}): boolean {
  // 与功能树一致：仅合规 guest/demo 隐藏；真实登录与非合规包均允许
  return !shouldApplyAppStoreRestrictions({
    isLoggedIn: Boolean(options?.isLoggedIn),
    isDemoSession: Boolean(options?.isDemoSession)
  })
}

/** 非官方声明（UI 复用） */
export const NON_OFFICIAL_DISCLAIMER_ZH =
  'Mini-HBUT 是独立开发、社区维护的开源学生工具，不由任何学校或教育机构开发、运营、赞助或背书。'

export const NON_OFFICIAL_DISCLAIMER_EN =
  'Mini-HBUT is an independently developed and community-maintained open-source student utility. It is not developed, operated, sponsored, or endorsed by any university or educational institution.'

export const PRIVACY_POLICY_URL = 'https://hbut.6661111.xyz/privacy'
export const SUPPORT_DOCS_URL = 'https://hbut.6661111.xyz/docs'
export const SECURITY_DOCS_URL = 'https://hbut.6661111.xyz/docs/security-privacy'
export const PROJECT_HOME_URL = 'https://hbut.6661111.xyz'
export const GITHUB_URL = 'https://github.com/superdaobo/mini-hbut'
export const FEEDBACK_URL = 'https://docs.qq.com/sheet/DQkdvWHJxQ3RwWlB4?tab=BB08J2'

/** 工信部 ICP 备案号（我的页底部公示） */
export const ICP_BEIAN_TEXT = '鲁ICP备2026039385号-1A'
/** 工信部备案查询官网 */
export const ICP_BEIAN_URL = 'https://beian.miit.gov.cn/'

export const DEMO_MODE_BANNER_ZH =
  '当前为审核演示模式，页面使用虚构数据，不连接真实校园服务。'

export const DEMO_MODE_BANNER_EN =
  'Demo Mode: This session uses fictional local data and does not connect to live campus services.'
