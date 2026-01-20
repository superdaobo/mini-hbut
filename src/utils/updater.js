/**
 * 版本更新检测模块
 * 使用 jsDelivr CDN 加速下载，适合国内用户
 */

const GITHUB_REPO = 'superdaobo/mini-hbut'

// GitHub API 代理列表（国内可用）
const API_PROXIES = [
  // jsDelivr 获取 package.json（最稳定，不会限流）
  `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@latest/package.json`,
  // GitHub API 代理
  `https://gh-proxy.com/https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,  // 原始 API
]

// 下载代理列表（按优先级）
const DOWNLOAD_PROXIES = [
  // GitHub Release 代理（优先使用 release 资产，避免拉到旧版本）
  (tag, filename) => `https://gh-proxy.com/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag, filename) => `https://mirror.ghproxy.com/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  // 原始链接（备用）
  (tag, filename) => `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  // jsDelivr CDN（仅作最后兜底，避免下载到仓库旧文件）
  (tag, filename) => `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${tag}/release/${filename}`,
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
async function fetchReleaseInfo(currentVersion) {
  let lastRelease = null
  for (const apiUrl of API_PROXIES) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      
      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      })
      
      clearTimeout(timeout)
      
      if (response.ok) {
        console.log('[Update] API 请求成功:', apiUrl)
        const data = await response.json()
        
        // 如果是 package.json 格式，转换为 release 格式
        if (data.version && !data.tag_name) {
          const normalized = {
            tag_name: `v${data.version}`,
            name: `v${data.version}`,
            body: data.description || '版本更新',
            html_url: `https://github.com/${GITHUB_REPO}/releases`,
            assets: [
              // 根据平台生成预期的资源名
              { name: `Mini-HBUT-v${data.version}-arm64.apk` },
              { name: `Mini-HBUT_${data.version}_x64-setup.exe` },
              { name: `Mini-HBUT_${data.version}_x64.msi` },
            ],
            published_at: new Date().toISOString()
          }
          lastRelease = normalized
          if (!currentVersion || compareVersions(data.version, currentVersion) > 0) {
            return normalized
          }
          continue
        }

        lastRelease = data
        const tag = data.tag_name || data.name || ''
        const latest = tag.replace(/^v/, '')
        if (!currentVersion || !latest) {
          return data
        }
        if (compareVersions(latest, currentVersion) > 0) {
          return data
        }
      }
    } catch (e) {
      console.warn('[Update] API 请求失败:', apiUrl, e.message)
    }
  }
  return lastRelease
}

// 检查更新
export async function checkForUpdates(currentVersion) {
  try {
    const release = await fetchReleaseInfo(currentVersion)
    
    if (!release) {
      console.warn('[Update] 无法获取版本信息')
      // 返回错误状态而非 null，便于 UI 区分
      return { error: true, message: '无法连接到更新服务器', currentVersion }
    }
    
    const tagName = release.tag_name || release.name
    const latestVersion = tagName.replace(/^v/, '')

    if (compareVersions(latestVersion, currentVersion) > 0) {
      const platform = getPlatform()
      const patterns = getAssetPatterns(platform)
      
      let assetName = null
      let assetUrl = null
      
      if (patterns.length > 0 && release.assets) {
        for (const pattern of patterns) {
          const asset = release.assets.find(a => pattern.test(a.name))
          if (asset) {
            assetName = asset.name
            assetUrl = asset.browser_download_url || null
            break
          }
        }
      }
      
      // 生成所有可用的下载链接（优先使用 release 资产）
      let downloadUrls = []
      if (assetName) {
        downloadUrls = DOWNLOAD_PROXIES.map(proxy => proxy(tagName, assetName))
        if (assetUrl) {
          downloadUrls.unshift(assetUrl)
        }
      }
      
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
    return { error: true, message: error.message || '检查更新时出错', currentVersion }
  }
}

// 下载更新 - 自动选择最快的镜像
export async function downloadUpdate(downloadUrls, filename, onProgress) {
  if (!downloadUrls || downloadUrls.length === 0) {
    throw new Error('没有可用的下载链接')
  }
  
  const platform = getPlatform()
  const isDesktop = ['windows', 'macos', 'linux'].includes(platform)

  if (platform === 'android') {
    try {
      const shell = await import('@tauri-apps/plugin-shell')
      await shell.open(downloadUrls[0])
      return { success: true, method: 'shell-open', url: downloadUrls[0] }
    } catch (e) {
      window.open(downloadUrls[0], '_blank')
      return { success: true, method: 'window-open', url: downloadUrls[0] }
    }
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

      // Desktop: 保存到下载目录并自动打开安装程序
      if (isDesktop) {
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

        console.log('[Update] 已保存并打开安装程序:', filePath)
        return { success: true, method: 'fs-open', size: received, url, path: filePath }
      }
      
      // Web/Android: 触发浏览器下载
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
export async function getCurrentVersion() {
  if (import.meta.env.VITE_APP_VERSION) {
    return import.meta.env.VITE_APP_VERSION
  }
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    const version = await getVersion()
    return version || '1.0.0'
  } catch (e) {
    return '1.0.0'
  }
}

export default {
  checkForUpdates,
  downloadUpdate,
  getCurrentVersion,
  compareVersions
}
