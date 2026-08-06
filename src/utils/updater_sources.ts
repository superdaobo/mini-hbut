/**
 * updater 下载源辅助模块：CDN / GitHub 代理 / 官方直链的常量与 URL 构造。
 * 纯函数，无平台依赖，供 updater.ts 与发布守卫（verify_release_config.mjs）复用。
 */

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
const DEV_RELEASE_TAG = 'dev-latest'

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
  (tag: unknown, filename: unknown) => `https://ghfast.top/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag: unknown, filename: unknown) => `https://v4.gh-proxy.org/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag: unknown, filename: unknown) => `${GH_DOWNLOAD_PROXY_PREFIX}https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag: unknown, filename: unknown) => `https://cdn.gh-proxy.org/https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`,
  (tag: unknown, filename: unknown) => `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`
]

const hostnameOf = (value: unknown): string => {
  try {
    return new URL(String(value || '').trim()).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** 官方 CDN 直链：EdgeOne / GitHub Pages 的 /releases/ 路径 */
export const isOfficialDownloadUrl = (url: unknown): boolean => {
  const value = String(url || '').trim()
  if (!value) return false
  return CDN_BASES.some((base) => value.startsWith(`${base}/releases/`))
}

export const describeUpdateDownloadSource = (
  url: unknown,
  index = 0
): { label: string; tag: string } => {
  const value = String(url || '').trim()
  if (EDGEONE_CDN_BASE && value.startsWith(`${EDGEONE_CDN_BASE}/`)) {
    return { label: 'EdgeOne 主站', tag: 'edgeone' }
  }
  if (GITHUB_PAGES_CDN_BASE && value.startsWith(`${GITHUB_PAGES_CDN_BASE}/`)) {
    return { label: 'GitHub Pages 备用', tag: 'ghpages' }
  }
  // 用 URL 对象精确匹配 hostname，避免 includes 子串匹配被
  // evil-gh-proxy.org / github.com.evil.com 这类域名绕过（CodeQL js/incomplete-url-substring-sanitization）
  const host = hostnameOf(value)
  if (host === 'ghfast.top') {
    return { label: '代理下载 1', tag: 'proxy1' }
  }
  if (host === 'v4.gh-proxy.org') {
    return { label: '代理下载 2', tag: 'proxy2' }
  }
  if (host === 'gh-proxy.org') {
    return { label: '代理下载 3', tag: 'proxy3' }
  }
  if (host === 'cdn.gh-proxy.org') {
    return { label: '代理下载 4', tag: 'proxy4' }
  }
  if (host === 'ghproxy.net' || host === 'mirror.ghproxy.com') {
    return { label: `代理下载 ${index + 1}`, tag: `proxy${index + 1}` }
  }
  if (host === 'github.com' || host.endsWith('.github.com')) {
    return { label: 'GitHub 源站', tag: 'github' }
  }
  return { label: `线路 ${index + 1}`, tag: `line${index}` }
}

/** CDN 安装包直链（EdgeOne 主 + GitHub Pages 备用），用于清单归一化与探测 */
export const buildCdnReleaseAssetUrls = (downloadDir: unknown, filename: unknown): string[] => {
  const dir = String(downloadDir || '').trim().replace(/^\/+|\/+$/g, '')
  const name = String(filename || '').trim().replace(/^\/+/, '')
  if (!dir || !name) return []
  return CDN_BASES.map((base) => `${base}/releases/${dir}/${name}`)
}

export const buildUpdateDownloadUrls = (
  tag: unknown,
  filename: unknown,
  primaryUrl = ''
): string[] => {
  // 下载列表：GitHub 代理链 + 源站；CDN 官方直链由 isOfficialDownloadUrl 过滤（UI 不重复展示）
  // 清单阶段已用 EdgeOne → GitHub Pages 双 CDN 探测版本
  const candidates = [
    ...DOWNLOAD_PROXIES.map((fn) => fn(tag, filename)),
    primaryUrl,
    ...buildCdnReleaseAssetUrls(tag, filename)
  ]
  return uniqueUrls(candidates).filter((url) => !isOfficialDownloadUrl(url))
}

export const buildDownloadOpenUrls = (downloadUrls: readonly string[]): string[] =>
  uniqueUrls(downloadUrls).filter((url) => !isOfficialDownloadUrl(url))

export function toGhProxyUrl(url: unknown): string {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.startsWith('https://gh-proxy.org/')) return value
  if (value.startsWith('https://gh-proxy.com/')) return value
  if (value.startsWith('https://mirror.ghproxy.com/')) return value
  if (value.startsWith('https://github.com/')) return `${GH_DOWNLOAD_PROXY_PREFIX}${value}`
  return value
}

const uniqueUrls = (list: readonly unknown[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list || []) {
    const url = String(item || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

export const withCacheBust = (url: unknown): string => {
  const text = String(url || '').trim()
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

export {
  GITHUB_REPO,
  GITHUB_RELEASES_URL,
  GH_DOWNLOAD_PROXY_PREFIX,
  EDGEONE_CDN_BASE,
  GITHUB_PAGES_CDN_BASE,
  CDN_BASES,
  STABLE_MANIFEST_URLS,
  DEV_MANIFEST_URLS,
  STABLE_MANIFEST_URL,
  DEV_MANIFEST_URL,
  DEV_RELEASE_TAG,
  API_PROXIES,
  DEV_API_PROXIES,
  DOWNLOAD_PROXIES
}
