/**
 * 轻量应用内多语言模块（issue #773 建立基建，issue #785 完成字典拆分与接入）。
 *
 * 字典已拆分至 ./i18n/messages/（zh-CN.ts / en.ts / index.ts），本文件仅保留
 * 公开 API（t / setLocale / useLocale / useI18n / getLocale / resolveLocale /
 * messages / DEFAULT_LOCALE 等），签名与行为与拆分前完全一致。
 * #784 各批次代理新增文案：直接往 ./i18n/messages/zh-CN.ts 与 en.ts 追加 key
 * （两侧同步，契约测试强制校验），不要改本文件。
 *
 * 设计要点：
 * - 不引入 vue-i18n 等第三方库，自建轻量字典 + t() 查找函数；
 * - 存储：localStorage 键 hbu_app_locale（与项目 hbu_ 前缀惯例一致），
 *   读取时校验合法性，无效/缺失/损坏 → 回落默认 zh-CN（不污染其他设置键）；
 * - 切换：setLocale 写存储 + 派发 window 自定义事件 hbu-locale-changed
 *   （detail 携带新 locale），消费方通过 useLocale()/useI18n() 获得响应式 locale 与 t；
 * - t() 回落链：当前 locale 字典 → zh-CN 字典 → key 本身（保证永不空白）；
 * - 开发态（import.meta.env.DEV）key 未命中任何字典时 console.warn 告警，
 *   生产构建静默（vite define 静态替换，无运行时开销）。
 */
import { ref } from 'vue'
import { messages, DEFAULT_LOCALE as DEFAULT_LOCALE_INNER, type Locale } from './i18n/messages'

export type { Locale } from './i18n/messages'

/** 默认语言：简体中文 */
export const DEFAULT_LOCALE: Locale = DEFAULT_LOCALE_INNER

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

// 字典统一由 ./i18n/messages 提供（re-export 保持旧 import 路径可用）
export { messages }

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
 * 开发态（DEV）key 未命中任何字典时 console.warn 一次提示，帮助各批次代理
 * 及时发现 key 拼写错误/漏翻译；生产构建该分支被 define 静态剪除，静默兜底。
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
  if (import.meta.env.DEV) {
    console.warn(`[i18n] missing key: ${key}`)
  }
  return key
}

/**
 * 整句插值翻译（issue #791 新增，与 #790 批次同签名）：
 * 先按 t() 回落链取词，再把字典中的 {name} 占位符替换为参数值。
 * 字典侧统一整句 key + {n}/{name} 占位（如 '系统预热中，正在重试 ({n}/{max})...'），
 * 避免调用方碎片拼接。
 */
export const tf = (key: string, params: Record<string, unknown>): string => {
  const text = t(key)
  return Object.entries(params ?? {}).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    text
  )
}

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

/**
 * useI18n（issue #785 新增）：与 useLocale 返回结构一致（{ locale, t }）的语义化别名。
 *
 * ⚠️ 两种在组件里取词的方式与推荐（#784 各批次代理必读）：
 * 1. ✅ 推荐：`const { t } = useI18n()`（或 useLocale()），模板/计算属性里 t('域.页面.元素')
 *    —— locale 是 ref，切换语言后模板自动重渲染，t() 取词即时生效；
 * 2. ❌ 非响应式：`import { t } from '../utils/app_i18n'` 后直接在模板绑定 t('key')
 *    —— t() 是普通函数，locale 变化不触发重渲染，仅适合 JS 逻辑内
 *    （如 showToast(t('xxx'))，取词发生在事件回调里，时机上已是最新语言）；
 *    需要占位插值时用 tf('key', { name: value })（同样仅限 JS 逻辑内）。
 * 底层为同一函数，可混用；本别名仅用于让调用点意图更清晰。
 */
export const useI18n = useLocale

// 模块加载时从存储初始化（缺失/非法/损坏一律回落 zh-CN）
try {
  currentLocale = resolveLocale(localStorage.getItem(APP_LOCALE_STORAGE_KEY))
} catch {
  // localStorage 不可用时保持默认 zh-CN
}
