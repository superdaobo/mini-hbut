/**
 * i18n 字典聚合出口（issue #785：字典按语言拆分后的统一入口）。
 *
 * 各批次代理（#784 A-J）新增文案时：
 * - 不要改本文件，直接往 zh-CN.ts / en.ts 追加 key（两侧同步）；
 * - 消费方统一从 '../app_i18n'（或相对路径 '../utils/app_i18n'）import
 *   { t, useLocale, useI18n, setLocale, getLocale, messages, DEFAULT_LOCALE }，
 *   不要直接 import 本目录，以保证回落链 / DEV 缺 key 告警 / 响应式语义一致。
 */
import { messages as zhCN } from './zh-CN'
import { messages as en } from './en'

export const messages: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCN,
  en
}

/** 语言标识类型（与 app_i18n.ts 中定义保持同一字面量集合） */
export type Locale = 'zh-CN' | 'en'

/** 默认语言（与 app_i18n.ts 中 re-export 的 DEFAULT_LOCALE 同源） */
export const DEFAULT_LOCALE: Locale = 'zh-CN'
