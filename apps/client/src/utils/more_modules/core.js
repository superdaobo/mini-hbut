import { getNativeAppVersion, isCapacitorRuntime, isLikelyAndroidUserAgent, isTauriRuntime, toNativeFileSrc } from '../../platform/native'
import { pushDebugLog } from '../debug_logger'
import { isRemoteModulesAllowed } from '../../config/app_store_policy'

export const assertRemoteModulesAllowed = () => {
  if (!isRemoteModulesAllowed()) {
    throw new Error('App Store 构建已禁用远程模块')
  }
}

export const DEFAULT_MODULE_CDN_BASE = 'https://hbut.6661111.xyz/modules'
/** GitHub Pages 备用模块 CDN（与 EdgeOne 同构 /modules 路径） */
export const GITHUB_PAGES_MODULE_CDN_BASE = 'https://superdaobo.github.io/mini-hbut/modules'
export const GITHUB_REPO = 'superdaobo/mini-hbut'
export const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}`
export const GITHUB_WEBSITE_BRANCH = 'website-pages'
export const GITHUB_PROXY_PREFIXES = Object.freeze(['https://hk.gh-proxy.org/', 'https://gh-proxy.com/', ''])
export const MODULE_PUBLIC_REPO_PATH = 'modules'
export const MODULE_CDN_OVERRIDE_STORAGE_KEY = 'hbu_debug_module_cdn_base'
export const MODULE_STATE_STORAGE_KEY = 'hbu_more_module_state_v1'
export const MODULE_CATALOG_CACHE_STORAGE_KEY = 'hbu_more_module_catalog_cache_v1'
export const MODULE_MANIFEST_CACHE_STORAGE_KEY = 'hbu_more_module_manifest_cache_v1'
export const MODULE_SOURCE_ROTATION_STORAGE_KEY = 'hbu_more_module_remote_source_rotation_v1'
export const DEFAULT_CHANNEL = 'main'
export const SHARED_CHANNEL = 'latest'
export const MODULE_CHANNELS = new Set(['main', 'dev', SHARED_CHANNEL])
export const DEFAULT_REMOTE_JSON_TIMEOUT_MS = 4500
export const FAST_REMOTE_RACE_TIMEOUT_MS = 2200
export const FAST_REMOTE_OPEN_PROBE_TIMEOUT_MS = 1800
export const CAPACITOR_MODULE_CACHE_ROOT = 'modules'
export const CAPACITOR_BUNDLE_TIMEOUT_MS = 20000
export const PREVIEW_MODE_TAURI_LOCAL = 'tauri-local'
export const PREVIEW_MODE_CAPACITOR_LOCAL = 'capacitor-local'
export const PREVIEW_MODE_REMOTE = 'remote-site'

export const withCacheBust = (url) => {
  const text = safeText(url)
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

export const isAbsoluteHttpUrl = (url) => /^https?:\/\//i.test(safeText(url))
export const isLocalModuleBridgePreviewUrl = (url) =>
  /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/module_bundle\/content\//i.test(safeText(url))

export const canUseLocalModuleBridgePreview = () => isTauriRuntime() && !isLikelyAndroidUserAgent()

export const describeError = (error) => {
  if (!error) return ''
  if (error instanceof Error) {
    return [error.message, error.stack].filter(Boolean).join('\n')
  }
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export const resolveModuleCdnBase = () => {
  try {
    const override = safeText(
      globalThis?.__HBUT_MODULE_CDN_BASE_OVERRIDE__ ||
        globalThis?.localStorage?.getItem(MODULE_CDN_OVERRIDE_STORAGE_KEY)
    )
    if (override) {
      return override.replace(/\/+$/, '')
    }
  } catch {
    const override = safeText(globalThis?.__HBUT_MODULE_CDN_BASE_OVERRIDE__)
    if (override) {
      return override.replace(/\/+$/, '')
    }
  }
  return DEFAULT_MODULE_CDN_BASE
}

export const isModuleCdnOverrideActive = () => resolveModuleCdnBase() !== DEFAULT_MODULE_CDN_BASE

export const sleep = (ms = 0) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timer = null
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage || '请求超时'))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const fetchWithTimeout = async (url, init = {}, timeoutMs = DEFAULT_REMOTE_JSON_TIMEOUT_MS) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timer = null
  try {
    if (controller) {
      timer = setTimeout(() => controller.abort(), timeoutMs)
    }
    return await withTimeout(
      fetch(url, {
        ...init,
        signal: controller?.signal
      }),
      timeoutMs,
      '请求超时'
    )
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const parseJsonPayload = (payload) => {
  if (payload && typeof payload === 'object') return payload
  if (typeof payload === 'string') {
    const parsed = JSON.parse(payload)
    if (parsed && typeof parsed === 'object') return parsed
  }
  throw new Error('远程 JSON 响应无效')
}

export const fetchJsonViaCapacitor = async (url, timeoutMs = DEFAULT_REMOTE_JSON_TIMEOUT_MS) => {
  const core = await import('@capacitor/core')
  const capHttp = core?.CapacitorHttp || globalThis?.Capacitor?.Plugins?.CapacitorHttp
  if (!capHttp?.request) {
    throw new Error('CapacitorHttp 不可用')
  }
  const result = await capHttp.request({
    method: 'GET',
    url,
    headers: { Accept: 'application/json' },
    connectTimeout: timeoutMs,
    readTimeout: timeoutMs
  })
  const status = Number(result?.status || 0)
  if (status < 200 || status >= 400) {
    throw new Error(`请求失败：HTTP ${status || 0}`)
  }
  return parseJsonPayload(result?.data)
}

export const probeUrlViaCapacitor = async (url, timeoutMs = FAST_REMOTE_OPEN_PROBE_TIMEOUT_MS) => {
  const core = await import('@capacitor/core')
  const capHttp = core?.CapacitorHttp || globalThis?.Capacitor?.Plugins?.CapacitorHttp
  if (!capHttp?.request) return false
  try {
    const result = await capHttp.request({
      method: 'GET',
      url: withCacheBust(url),
      headers: { Accept: 'text/html,*/*' },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs
    })
    const status = Number(result?.status || 0)
    return status >= 200 && status < 400
  } catch {
    return false
  }
}

export const isNativeBridgeUnavailableError = (error) => {
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

export const invokeNativeBridge = async (command, args, label = '') => {
  const core = await import('@tauri-apps/api/core')
  try {
    const result = await core.invoke(command, args)
    if (label) {
      pushDebugLog('MoreModules', `${label}：原生桥接成功`, 'debug', {
        command
      })
    }
    return result
  } catch (error) {
    if (label) {
      pushDebugLog('MoreModules', `${label}：原生桥接失败`, 'warn', {
        command,
        error: describeError(error)
      })
    }
    throw error
  }
}

export const safeText = (value) => String(value ?? '').trim()

export const sanitizeStorageSegment = (value, fallback = '') => {
  const normalized = safeText(value || fallback)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
  const compact = normalized.replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return compact || safeText(fallback)
}

export const joinRelativePath = (...parts) =>
  parts
    .map((part) => safeText(part).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')

export const normalizeRelativeModulePath = (value, fallback = 'index.html') => {
  const normalized = safeText(value || fallback).replace(/\\/g, '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) {
    return safeText(fallback)
  }
  return segments.join('/')
}

export const normalizeZipEntryPath = (value) => {
  let normalized = safeText(value).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.endsWith('/')) return ''
  if (/^site\//i.test(normalized)) {
    normalized = normalized.replace(/^site\//i, '')
  }
  const segments = normalized.split('/').filter(Boolean)
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) {
    return ''
  }
  return segments.join('/')
}

export const candidateEntryPaths = (requested = 'index.html') => {
  const normalized = normalizeRelativeModulePath(requested, 'index.html')
  return toUniqueTextList([
    normalized,
    `site/${normalized}`,
    'index.html',
    'site/index.html'
  ]).map((item) => normalizeRelativeModulePath(item, 'index.html'))
}

export const uint8ArrayToBase64 = (bytes) => {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < buffer.length; index += chunkSize) {
    const chunk = buffer.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export const base64ToUint8Array = (base64Text = '') => {
  const text = safeText(base64Text)
  if (!text) return new Uint8Array()
  const binary = atob(text)
  const result = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index)
  }
  return result
}

export const sha256Hex = async (bytes) => {
  const cryptoApi = globalThis?.crypto?.subtle
  if (!cryptoApi) return ''
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  const digest = await cryptoApi.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

export const buildCapacitorModulePaths = ({ channel, moduleId, version }) => {
  const safeChannel = sanitizeStorageSegment(normalizeChannel(channel), DEFAULT_CHANNEL)
  const safeModuleId = sanitizeStorageSegment(moduleId, 'module')
  const safeVersion = sanitizeStorageSegment(version, 'latest')
  const versionRootPath = joinRelativePath(
    CAPACITOR_MODULE_CACHE_ROOT,
    safeChannel,
    safeModuleId,
    safeVersion
  )
  return {
    versionRootPath,
    siteRootPath: joinRelativePath(versionRootPath, 'site'),
    bundleZipPath: joinRelativePath(versionRootPath, 'bundle.zip')
  }
}

export const safeCapacitorRemoveDir = async (path) => {
  const targetPath = safeText(path)
  if (!targetPath) return
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  await Filesystem.rmdir({
    path: targetPath,
    directory: Directory.Data,
    recursive: true
  }).catch(() => {})
}

export const locateCapacitorEntryPath = async (versionRootPath, requestedEntryPath = 'index.html') => {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  for (const candidate of candidateEntryPaths(requestedEntryPath)) {
    try {
      await Filesystem.stat({
        path: joinRelativePath(versionRootPath, candidate),
        directory: Directory.Data
      })
      return candidate
    } catch {
      // try next candidate
    }
  }
  throw new Error(`模块入口不存在：${requestedEntryPath}`)
}

export const buildCapacitorLocalPreviewUrl = async (versionRootPath, entryPath) => {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const filePath = joinRelativePath(versionRootPath, entryPath)
  const resolved = await Filesystem.getUri({
    path: filePath,
    directory: Directory.Data
  })
  return await toNativeFileSrc(safeText(resolved?.uri || filePath))
}

export const resolveCapacitorVersionRootPath = ({
  moduleId,
  channel,
  version,
  cacheDir,
  siteRootPath
}) => {
  const explicitCacheDir = safeText(cacheDir).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (explicitCacheDir) return explicitCacheDir
  const explicitSiteRoot = safeText(siteRootPath).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (explicitSiteRoot) {
    return explicitSiteRoot.replace(/\/site$/i, '')
  }
  if (!safeText(moduleId) || !safeText(version)) return ''
  return buildCapacitorModulePaths({
    channel: normalizeChannel(channel || DEFAULT_CHANNEL),
    moduleId,
    version
  }).versionRootPath
}

export const normalizeChannel = (value) => {
  const normalized = safeText(value).toLowerCase()
  return MODULE_CHANNELS.has(normalized) ? normalized : DEFAULT_CHANNEL
}

export const detectChannelFromVersion = (version) => {
  const value = safeText(version).toLowerCase()
  if (!value) return DEFAULT_CHANNEL
  return /(dev|beta|alpha|rc)/.test(value) ? 'dev' : 'main'
}

export const buildCatalogFetchOrder = (inputChannel = '') => {
  const preferred = normalizeChannel(inputChannel)
  const order = [preferred, SHARED_CHANNEL]
  if (preferred === 'dev') {
    order.push('main')
  } else if (preferred === 'main') {
    order.push('dev')
  }
  order.push(DEFAULT_CHANNEL)
  return Array.from(new Set(order.filter(Boolean)))
}

export const toAbsoluteUrl = (input, base = resolveModuleCdnBase()) => {
  const value = safeText(input)
  if (!value) return ''
  try {
    return new URL(value, `${safeText(base).replace(/\/+$/, '')}/`).toString()
  } catch {
    return value
  }
}

export const toUniqueTextList = (items = []) =>
  Array.from(
    new Set(
      (Array.isArray(items) ? items : [items])
        .map((item) => safeText(item))
        .filter(Boolean)
    )
  )

export const detectModuleChannelHintFromPath = (relativePath = '') => {
  const firstSegment = safeText(relativePath).split('/').filter(Boolean)[0]
  if (firstSegment === 'dev') return 'dev'
  if (firstSegment === 'main') return 'main'
  if (firstSegment === SHARED_CHANNEL) return SHARED_CHANNEL
  return ''
}

export const extractModuleRelativePath = (inputUrl) => {
  const absolute = toAbsoluteUrl(inputUrl)
  if (!absolute) return ''
  try {
    const pathname = new URL(absolute).pathname.replace(/\\/g, '/')
    const markers = ['/dist/modules/', '/website/public/modules/', '/modules/']
    for (const marker of markers) {
      const index = pathname.toLowerCase().indexOf(marker.toLowerCase())
      if (index >= 0) {
        return pathname.slice(index + marker.length).replace(/^\/+/, '')
      }
    }
  } catch {
    // ignore
  }
  return ''
}

export const buildGithubRawUrl = (relativePath) => {
  const safePath = safeText(relativePath).replace(/^\/+/, '')
  if (!safePath) return ''
  // website-pages 分支根目录即静态站（modules/ 在根下，兼容历史 dist/modules）
  return `${GITHUB_RAW_BASE}/${GITHUB_WEBSITE_BRANCH}/${MODULE_PUBLIC_REPO_PATH}/${safePath}`
}

export const buildGithubPagesModuleUrl = (relativePath) => {
  const safePath = safeText(relativePath).replace(/^\/+/, '')
  if (!safePath) return ''
  return `${GITHUB_PAGES_MODULE_CDN_BASE.replace(/\/+$/, '')}/${safePath}`
}

export const buildCurrentBaseUrl = (relativePath) => {
  const safePath = safeText(relativePath).replace(/^\/+/, '')
  if (!safePath) return ''
  return `${resolveModuleCdnBase().replace(/\/+$/, '')}/${safePath}`
}

export const buildMirrorCandidateUrls = (targetUrl) => {
  const absolute = safeText(targetUrl)
  if (!absolute) return []
  return toUniqueTextList(
    GITHUB_PROXY_PREFIXES.map((prefix) => (prefix ? `${prefix}${absolute}` : absolute))
  )
}

export const readSourceRotationMap = () => {
  try {
    const raw = globalThis?.localStorage?.getItem(MODULE_SOURCE_ROTATION_STORAGE_KEY)
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export const writeSourceRotationMap = (nextMap) => {
  try {
    globalThis?.localStorage?.setItem(
      MODULE_SOURCE_ROTATION_STORAGE_KEY,
      JSON.stringify(nextMap || {})
    )
  } catch {
    // ignore storage failure
  }
}

export const rotateRemoteCandidates = (items, purpose = 'remote', scope = '') => {
  const list = toUniqueTextList(items)
  if (list.length <= 1) return list
  const rotationKey = `${safeText(purpose || 'remote')}:${safeText(scope || list[0])}`
  const rotationMap = readSourceRotationMap()
  const rawIndex = Number(rotationMap?.[rotationKey] || 0)
  const startIndex = Number.isFinite(rawIndex) && rawIndex >= 0 ? rawIndex % list.length : 0
  rotationMap[rotationKey] = startIndex + 1
  writeSourceRotationMap(rotationMap)
  return [...list.slice(startIndex), ...list.slice(0, startIndex)]
}

export const shouldRotateRemoteCandidates = (purpose = 'remote') => safeText(purpose).toLowerCase() === 'open'

export const finalizeRemoteCandidates = (items, purpose = 'remote', scope = '') => {
  let list = toUniqueTextList(items)
  // 页面加载（open）时排除代理 URL — 代理服务器通常设置 X-Frame-Options 阻止 iframe 嵌入
  if (purpose === 'open') {
    const filtered = list.filter(url => !GITHUB_PROXY_PREFIXES.some(p => p && url.startsWith(p)))
    if (filtered.length > 0) list = filtered
  }
  if (list.length <= 1) return list
  return shouldRotateRemoteCandidates(purpose) ? rotateRemoteCandidates(list, purpose, scope) : list
}

export const buildRemoteUrlCandidates = (inputUrl, preferredChannel = '', purpose = 'remote') => {
  const absolute = toAbsoluteUrl(inputUrl)
  if (!absolute) return []
  const relativePath = extractModuleRelativePath(absolute)
  if (!relativePath) return finalizeRemoteCandidates([absolute], purpose, absolute)
  const channelHint = detectModuleChannelHintFromPath(relativePath)
  const normalizedRelativePath =
    channelHint && preferredChannel && normalizeChannel(preferredChannel) !== channelHint
      ? relativePath.replace(new RegExp(`^${channelHint}/`), `${normalizeChannel(preferredChannel)}/`)
      : relativePath
  const currentBaseUrl = buildCurrentBaseUrl(normalizedRelativePath)
  const githubPagesUrl = buildGithubPagesModuleUrl(normalizedRelativePath)
  const rawUrl = buildGithubRawUrl(normalizedRelativePath)
  // raw.githubusercontent 可走代理；GitHub Pages 备用站可直接嵌入（无 X-Frame 代理问题）
  const githubCandidates = buildMirrorCandidateUrls(rawUrl)
  const primaryCandidates = isModuleCdnOverrideActive()
    ? [currentBaseUrl]
    : [currentBaseUrl, githubPagesUrl, absolute]
  return finalizeRemoteCandidates(
    toUniqueTextList([...primaryCandidates, githubPagesUrl, ...githubCandidates]),
    purpose,
    normalizedRelativePath
  )
}

export const readModuleStateMap = () => {
  try {
    const raw = localStorage.getItem(MODULE_STATE_STORAGE_KEY)
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export const writeModuleStateMap = (nextMap) => {
  try {
    localStorage.setItem(MODULE_STATE_STORAGE_KEY, JSON.stringify(nextMap || {}))
  } catch {
    // ignore storage failure
  }
}

export const updateModuleState = (moduleId, patch) => {
  const id = safeText(moduleId)
  if (!id) return
  const map = readModuleStateMap()
  map[id] = {
    ...(map[id] && typeof map[id] === 'object' ? map[id] : {}),
    ...(patch && typeof patch === 'object' ? patch : {}),
    updated_at: new Date().toISOString()
  }
  writeModuleStateMap(map)
}

export const getLocalModuleState = (moduleId) => {
  const id = safeText(moduleId)
  if (!id) return null
  const map = readModuleStateMap()
  const value = map[id]
  return value && typeof value === 'object' ? value : null
}

export const readStorageJson = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

export const writeStorageJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage failure
  }
}

export const readCachedCatalogSnapshot = (channel) => {
  const id = safeText(channel)
  if (!id) return null
  const cacheMap = readStorageJson(MODULE_CATALOG_CACHE_STORAGE_KEY, {})
  const snapshot = cacheMap?.[id]
  if (!snapshot || typeof snapshot !== 'object') return null
  const modules = Array.isArray(snapshot?.catalog?.modules) ? snapshot.catalog.modules : []
  if (!modules.length) return null
  return {
    channel: normalizeChannel(snapshot.channel || id),
    url: safeText(snapshot.url),
    catalog: {
      schema_version: Number(snapshot?.catalog?.schema_version || 1),
      generated_at: safeText(snapshot?.catalog?.generated_at || snapshot?.catalog?.generatedAt || ''),
      modules
    },
    from_cache: true
  }
}

export const writeCachedCatalogSnapshot = (channel, payload) => {
  const id = safeText(channel)
  if (!id || !payload?.catalog || !Array.isArray(payload.catalog.modules) || !payload.catalog.modules.length) return
  const cacheMap = readStorageJson(MODULE_CATALOG_CACHE_STORAGE_KEY, {})
  cacheMap[id] = {
    channel: normalizeChannel(payload.channel || id),
    url: safeText(payload.url),
    stored_at: new Date().toISOString(),
    catalog: {
      schema_version: Number(payload?.catalog?.schema_version || 1),
      generated_at: safeText(payload?.catalog?.generated_at || payload?.catalog?.generatedAt || ''),
      modules: payload.catalog.modules
    }
  }
  writeStorageJson(MODULE_CATALOG_CACHE_STORAGE_KEY, cacheMap)
}

export const buildManifestCacheKey = (url) => safeText(toAbsoluteUrl(url))

export const readCachedManifestSnapshot = (url) => {
  const cacheKey = buildManifestCacheKey(url)
  if (!cacheKey) return null
  const cacheMap = readStorageJson(MODULE_MANIFEST_CACHE_STORAGE_KEY, {})
  const snapshot = cacheMap?.[cacheKey]
  if (!snapshot || typeof snapshot !== 'object') return null
  if (!safeText(snapshot.module_id) || !safeText(snapshot.version) || !safeText(snapshot.package_url)) return null
  return {
    ...snapshot,
    url: cacheKey,
    from_cache: true
  }
}

export const writeCachedManifestSnapshot = (manifest) => {
  const cacheKey = buildManifestCacheKey(manifest?.url)
  if (!cacheKey || !safeText(manifest?.module_id) || !safeText(manifest?.version) || !safeText(manifest?.package_url)) {
    return
  }
  const cacheMap = readStorageJson(MODULE_MANIFEST_CACHE_STORAGE_KEY, {})
  cacheMap[cacheKey] = {
    url: cacheKey,
    stored_at: new Date().toISOString(),
    schema_version: Number(manifest?.schema_version || 1),
    module_id: safeText(manifest?.module_id),
    module_name: safeText(manifest?.module_name || manifest?.module_id),
    version: safeText(manifest?.version),
    package_url: safeText(manifest?.package_url),
    package_urls: toUniqueTextList(manifest?.package_urls),
    package_sha256: safeText(manifest?.package_sha256),
    channel: safeText(manifest?.channel),
    entry_path: safeText(manifest?.entry_path || 'index.html'),
    min_compatible_version: safeText(manifest?.min_compatible_version),
    published_at: safeText(manifest?.published_at),
    release_notes: safeText(manifest?.release_notes),
    open_url: safeText(manifest?.open_url)
  }
  writeStorageJson(MODULE_MANIFEST_CACHE_STORAGE_KEY, cacheMap)
}

export const fetchJsonNoStore = async (url, timeoutMs = DEFAULT_REMOTE_JSON_TIMEOUT_MS) => {
  const targetUrl = toAbsoluteUrl(url, globalThis?.location?.href || resolveModuleCdnBase())
  const requestUrl = withCacheBust(targetUrl)

  if (isAbsoluteHttpUrl(targetUrl) && isTauriRuntime()) {
    try {
      return await withTimeout(
        invokeNativeBridge(
          'fetch_remote_json',
          { url: requestUrl },
          `远程 JSON ${targetUrl}`
        ),
        timeoutMs,
        '远程 JSON 请求超时'
      )
    } catch (error) {
      if (!isNativeBridgeUnavailableError(error)) {
        throw error
      }
      pushDebugLog('MoreModules', `远程 JSON 回退浏览器请求：${targetUrl}`, 'warn', {
        error: describeError(error)
      })
    }
  }

  if (isAbsoluteHttpUrl(targetUrl) && isCapacitorRuntime()) {
    try {
      return await withTimeout(fetchJsonViaCapacitor(requestUrl, timeoutMs), timeoutMs, '远程 JSON 请求超时')
    } catch (error) {
      pushDebugLog('MoreModules', `远程 JSON 回退浏览器请求：${targetUrl}`, 'warn', {
        error: describeError(error)
      })
    }
  }

  const response = await fetchWithTimeout(
    requestUrl,
    { cache: 'no-store' },
    timeoutMs
  )
  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`)
  }
  return response.json()
}

