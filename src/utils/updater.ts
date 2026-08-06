/**
 * updater：更新检查 / 下载 / 频道管理的真实 TypeScript 实现。
 * 下载源常量与 URL 构造收敛在 ./updater_sources.ts，本文件承载版本语义、
 * 频道存储、发布判断与网络编排。
 */
import { openExternal } from './external_link'
import { getNativeAppVersion, invokeNative, isTauriRuntime } from '../platform/native'
import {
  API_PROXIES,
  CDN_BASES,
  DEV_API_PROXIES,
  GITHUB_PAGES_CDN_BASE,
  DEV_MANIFEST_URLS,
  DEV_RELEASE_TAG,
  EDGEONE_CDN_BASE,
  GH_DOWNLOAD_PROXY_PREFIX,
  GITHUB_RELEASES_URL,
  STABLE_MANIFEST_URLS,
  buildCdnReleaseAssetUrls,
  buildDownloadOpenUrls,
  buildUpdateDownloadUrls,
  describeUpdateDownloadSource,
  isOfficialDownloadUrl,
  toGhProxyUrl,
  withCacheBust
} from './updater_sources.js'

export type UpdateChannel = 'stable' | 'beta' | 'dev'

export interface ReleaseAsset {
  name?: string
  browser_download_url?: string
  [key: string]: unknown
}

export interface ReleaseInfo extends Record<string, unknown> {
  tag_name?: string
  name?: string
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

export interface UpdateDownloadSource { label: string; tag: string }

const UPDATE_CHANNEL_KEY = 'hbu_update_channel'
const SKIPPED_VERSION_STABLE_KEY = 'hbu_skipped_version'
const SKIPPED_VERSION_DEV_KEY = 'hbu_skipped_version_dev'

/** 无 localStorage 时（部分测试环境）的内存回退 */
const memoryPrefs = {
  channel: 'stable',
  skippedStable: '',
  skippedDev: ''
}

const storageGet = (key: string): string | null => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage.getItem(key)
    }
  } catch {
    // ignore
  }
  if (key === UPDATE_CHANNEL_KEY) return memoryPrefs.channel
  if (key === SKIPPED_VERSION_STABLE_KEY) return memoryPrefs.skippedStable
  if (key === SKIPPED_VERSION_DEV_KEY) return memoryPrefs.skippedDev
  return null
}

const storageSet = (key: string, value: string): void => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(key, value)
      return
    }
  } catch {
    // fall through to memory
  }
  if (key === UPDATE_CHANNEL_KEY) memoryPrefs.channel = value
  if (key === SKIPPED_VERSION_STABLE_KEY) memoryPrefs.skippedStable = value
  if (key === SKIPPED_VERSION_DEV_KEY) memoryPrefs.skippedDev = value
}

/** 归一化用户更新频道：stable | dev */
export const normalizeUpdateChannel = (value: unknown): UpdateChannel => {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'dev' || text === 'beta' || text === 'development' || text === 'nightly') return 'dev'
  return 'stable'
}

export const getUpdateChannel = (): UpdateChannel =>
  normalizeUpdateChannel(storageGet(UPDATE_CHANNEL_KEY))

export const setUpdateChannel = (channel: unknown): UpdateChannel => {
  const next = normalizeUpdateChannel(channel)
  storageSet(UPDATE_CHANNEL_KEY, next)
  return next
}

export const getSkippedVersionKey = (channel: UpdateChannel = getUpdateChannel()): string =>
  normalizeUpdateChannel(channel) === 'dev' ? SKIPPED_VERSION_DEV_KEY : SKIPPED_VERSION_STABLE_KEY

export const getSkippedVersion = (channel: UpdateChannel = getUpdateChannel()): string =>
  String(storageGet(getSkippedVersionKey(channel)) || '').trim()

export const setSkippedVersion = (version: unknown, channel: UpdateChannel = getUpdateChannel()): void => {
  const text = String(version || '').trim()
  if (!text) return
  storageSet(getSkippedVersionKey(channel), text)
}

interface ParsedVersion {
  raw: string
  core: number[]
  prerelease: Array<number | string>
  isPrerelease: boolean
}

