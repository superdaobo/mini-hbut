// 测试 fixture：more_modules 模块类型声明（与 more_modules.js 导出对齐）
export interface ModuleManifest {
  name: string
  id: string
  entry?: string
  [key: string]: unknown
}

export interface ModuleHostPreviewPayload {
  moduleId?: string
  channel?: string
  [key: string]: unknown
}

export interface ModuleHostPreviewResult {
  sourceKind: string
  resolvedPreviewUrl: string
  entryPath?: string
  [key: string]: unknown
}

export function isLocalModuleBridgePreviewUrl(url: string): boolean
export function canUseLocalModuleBridgePreview(): boolean
export function getLocalModuleState(moduleId: string): unknown
export function resolveModuleChannel(): Promise<string>
export function fetchModuleCatalog(inputChannel?: string): Promise<unknown>
export function fetchModuleManifest(manifestUrl: string): Promise<unknown>
export function resolveModuleHostPreviewSource(payload?: ModuleHostPreviewPayload, options?: Record<string, unknown>): ModuleHostPreviewResult
export function normalizeModuleHostSessionPayload(payload?: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>
export function prepareModuleBundle(options: { channel?: string; moduleInfo?: unknown; manifest?: unknown }): Promise<unknown>
export const prepareAndOpenModule: (options: { channel?: string; moduleInfo?: unknown; manifest?: unknown }) => Promise<unknown>
export function getModuleCdnBase(): string
