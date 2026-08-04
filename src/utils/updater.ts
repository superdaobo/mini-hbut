// @ts-expect-error Legacy updater implementation is isolated behind this typed facade.
import runtime, * as updaterRuntime from './updater.runtime.js'

export type UpdateChannel = 'stable' | 'beta' | 'dev'

export interface ReleaseAsset {
  name?: string
  browser_download_url?: string
  [key: string]: unknown
}

export interface ReleaseInfo extends Record<string, unknown> {
  tag_name?: string
  version?: string
  prerelease?: boolean
  draft?: boolean
  body?: string
  html_url?: string
  published_at?: string
  assets?: ReleaseAsset[]
}

export interface NormalizedReleaseInfo extends ReleaseInfo {
  assets: ReleaseAsset[]
}

export interface UpdateCheckOptions {
  channel?: UpdateChannel | string
}

export interface UpdateCheckResult extends Record<string, unknown> {
  hasUpdate?: boolean
  error?: boolean
  message?: string
  mode?: string
  currentVersion?: string
  latestVersion?: string
  tagName?: string
  channel?: UpdateChannel
  releaseNotes?: string
  releaseUrl?: string
  downloadUrls?: string[]
  preferredDownloadUrl?: string
  assetName?: string
  platform?: string
  publishedAt?: string
}

export interface DownloadUpdateResult {
  success: true
  method: 'external-open'
  url: string
  filename: string
}

export const isOfficialDownloadUrl = updaterRuntime.isOfficialDownloadUrl as (url: unknown) => boolean
export interface UpdateDownloadSource { label: string; tag: string }
export const describeUpdateDownloadSource = updaterRuntime.describeUpdateDownloadSource as (
  url: unknown,
  index?: number
) => UpdateDownloadSource
export const buildCdnReleaseAssetUrls = updaterRuntime.buildCdnReleaseAssetUrls as (
  downloadDir: unknown,
  filename: unknown
) => string[]
export const buildUpdateDownloadUrls = updaterRuntime.buildUpdateDownloadUrls as (
  tag: unknown,
  filename: unknown,
  primaryUrl?: unknown
) => string[]
export const buildDownloadOpenUrls = updaterRuntime.buildDownloadOpenUrls as (
  downloadUrls: readonly string[]
) => string[]
export const toGhProxyUrl = updaterRuntime.toGhProxyUrl as (url: unknown) => string
export const compareVersions = updaterRuntime.compareVersions as (
  first: unknown,
  second: unknown
) => number
export const isCurrentInstallDev = updaterRuntime.isCurrentInstallDev as (
  version: unknown
) => boolean
export const normalizeUpdateChannel = updaterRuntime.normalizeUpdateChannel as (
  value: unknown
) => UpdateChannel
export const getUpdateChannel = updaterRuntime.getUpdateChannel as () => UpdateChannel
export const setUpdateChannel = updaterRuntime.setUpdateChannel as (
  channel: unknown
) => UpdateChannel
export const getSkippedVersionKey = updaterRuntime.getSkippedVersionKey as (
  channel?: UpdateChannel
) => string
export const getSkippedVersion = updaterRuntime.getSkippedVersion as (
  channel?: UpdateChannel
) => string
export const setSkippedVersion = updaterRuntime.setSkippedVersion as (
  version: unknown,
  channel?: UpdateChannel
) => void
export const isDevRelease = updaterRuntime.isDevRelease as (release: ReleaseInfo) => boolean
export const shouldOfferRelease = updaterRuntime.shouldOfferRelease as (
  release: ReleaseInfo,
  currentVersion: unknown,
  channel?: UpdateChannel
) => boolean
export const normalizeCdnManifestAsRelease = updaterRuntime.normalizeCdnManifestAsRelease as (
  manifest: unknown,
  cdnBase?: string
) => NormalizedReleaseInfo
export const mergeCdnReleaseWithApiNotes = updaterRuntime.mergeCdnReleaseWithApiNotes as (
  cdnRelease: ReleaseInfo,
  apiRelease: ReleaseInfo | null
) => NormalizedReleaseInfo
export const checkForUpdates = updaterRuntime.checkForUpdates as (
  currentVersion: string,
  options?: UpdateCheckOptions
) => Promise<UpdateCheckResult>
export const downloadUpdate = updaterRuntime.downloadUpdate as (
  downloadUrls: string[],
  filename?: string,
  onProgress?: ((progress: number) => void) | null
) => Promise<DownloadUpdateResult>
export const getCurrentVersion = updaterRuntime.getCurrentVersion as () => Promise<string>

export default runtime as {
  checkForUpdates: typeof checkForUpdates
  downloadUpdate: typeof downloadUpdate
  getCurrentVersion: typeof getCurrentVersion
  compareVersions: typeof compareVersions
  toGhProxyUrl: typeof toGhProxyUrl
  getUpdateChannel: typeof getUpdateChannel
  setUpdateChannel: typeof setUpdateChannel
  normalizeUpdateChannel: typeof normalizeUpdateChannel
  getSkippedVersion: typeof getSkippedVersion
  setSkippedVersion: typeof setSkippedVersion
  shouldOfferRelease: typeof shouldOfferRelease
  isDevRelease: typeof isDevRelease
  isCurrentInstallDev: typeof isCurrentInstallDev
}
