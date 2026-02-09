import { openExternal } from './external_link'

const GITHUB_REPO = 'superdaobo/mini-hbut'

const API_PROXIES = [
  `https://gh-proxy.com/https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@latest/package.json`
]

const DOWNLOAD_PROXIES = [
  (tag, filename) => `https://gh-proxy.com/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://mirror.ghproxy.com/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`
]

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
    html_url: `https://github.com/${GITHUB_REPO}/releases`,
    assets: [],
    published_at: new Date().toISOString()
  }
}

async function fetchReleaseInfo(currentVersion) {
  let fallback = null
  for (const url of API_PROXIES) {
    try {
      const response = await withTimeout(
        fetch(url, { headers: { Accept: 'application/json' } }),
        9000
      )
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
        releaseUrl: release.html_url,
        platform,
        publishedAt: release.published_at
      }
    }

    const downloadUrls = DOWNLOAD_PROXIES.map((fn) => fn(tagName, asset.name))
    if (asset.browser_download_url) {
      downloadUrls.unshift(asset.browser_download_url)
    }

    return {
      hasUpdate: true,
      currentVersion,
      latestVersion,
      tagName,
      releaseNotes: release.body || '暂无更新说明',
      releaseUrl: release.html_url,
      downloadUrls,
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

  const platform = getPlatform()
  const isDesktop = ['windows', 'macos', 'linux'].includes(platform)
  const isMobile = ['android', 'ios'].includes(platform)

  if (isMobile) {
    const opened = await openFirstUrl(downloadUrls)
    if (opened.success) {
      return { success: true, method: 'external-open', url: opened.url }
    }
    throw new Error('无法打开下载链接')
  }

  for (const url of downloadUrls) {
    try {
      const response = await withTimeout(fetch(url), 15000)
      if (!response.ok || !response.body) continue

      const total = Number(response.headers.get('content-length') || 0)
      const reader = response.body.getReader()
      const chunks = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (typeof onProgress === 'function' && total > 0) {
          onProgress(Math.round((received / total) * 100))
        }
      }

      if (isDesktop && typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)) {
        try {
          const { writeBinaryFile } = await import('@tauri-apps/plugin-fs')
          const { downloadDir, join } = await import('@tauri-apps/api/path')
          const { open } = await import('@tauri-apps/plugin-shell')

          const bytes = new Uint8Array(chunks.reduce((acc, chunk) => {
            const merged = new Uint8Array(acc.length + chunk.length)
            merged.set(acc, 0)
            merged.set(chunk, acc.length)
            return merged
          }, new Uint8Array()))

          const dir = await downloadDir()
          const safeName = filename || `Mini-HBUT-update-${Date.now()}`
          const filePath = await join(dir, safeName)
          await writeBinaryFile(filePath, bytes)
          await open(filePath)
          return { success: true, method: 'fs-open', path: filePath, url, size: received }
        } catch (_) {
          const opened = await openExternal(url)
          if (opened) {
            return { success: true, method: 'external-open', url }
          }
        }
      }

      const blob = new Blob(chunks)
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename || 'Mini-HBUT-update.bin'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
      return { success: true, method: 'fetch', url, size: received }
    } catch (_) {
      // try next download URL
    }
  }

  const opened = await openFirstUrl(downloadUrls)
  if (opened.success) {
    return { success: true, method: 'external-open', url: opened.url }
  }
  throw new Error('下载失败')
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
  compareVersions
}
