/**
 * icon_source_scan.mjs 的类型声明（供 TS 侧 import：契约测试 / 其它工具）。
 */

export declare const ICON_SCAN_EXTS: string[]

export interface IconScanOptions {
  /** 项目根目录（通常为 apps/client） */
  cwd: string
  /** 额外扫描目录（绝对路径，如 website/modules-src） */
  extraRoots?: string[]
  /** 参与扫描的扩展名 */
  exts?: string[]
}

export interface IconScanResult {
  /** 高置信 ligature 名（可直接用于「源码 ⊆ 字体」断言） */
  strong: string[]
  /** 宽口径候选（含假阳性，需与字体实际字形求交） */
  weak: string[]
  /** 源码中出现的模块键（iconKey） */
  iconKeys: string[]
  /** 无法经 iconMap 解析的模块键（应保持为空） */
  unresolvedIconKeys: string[]
  /** 模块键 → ligature 名的映射（来自 iconMap 等映射表） */
  iconMap: Record<string, string>
  /** 命中的源码文件（相对 cwd） */
  scannedFiles: string[]
}

export interface ExtractedIconNames {
  strong: string[]
  weak: string[]
  iconKeys: string[]
  unresolvedIconKeys: string[]
}

export declare function scanIconNames(options: IconScanOptions): IconScanResult

export declare function extractIconNamesFromSource(
  content: string,
  iconMap?: Record<string, string>
): ExtractedIconNames

export declare function parseIconMapFromSource(content: string): Record<string, string>

export declare function readBalancedObject(text: string, openIndex: number): string | null
