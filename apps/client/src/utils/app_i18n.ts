/**
 * 轻量应用内多语言模块（issue #773）。
 *
 * ⚠️ 本期范围控制（刻意收敛，避免巨量 diff 与回归风险）：
 * 仅覆盖「设置中心外观页（SettingsView）+ 底部/全局公共导航（App.vue TabBar）」
 * 的固定文案；其余页面文案保持中文，后续逐步开放（设置页语言项下方有小字说明）。
 *
 * 设计要点：
 * - 不引入 vue-i18n 等第三方库，自建轻量字典 + t() 查找函数；
 * - 存储：localStorage 键 hbu_app_locale（与项目 hbu_ 前缀惯例一致），
 *   读取时校验合法性，无效/缺失/损坏 → 回落默认 zh-CN（不污染其他设置键）；
 * - 切换：setLocale 写存储 + 派发 window 自定义事件 hbu-locale-changed
 *   （detail 携带新 locale），消费方通过 useLocale() 获得响应式 locale 与 t；
 * - t() 回落链：当前 locale 字典 → zh-CN 字典 → key 本身（保证永不空白）。
 */

/** 支持的语言标识：首批 简体中文（默认）+ English */
export type Locale = 'zh-CN' | 'en'

/** 默认语言：简体中文 */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** 语言偏好存储键（hbu_ 前缀与项目其他设置键一致） */
export const APP_LOCALE_STORAGE_KEY = 'hbu_app_locale'

/** 语言切换自定义事件名：setLocale 派发，useLocale 监听 */
export const APP_LOCALE_CHANGED_EVENT = 'hbu-locale-changed'

const LOCALE_VALUES: readonly Locale[] = ['zh-CN', 'en']

/**
 * 校验并规范化存储值：合法值原样返回，空/非法/损坏 → 默认 zh-CN。
 */
export const resolveLocale = (raw: unknown): Locale => {
  const value = String(raw ?? '').trim()
  if ((LOCALE_VALUES as readonly string[]).includes(value)) {
    return value as Locale
  }
  return DEFAULT_LOCALE
}

/**
 * 界面文案字典：语义化 key，与设置页/导航实际文案一一对应。
 * 新增文案时 zh-CN 与 en 必须同时补齐（t() 对缺失 key 会回落 zh-CN 再回落 key）。
 */
export const messages: Record<Locale, Record<string, string>> = {
  'zh-CN': {
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
    'settings.language.hint': '更多界面语言支持将逐步开放'
  },
  en: {
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
    'settings.language.hint': 'More interface languages coming soon'
  }
}

/** 模块级当前语言（resolveLocale 保证始终合法） */
let currentLocale: Locale = DEFAULT_LOCALE

/** 读取当前语言（模块加载时已从存储初始化） */
export const getLocale = (): Locale => currentLocale

/**
 * 切换语言：写 localStorage + 更新模块状态 + 派发 hbu-locale-changed 事件。
 * 存储不可用时仅同步内存状态（与 night_mode 等模块的兜底策略一致）。
 */
export const setLocale = (locale: Locale): void => {
  const next = resolveLocale(locale)
  currentLocale = next
  try {
    localStorage.setItem(APP_LOCALE_STORAGE_KEY, next)
  } catch {
    // localStorage 不可用时仅同步内存状态
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(APP_LOCALE_CHANGED_EVENT, { detail: { locale: next } })
    )
  }
}

/**
 * 翻译查找：当前 locale 字典 → zh-CN 字典 → key 本身（永不空白）。
 */
export const t = (key: string): string => {
  const dict = messages[currentLocale]
  if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key]
  }
  const fallback = messages[DEFAULT_LOCALE]
  if (fallback && Object.prototype.hasOwnProperty.call(fallback, key)) {
    return fallback[key]
  }
  return key
}

import { ref } from 'vue'

/**
 * Vue 组合函数：返回响应式 locale 与 t。
 * - locale 为 ref，监听 hbu-locale-changed 事件跟随变化（设置页切换即时生效）；
 * - 可选监听 storage 事件，实现跨标签页同步（Tauri 单窗口场景为兜底）。
 * 注意：t() 内部读模块级 currentLocale，事件先行同步再更新 ref，
 * 因此模板重渲染时 t() 已按新语言取词。
 */
export const useLocale = () => {
  const locale = ref<Locale>(currentLocale)

  const syncLocale = (event: Event) => {
    const detail = (event as CustomEvent<{ locale?: Locale }>).detail
    const next = resolveLocale(detail?.locale ?? currentLocale)
    currentLocale = next
    locale.value = next
  }

  // 跨标签页同步（可选兜底）：storage 事件在其他标签写入时触发
  const onStorage = (event: StorageEvent) => {
    if (event.key === APP_LOCALE_STORAGE_KEY) {
      currentLocale = resolveLocale(event.newValue)
      locale.value = currentLocale
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(APP_LOCALE_CHANGED_EVENT, syncLocale)
    window.addEventListener('storage', onStorage)
  }

  return { locale, t }
}

// 模块加载时从存储初始化（缺失/非法/损坏一律回落 zh-CN）
try {
  currentLocale = resolveLocale(localStorage.getItem(APP_LOCALE_STORAGE_KEY))
} catch {
  // localStorage 不可用时保持默认 zh-CN
}
