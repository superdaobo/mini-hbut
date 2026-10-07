/**
 * i18n 字典聚合出口（issue #785：字典按语言拆分后的统一入口）。
 *
 * 各批次代理（#784 A-J）新增文案时：
 * - 不要改本文件，直接往 zh-CN.ts / en.ts / ja.ts 追加 key（三侧同步，契约测试强制校验）；
 * - 消费方统一从 '../app_i18n'（或相对路径 '../utils/app_i18n'）import
 *   { t, useLocale, useI18n, setLocale, getLocale, messages, DEFAULT_LOCALE }，
 *   不要直接 import 本目录，以保证回落链 / DEV 缺 key 告警 / 响应式语义一致。
 *
 * ## #993：非默认语言字典改为按需加载
 *
 * 三份字典合计约 684 KB 源码，此前**全部顶层静态 import**，经 `app_i18n` → `App.vue`
 * 进入入口 chunk，冷启动时必须由主线程 parse + compile + eval（iOS 无字节码缓存时尤重）。
 * 现在只静态保留默认语言（简体中文），`en` / `ja` 在首次被选中时动态 `import()` 填充。
 *
 * 行为约定：
 * - 未加载的语言在 `messages[locale]` 处为**空对象**，`t()` 经回落链取默认语言文案
 *   （见 `app_i18n.ts` 的 `t()`），因此永不空白；
 * - 字典加载完成后就地填充导出对象（按引用共享），并由 `setLocale` 再派发一次
 *   locale 变更事件，触发模板重渲染；
 * - `ensureLocaleMessages` 幂等且并发去重；失败返回 false 并保持回落，绝不抛错。
 */

import { messages as zhCN } from './zh-CN'

/** 语言标识类型（与 app_i18n.ts 中定义保持同一字面量集合） */
export type Locale = 'zh-CN' | 'en' | 'ja'

/** 默认语言（与 app_i18n.ts 中 re-export 的 DEFAULT_LOCALE 同源） */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** 非默认语言（按需动态加载） */
export type LazyLocale = Exclude<Locale, typeof DEFAULT_LOCALE>

/**
 * 字典容器。默认语言静态注入；其余语言在加载完成前为空对象，
 * 由 `ensureLocaleMessages` 就地填充（保持导出引用不变，消费方无需改签名）。
 */
export const messages: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCN,
  en: {},
  ja: {}
}

const LAZY_LOADERS: Record<LazyLocale, () => Promise<{ messages: Record<string, string> }>> = {
  en: () => import('./en'),
  ja: () => import('./ja')
}

const inFlight = new Map<LazyLocale, Promise<boolean>>()

/**
 * 已成功加载的语言集合。
 *
 * 刻意用**显式集合**而不是「字典非空」来判定：占位对象可能被测试或调用方写入
 * 个别探针 key，若按 key 数量推断会误判为「已加载」而跳过真正的字典加载。
 */
const loadedLocales = new Set<Locale>([DEFAULT_LOCALE])

const isLazyLocale = (locale: Locale): locale is LazyLocale => locale === 'en' || locale === 'ja'

/** 该语言字典是否已就绪（默认语言恒为 true） */
export const isLocaleMessagesLoaded = (locale: Locale): boolean => loadedLocales.has(locale)

/**
 * 按需加载非默认语言字典（幂等、并发去重）。
 *
 * 采用 `Object.assign` **合并**而非整体替换：保留调用方在加载完成前写入的 key
 * （例如测试注入的探针 key），避免被字典加载悄悄抹掉。
 *
 * @returns 加载成功（或本已就绪 / 默认语言）返回 true；失败返回 false 且不抛错。
 */
export const ensureLocaleMessages = (locale: Locale): Promise<boolean> => {
  if (!isLazyLocale(locale)) return Promise.resolve(true)
  if (isLocaleMessagesLoaded(locale)) return Promise.resolve(true)

  const existing = inFlight.get(locale)
  if (existing) return existing

  const task = LAZY_LOADERS[locale]()
    .then((mod) => {
      const dict = (mod as { messages?: Record<string, string> }).messages
      if (!dict || typeof dict !== 'object') return false
      Object.assign(messages[locale], dict)
      loadedLocales.add(locale)
      return true
    })
    .catch(() => false)
    .finally(() => {
      inFlight.delete(locale)
    })

  inFlight.set(locale, task)
  return task
}
