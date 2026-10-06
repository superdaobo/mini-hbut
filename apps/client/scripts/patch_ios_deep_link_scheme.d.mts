/**
 * patch_ios_deep_link_scheme.mjs 的类型声明（供 TS 侧 import：契约测试）。
 *
 * 脚本职责：把 tauri.conf.json 的 mobile scheme 确定性写入 iOS 生成工程的 Info.plist，
 * 使 iOS 深链注册不再依赖 tauri-plugin-deep-link build.rs 的缓存与时序。
 */

/** tauri.conf.json 中 `plugins.deep-link.mobile` 的条目形态 */
export interface DeepLinkMobileEntry {
  scheme?: string[] | unknown
  appLink?: boolean
}

/** 从 tauri.conf.json 解析出需要写进 CFBundleURLTypes 的 scheme（非 appLink、剔除 http/https、去重） */
export declare function resolveIosSchemes(tauriConf: unknown): string[]

/** 构造与插件 build.rs 等价的 CFBundleURLTypes XML 片段 */
export declare function buildUrlTypesBlock(schemes: string[], indent?: string): string

/** 幂等写入 CFBundleURLTypes；返回新 XML 与是否发生改动 */
export declare function upsertUrlTypes(
  xml: string,
  schemes: string[]
): { xml: string; changed: boolean }

/** 判断给定 scheme 是否已注册在 CFBundleURLTypes 段内 */
export declare function isSchemeRegistered(xml: string, schemes: string[]): boolean
