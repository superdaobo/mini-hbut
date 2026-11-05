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

// #1168 T07：远端嵌入白名单
export const MODULE_REMOTE_OPEN_HOSTS: readonly string[]
export function isTrustedRemoteModuleUrl(url: string): boolean
// #1166 T05：签名类错误码 → i18n key
export const MODULE_SIGNING_ERROR_CODES: readonly string[]
export function extractModuleSigningErrorCode(message: string): string
export function moduleSigningErrorKey(message: string): string
// #1165 T04：模块内容独立 origin
export const MODULE_CONTENT_PORT: number
export function getModuleContentOrigin(): string
export function isLocalModuleContentOrigin(origin: string): boolean
export function isLocalModuleBridgePreviewUrl(url: string): boolean
export function canUseLocalModuleBridgePreview(): boolean
export function getLocalModuleState(moduleId: string): unknown
export function deleteModuleState(moduleId: string): boolean
export function readCachedManifestSnapshot(manifestUrl: string): any
export function writeCachedManifestSnapshot(manifest: Record<string, unknown>): void
export function deleteCachedManifestSnapshot(manifestUrl: string): boolean
export function pickFirstReachableUrl(
  candidates: string[],
  probe?: (url: string, timeoutMs?: number) => boolean | Promise<boolean>
): Promise<string>
export function resolveModuleChannel(): Promise<string>
export function fetchModuleCatalog(inputChannel?: string): Promise<unknown>
export function fetchModuleManifest(
  manifestUrl: string,
  options?: { allowCache?: boolean }
): Promise<any>
export function resolveModuleHostPreviewSource(payload?: ModuleHostPreviewPayload, options?: Record<string, unknown>): ModuleHostPreviewResult
export function normalizeModuleHostSessionPayload(payload?: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>
export function prepareModuleBundle(options: { channel?: string; moduleInfo?: unknown; manifest?: unknown }): Promise<unknown>
export const prepareAndOpenModule: (options: { channel?: string; moduleInfo?: unknown; manifest?: unknown }) => Promise<unknown>
export function getModuleCdnBase(): string
