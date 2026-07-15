/**
 * iOS TestFlight / App Store 合规构建的功能策略中枢。
 *
 * - 仅当编译期 `VITE_APP_STORE_BUILD === '1'` 时收紧（由 ios-testflight.yml 注入）。
 * - 默认构建 / release / dev / Android / Desktop：全部允许，行为与现网一致。
 * - 功能可见性不得根据 reviewer 用户名变化；演示账号只换数据源。
 * - 远程配置不能改写本模块的编译期判定。
 */

/** 编译期注入（见 vite.config.ts define） */
export const IS_APP_STORE_BUILD: boolean = String(
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_APP_STORE_BUILD || ''
) === '1'

/** 测试用覆盖；生产路径勿调用 */
let appStoreBuildOverride: boolean | null = null

export function setAppStoreBuildOverrideForTests(value: boolean | null): void {
  appStoreBuildOverride = value
}

/** 当前是否处于 App Store / TestFlight 合规构建 */
export function isAppStoreBuild(): boolean {
  if (appStoreBuildOverride !== null) return appStoreBuildOverride
  return IS_APP_STORE_BUILD
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
  academicReadonly: true
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
  academicReadonly: true
})

export function getFeaturePolicy(): AppStoreFeaturePolicy {
  return isAppStoreBuild() ? APP_STORE_POLICY : FULL_POLICY
}

/** 合规构建下禁止的 module / view id（与 Dashboard / App 路由对齐） */
export const APP_STORE_BLOCKED_MODULE_IDS: ReadonlySet<string> = Object.freeze(
  new Set([
    'course_selection',
    'ranking',
    'qxzkb',
    'school_inbox',
    'campus_code',
    'electricity',
    'transactions',
    'resource_share',
    'chaoxing_class',
    'towergo',
    'ai',
    'forum',
    'more',
    'more_module_host',
    'more_chaoxing_checkin',
    'service_stats',
    'config',
    'school_website',
    'quick_links',
    'campus_network'
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
 * 合规关：全部 true。合规开：黑名单拒绝，其余白名单或未列出的默认拒绝高风险未知 id。
 */
export function isModuleAllowed(moduleId: unknown): boolean {
  const id = normalizeId(moduleId)
  if (!id) return false
  if (id === '__more__') {
    // 首页「展开更多分类」按钮，不是远程模块中心
    return true
  }
  if (!isAppStoreBuild()) return true
  if (APP_STORE_BLOCKED_MODULE_IDS.has(id)) return false
  if (APP_STORE_ALLOWED_CORE_IDS.has(id)) return true
  // 未知 id 在合规构建默认拒绝，避免远程/缓存注入新入口
  return false
}

/**
 * 应用 view 名是否允许导航（含 Me 子页、深链目标）。
 */
export function isViewAllowed(view: unknown): boolean {
  const id = normalizeId(view)
  if (!id) return false
  if (!isAppStoreBuild()) return true
  if (APP_STORE_BLOCKED_MODULE_IDS.has(id)) return false
  if (APP_STORE_ALLOWED_CORE_IDS.has(id)) return true
  // 主 Tab 等
  if (['home', 'schedule', 'notifications', 'me'].includes(id)) return true
  return false
}

export function isDeepLinkAllowed(viewOrModule: unknown): boolean {
  return isViewAllowed(viewOrModule) && isModuleAllowed(viewOrModule)
}

export function filterAllowedModules<T extends { id?: string }>(modules: T[]): T[] {
  return (modules || []).filter((m) => isModuleAllowed(m?.id))
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

export const DEMO_MODE_BANNER_ZH =
  '当前为审核演示模式，页面使用虚构数据，不连接真实校园服务。'

export const DEMO_MODE_BANNER_EN =
  'Demo Mode: This session uses fictional local data and does not connect to live campus services.'