function parseVersion(version: unknown): ParsedVersion {
  const raw = String(version || '').trim().replace(/^v/i, '')
  const [corePart, prereleasePart = ''] = raw.split('-', 2)
  const core = corePart
    .split('.')
    .map((segment) => {
      const match = String(segment || '').match(/^(\d+)/)
      return Number(match?.[1] || 0)
    })
  const prerelease = prereleasePart
    ? prereleasePart
        .split('.')
        .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : String(segment || '').toLowerCase()))
    : []
  return {
    raw,
    core,
    prerelease,
    isPrerelease: prerelease.length > 0
  }
}

export function compareVersions(v1: unknown, v2: unknown): number {
  const left = parseVersion(v1)
  const right = parseVersion(v2)
  const coreCmp = compareVersionCore(left, right)
  if (coreCmp !== 0) return coreCmp

  if (left.isPrerelease && !right.isPrerelease) return -1
  if (!left.isPrerelease && right.isPrerelease) return 1

  const preLen = Math.max(left.prerelease.length, right.prerelease.length)
  for (let i = 0; i < preLen; i += 1) {
    const lv = left.prerelease[i]
    const rv = right.prerelease[i]
    if (lv === undefined) return -1
    if (rv === undefined) return 1
    if (lv === rv) continue
    if (typeof lv === 'number' && typeof rv === 'number') return lv > rv ? 1 : -1
    if (typeof lv === 'number') return -1
    if (typeof rv === 'number') return 1
    return String(lv).localeCompare(String(rv))
  }

  return 0
}

function compareVersionCore(left: ParsedVersion, right: ParsedVersion): number {
  const len = Math.max(left.core.length, right.core.length)
  for (let i = 0; i < len; i += 1) {
    const lv = left.core[i] || 0
    const rv = right.core[i] || 0
    if (lv > rv) return 1
    if (lv < rv) return -1
  }
  return 0
}

function isPrereleaseVersion(version: unknown): boolean {
  return parseVersion(version).isPrerelease
}

/**
 * 当前安装是否为开发版/预发布构建。
 * 以版本字符串为准（含 -beta/-dev/-rc 等），与「接收更新频道」开关无关。
 */
export function isCurrentInstallDev(version: unknown): boolean {
  const text = String(version || '').replace(/^v/i, '').trim()
  if (!text) return false
  if (isPrereleaseVersion(text)) return true
  return /(^|[-._])(alpha|beta|rc|dev|nightly)([-._]|$)/i.test(text)
}

function isStableRelease(release: ReleaseInfo): boolean {
  const latestVersion = String(release?.version || release?.tag_name || '').replace(/^v/i, '')
  if (!latestVersion) return false
  if (release?.prerelease) return false
  if (isPrereleaseVersion(latestVersion)) return false

  const channel = String(release?.channel || '').trim().toLowerCase()
  if (channel && channel !== 'main' && channel !== 'stable' && channel !== 'release') {
    return false
  }

  const tag = String(release?.tag_name || '').trim().toLowerCase()
  if (/(^|[-._])(alpha|beta|rc|dev)([-._]|$)/.test(tag) || tag === 'dev-latest') {
    return false
  }

  return true
}

/** 是否为开发版/滚动 beta 产物（CDN channel=dev 或 tag=dev-latest） */
export function isDevRelease(release: ReleaseInfo | null | undefined): boolean {
  if (!release) return false
  const channel = String(release?.channel || '').trim().toLowerCase()
  if (channel === 'dev' || channel === 'beta') return true
  const tag = String(release?.tag_name || '').trim().toLowerCase()
  if (tag === DEV_RELEASE_TAG || tag === 'beta-latest') return true
  if (release?.prerelease) return true
  const version = String(release?.version || tag).replace(/^v/i, '')
  return isPrereleaseVersion(version)
}

/**
 * 是否应对用户提示更新。
 * - stable：仅正式版且核心版本真正更高；同 core 的 beta 不回落到正式版
 * - dev：允许 prerelease；完整 semver 比较；core 低于当前安装的 dev 不提示
 */
