import { openExternal } from './external_link'
import { getNativeAppVersion, invokeNative, isTauriRuntime } from '../platform/native'

const GITHUB_REPO = 'superdaobo/mini-hbut'
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`
const GH_API_PROXY_PREFIX = 'https://gh-proxy.com/'
const GH_DOWNLOAD_PROXY_PREFIX = 'https://gh-proxy.org/'

// 主 CDN：腾讯云 EdgeOne Pages；备用：GitHub Pages 项目站（/mini-hbut）
const EDGEONE_CDN_BASE = 'https://hbut.6661111.xyz'
const GITHUB_PAGES_CDN_BASE = 'https://superdaobo.github.io/mini-hbut'
/** 更新清单 / 安装包 CDN 顺序：EdgeOne 优先，GitHub Pages 备用 */
const CDN_BASES = Object.freeze(
  [EDGEONE_CDN_BASE, GITHUB_PAGES_CDN_BASE].filter((base) => String(base || '').trim())
)
// latest.json 在 EdgeOne 上为 max-age=0；stable-latest 曾被标成 immutable 长缓存，优先 latest
const STABLE_MANIFEST_URLS = CDN_BASES.flatMap((base) => [
  `${base}/releases/latest.json`,
  `${base}/releases/stable-latest.json`
])
const DEV_MANIFEST_URLS = CDN_BASES.map((base) => `${base}/releases/dev-latest.json`)
// 兼容旧引用
const STABLE_MANIFEST_URL = STABLE_MANIFEST_URLS[0] || ''
const DEV_MANIFEST_URL = DEV_MANIFEST_URLS[0] || ''
const UPDATE_CHANNEL_KEY = 'hbu_update_channel'
const SKIPPED_VERSION_STABLE_KEY = 'hbu_skipped_version'
const SKIPPED_VERSION_DEV_KEY = 'hbu_skipped_version_dev'
const DEV_RELEASE_TAG = 'dev-latest'

/** 无 localStorage 时（部分测试环境）的内存回退 */
const memoryPrefs = {
  channel: 'stable',
  skippedStable: '',
  skippedDev: ''
}

const storageGet = (key) => {
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

const storageSet = (key, value) => {
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

const API_PROXIES = [
  `${GH_API_PROXY_PREFIX}https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@latest/package.json`
]

const DEV_API_PROXIES = [
  `${GH_API_PROXY_PREFIX}https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${DEV_RELEASE_TAG}`,
  `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${DEV_RELEASE_TAG}`
]

const DOWNLOAD_PROXIES = [
  (tag, filename) => `https://ghfast.top/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://v4.gh-proxy.org/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `${GH_DOWNLOAD_PROXY_PREFIX}https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://cdn.gh-proxy.org/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`
]

export const isOfficialDownloadUrl = (url) => {
  const value = String(url || '').trim()
  if (!value) return false
  return CDN_BASES.some((base) => value.startsWith(`${base}/releases/`))
}

export const describeUpdateDownloadSource = (url, index = 0) => {
  const value = String(url || '').trim()
  if (EDGEONE_CDN_BASE && value.startsWith(`${EDGEONE_CDN_BASE}/`)) {
    return { label: 'EdgeOne 主站', tag: 'edgeone' }
  }
  if (GITHUB_PAGES_CDN_BASE && value.startsWith(`${GITHUB_PAGES_CDN_BASE}/`)) {
    return { label: 'GitHub Pages 备用', tag: 'ghpages' }
  }
  if (value.includes('ghfast.top')) {
    return { label: '代理下载 1', tag: 'proxy1' }
  }
  if (value.includes('v4.gh-proxy.org')) {
    return { label: '代理下载 2', tag: 'proxy2' }
  }
  if (value.includes('gh-proxy.org') && !value.includes('cdn.gh-proxy.org')) {
    return { label: '代理下载 3', tag: 'proxy3' }
  }
  if (value.includes('cdn.gh-proxy.org')) {
    return { label: '代理下载 4', tag: 'proxy4' }
  }
  if (value.includes('ghproxy.net') || value.includes('mirror.ghproxy.com')) {
    return { label: `代理下载 ${index + 1}`, tag: `proxy${index + 1}` }
  }
  if (value.startsWith('https://github.com/')) {
    return { label: 'GitHub 源站', tag: 'github' }
  }
  return { label: `线路 ${index + 1}`, tag: `line${index}` }
}

