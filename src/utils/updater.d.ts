export interface UpdateDownloadSource {
  label: string
  tag: string
}

export const isOfficialDownloadUrl: (url: string) => boolean
export const describeUpdateDownloadSource: (url: string, index?: number) => UpdateDownloadSource
export const buildCdnReleaseAssetUrls: (downloadDir: string, filename: string) => string[]
export const buildUpdateDownloadUrls: (tag: string, filename: string, primaryUrl?: string) => string[]
export const buildDownloadOpenUrls: (downloadUrls: string[]) => string[]
export function toGhProxyUrl(url: string): string
export function compareVersions(v1: string, v2: string): number
export function isCurrentInstallDev(version: string): boolean
export const normalizeUpdateChannel: (value: unknown) => string
export const getUpdateChannel: () => string
export const setUpdateChannel: (channel: string) => string
export const getSkippedVersionKey: (channel?: string) => string
export const getSkippedVersion: (channel?: string) => string
export const setSkippedVersion: (version: string, channel?: string) => void
export function isDevRelease(release: unknown): boolean
export function shouldOfferRelease(release: unknown, currentVersion: string, channel?: string): boolean
export const normalizeCdnManifestAsRelease: (
  manifest: unknown,
  cdnBase?: string
) => Record<string, unknown>
export const mergeCdnReleaseWithApiNotes: (
  cdnRelease: unknown,
  apiRelease: unknown
) => Record<string, unknown>
export function checkForUpdates(
  currentVersion: string,
  options?: Record<string, unknown>
): Promise<Record<string, unknown>>
export function downloadUpdate(
  downloadUrls: string[],
  filename: string,
  onProgress?: (progress: unknown) => void
): Promise<unknown>
export function getCurrentVersion(): Promise<string>

declare const _default: Record<string, unknown>
export default _default