export const fetchJsonFromAnyCandidate = async (candidates, timeoutMs) => {
  const urls = toUniqueTextList(candidates)
  if (!urls.length) {
    throw new Error('远程配置地址为空')
  }
  return await new Promise((resolve, reject) => {
    let settled = false
    let pending = urls.length
    let lastError = null
    urls.forEach((candidate) => {
      fetchJsonNoStore(candidate, timeoutMs)
        .then((payload) => {
          if (settled) return
          settled = true
          resolve({ payload, url: candidate })
        })
        .catch((error) => {
          lastError = error
        })
        .finally(() => {
          pending -= 1
          if (!settled && pending <= 0) {
            reject(lastError || new Error('远程配置请求失败'))
          }
        })
    })
  })
}

export const fetchJsonWithRetry = async (
  urlOrUrls,
  timeoutMsList = [DEFAULT_REMOTE_JSON_TIMEOUT_MS],
  options = {}
) => {
  const candidates = toUniqueTextList(urlOrUrls).map((item) => toAbsoluteUrl(item))
  if (!candidates.length) {
    throw new Error('远程配置地址为空')
  }
  const normalizedTimeouts = toUniqueTextList(timeoutMsList)
    .map((item) => Number(item) || DEFAULT_REMOTE_JSON_TIMEOUT_MS)
    .filter((item) => item > 0)
  const raceFirst = options && options.raceFirst === true
  let lastError = null
  if (raceFirst && candidates.length > 1) {
    try {
      return await fetchJsonFromAnyCandidate(
        candidates,
        Math.min(FAST_REMOTE_RACE_TIMEOUT_MS, normalizedTimeouts[0] || DEFAULT_REMOTE_JSON_TIMEOUT_MS)
      )
    } catch (error) {
      lastError = error
    }
  }
  for (const candidate of candidates) {
    for (let index = 0; index < normalizedTimeouts.length; index += 1) {
      try {
        const payload = await fetchJsonNoStore(
          candidate,
          normalizedTimeouts[index] || DEFAULT_REMOTE_JSON_TIMEOUT_MS
        )
        return {
          payload,
          url: candidate
        }
      } catch (error) {
        lastError = error
        if (index < normalizedTimeouts.length - 1) {
          await sleep(180 * (index + 1))
        }
      }
    }
  }
  throw lastError || new Error('远程配置请求失败')
}

