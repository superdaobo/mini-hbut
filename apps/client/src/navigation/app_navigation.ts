/**
 * 应用主导航常量与工具函数（从 App.vue 抽离，便于维护与测试）。
 */

export const MAIN_TABS = ['home', 'schedule', 'notifications', 'me'] as const

export const ME_SUB_VIEWS = [
  'official',
  'feedback',
  'config',
  'settings',
  'privacy_data',
  'export_center',
  'service_stats',
  'school_website',
  'quick_links',
  'campus_network',
  'identity_auth_history',
  'more',
  'more_module_host',
  'more_chaoxing_checkin',
  // #905 湖工游乐场（Game Center）：更多页的一级子视图
  'game_center'
] as const

/** 需登录后才能访问的「我的」子页面 */
export const LOGIN_REQUIRED_ME_VIEWS = ['school_website', 'quick_links', 'campus_network'] as const

export const isLoginRequiredView = (view: unknown): boolean => {
  const normalized = String(view || '').trim()
  return (LOGIN_REQUIRED_ME_VIEWS as readonly string[]).includes(normalized)
}

export const HIERARCHICAL_PARENT_VIEW_MAP: Readonly<Record<string, string>> = Object.freeze({
  schedule: 'home',
  forum: 'home',
  notifications: 'home',
  me: 'home',
  official: 'me',
  feedback: 'me',
  config: 'me',
  settings: 'me',
  privacy_data: 'me',
  export_center: 'me',
  service_stats: 'me',
  school_website: 'me',
  quick_links: 'me',
  campus_network: 'me',
  identity_auth_history: 'me',
  more: 'me',
  more_module_host: 'more',
  more_chaoxing_checkin: 'more',
  // #905：游乐场返回回到「更多」页（与其入口层级一致）
  game_center: 'more',
  smart_orientation: 'home'
})

export type MainTab = (typeof MAIN_TABS)[number]
export type MeSubView = (typeof ME_SUB_VIEWS)[number]

export const normalizeViewName = (view: unknown): string => {
  const normalized = String(view || '').trim()
  return normalized || 'home'
}
