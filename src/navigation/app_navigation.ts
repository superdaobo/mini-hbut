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
  'more',
  'more_module_host',
  'more_chaoxing_checkin'
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
  more: 'me',
  more_module_host: 'more',
  more_chaoxing_checkin: 'more',
  smart_orientation: 'home'
})

export type MainTab = (typeof MAIN_TABS)[number]
export type MeSubView = (typeof ME_SUB_VIEWS)[number]

export const normalizeViewName = (view: unknown): string => {
  const normalized = String(view || '').trim()
  return normalized || 'home'
}
