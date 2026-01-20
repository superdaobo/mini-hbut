/**
 * 版本更新检测模块
 * 通过 GitHub Release API 检测新版本，使用 jsDelivr CDN 下载
 */

const GITHUB_REPO = 'superdaobo/mini-hbut'
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const JSDELIVR_BASE = `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@`

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

// 获取对应平台的下载资产名
function getAssetPattern(platform) {
  switch (platform) {
    case 'android': return /\.apk$/i
    case 'windows': return /\.(exe|msi)$/i
    case 'macos': return /\.(dmg|app\.tar\.gz)$/i
    case 'linux': return /\.(AppImage|deb)$/i
    default: return null
  }
}

// 检查更新
export async function checkForUpdates(currentVersion) {
  try {
    const response = await fetch(GITHUB_API, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    
    if (!response.ok) {
      console.warn('[Update] GitHub API 请求失败:', response.status)
      return null
    }
    
    const release = await response.json()
    const latestVersion = release.tag_name || release.name
    
    if (compareVersions(latestVersion, currentVersion) > 0) {
      const platform = getPlatform()
      const pattern = getAssetPattern(platform)
      
      let downloadUrl = null
      let assetName = null
      
      if (pattern && release.assets) {
        const asset = release.assets.find(a => pattern.test(a.name))
        if (asset) {
          // 使用 jsDelivr CDN 加速下载
          downloadUrl = `${JSDELIVR_BASE}${latestVersion}/release/${asset.name}`
          assetName = asset.name
          
          // 备用：直接使用 GitHub 下载链接
          // downloadUrl = asset.browser_download_url
        }
      }
      
      return {
        hasUpdate: true,
        currentVersion,
        latestVersion,
        releaseNotes: release.body || '暂无更新说明',
        releaseUrl: release.html_url,
        downloadUrl,
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

// 下载更新
export async function downloadUpdate(url, filename) {
  try {
    // 尝试使用 Tauri 的 shell 打开下载链接
    const shell = await import('@tauri-apps/plugin-shell')
    await shell.open(url)
    return { success: true, method: 'tauri-shell' }
  } catch (e) {
    // 如果 Tauri 插件不可用，使用浏览器下载
    console.log('[Update] 使用浏览器下载:', url)
    
    // 最后的备选方案：创建下载链接
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    
    return { success: true, method: 'browser' }
  }
}

// 获取当前应用版本
export function getCurrentVersion() {
  // 从 package.json 或环境变量获取版本
  return import.meta.env.VITE_APP_VERSION || '1.0.0'
}

export default {
  checkForUpdates,
  downloadUpdate,
  getCurrentVersion,
  compareVersions
}
