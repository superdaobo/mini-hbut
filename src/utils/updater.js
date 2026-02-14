import { openExternal } from './external_link'

const GITHUB_REPO = 'superdaobo/mini-hbut'
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`
const GH_PROXY_PREFIX = 'https://gh-proxy.com/'

const API_PROXIES = [
  `${GH_PROXY_PREFIX}https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@latest/package.json`
]

const DOWNLOAD_PROXIES = [
  (tag, filename) => `${GH_PROXY_PREFIX}https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://mirror.ghproxy.com/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`
]

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

function compareVersions(v1, v2) {
  const parts1 = String(v1 || '').replace(/^v/, '').split('.').map((n) => Number(n) || 0)
  const parts2 = String(v2 || '').replace(/^v/, '').split('.').map((n) => Number(n) || 0)
  const len = Math.max(parts1.length, parts2.length)
  for (let i = 0; i < len; i += 1) {
    if (parts1[i] > parts2[i]) return 1
    if (parts1[i] < parts2[i]) return -1
  }
  return 0
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

async function fetchReleaseInfo(currentVersion) {
  let fallback = null
  for (const url of API_PROXIES) {
    try {
      const response = await withTimeout(fetch(url, { headers: { Accept: 'application/json' } }), 9000)
      if (!response.ok) continue
      const data = await response.json()
      const release = data?.tag_name ? data : normalizePackageJsonAsRelease(data)
      if (!release) continue
      fallback = release
      const latest = String(release.tag_name || '').replace(/^v/, '')
      if (!currentVersion || !latest || compareVersions(latest, currentVersion) > 0) {
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
    const latestVersion = String(tagName).replace(/^v/, '')
    if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
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

  const preferred = uniqueUrls(downloadUrls.map((url) => toGhProxyUrl(url)))
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
    const { getVersion } = await import('@tauri-apps/api/app')
    const version = await getVersion()
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
