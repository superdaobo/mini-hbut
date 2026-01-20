/**
 * 版本更新检测模块
 * 使用 jsDelivr CDN 加速下载，适合国内用户
 */

const GITHUB_REPO = 'superdaobo/mini-hbut'

// GitHub API 代理列表（国内可用）
const API_PROXIES = [
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,  // 原始 API
  `https://gh-proxy.com/https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
]

// 下载代理列表（按优先级）
const DOWNLOAD_PROXIES = [
  // jsDelivr CDN - 最稳定
  (tag, filename) => `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${tag}/release/${filename}`,
  // GitHub Release 代理
  (tag, filename) => `https://gh-proxy.com/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://mirror.ghproxy.com/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  // 原始链接（备用）
  (tag, filename) => `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
]

// 版本比较：返回 1 如果 v1 > v2, -1 如果 v1 < v2, 0 如果相等
function compareVersions(v1, v2) {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number)
  const parts2 = v2.replace(/^v/, '').split('.').map(Number)
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

// 获取当前平台
function getPlatform() {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

// 获取对应平台的下载资产匹配规则
function getAssetPatterns(platform) {
  switch (platform) {
    case 'android': 
      return [/Mini-HBUT.*\.apk$/i, /\.apk$/i]
    case 'windows': 
      return [/setup\.exe$/i, /\.msi$/i, /\.exe$/i]
    case 'macos': 
      return [/\.dmg$/i, /\.app\.tar\.gz$/i]
    case 'linux': 
      return [/\.AppImage$/i, /\.deb$/i]
    default: 
      return []
  }
}

// 尝试多个 API 端点获取 Release 信息
async function fetchReleaseInfo() {
  for (const apiUrl of API_PROXIES) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      
      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        signal: controller.signal
      })
      
      clearTimeout(timeout)
      
      if (response.ok) {
        console.log('[Update] API 请求成功:', apiUrl)
        return await response.json()
      }
    } catch (e) {
      console.warn('[Update] API 请求失败:', apiUrl, e.message)
    }
  }
  return null
}

// 检查更新
export async function checkForUpdates(currentVersion) {
  try {
    const release = await fetchReleaseInfo()
    
    if (!release) {
      console.warn('[Update] 无法获取版本信息')
      return null
    }
    
    const tagName = release.tag_name || release.name
    const latestVersion = tagName.replace(/^v/, '')

    if (compareVersions(latestVersion, currentVersion) > 0) {
      const platform = getPlatform()
      const patterns = getAssetPatterns(platform)
      
      let assetName = null
      
      if (patterns.length > 0 && release.assets) {
        for (const pattern of patterns) {
          const asset = release.assets.find(a => pattern.test(a.name))
          if (asset) {
            assetName = asset.name
            break
          }
        }
      }
      
      // 生成所有可用的下载链接（使用代理）
      const downloadUrls = assetName 
        ? DOWNLOAD_PROXIES.map(proxy => proxy(tagName, assetName))
        : []
      
      return {
        hasUpdate: true,
        currentVersion,
        latestVersion,
        tagName,
        releaseNotes: release.body || '暂无更新说明',
        releaseUrl: release.html_url,
        downloadUrls,  // 多个下载链接
        assetName,
        platform,
        publishedAt: release.published_at
      }
    }
    
    return { hasUpdate: false, currentVersion, latestVersion }
  } catch (error) {
    console.error('[Update] 检查更新失败:', error)
    return null
  }
}

// 下载更新 - 自动选择最快的镜像
export async function downloadUpdate(downloadUrls, filename, onProgress) {
  if (!downloadUrls || downloadUrls.length === 0) {
    throw new Error('没有可用的下载链接')
  }
  
  // 依次尝试每个下载链接
  for (let i = 0; i < downloadUrls.length; i++) {
    const url = downloadUrls[i]
    console.log(`[Update] 尝试下载 (${i + 1}/${downloadUrls.length}):`, url)
    
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000) // 10秒超时
      
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      
      if (!response.ok) {
        console.warn(`[Update] 下载失败 (${response.status}):`, url)
        continue
      }
      
      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0
      
      const reader = response.body.getReader()
      const chunks = []
      let received = 0
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        chunks.push(value)
        received += value.length
        
        if (onProgress && total > 0) {
          onProgress(Math.round((received / total) * 100))
        }
      }
      
      // 合并数据并触发下载
      const blob = new Blob(chunks)
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename || 'Mini-HBUT-update.apk'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
      
      console.log('[Update] 下载成功:', url)
      return { success: true, method: 'fetch', size: received, url }
    } catch (e) {
      console.warn(`[Update] 下载出错:`, url, e.message)
    }
  }
  
  // 所有链接都失败，尝试打开浏览器
  console.log('[Update] 所有下载链接失败，尝试打开浏览器')
  try {
    const shell = await import('@tauri-apps/plugin-shell')
    await shell.open(downloadUrls[0])
    return { success: true, method: 'tauri-shell' }
  } catch (e) {
    window.open(downloadUrls[0], '_blank')
    return { success: true, method: 'window-open' }
  }
}

// 获取当前应用版本
export function getCurrentVersion() {
  return import.meta.env.VITE_APP_VERSION || '1.0.0'
}

export default {
  checkForUpdates,
  downloadUpdate,
  getCurrentVersion,
  compareVersions
}
