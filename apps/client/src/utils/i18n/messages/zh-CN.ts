/**
 * 简体中文字典（issue #785：从 app_i18n.ts 拆分而出，key 与拆分前完全一致）。
 *
 * ⚠️ key 命名规范（#784 各批次代理必须遵守）：
 * - 统一「域.页面.元素」三段式小写点分，如 home.greeting.title、settings.theme.system.label；
 * - 跨页面通用文案归 common 域，如 common.confirm、common.empty.loading；
 * - 新增文案必须 zh-CN 与 en 两份字典同步补齐
 *   （i18n_coverage.spec.ts 测试 2 强制校验两侧 key 集合一致，漏一侧会被拦下）；
 * - t() 回落链：当前语言 → zh-CN → key 本身，en 缺失不会白屏，但契约测试会报出缺失清单。
 */

export const messages: Record<string, string> = {
  // —— 通用 ——
  'app.name': '校园小助手',
  // —— 底部公共导航（App.vue TabBar）——
  'tab.home': '首页',
  'tab.schedule': '课表',
  'tab.notifications': '通知',
  'tab.me': '我的',
  // —— 设置中心 header / tab 栏 ——
  'settings.title': '设置中心',
  'settings.tab.appearance': '外观',
  'settings.tab.backend': '后端',
  'settings.tab.security': '安全',
  'settings.tab.debug': '调试',
  // —— 设置中心：语言 section ——
  'settings.language.label': '语言 / Language',
  'settings.language.option.zh-CN': '简体中文',
  'settings.language.option.en': 'English',
  'settings.language.toast': '语言：简体中文',
  'settings.language.hint': '更多界面语言支持将逐步开放',
  // —— 公共组件内置默认文案（#785：TEmptyState / TModal）——
  'common.close': '关闭',
  'common.empty.loading': '加载中...',
  'common.empty.error': '加载失败，请稍后重试',
  'common.empty.text': '暂无数据'
}
