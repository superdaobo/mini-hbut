import { openExternal } from './external_link'
import { getNativeAppVersion, invokeNative, isTauriRuntime } from '../platform/native'

const GITHUB_REPO = 'superdaobo/mini-hbut'
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`
const GH_PROXY_PREFIX = 'https://gh-proxy.com/'
const HK_DOWNLOAD_PROXY_PREFIX = 'https://hk.gh-proxy.org/'

// 腾讯云 EdgeOne Pages CDN 域名（部署后填写实际域名，留空则跳过 CDN 优先逻辑）
const EDGEONE_CDN_BASE = 'https://hbut.6661111.xyz'
const ACTIVE_MANIFEST_URL = EDGEONE_CDN_BASE ? `${EDGEONE_CDN_BASE}/releases/active.json` : ''
const LATEST_MANIFEST_URL = EDGEONE_CDN_BASE ? `${EDGEONE_CDN_BASE}/releases/latest.json` : ''
const API_PROXIES = [
  `${GH_PROXY_PREFIX}https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@latest/package.json`
]

const DOWNLOAD_PROXIES = [
  ...(EDGEONE_CDN_BASE
    ? [(tag, filename) => `${EDGEONE_CDN_BASE}/releases/${tag}/${filename}`]
    : []),
  (tag, filename) => `${GH_PROXY_PREFIX}https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://mirror.ghproxy.com/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`
]

const unwrapKnownProxyUrl = (url) => {
  const value = String(url || '').trim()
  if (!value) return ''
  const prefixes = [
    'https://hk.gh-proxy.org/',
    'https://gh-proxy.com/',
    'https://mirror.ghproxy.com/',
    'https://ghproxy.net/'
  ]
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length)
    }
  }
  return value
}

const toHkDownloadUrl = (url) => {
  const raw = unwrapKnownProxyUrl(url)
  if (!raw) return ''
  if (raw.startsWith(HK_DOWNLOAD_PROXY_PREFIX)) return raw
  if (raw.startsWith('https://github.com/')) return `${HK_DOWNLOAD_PROXY_PREFIX}${raw}`
  return raw
}

export function toGhProxyUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.startsWith('https://gh-proxy.com/')) return value
  if (value.startsWith('https://mirror.ghproxy.com/')) return value
  if (value.startsWith('https://github.com/')) return `${GH_PROXY_PREFIX}${value}`
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