export const pickFastestOpenUrl = async (candidates = []) => {
  const urls = toUniqueTextList(candidates)
  if (!urls.length) return ''
  if (!isCapacitorRuntime() || urls.length === 1) return urls[0]
  return await new Promise((resolve) => {
    let settled = false
    let pending = urls.length
    urls.forEach((candidate) => {
      probeUrlViaCapacitor(candidate, FAST_REMOTE_OPEN_PROBE_TIMEOUT_MS)
        .then((ok) => {
          if (!ok || settled) return
          settled = true
          resolve(candidate)
        })
        .catch(() => {
          // ignore single candidate probe failure
        })
        .finally(() => {
          pending -= 1
          if (!settled && pending <= 0) {
            resolve(urls[0] || '')
          }
        })
    })
  })
}

export const resolveModuleChannel = async () => {
  const overridden = normalizeChannel(localStorage.getItem('hbu_module_channel'))
  if (MODULE_CHANNELS.has(overridden)) return overridden

  let version = ''
  try {
    version = await getNativeAppVersion()
  } catch {
    // ignore
  }
  if (!version && import.meta.env.VITE_APP_VERSION) {
    version = safeText(import.meta.env.VITE_APP_VERSION)
  }
  if (!version && import.meta.env.DEV) return 'dev'
  return detectChannelFromVersion(version)
}