export function shouldOfferRelease(
  release: ReleaseInfo,
  currentVersion: unknown,
  channel: UpdateChannel | string = 'stable'
): boolean {
  const preferred = normalizeUpdateChannel(channel)
  const latestVersion = String(release?.version || release?.tag_name || '').replace(/^v/i, '')
  const currentText = String(currentVersion || '').replace(/^v/i, '')
  if (!latestVersion) return false

  if (preferred === 'stable') {
    if (!isStableRelease(release)) return false
    if (!currentText) return true
    const latest = parseVersion(latestVersion)
    const current = parseVersion(currentText)
    // 本项目 beta 后缀是滚动开发构建：当前是 beta 时，只有核心版本真正更高才提示
    // 对该 beta 的升级，否则 1.4.5-beta.363 会被错误提示"更新"到 1.4.5。
    if (current.isPrerelease) return compareVersionCore(latest, current) > 0
    return compareVersions(latestVersion, currentText) > 0
  }

  // 开发频道只跟踪 dev 滚动产物，避免把 /latest 稳定包误当 dev
  if (!isDevRelease(release)) return false
  if (!currentText) return true

  const latest = parseVersion(latestVersion)
  const current = parseVersion(currentText)
  // 远端 core 落后于当前安装（例如装了 1.4.4 却只剩 1.4.3-beta）→ 不提示
  const coreCmp = compareVersionCore(latest, current)
  if (coreCmp < 0) return false
  // 同 core：用户已装正式版，远端为更新/任意 beta → 允许（主动开 dev）
  if (coreCmp === 0 && !current.isPrerelease && latest.isPrerelease) return true
  return compareVersions(latestVersion, currentText) > 0
}