/** CDN 安装包直链（EdgeOne 主 + GitHub Pages 备用），用于清单归一化与探测 */
export const buildCdnReleaseAssetUrls = (downloadDir, filename) => {
  const dir = String(downloadDir || '').trim().replace(/^\/+|\/+$/g, '')
  const name = String(filename || '').trim().replace(/^\/+/, '')
  if (!dir || !name) return []
  return CDN_BASES.map((base) => `${base}/releases/${dir}/${name}`)
}

export const buildUpdateDownloadUrls = (tag, filename, primaryUrl = '') => {
  // 下载列表：GitHub 代理链 + 源站；CDN 官方直链由 isOfficialDownloadUrl 过滤（UI 不重复展示）
  // 清单阶段已用 EdgeOne → GitHub Pages 双 CDN 探测版本
  const candidates = [
    ...DOWNLOAD_PROXIES.map((fn) => fn(tag, filename)),
    primaryUrl,
    ...buildCdnReleaseAssetUrls(tag, filename)
  ]
  return uniqueUrls(candidates).filter((url) => !isOfficialDownloadUrl(url))
}

export const buildDownloadOpenUrls = (downloadUrls) =>
  uniqueUrls(downloadUrls).filter((url) => !isOfficialDownloadUrl(url))

export function toGhProxyUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.startsWith('https://gh-proxy.org/')) return value
  if (value.startsWith('https://gh-proxy.com/')) return value
  if (value.startsWith('https://mirror.ghproxy.com/')) return value
  if (value.startsWith('https://github.com/')) return `${GH_DOWNLOAD_PROXY_PREFIX}${value}`
  return value
}

