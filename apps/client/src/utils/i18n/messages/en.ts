/**
 * English 字典（issue #785：从 app_i18n.ts 拆分而出，key 与拆分前完全一致）。
 *
 * ⚠️ key 命名规范（#784 各批次代理必须遵守）：
 * - 与 zh-CN.ts 完全同构：key 一字不差，仅 value 为英文；
 * - 新增文案必须 zh-CN 与 en 两份字典同步补齐
 *   （i18n_coverage.spec.ts 测试 2 强制校验两侧 key 集合一致，漏一侧会被拦下）；
 * - 语言名称按惯例不翻译（如 settings.language.option.zh-CN 的英文值仍为「简体中文」）。
 */

export const messages: Record<string, string> = {
  // —— Common ——
  'app.name': 'Campus Assistant',
  // —— Bottom tab bar (App.vue) ——
  'tab.home': 'Home',
  'tab.schedule': 'Schedule',
  'tab.notifications': 'Alerts',
  'tab.me': 'Me',
  // —— Settings header / tab bar ——
  'settings.title': 'Settings',
  'settings.tab.appearance': 'Appearance',
  'settings.tab.backend': 'Backend',
  'settings.tab.security': 'Security',
  'settings.tab.debug': 'Debug',
  // —— Settings: language section ——
  'settings.language.label': 'Language / 语言',
  'settings.language.option.zh-CN': '简体中文',
  'settings.language.option.en': 'English',
  'settings.language.toast': 'Language: English',
  'settings.language.hint': 'More interface languages coming soon',
  // —— Shared component built-in defaults (#785: TEmptyState / TModal) ——
  'common.close': 'Close',
  'common.empty.loading': 'Loading...',
  'common.empty.error': 'Load failed, please try again later',
  'common.empty.text': 'No data yet'
}