function getPlatform(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'ios'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

function getAssetPatterns(platform: string): RegExp[] {
  switch (platform) {
    case 'android':
      return [/\.apk$/i]
    case 'ios':
      return [/\.ipa$/i]
    case 'windows':
      return [/x64-setup\.exe$/i, /\.msi$/i, /\.exe$/i]
    case 'macos':
      // dev-latest 常为 .app.zip，稳定版多为 .dmg
      return [/\.dmg$/i, /\.app\.zip$/i, /universal\.app\.zip$/i, /\.zip$/i]
    case 'linux':
      return [/\.AppImage$/i, /\.deb$/i]
    default:
      return []
  }
}

const normalizePackageJsonAsRelease = (data: unknown): ReleaseInfo | null => {
  const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const version = obj.version
  if (!version) return null
  const tagName = `v${String(version).replace(/^v/, '')}`
  return {
    tag_name: tagName,
    name: tagName,
    body: obj.description ? String(obj.description) : '版本更新',
    html_url: GITHUB_RELEASES_URL,
    assets: [],
    published_at: new Date().toISOString()
  }
}

function buildExpectedAssetName(
  platform: string,
  version: unknown,
  { preferDevZip = false }: { preferDevZip?: boolean } = {}
): string {
  const v = String(version).replace(/^v/, '')
  switch (platform) {
    case 'windows': return `Mini-HBUT_${v}_x64-setup.exe`
    case 'macos': return preferDevZip
      ? `Mini-HBUT_${v}_universal.app.zip`
      : `Mini-HBUT_${v}_universal.dmg`
    case 'linux': return `Mini-HBUT_${v}_amd64.AppImage`
    case 'android': return `Mini-HBUT_${v}_arm64.apk`
    case 'ios': return `Mini-HBUT_${v}_iOS.ipa`
    default: return ''
  }
}

const extractReleaseNoteVersion = (notes: unknown): string => {
  const text = String(notes || '').trim()
  if (!text) return ''
  const headingMatch = text.match(/Mini-HBUT\s+v?(\d+\.\d+\.\d+(?:[-.\w]+)?)\s+更新说明/i)
  if (headingMatch?.[1]) return headingMatch[1].replace(/^v/i, '')
  const genericMatch = text.slice(0, 160).match(/\bv?(\d+\.\d+\.\d+(?:[-.\w]+)?)\b/i)
  return genericMatch?.[1] ? genericMatch[1].replace(/^v/i, '') : ''
}

const normalizeReleaseNotesForVersion = (notes: unknown, version: unknown): string => {
  const body = String(notes || '').trim()
  if (!body) return ''
  const expectedVersion = String(version || '').trim().replace(/^v/i, '')
  const noteVersion = extractReleaseNoteVersion(body)
  if (expectedVersion && noteVersion && compareVersions(noteVersion, expectedVersion) !== 0) {
    return ''
  }
  return body
}

interface CdnManifest {
  tag?: unknown
  assets?: unknown
  downloadDir?: unknown
  version?: unknown
  release_notes?: unknown
  body?: unknown
  generatedAt?: unknown
  prerelease?: unknown
  channel?: unknown
}

const normalizeCdnManifestAsRelease = (
  manifest: unknown,
  cdnBase = EDGEONE_CDN_BASE
): NormalizedReleaseInfo => {
  const raw = manifest && typeof manifest === 'object' ? (manifest as CdnManifest) : null
  if (!raw?.tag || !raw?.assets) return null as unknown as NormalizedReleaseInfo
  const tag = String(raw.tag || '').trim()
  const downloadDir = String(raw.downloadDir || tag).trim() || tag
  const version = String(raw.version || tag).replace(/^v/, '')
  const rawBody = String(raw.release_notes || raw.body || '').trim()
  const body = normalizeReleaseNotesForVersion(rawBody, version || tag)
  const assetBase = String(cdnBase || EDGEONE_CDN_BASE || GITHUB_PAGES_CDN_BASE || '').replace(/\/+$/, '')
  const assets = Object.values(raw.assets || {})
    .filter(Boolean)
    .map((filename) => ({
      name: filename,
      // 资产 URL 绑定实际命中的 CDN；下载时还会追加 GitHub 代理与另一 CDN 候选
      browser_download_url: assetBase
        ? `${assetBase}/releases/${downloadDir}/${filename}`
        : ''
    }))

  return {
    tag_name: tag,
    name: `v${version}`,
    body,
    html_url: `${GITHUB_RELEASES_URL}/tag/${tag}`,
    assets,
    published_at: raw.generatedAt ? String(raw.generatedAt) : undefined,
    version,
    prerelease: !!raw.prerelease,
    channel: String(raw.channel || '').trim(),
    downloadDir,
    __fromCdnManifest: true,
    __cdnBase: assetBase,
    __staleReleaseNotes: Boolean(rawBody && !body)
  }
}

const mergeCdnReleaseWithApiNotes = (
  cdnRelease: ReleaseInfo | null,
  apiRelease: ReleaseInfo | null
): NormalizedReleaseInfo => {
  if (!cdnRelease || !apiRelease) return (apiRelease || cdnRelease) as NormalizedReleaseInfo
  const cdnVersion = String(cdnRelease.version || cdnRelease.tag_name || '').replace(/^v/i, '')
  const apiVersion = String(apiRelease.version || apiRelease.tag_name || '').replace(/^v/i, '')
  if (!cdnVersion || !apiVersion) {
    return (apiRelease || cdnRelease) as NormalizedReleaseInfo
  }
  const cmp = compareVersions(cdnVersion, apiVersion)
  // 版本不一致时取更新的一侧，避免旧 API/缓存覆盖 CDN 已发布的正式版
  if (cmp !== 0) {
    return (cmp > 0 ? cdnRelease : apiRelease) as NormalizedReleaseInfo
  }
  return {
    ...cdnRelease,
    assets: cdnRelease.assets || [],
    body: apiRelease.body || cdnRelease.body || '',
    html_url: apiRelease.html_url || cdnRelease.html_url,
    published_at: apiRelease.published_at || cdnRelease.published_at,
    name: apiRelease.name || cdnRelease.name,
    __releaseNotesFromApi: Boolean(apiRelease.body)
  }
}

const describeError = (error: unknown): string => {
  if (!error) return ''
  if (error instanceof Error) return `${error.message}\n${error.stack || ''}`.trim()
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

const isRecoverableNativeFetchError = (error: unknown): boolean => {
  const text = describeError(error).toLowerCase()
  if (!text) return true
  return (
    text.includes('当前运行时不支持 invoke') ||
    text.includes('window.__tauri_internal') ||
    text.includes('__tauri_internal') ||
    text.includes('__tauri_ipc__') ||
    text.includes('tauri is not defined') ||
    text.includes('ipc channel not found') ||
    text.includes('could not find the webview window') ||
    text.includes('this command is not allowed') ||
    text.includes('not running in tauri')
  )
}

const withTimeout = async <T>(promise: Promise<T>, ms = 9000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const fetchJson = async (url: unknown, timeoutMs = 6000): Promise<unknown> => {
  const requestUrl = withCacheBust(url)

  if (isTauriRuntime()) {
    try {
      return await withTimeout(
        invokeNative('fetch_remote_json', { url: requestUrl }),
        timeoutMs
      )
    } catch (error) {
      if (!isRecoverableNativeFetchError(error)) {
        throw error
      }
    }
  }

  const resp = await withTimeout(
    fetch(requestUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }),
    timeoutMs
  )
  if (!resp.ok) {
    throw new Error(`请求远程 JSON 失败: HTTP ${resp.status}`)
  }
  return (await resp.json()) as unknown
}

/** 给清单 URL 加缓存破坏参数，避免 EdgeOne 对 alias JSON 错误下发 long-cache */
const withManifestCacheBust = (url: unknown): string => {
  const text = String(url || '').trim()
  if (!text) return text
  try {
    const parsed = new URL(text)
    parsed.searchParams.set('_cb', String(Date.now()))
    return parsed.toString()
  } catch {
    const join = text.includes('?') ? '&' : '?'
    return `${text}${join}_cb=${Date.now()}`
  }
}

interface CdnManifestHit {
  manifest: CdnManifest
  base: string
}

/** 按 CDN 顺序拉取 manifest；返回 { manifest, base } 或 null */
const fetchFirstCdnManifest = async (
  urls: readonly string[],
  timeoutMs = 6000
): Promise<CdnManifestHit | null> => {
  for (const url of urls || []) {
    const text = String(url || '').trim()
    if (!text) continue
    try {
      const manifest = (await fetchJson(withManifestCacheBust(text), timeoutMs)) as CdnManifest | null
      if (!manifest?.tag || !manifest?.assets) continue
      const base = CDN_BASES.find((b) => text.startsWith(`${b}/`)) || EDGEONE_CDN_BASE
      return { manifest, base }
    } catch {
      // try next CDN
    }
  }
  return null
}

async function fetchStableReleaseInfo(currentVersion: string): Promise<ReleaseInfo | null> {
  let cdnCandidate: ReleaseInfo | null = null
  // EdgeOne 主站 → GitHub Pages 备用 → GitHub API
  const hit = await fetchFirstCdnManifest(STABLE_MANIFEST_URLS, 6000)
  if (hit) {
    const release = normalizeCdnManifestAsRelease(hit.manifest, hit.base)
    if (release && shouldOfferRelease(release, currentVersion, 'stable')) {
      if (release.__staleReleaseNotes) {
        cdnCandidate = release
      } else {
        return release
      }
    } else if (release) {
      // 即使无需升级也保留 candidate，供 UI 展示 latestVersion
      cdnCandidate = release
    }
  }

  let fallback: ReleaseInfo | null = null
  for (const url of API_PROXIES) {
    try {
      const data = (await fetchJson(url, 9000)) as ReleaseInfo | null
      const release = data?.tag_name ? data : normalizePackageJsonAsRelease(data)
      if (!release) continue
      // 优先保留含 assets 的 release，避免 jsdelivr 空 assets 覆盖完整数据
      if (!fallback || (release.assets?.length || 0) > (fallback.assets?.length || 0)) {
        fallback = release
      }
      if (shouldOfferRelease(release, currentVersion, 'stable')) {
        return mergeCdnReleaseWithApiNotes(cdnCandidate, release)
      }
    } catch {
      // try next proxy
    }
  }
  return cdnCandidate || fallback
}

async function fetchDevReleaseInfo(currentVersion: string): Promise<ReleaseInfo | null> {
  let cdnCandidate: ReleaseInfo | null = null
  const hit = await fetchFirstCdnManifest(DEV_MANIFEST_URLS, 6000)
  if (hit) {
    const release = normalizeCdnManifestAsRelease(hit.manifest, hit.base)
    if (release) {
      // 强制标记为 dev，避免旧 manifest 缺 channel
      release.channel = release.channel || 'dev'
      release.prerelease = true
      if (!release.tag_name) release.tag_name = DEV_RELEASE_TAG
      cdnCandidate = release
      if (shouldOfferRelease(release, currentVersion, 'dev') && !release.__staleReleaseNotes) {
        return release
      }
    }
  }

  let fallback: ReleaseInfo | null = null
  for (const url of DEV_API_PROXIES) {
    try {
      const data = (await fetchJson(url, 9000)) as ReleaseInfo | null
      if (!data?.tag_name && !data?.assets) continue
      const release: ReleaseInfo = {
        ...data,
        prerelease: true,
        channel: 'dev',
        version: String(data.tag_name || DEV_RELEASE_TAG).replace(/^v/i, '')
      }
      // tag 固定为 dev-latest，版本号尽量从 asset 名解析
      if (Array.isArray(data.assets) && data.assets.length) {
        const sample = String(data.assets[0]?.name || '')
        const m = sample.match(/Mini-HBUT_([^_]+)_/i)
        if (m?.[1]) release.version = m[1]
      }
      if (!fallback || (release.assets?.length || 0) > (fallback.assets?.length || 0)) {
        fallback = release
      }
      if (shouldOfferRelease(release, currentVersion, 'dev')) {
        return mergeCdnReleaseWithApiNotes(cdnCandidate, release)
      }
    } catch {
      // try next
    }
  }
  return cdnCandidate || fallback
}

async function fetchReleaseInfo(
  currentVersion: string,
  channel: UpdateChannel | string = 'stable'
): Promise<ReleaseInfo | null> {
  const preferred = normalizeUpdateChannel(channel)
  if (preferred === 'dev') return fetchDevReleaseInfo(currentVersion)
  return fetchStableReleaseInfo(currentVersion)
}

interface BuildUpdateResult extends UpdateCheckResult {
  isPrerelease?: boolean
  pending?: boolean
}

const buildUpdateResultFromRelease = (
  release: ReleaseInfo,
  currentVersion: string,
  channel: UpdateChannel | string
): BuildUpdateResult => {
  const preferred = normalizeUpdateChannel(channel)
  const tagName = release.tag_name || release.name || ''
  const latestVersion = String(release.version || tagName).replace(/^v/, '')
  const currentText = String(currentVersion || '').replace(/^v/, '')
  const platform = getPlatform()
  const patterns = getAssetPatterns(platform)
  const isPrerelease = preferred === 'dev' || isDevRelease(release) || isPrereleaseVersion(latestVersion)

  if (!shouldOfferRelease(release, currentText, preferred)) {
    return {
      hasUpdate: false,
      currentVersion: currentText,
      latestVersion,
      tagName,
      channel: preferred,
      isPrerelease,
      platform
    }
  }

  let asset: ReleaseAsset | null = null
  if (Array.isArray(release.assets) && release.assets.length > 0) {
    for (const pattern of patterns) {
      asset = release.assets.find((item) => pattern.test(item.name || '')) || null
      if (asset) break
    }
  }

  // 下载 tag：CDN/GH 滚动 dev 使用 dev-latest 目录名
  const downloadTag = preferred === 'dev'
    ? (String(release.downloadDir || tagName || DEV_RELEASE_TAG).trim() || DEV_RELEASE_TAG)
    : tagName

  const releaseUrl =
    toGhProxyUrl(release.html_url) || release.html_url || `${GH_DOWNLOAD_PROXY_PREFIX}${GITHUB_RELEASES_URL}`

  if (!asset) {
    const versionForName = preferred === 'dev' ? latestVersion : tagName
    const expectedName = buildExpectedAssetName(platform, versionForName, {
      preferDevZip: preferred === 'dev'
    })
    if (expectedName) {
      const downloadUrls = buildUpdateDownloadUrls(downloadTag, expectedName)
      return {
        hasUpdate: true,
        currentVersion: currentText,
        latestVersion,
        tagName,
        channel: preferred,
        isPrerelease,
        releaseNotes: release.body || '暂无更新说明',
        releaseUrl,
        downloadUrls,
        preferredDownloadUrl: downloadUrls[0] || '',
        assetName: expectedName,
        platform,
        publishedAt: release.published_at
      }
    }
    return {
      hasUpdate: false,
      pending: true,
      currentVersion: currentText,
      latestVersion,
      tagName,
      channel: preferred,
      isPrerelease,
      releaseNotes: release.body || '暂无更新说明',
      releaseUrl,
      platform,
      publishedAt: release.published_at
    }
  }

  const downloadUrls = buildUpdateDownloadUrls(downloadTag, asset.name, asset.browser_download_url)
  return {
    hasUpdate: true,
    currentVersion: currentText,
    latestVersion,
    tagName,
    channel: preferred,
    isPrerelease,
    releaseNotes: release.body || '暂无更新说明',
    releaseUrl,
    downloadUrls,
    preferredDownloadUrl: downloadUrls[0] || '',
    assetName: asset.name,
    platform,
    publishedAt: release.published_at
  }
}

export async function checkForUpdates(
  currentVersion: string,
  options: UpdateCheckOptions = {}
): Promise<UpdateCheckResult> {
  // 合规 iOS 包禁止 GitHub/CDN 更新；调用方应改走 apple_app_update
  try {
    const { allowsInAppGithubUpdater } = await import('../config/app_store_policy')
    if (!allowsInAppGithubUpdater()) {
      return {
        mode: 'apple_storefront',
        hasUpdate: false,
        error: false,
        message: '本安装通过 App Store / TestFlight 分发，请使用苹果更新。',
        currentVersion,
        channel: normalizeUpdateChannel(options.channel ?? getUpdateChannel())
      }
    }
  } catch {
    // 策略模块异常时不阻断非合规路径
  }

  const channel = normalizeUpdateChannel(options.channel ?? getUpdateChannel())
  try {
    const release = await fetchReleaseInfo(currentVersion, channel)
    if (!release) {
      return {
        error: true,
        message: '无法连接更新服务',
        currentVersion,
        channel
      }
    }

    // stable 频道若只拿到 prerelease，视为无正式更新
    if (channel === 'stable' && !isStableRelease(release) && !shouldOfferRelease(release, currentVersion, 'stable')) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: String(release.version || release.tag_name || '').replace(/^v/, ''),
        channel
      }
    }

    return buildUpdateResultFromRelease(release, currentVersion, channel)
  } catch (error) {
    return {
      error: true,
      message: (error as Error | undefined)?.message || '检查更新失败',
      currentVersion,
      channel
    }
  }
}