const uniqueUrls = (list) => {
  const seen = new Set()
  const out = []
  for (const item of list || []) {
    const url = String(item || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

const withCacheBust = (url) => {
  const text = String(url || '').trim()
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

const describeError = (error) => {
  if (!error) return ''
  if (error instanceof Error) return `${error.message}\n${error.stack || ''}`.trim()
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

const isRecoverableNativeFetchError = (error) => {
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

const fetchJson = async (url, timeoutMs = 6000) => {
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
  return resp.json()
}

const withTimeout = async (promise, ms = 9000) => {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

function parseVersion(version) {
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

export function compareVersions(v1, v2) {
  const left = parseVersion(v1)
  const right = parseVersion(v2)
  const len = Math.max(left.core.length, right.core.length)
  for (let i = 0; i < len; i += 1) {
    const lv = left.core[i] || 0
    const rv = right.core[i] || 0
    if (lv > rv) return 1
    if (lv < rv) return -1
  }

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

function isPrereleaseVersion(version) {
  return parseVersion(version).isPrerelease
}

/**
 * 当前安装是否为开发版/预发布构建。
 * 以版本字符串为准（含 -beta/-dev/-rc 等），与「接收更新频道」开关无关。
 */
export function isCurrentInstallDev(version) {
  const text = String(version || '').replace(/^v/i, '').trim()
  if (!text) return false
  if (isPrereleaseVersion(text)) return true
  return /(^|[-._])(alpha|beta|rc|dev|nightly)([-._]|$)/i.test(text)
}

/** 归一化用户更新频道：stable | dev */
export const normalizeUpdateChannel = (value) => {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'dev' || text === 'beta' || text === 'development' || text === 'nightly') return 'dev'
  return 'stable'
}

export const getUpdateChannel = () => normalizeUpdateChannel(storageGet(UPDATE_CHANNEL_KEY))

export const setUpdateChannel = (channel) => {
  const next = normalizeUpdateChannel(channel)
  storageSet(UPDATE_CHANNEL_KEY, next)
  return next
}

export const getSkippedVersionKey = (channel = getUpdateChannel()) =>
  normalizeUpdateChannel(channel) === 'dev' ? SKIPPED_VERSION_DEV_KEY : SKIPPED_VERSION_STABLE_KEY

export const getSkippedVersion = (channel = getUpdateChannel()) =>
  String(storageGet(getSkippedVersionKey(channel)) || '').trim()

export const setSkippedVersion = (version, channel = getUpdateChannel()) => {
  const text = String(version || '').trim()
  if (!text) return
  storageSet(getSkippedVersionKey(channel), text)
}

function isStableRelease(release) {
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
export function isDevRelease(release) {
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
 * - stable：仅正式版且版本更高（含「当前为 beta、远端同 core 正式版」可提示回落）
 * - dev：允许 prerelease；完整 semver 比较；core 低于当前安装的 dev 不提示
 */
export function shouldOfferRelease(release, currentVersion, channel = 'stable') {
  const preferred = normalizeUpdateChannel(channel)
  const latestVersion = String(release?.version || release?.tag_name || '').replace(/^v/i, '')
  const currentText = String(currentVersion || '').replace(/^v/i, '')
  if (!latestVersion) return false

  if (preferred === 'stable') {
    if (!isStableRelease(release)) return false
    if (!currentText) return true
    return compareVersions(latestVersion, currentText) > 0
  }

  // 开发频道只跟踪 dev 滚动产物，避免把 /latest 稳定包误当 dev
  if (!isDevRelease(release)) return false
  if (!currentText) return true

  const latest = parseVersion(latestVersion)
  const current = parseVersion(currentText)
  // 远端 core 落后于当前安装（例如装了 1.4.4 却只剩 1.4.3-beta）→ 不提示
  const coreCmp = (() => {
    const len = Math.max(latest.core.length, current.core.length)
    for (let i = 0; i < len; i += 1) {
      const lv = latest.core[i] || 0
      const rv = current.core[i] || 0
      if (lv > rv) return 1
      if (lv < rv) return -1
    }
    return 0
  })()
  if (coreCmp < 0) return false
  // 同 core：用户已装正式版，远端为更新/任意 beta → 允许（主动开 dev）
  if (coreCmp === 0 && !current.isPrerelease && latest.isPrerelease) return true
  return compareVersions(latestVersion, currentText) > 0
}

function getPlatform() {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'ios'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

function getAssetPatterns(platform) {
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

const normalizePackageJsonAsRelease = (data) => {
  const version = data?.version
  if (!version) return null
  const tagName = `v${String(version).replace(/^v/, '')}`
  return {
    tag_name: tagName,
    name: tagName,
    body: data?.description || '版本更新',
    html_url: GITHUB_RELEASES_URL,
    assets: [],
    published_at: new Date().toISOString()
  }
}

function buildExpectedAssetName(platform, version, { preferDevZip = false } = {}) {
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

const extractReleaseNoteVersion = (notes) => {
  const text = String(notes || '').trim()
  if (!text) return ''
  const headingMatch = text.match(/Mini-HBUT\s+v?(\d+\.\d+\.\d+(?:[-.\w]+)?)\s+更新说明/i)
  if (headingMatch?.[1]) return headingMatch[1].replace(/^v/i, '')
  const genericMatch = text.slice(0, 160).match(/\bv?(\d+\.\d+\.\d+(?:[-.\w]+)?)\b/i)
  return genericMatch?.[1] ? genericMatch[1].replace(/^v/i, '') : ''
}

const normalizeReleaseNotesForVersion = (notes, version) => {
  const body = String(notes || '').trim()
  if (!body) return ''
  const expectedVersion = String(version || '').trim().replace(/^v/i, '')
  const noteVersion = extractReleaseNoteVersion(body)
  if (expectedVersion && noteVersion && compareVersions(noteVersion, expectedVersion) !== 0) {
    return ''
  }
  return body
}

export const normalizeCdnManifestAsRelease = (manifest, cdnBase = EDGEONE_CDN_BASE) => {
  if (!manifest?.tag || !manifest?.assets) return null
  const tag = String(manifest.tag || '').trim()
  const downloadDir = String(manifest.downloadDir || tag).trim() || tag
  const version = String(manifest.version || tag).replace(/^v/, '')
  const rawBody = String(manifest.release_notes || manifest.body || '').trim()
  const body = normalizeReleaseNotesForVersion(rawBody, version || tag)
  const assetBase = String(cdnBase || EDGEONE_CDN_BASE || GITHUB_PAGES_CDN_BASE || '').replace(/\/+$/, '')
  const assets = Object.values(manifest.assets || {})
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
    published_at: manifest.generatedAt,
    version,
    prerelease: !!manifest.prerelease,
    channel: String(manifest.channel || '').trim(),
    downloadDir,
    __fromCdnManifest: true,
    __cdnBase: assetBase,
    __staleReleaseNotes: Boolean(rawBody && !body)
  }
}

/** 给清单 URL 加缓存破坏参数，避免 EdgeOne 对 alias JSON 错误下发 long-cache */
const withManifestCacheBust = (url) => {
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

/** 按 CDN 顺序拉取 manifest；返回 { manifest, base } 或 null */
const fetchFirstCdnManifest = async (urls, timeoutMs = 6000) => {
  for (const url of urls || []) {
    const text = String(url || '').trim()
    if (!text) continue
    try {
      const manifest = await fetchJson(withManifestCacheBust(text), timeoutMs)
      if (!manifest?.tag || !manifest?.assets) continue
      const base = CDN_BASES.find((b) => text.startsWith(`${b}/`)) || EDGEONE_CDN_BASE
      return { manifest, base }
    } catch (_) {
      // try next CDN
    }
  }
  return null
}

export const mergeCdnReleaseWithApiNotes = (cdnRelease, apiRelease) => {
  if (!cdnRelease || !apiRelease) return apiRelease || cdnRelease
  const cdnVersion = String(cdnRelease.version || cdnRelease.tag_name || '').replace(/^v/i, '')
  const apiVersion = String(apiRelease.version || apiRelease.tag_name || '').replace(/^v/i, '')
  if (!cdnVersion || !apiVersion) {
    return apiRelease || cdnRelease
  }
  const cmp = compareVersions(cdnVersion, apiVersion)
  // 版本不一致时取更新的一侧，避免旧 API/缓存覆盖 CDN 已发布的正式版
  if (cmp !== 0) {
    return cmp > 0 ? cdnRelease : apiRelease
  }
  return {
    ...cdnRelease,
    body: apiRelease.body || cdnRelease.body || '',
    html_url: apiRelease.html_url || cdnRelease.html_url,
    published_at: apiRelease.published_at || cdnRelease.published_at,
    name: apiRelease.name || cdnRelease.name,
    __releaseNotesFromApi: Boolean(apiRelease.body)
  }
}

async function fetchStableReleaseInfo(currentVersion) {
  let cdnCandidate = null
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

  let fallback = null
  for (const url of API_PROXIES) {
    try {
      const data = await fetchJson(url, 9000)
      const release = data?.tag_name ? data : normalizePackageJsonAsRelease(data)
      if (!release) continue
      // 优先保留含 assets 的 release，避免 jsdelivr 空 assets 覆盖完整数据
      if (!fallback || (release.assets?.length || 0) > (fallback.assets?.length || 0)) {
        fallback = release
      }
      if (shouldOfferRelease(release, currentVersion, 'stable')) {
        return mergeCdnReleaseWithApiNotes(cdnCandidate, release)
      }
    } catch (_) {
      // try next proxy
    }
  }
  return cdnCandidate || fallback
}

async function fetchDevReleaseInfo(currentVersion) {
  let cdnCandidate = null
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

  let fallback = null
  for (const url of DEV_API_PROXIES) {
    try {
      const data = await fetchJson(url, 9000)
      if (!data?.tag_name && !data?.assets) continue
      const release = {
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
    } catch (_) {
      // try next
    }
  }
  return cdnCandidate || fallback
}

async function fetchReleaseInfo(currentVersion, channel = 'stable') {
  const preferred = normalizeUpdateChannel(channel)
  if (preferred === 'dev') return fetchDevReleaseInfo(currentVersion)
  return fetchStableReleaseInfo(currentVersion)
}

const buildUpdateResultFromRelease = (release, currentVersion, channel) => {
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

  let asset = null
  if (Array.isArray(release.assets) && release.assets.length > 0) {
    for (const pattern of patterns) {
      asset = release.assets.find((item) => pattern.test(item.name))
      if (asset) break
    }
  }

  // 下载 tag：CDN/GH 滚动 dev 使用 dev-latest 目录名
  const downloadTag = preferred === 'dev'
    ? (String(release.downloadDir || tagName || DEV_RELEASE_TAG).trim() || DEV_RELEASE_TAG)
    : tagName

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
        releaseUrl: toGhProxyUrl(release.html_url) || release.html_url || `${GH_DOWNLOAD_PROXY_PREFIX}${GITHUB_RELEASES_URL}`,
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
      releaseUrl: toGhProxyUrl(release.html_url) || release.html_url || `${GH_DOWNLOAD_PROXY_PREFIX}${GITHUB_RELEASES_URL}`,
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
    releaseUrl: toGhProxyUrl(release.html_url) || release.html_url || `${GH_DOWNLOAD_PROXY_PREFIX}${GITHUB_RELEASES_URL}`,
    downloadUrls,
    preferredDownloadUrl: downloadUrls[0] || '',
    assetName: asset.name,
    platform,
    publishedAt: release.published_at
  }
}

export async function checkForUpdates(currentVersion, options = {}) {
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
      message: error?.message || '检查更新失败',
      currentVersion,
      channel
    }
  }
}

const openFirstUrl = async (downloadUrls) => {
  for (const url of downloadUrls || []) {
    const ok = await openExternal(url)
    if (ok) return { success: true, url }
  }
  return { success: false }
}

export async function downloadUpdate(downloadUrls, filename, onProgress) {
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
      url: opened.url,
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
export async function getCurrentVersion() {
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