function compareVersions(v1, v2) {
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

function shouldOfferRelease(release, currentVersion) {
  const latestVersion = String(release?.version || release?.tag_name || '').replace(/^v/i, '')
  const currentText = String(currentVersion || '').replace(/^v/i, '')
  if (!latestVersion) return false
  if (!currentText) return true
  if (release?.__fromCdnManifest) {
    return latestVersion !== currentText
  }
  if (release?.prerelease && !isPrereleaseVersion(currentText)) {
    return false
  }
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
      return [/\.dmg$/i]
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

function buildExpectedAssetName(platform, version) {
  const v = String(version).replace(/^v/, '')
  switch (platform) {
    case 'windows': return `Mini-HBUT_${v}_x64-setup.exe`
    case 'macos': return `Mini-HBUT_${v}_universal.dmg`
    case 'linux': return `Mini-HBUT_${v}_amd64.AppImage`
    case 'android': return `Mini-HBUT_${v}_arm64.apk`
    case 'ios': return `Mini-HBUT_${v}_iOS.ipa`
    default: return ''
  }
}

const normalizeCdnManifestAsRelease = (manifest) => {
  if (!manifest?.tag || !manifest?.assets) return null
  const tag = String(manifest.tag || '').trim()
  const downloadDir = String(manifest.downloadDir || tag).trim() || tag
  const version = String(manifest.version || tag).replace(/^v/, '')
  const assets = Object.values(manifest.assets || {})
    .filter(Boolean)
    .map((filename) => ({
      name: filename,
      browser_download_url: `${EDGEONE_CDN_BASE}/releases/${downloadDir}/${filename}`
    }))

  return {
    tag_name: tag,
    name: `v${version}`,
    body: '',
    html_url: `${GITHUB_RELEASES_URL}/tag/${tag}`,
    assets,
    published_at: manifest.generatedAt,
    version,
    prerelease: !!manifest.prerelease,
    channel: String(manifest.channel || '').trim(),
    __fromCdnManifest: true
  }
}

async function fetchReleaseInfo(currentVersion) {
  if (ACTIVE_MANIFEST_URL) {
    try {
      const manifest = await fetchJson(ACTIVE_MANIFEST_URL, 6000)
      const release = normalizeCdnManifestAsRelease(manifest)
      if (release && shouldOfferRelease(release, currentVersion)) {
        return release
      }
    } catch (_) {
      // active manifest 不可用，继续 fallback
    }
  }

  if (LATEST_MANIFEST_URL) {
    try {
      const manifest = await fetchJson(LATEST_MANIFEST_URL, 6000)
      const release = normalizeCdnManifestAsRelease(manifest)
      if (release && shouldOfferRelease(release, currentVersion)) {
        return release
      }
    } catch (_) {
      // latest manifest 不可用，继续 fallback
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
      if (shouldOfferRelease(release, currentVersion)) {
        return release
      }
    } catch (_) {
      // try next proxy
    }
  }
  return fallback
}

export async function checkForUpdates(currentVersion) {
  try {
    const release = await fetchReleaseInfo(currentVersion)
    if (!release) {
      return {
        error: true,
        message: '无法连接更新服务',
        currentVersion
      }
    }

    const tagName = release.tag_name || release.name || ''
    const latestVersion = String(release.version || tagName).replace(/^v/, '')
    const currentText = String(currentVersion || '').replace(/^v/, '')
    if (!shouldOfferRelease(release, currentText)) {
      return { hasUpdate: false, currentVersion, latestVersion }
    }

    const platform = getPlatform()
    const patterns = getAssetPatterns(platform)
    let asset = null

    if (Array.isArray(release.assets) && release.assets.length > 0) {
      for (const pattern of patterns) {
        asset = release.assets.find((item) => pattern.test(item.name))
        if (asset) break
      }
    }

    if (!asset) {
      // 当 API 未返回资产列表时（如仅 jsdelivr 可用），根据命名规则构造下载链接
      const expectedName = buildExpectedAssetName(platform, tagName)
      if (expectedName) {
        const downloadUrls = uniqueUrls(
          DOWNLOAD_PROXIES.map((fn) => toGhProxyUrl(fn(tagName, expectedName)))
        )
        return {
          hasUpdate: true,
          currentVersion,
          latestVersion,
          tagName,
          releaseNotes: release.body || '暂无更新说明',
          releaseUrl: toGhProxyUrl(release.html_url) || release.html_url || `${GH_PROXY_PREFIX}${GITHUB_RELEASES_URL}`,
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
        currentVersion,
        latestVersion,
        tagName,
        releaseNotes: release.body || '暂无更新说明',
        releaseUrl: toGhProxyUrl(release.html_url) || release.html_url || `${GH_PROXY_PREFIX}${GITHUB_RELEASES_URL}`,
        platform,
        publishedAt: release.published_at
      }
    }

    const downloadUrls = uniqueUrls([
      toGhProxyUrl(asset.browser_download_url),
      ...DOWNLOAD_PROXIES.map((fn) => toGhProxyUrl(fn(tagName, asset.name)))
    ])

    return {
      hasUpdate: true,
      currentVersion,
      latestVersion,
      tagName,
      releaseNotes: release.body || '暂无更新说明',
      releaseUrl: toGhProxyUrl(release.html_url) || release.html_url || `${GH_PROXY_PREFIX}${GITHUB_RELEASES_URL}`,
      downloadUrls,
      preferredDownloadUrl: downloadUrls[0] || '',
      assetName: asset.name,
      platform,
      publishedAt: release.published_at
    }
  } catch (error) {
    return {
      error: true,
      message: error?.message || '检查更新失败',
      currentVersion
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

  // 下载跳转优先统一到 hk 代理拼接后的 GitHub 资产链接。
  const preferred = uniqueUrls(downloadUrls.map((url) => toHkDownloadUrl(url)))
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

export async function getCurrentVersion() {
  if (import.meta.env.VITE_APP_VERSION) return import.meta.env.VITE_APP_VERSION
  try {
    const version = await getNativeAppVersion()
    return version || '1.0.0'
  } catch {
    return '1.0.0'
  }
}

export default {
  checkForUpdates,
  downloadUpdate,
  getCurrentVersion,
  compareVersions,
  toGhProxyUrl
}
