// 测试 fixture：updater 模块类型声明（与 updater.js 导出对齐）
export interface UpdateReleaseAsset {
  browser_download_url: string
  name?: string
  [key: string]: unknown
}

export interface UpdateRelease {
  version: string
  tag_name?: string
  channel?: string
  prerelease?: boolean
  downloadDir?: string
  body?: string
  notes?: string
  url?: string
  assets?: UpdateReleaseAsset[]
  [key: string]: unknown
}

export interface MergedUpdateRelease extends UpdateRelease {
  assets: UpdateReleaseAsset[]
}

export type UpdateDownloadUrls = string[]

export function isOfficialDownloadUrl(url: string): boolean
export function describeUpdateDownloadSource(url: string, index?: number): { label: string; tag: string }
export function buildCdnReleaseAssetUrls(downloadDir: string, filename: string): string[]
export function buildUpdateDownloadUrls(tag: string, filename: string, primaryUrl?: string): UpdateDownloadUrls
export function buildDownloadOpenUrls(downloadUrls: string[]): string[]
export function toGhProxyUrl(url: string): string
export function compareVersions(v1: string, v2: string): number
export function isCurrentInstallDev(version: string): boolean
export function normalizeUpdateChannel(value: unknown): string
export function getUpdateChannel(): string
export function setUpdateChannel(channel: string): void
export function getSkippedVersionKey(channel?: string): string
export function getSkippedVersion(channel?: string): string | null
export function setSkippedVersion(version: string, channel?: string): void
export function isDevRelease(release: UpdateRelease): boolean
export function shouldOfferRelease(release: UpdateRelease, currentVersion: string, channel?: string): boolean
export function normalizeCdnManifestAsRelease(manifest: unknown, cdnBase?: string): UpdateRelease
export function mergeCdnReleaseWithApiNotes(cdnRelease: UpdateRelease, apiRelease: unknown): MergedUpdateRelease
export function checkForUpdates(currentVersion: string, options?: Record<string, unknown>): Promise<{
  mode: string
  hasUpdate: boolean
  message?: string
  [key: string]: unknown
}>
export function downloadUpdate(downloadUrls: UpdateDownloadUrls, filename: string, onProgress?: (progress: unknown) => void): Promise<unknown>
export function getCurrentVersion(): Promise<string>
