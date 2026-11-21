/**
 * patch_ios_location_usage.mjs 的类型声明（供 TS 侧 import：契约测试）。
 *
 * 脚本职责：把 iOS 定位权限 usage 描述（NSLocationWhenInUseUsageDescription）
 * 确定性写入 Tauri 生成工程（gen/apple）的 Info.plist，修复 WKWebView 下
 * 定位权限框不弹、定位直接失败的问题（#1370）。
 */

/** iOS 前台定位权限的 usage 描述键名 */
export declare const LOCATION_USAGE_KEY: string

/** 写入 Info.plist 的固定中文文案 */
export declare const LOCATION_USAGE_TEXT: string

/** XML 文本转义（& < >） */
export declare function escapeXmlText(value: string): string

/** XML 文本反转义（与 escapeXmlText 互逆） */
export declare function unescapeXmlText(value: string): string

/** 判断 plist XML 是否已含期望的 usage 描述（按反转义后的语义值比较） */
export declare function hasLocationUsage(xml: string, text?: string): boolean

/** 幂等写入定位 usage 描述；返回新 XML 与是否发生改动 */
export declare function upsertLocationUsage(xml: string, text?: string): {
  xml: string
  changed: boolean
}