export const normalizeCatalogModule = (item, channel) => {
  const raw = item && typeof item === 'object' ? item : {}
  const id = safeText(raw.id || raw.module_id)
  const manifestUrl = toAbsoluteUrl(
    raw.manifest_url || `${resolveModuleCdnBase()}/${channel}/${id}/manifest.json`,
    `${resolveModuleCdnBase()}/${channel}/`
  )
  return {
    id,
    name: safeText(raw.name || raw.module_name || id),
    manifest_url: manifestUrl,
    min_compatible_version: safeText(raw.min_compatible_version || raw.minCompatibleVersion),
    key_required: !!raw.key_required,
    order: Number(raw.order || 999),
    icon: safeText(raw.icon || ''),
    description: safeText(raw.description || ''),
    raw
  }
}

export const fetchModuleCatalog = async (inputChannel = '') => {
  assertRemoteModulesAllowed()
  const tried = []

  for (const channel of buildCatalogFetchOrder(inputChannel)) {
    const resolved = normalizeChannel(channel)
    if (!resolved || tried.includes(resolved)) continue
    tried.push(resolved)
      const url = `${resolveModuleCdnBase()}/${resolved}/catalog.json`
      try {
        const { payload, url: resolvedUrl } = await fetchJsonWithRetry(
          buildRemoteUrlCandidates(url, resolved, 'catalog'),
          [2500, 4200]
        )
      const rawModules = Array.isArray(payload?.modules) ? payload.modules : []
      const modules = rawModules
        .map((item) => normalizeCatalogModule(item, resolved))
        .filter((item) => item.id && item.manifest_url)
        .sort((a, b) => a.order - b.order)

      const snapshot = {
        channel: resolved,
        url: resolvedUrl,
        catalog: {
          schema_version: Number(payload?.schema_version || 1),
          generated_at: safeText(payload?.generated_at || payload?.generatedAt || ''),
          modules
        },
        from_fallback: resolved !== SHARED_CHANNEL
      }
      writeCachedCatalogSnapshot(resolved, snapshot)
      return snapshot
    } catch {
      // try next channel
    }
  }
  for (const channel of tried) {
    const snapshot = readCachedCatalogSnapshot(channel)
    if (snapshot) {
      return {
        ...snapshot,
        from_fallback: normalizeChannel(snapshot.channel || channel) !== SHARED_CHANNEL
      }
    }
  }
  throw new Error('无法获取模块清单，请检查网络后重试')
}

