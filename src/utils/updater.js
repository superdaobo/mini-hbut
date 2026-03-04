import { openExternal } from './external_link'
import { getNativeAppVersion } from '../platform/native'

const GITHUB_REPO = 'superdaobo/mini-hbut'
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`
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

const GITHUB_API_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

const normalizeProxyPrefixes = (list) =>
  uniqueUrls(list).map((prefix) => (String(prefix || '').trim().endsWith('/') ? String(prefix || '').trim() : `${String(prefix || '').trim()}/`))

// API 检查优先级：
// 1) gh-proxy.com
// 2) GitHub 直连
// 3) hk.gh-proxy.org
// 4) 其他镜像
const API_PROXY_PREFIXES = normalizeProxyPrefixes([
  'https://gh-proxy.com/',
  'https://hk.gh-proxy.org/',
  'https://mirror.ghproxy.com/',
  'https://ghproxy.net/'
])

// 下载优先级：
// 1) hk.gh-proxy.org
// 2) gh-proxy.com
// 3) 其他镜像
// 4) GitHub 直连兜底
const DOWNLOAD_PROXY_PREFIXES = normalizeProxyPrefixes([
  'https://hk.gh-proxy.org/',
  'https://gh-proxy.com/',
  'https://mirror.ghproxy.com/',
  'https://ghproxy.net/'
])

const ALL_PROXY_PREFIXES = normalizeProxyPrefixes([
  ...API_PROXY_PREFIXES,
  ...DOWNLOAD_PROXY_PREFIXES
])

const isGithubApiOrWebUrl = (url) =>
  /^https:\/\/(?:api\.)?github\.com\//i.test(String(url || '').trim())

const isAlreadyProxiedGithubUrl = (url) => {
  const value = String(url || '').trim().toLowerCase()
  if (!value) return false
  return ALL_PROXY_PREFIXES.some((prefix) => value.startsWith(prefix.toLowerCase()))
}

const buildGithubUrlCandidates = (url, options = {}) => {
  const {
    includeDirect = true,
    proxyPrefixes = DOWNLOAD_PROXY_PREFIXES,
    directPosition = 'last' // first | after-first | last
  } = options
  const value = String(url || '').trim()
  if (!value) return []
  if (isAlreadyProxiedGithubUrl(value)) return [value]
  if (!isGithubApiOrWebUrl(value)) return [value]
  const proxied = normalizeProxyPrefixes(proxyPrefixes).map((prefix) => `${prefix}${value}`)
  if (!includeDirect) return uniqueUrls(proxied)
  if (directPosition === 'first') {
    return uniqueUrls([value, ...proxied])
  }
  if (directPosition === 'after-first') {
    const [first = '', ...rest] = proxied
    return uniqueUrls([first, value, ...rest])
  }
  return uniqueUrls([...proxied, value])
}

const API_PROXIES = uniqueUrls([
  ...buildGithubUrlCandidates(GITHUB_API_LATEST_URL, {
    includeDirect: true,
    proxyPrefixes: API_PROXY_PREFIXES,
    directPosition: 'after-first'
  }),
  `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@latest/package.json`
])

const DOWNLOAD_URL_BUILDERS = [
  (tag, filename) => `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`
]

export function toGhProxyUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''
  const candidates = buildGithubUrlCandidates(value, {
    includeDirect: true,
    proxyPrefixes: DOWNLOAD_PROXY_PREFIXES,
    directPosition: 'last'
  })
  return candidates[0] || value
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
      console.info(`[Updater] check release from: ${url}`)
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
    } catch (error) {
      console.warn(`[Updater] release endpoint failed: ${url}`, error?.message || error)
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

    const releaseUrlCandidates = buildGithubUrlCandidates(release.html_url || GITHUB_RELEASES_URL, {
      includeDirect: true,
      proxyPrefixes: DOWNLOAD_PROXY_PREFIXES,
      directPosition: 'last'
    })

    if (!asset) {
      return {
        hasUpdate: false,
        pending: true,
        currentVersion,
        latestVersion,
        tagName,
        releaseNotes: release.body || '暂无更新说明',
        releaseUrl: releaseUrlCandidates[0] || toGhProxyUrl(GITHUB_RELEASES_URL),
        releaseUrls: releaseUrlCandidates,
        platform,
        publishedAt: release.published_at
      }
    }

    const rawDownloadUrls = uniqueUrls([
      asset.browser_download_url,
      ...DOWNLOAD_URL_BUILDERS.map((fn) => fn(tagName, asset.name))
    ])
    const downloadUrls = uniqueUrls(
      rawDownloadUrls.flatMap((url) =>
        buildGithubUrlCandidates(url, {
          includeDirect: true,
          proxyPrefixes: DOWNLOAD_PROXY_PREFIXES,
          directPosition: 'last'
        })
      )
    )

    return {
      hasUpdate: true,
      currentVersion,
      latestVersion,
      tagName,
      releaseNotes: release.body || '暂无更新说明',
      releaseUrl: releaseUrlCandidates[0] || toGhProxyUrl(GITHUB_RELEASES_URL),
      releaseUrls: releaseUrlCandidates,
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

  const preferred = uniqueUrls(
    downloadUrls.flatMap((url) =>
      buildGithubUrlCandidates(url, {
        includeDirect: true,
        proxyPrefixes: DOWNLOAD_PROXY_PREFIXES,
        directPosition: 'last'
      })
    )
  )
  console.info(`[Updater] open download urls: ${preferred.length}`)
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
