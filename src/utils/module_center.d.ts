// 测试 fixture：module_center 模块类型声明（与 module_center.js 导出对齐）
export interface ModuleCenterEntry {
  id: string
  name?: string
  channel?: string
  disabled?: boolean
  order?: number
  [key: string]: unknown
}

export interface ModuleCenterConfig {
  channel: string
  modules: readonly ModuleCenterEntry[]
  [key: string]: unknown
}

export const DEFAULT_MODULE_CENTER: ModuleCenterConfig
export function normalizeModuleCenterChannel(value: unknown, fallback?: string): string
export function buildModuleManifestUrl(options?: {
  rawUrl?: string
  channel?: string
  moduleId?: string
  moduleCdnBase?: string
}): string
export function normalizeModuleCenterEntry(
  value: unknown,
  index?: number,
  channel?: string,
  options?: Record<string, unknown>
): ModuleCenterEntry
export function buildModuleCenterCards(options?: {
  channel?: string
  configuredModules?: unknown[]
  catalogModules?: unknown[]
  moduleCdnBase?: string
}): ModuleCenterEntry[]