export const fetchModuleManifest = async (manifestUrl) => {
  const url = toAbsoluteUrl(manifestUrl)
  if (!url) throw new Error('模块 manifest 地址为空')
  try {
    const { payload, url: resolvedUrl } = await fetchJsonWithRetry(
      buildRemoteUrlCandidates(url, '', 'manifest'),
      [2800, 4500]
    )

    const moduleId = safeText(payload?.module_id || payload?.id)
    const version = safeText(payload?.version)
    const packageUrl = toAbsoluteUrl(payload?.package_url, resolvedUrl)
    const entryPath = safeText(payload?.entry_path || 'index.html')
    if (!moduleId || !version || !packageUrl) {
      throw new Error('模块 manifest 字段不完整')
    }
    const preferredChannel =
      safeText(payload?.channel) ||
      detectModuleChannelHintFromPath(extractModuleRelativePath(resolvedUrl)) ||
      detectModuleChannelHintFromPath(extractModuleRelativePath(packageUrl))
    const packageUrls = buildRemoteUrlCandidates(packageUrl, preferredChannel, 'package')

    const manifest = {
      url: resolvedUrl,
      schema_version: Number(payload?.schema_version || 1),
      module_id: moduleId,
      module_name: safeText(payload?.module_name || payload?.name || moduleId),
      version,
      package_url: packageUrl,
      package_urls: packageUrls,
      package_sha256: safeText(payload?.package_sha256 || payload?.sha256 || ''),
      package_size: Number(payload?.package_size || 0),
      channel: safeText(payload?.channel),
      entry_path: entryPath,
      min_compatible_version: safeText(payload?.min_compatible_version || payload?.minCompatibleVersion || ''),
      published_at: safeText(payload?.published_at || ''),
      release_notes: safeText(payload?.release_notes || ''),
      open_url: toAbsoluteUrl(payload?.open_url, resolvedUrl)
    }
    writeCachedManifestSnapshot(manifest)
    return manifest
  } catch (error) {
    const cachedManifest = readCachedManifestSnapshot(url)
    if (cachedManifest) return cachedManifest
    throw error
  }
}