const openFirstUrl = async (
  downloadUrls: readonly string[]
): Promise<{ success: boolean; url?: string }> => {
  for (const url of downloadUrls || []) {
    const ok = await openExternal(url)
    if (ok) return { success: true, url }
  }
  return { success: false }
}

export async function downloadUpdate(
  downloadUrls: string[],
  filename?: string,
  onProgress?: ((progress: number) => void) | null
): Promise<DownloadUpdateResult> {
  if (!Array.isArray(downloadUrls) || downloadUrls.length === 0) {
    throw new Error('没有可用的下载链接')
  }

  const preferred = buildDownloadOpenUrls(downloadUrls)
  if (typeof onProgress === 'function') onProgress(20)
  const opened = await openFirstUrl(preferred)
  if (opened.success) {
    if (typeof onProgress === 'function') onProgress(100)
    return {
      success: true,
      method: 'external-open',
      url: opened.url || '',
      filename: filename || ''
    }
  }

  throw new Error('无法打开浏览器下载链接')
}

/**
 * 读取当前安装版本：
 * 1. 原生包版本（Tauri/Capacitor）— 开发版 APK 可能带 -beta，优先于构建期注入
 * 2. Vite 注入 VITE_APP_VERSION
 * 3. 兜底 1.0.0
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    const native = await getNativeAppVersion()
    const nativeText = String(native || '').trim()
    if (nativeText) return nativeText.replace(/^v/i, '')
  } catch {
    // fall through
  }
  const viteVersion = String(import.meta.env.VITE_APP_VERSION || '').trim()
  if (viteVersion) return viteVersion.replace(/^v/i, '')
  return '1.0.0'
}

export {
  isOfficialDownloadUrl,
  describeUpdateDownloadSource,
  buildCdnReleaseAssetUrls,
  buildUpdateDownloadUrls,
  buildDownloadOpenUrls,
  toGhProxyUrl,
  normalizeCdnManifestAsRelease,
  mergeCdnReleaseWithApiNotes
}

export default {
  checkForUpdates,
  downloadUpdate,
  getCurrentVersion,
  compareVersions,
  toGhProxyUrl,
  getUpdateChannel,
  setUpdateChannel,
  normalizeUpdateChannel,
  getSkippedVersion,
  setSkippedVersion,
  shouldOfferRelease,
  isDevRelease,
  isCurrentInstallDev
}
