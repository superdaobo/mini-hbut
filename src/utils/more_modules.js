import { getNativeAppVersion, isCapacitorRuntime, isTauriRuntime, toNativeFileSrc } from '../platform/native'
import { pushDebugLog } from './debug_logger'

const DEFAULT_MODULE_CDN_BASE = 'https://hbut.6661111.xyz/modules'
const GITHUB_REPO = 'superdaobo/mini-hbut'
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}`
const GITHUB_WEBSITE_BRANCH = 'website-pages'
const GITHUB_PROXY_PREFIXES = Object.freeze(['https://hk.gh-proxy.org/', 'https://gh-proxy.com/', ''])
const MODULE_PUBLIC_REPO_PATH = 'dist/modules'
const MODULE_CDN_OVERRIDE_STORAGE_KEY = 'hbu_debug_module_cdn_base'
const MODULE_STATE_STORAGE_KEY = 'hbu_more_module_state_v1'
const MODULE_CATALOG_CACHE_STORAGE_KEY = 'hbu_more_module_catalog_cache_v1'
const MODULE_MANIFEST_CACHE_STORAGE_KEY = 'hbu_more_module_manifest_cache_v1'
const MODULE_SOURCE_ROTATION_STORAGE_KEY = 'hbu_more_module_remote_source_rotation_v1'
const DEFAULT_CHANNEL = 'main'
const SHARED_CHANNEL = 'latest'
const MODULE_CHANNELS = new Set(['main', 'dev', SHARED_CHANNEL])
const DEFAULT_REMOTE_JSON_TIMEOUT_MS = 4500
const FAST_REMOTE_RACE_TIMEOUT_MS = 2200
const FAST_REMOTE_OPEN_PROBE_TIMEOUT_MS = 1800
const CAPACITOR_MODULE_CACHE_ROOT = 'modules'
const CAPACITOR_BUNDLE_TIMEOUT_MS = 20000
const PREVIEW_MODE_TAURI_LOCAL = 'tauri-local'
const PREVIEW_MODE_CAPACITOR_LOCAL = 'capacitor-local'
const PREVIEW_MODE_REMOTE = 'remote-site'

const withCacheBust = (url) => {
  const text = safeText(url)
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

const isAbsoluteHttpUrl = (url) => /^https?:\/\//i.test(safeText(url))
export const isLocalModuleBridgePreviewUrl = (url) =>
  /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/module_bundle\/content\//i.test(safeText(url))

const describeError = (error) => {
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

const resolveModuleCdnBase = () => {
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

const isModuleCdnOverrideActive = () => resolveModuleCdnBase() !== DEFAULT_MODULE_CDN_BASE

const sleep = (ms = 0) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
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

const fetchWithTimeout = async (url, init = {}, timeoutMs = DEFAULT_REMOTE_JSON_TIMEOUT_MS) => {
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

const parseJsonPayload = (payload) => {
  if (payload && typeof payload === 'object') return payload
  if (typeof payload === 'string') {
    const parsed = JSON.parse(payload)
    if (parsed && typeof parsed === 'object') return parsed
  }
  throw new Error('远程 JSON 响应无效')
}

const fetchJsonViaCapacitor = async (url, timeoutMs = DEFAULT_REMOTE_JSON_TIMEOUT_MS) => {
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

const probeUrlViaCapacitor = async (url, timeoutMs = FAST_REMOTE_OPEN_PROBE_TIMEOUT_MS) => {
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

const isNativeBridgeUnavailableError = (error) => {
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

const invokeNativeBridge = async (command, args, label = '') => {
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

const safeText = (value) => String(value ?? '').trim()

const sanitizeStorageSegment = (value, fallback = '') => {
  const normalized = safeText(value || fallback)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
  const compact = normalized.replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return compact || safeText(fallback)
}

const joinRelativePath = (...parts) =>
  parts
    .map((part) => safeText(part).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')

const normalizeRelativeModulePath = (value, fallback = 'index.html') => {
  const normalized = safeText(value || fallback).replace(/\\/g, '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) {
    return safeText(fallback)
  }
  return segments.join('/')
}

const normalizeZipEntryPath = (value) => {
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

const candidateEntryPaths = (requested = 'index.html') => {
  const normalized = normalizeRelativeModulePath(requested, 'index.html')
  return toUniqueTextList([
    normalized,
    `site/${normalized}`,
    'index.html',
    'site/index.html'
  ]).map((item) => normalizeRelativeModulePath(item, 'index.html'))
}

const uint8ArrayToBase64 = (bytes) => {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < buffer.length; index += chunkSize) {
    const chunk = buffer.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

const base64ToUint8Array = (base64Text = '') => {
  const text = safeText(base64Text)
  if (!text) return new Uint8Array()
  const binary = atob(text)
  const result = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index)
  }
  return result
}

const sha256Hex = async (bytes) => {
  const cryptoApi = globalThis?.crypto?.subtle
  if (!cryptoApi) return ''
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  const digest = await cryptoApi.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

const buildCapacitorModulePaths = ({ channel, moduleId, version }) => {
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

const safeCapacitorRemoveDir = async (path) => {
  const targetPath = safeText(path)
  if (!targetPath) return
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  await Filesystem.rmdir({
    path: targetPath,
    directory: Directory.Data,
    recursive: true
  }).catch(() => {})
}

const locateCapacitorEntryPath = async (versionRootPath, requestedEntryPath = 'index.html') => {
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

const buildCapacitorLocalPreviewUrl = async (versionRootPath, entryPath) => {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const filePath = joinRelativePath(versionRootPath, entryPath)
  const resolved = await Filesystem.getUri({
    path: filePath,
    directory: Directory.Data
  })
  return await toNativeFileSrc(safeText(resolved?.uri || filePath))
}

const resolveCapacitorVersionRootPath = ({
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

const normalizeChannel = (value) => {
  const normalized = safeText(value).toLowerCase()
  return MODULE_CHANNELS.has(normalized) ? normalized : DEFAULT_CHANNEL
}

const detectChannelFromVersion = (version) => {
  const value = safeText(version).toLowerCase()
  if (!value) return DEFAULT_CHANNEL
  return /(dev|beta|alpha|rc)/.test(value) ? 'dev' : 'main'
}

const buildCatalogFetchOrder = (inputChannel = '') => {
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

const toAbsoluteUrl = (input, base = resolveModuleCdnBase()) => {
  const value = safeText(input)
  if (!value) return ''
  try {
    return new URL(value, `${safeText(base).replace(/\/+$/, '')}/`).toString()
  } catch {
    return value
  }
}

const toUniqueTextList = (items = []) =>
  Array.from(
    new Set(
      (Array.isArray(items) ? items : [items])
        .map((item) => safeText(item))
        .filter(Boolean)
    )
  )

const detectModuleChannelHintFromPath = (relativePath = '') => {
  const firstSegment = safeText(relativePath).split('/').filter(Boolean)[0]
  if (firstSegment === 'dev') return 'dev'
  if (firstSegment === 'main') return 'main'
  if (firstSegment === SHARED_CHANNEL) return SHARED_CHANNEL
  return ''
}

const extractModuleRelativePath = (inputUrl) => {
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

const buildGithubRawUrl = (relativePath) => {
  const safePath = safeText(relativePath).replace(/^\/+/, '')
  if (!safePath) return ''
  return `${GITHUB_RAW_BASE}/${GITHUB_WEBSITE_BRANCH}/${MODULE_PUBLIC_REPO_PATH}/${safePath}`
}

const buildCurrentBaseUrl = (relativePath) => {
  const safePath = safeText(relativePath).replace(/^\/+/, '')
  if (!safePath) return ''
  return `${resolveModuleCdnBase().replace(/\/+$/, '')}/${safePath}`
}

const buildMirrorCandidateUrls = (targetUrl) => {
  const absolute = safeText(targetUrl)
  if (!absolute) return []
  return toUniqueTextList(
    GITHUB_PROXY_PREFIXES.map((prefix) => (prefix ? `${prefix}${absolute}` : absolute))
  )
}

const readSourceRotationMap = () => {
  try {
    const raw = globalThis?.localStorage?.getItem(MODULE_SOURCE_ROTATION_STORAGE_KEY)
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeSourceRotationMap = (nextMap) => {
  try {
    globalThis?.localStorage?.setItem(
      MODULE_SOURCE_ROTATION_STORAGE_KEY,
      JSON.stringify(nextMap || {})
    )
  } catch {
    // ignore storage failure
  }
}

const rotateRemoteCandidates = (items, purpose = 'remote', scope = '') => {
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

const buildRemoteUrlCandidates = (inputUrl, preferredChannel = '', purpose = 'remote') => {
  const absolute = toAbsoluteUrl(inputUrl)
  if (!absolute) return []
  const relativePath = extractModuleRelativePath(absolute)
  if (!relativePath) return rotateRemoteCandidates([absolute], purpose, absolute)
  const channelHint = detectModuleChannelHintFromPath(relativePath)
  const normalizedRelativePath =
    channelHint && preferredChannel && normalizeChannel(preferredChannel) !== channelHint
      ? relativePath.replace(new RegExp(`^${channelHint}/`), `${normalizeChannel(preferredChannel)}/`)
      : relativePath
  const currentBaseUrl = buildCurrentBaseUrl(normalizedRelativePath)
  const rawUrl = buildGithubRawUrl(normalizedRelativePath)
  const githubCandidates = buildMirrorCandidateUrls(rawUrl)
  const primaryCandidates = isModuleCdnOverrideActive()
    ? [currentBaseUrl]
    : [currentBaseUrl, absolute]
  return rotateRemoteCandidates(
    toUniqueTextList([...primaryCandidates, ...githubCandidates]),
    purpose,
    normalizedRelativePath
  )
}

const readModuleStateMap = () => {
  try {
    const raw = localStorage.getItem(MODULE_STATE_STORAGE_KEY)
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeModuleStateMap = (nextMap) => {
  try {
    localStorage.setItem(MODULE_STATE_STORAGE_KEY, JSON.stringify(nextMap || {}))
  } catch {
    // ignore storage failure
  }
}

const updateModuleState = (moduleId, patch) => {
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

const readStorageJson = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

const writeStorageJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage failure
  }
}

const readCachedCatalogSnapshot = (channel) => {
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

const writeCachedCatalogSnapshot = (channel, payload) => {
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

const buildManifestCacheKey = (url) => safeText(toAbsoluteUrl(url))

const readCachedManifestSnapshot = (url) => {
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

const writeCachedManifestSnapshot = (manifest) => {
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

const fetchJsonNoStore = async (url, timeoutMs = DEFAULT_REMOTE_JSON_TIMEOUT_MS) => {
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

const fetchJsonFromAnyCandidate = async (candidates, timeoutMs) => {
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

const fetchJsonWithRetry = async (urlOrUrls, timeoutMsList = [DEFAULT_REMOTE_JSON_TIMEOUT_MS]) => {
  const candidates = toUniqueTextList(urlOrUrls).map((item) => toAbsoluteUrl(item))
  if (!candidates.length) {
    throw new Error('远程配置地址为空')
  }
  const normalizedTimeouts = toUniqueTextList(timeoutMsList)
    .map((item) => Number(item) || DEFAULT_REMOTE_JSON_TIMEOUT_MS)
    .filter((item) => item > 0)
  let lastError = null
  if (candidates.length > 1) {
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
        if (index < timeoutMsList.length - 1) {
          await sleep(180 * (index + 1))
        }
      }
    }
  }
  throw lastError || new Error('远程配置请求失败')
}

const pickFastestOpenUrl = async (candidates = []) => {
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

const normalizeCatalogModule = (item, channel) => {
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

const buildRemoteOpenUrlCandidates = ({
  manifestUrl,
  channel,
  moduleId,
  version,
  packageUrl,
  packageUrls,
  entryPath,
  openUrl
}) => {
  const preferredChannel =
    safeText(channel) ||
    normalizeChannel(channel) ||
    detectModuleChannelHintFromPath(extractModuleRelativePath(manifestUrl)) ||
    detectModuleChannelHintFromPath(extractModuleRelativePath(packageUrl))
  const normalizedEntryPath = normalizeRelativeModulePath(entryPath, 'index.html')
  const explicit = toAbsoluteUrl(openUrl, safeText(manifestUrl))
  if (explicit && !isLocalModuleBridgePreviewUrl(explicit)) {
    return buildRemoteUrlCandidates(explicit, preferredChannel, 'open')
  }
  const packageCandidates = toUniqueTextList(packageUrls || packageUrl)
  const siteCandidates = packageCandidates.map((candidate) => {
    if (candidate.includes('/bundle.zip')) {
      return candidate.replace(/\/bundle\.zip(?:\?.*)?$/i, `/site/${normalizedEntryPath}`)
    }
    return `${candidate.replace(/\/+$/, '')}/site/${normalizedEntryPath}`
  })
  return rotateRemoteCandidates(
    toUniqueTextList([
      ...siteCandidates,
      `${resolveModuleCdnBase()}/${normalizeChannel(preferredChannel)}/${safeText(moduleId)}/${safeText(version)}/site/${normalizedEntryPath}`
    ]),
    'open',
    `${normalizeChannel(preferredChannel)}/${safeText(moduleId)}/${safeText(version)}/site/${normalizedEntryPath}`
  )
}

const buildOpenUrlCandidates = ({ manifest, channel }) =>
  buildRemoteOpenUrlCandidates({
    manifestUrl: safeText(manifest?.url),
    channel: safeText(manifest?.channel || channel),
    moduleId: safeText(manifest?.module_id),
    version: safeText(manifest?.version),
    packageUrl: safeText(manifest?.package_url),
    packageUrls: manifest?.package_urls,
    entryPath: safeText(manifest?.entry_path || 'index.html'),
    openUrl: safeText(manifest?.open_url)
  })

const prepareCapacitorLocalModuleBundle = async ({
  channel,
  moduleInfo,
  manifest,
  moduleId,
  packageUrl,
  packageUrls,
  openUrlCandidates
}) => {
  const { unzipSync } = await import('fflate')
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const requestedEntryPath = normalizeRelativeModulePath(manifest?.entry_path, 'index.html')
  const resolvedChannel = normalizeChannel(channel || manifest?.channel)
  const version = safeText(manifest?.version)
  const moduleName = safeText(moduleInfo?.name || manifest?.module_name || moduleId)
  const packageSha256 = safeText(manifest?.package_sha256).toLowerCase()
  const minCompatibleVersion = safeText(manifest?.min_compatible_version)
  const openUrl = safeText(manifest?.open_url || openUrlCandidates[0])
  const manifestUrl = safeText(manifest?.url)
  const manifestCheckedAt = new Date().toISOString()
  const modulePaths = buildCapacitorModulePaths({
    channel: resolvedChannel,
    moduleId,
    version
  })
  const localState = getLocalModuleState(moduleId) || {}

  const reuseCachedBundle = async () => {
    if (safeText(localState?.version) !== version) return null
    if (
      packageSha256 &&
      safeText(localState?.package_sha256).toLowerCase() &&
      safeText(localState?.package_sha256).toLowerCase() !== packageSha256
    ) {
      return null
    }
    if (safeText(localState?.min_compatible_version) !== minCompatibleVersion) {
      return null
    }
    try {
      const resolvedEntryPath = await locateCapacitorEntryPath(
        modulePaths.versionRootPath,
        safeText(localState?.requested_entry_path || requestedEntryPath)
      )
      const localPreviewUrl =
        safeText(localState?.local_preview_url) ||
        (await buildCapacitorLocalPreviewUrl(modulePaths.versionRootPath, resolvedEntryPath))
      return {
        resolvedEntryPath,
        localPreviewUrl
      }
    } catch {
      return null
    }
  }

  const cachedBundle = await reuseCachedBundle()
  if (cachedBundle) {
    updateModuleState(moduleId, {
      channel: resolvedChannel,
      version,
      module_name: moduleName,
      package_url: packageUrl,
      package_urls: packageUrls,
      package_sha256: packageSha256,
      requested_entry_path: requestedEntryPath,
      resolved_entry_path: cachedBundle.resolvedEntryPath,
      entry_path: requestedEntryPath,
      min_compatible_version: minCompatibleVersion,
      open_url: openUrl,
      preview_url: cachedBundle.localPreviewUrl,
      preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
      local_preview_url: cachedBundle.localPreviewUrl,
      site_root_path: modulePaths.siteRootPath,
      bundle_zip_path: modulePaths.bundleZipPath,
      cache_dir: modulePaths.versionRootPath,
      bundle_path: modulePaths.bundleZipPath,
      manifest_url: manifestUrl,
      manifest_checked_at: manifestCheckedAt,
      source: 'cache'
    })
    pushDebugLog('MoreModules', `安卓模块缓存命中：${moduleId}`, 'info', {
      preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
      entry_path: cachedBundle.resolvedEntryPath,
      preview_url: cachedBundle.localPreviewUrl
    })
    return {
      ready: true,
      launch_mode: 'cache',
      version,
      package_url: packageUrl,
      package_urls: packageUrls,
      cache_dir: modulePaths.versionRootPath,
      bundle_path: modulePaths.bundleZipPath,
      bundle_zip_path: modulePaths.bundleZipPath,
      site_root_path: modulePaths.siteRootPath,
      preview_url: cachedBundle.localPreviewUrl,
      local_preview_url: cachedBundle.localPreviewUrl,
      open_url: openUrl,
      min_compatible_version: minCompatibleVersion,
      source: 'cache',
      module_id: moduleId,
      module_name: moduleName,
      channel: resolvedChannel,
      requested_entry_path: requestedEntryPath,
      resolved_entry_path: cachedBundle.resolvedEntryPath,
      preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
      local_ready: true
    }
  }

  await safeCapacitorRemoveDir(modulePaths.versionRootPath)
  await Filesystem.mkdir({
    path: modulePaths.siteRootPath,
    directory: Directory.Data,
    recursive: true
  }).catch(() => {})

  let lastError = null
  for (const candidate of packageUrls) {
    try {
      await Filesystem.downloadFile({
        url: withCacheBust(candidate),
        path: modulePaths.bundleZipPath,
        directory: Directory.Data,
        progress: false,
        connectTimeout: CAPACITOR_BUNDLE_TIMEOUT_MS,
        readTimeout: CAPACITOR_BUNDLE_TIMEOUT_MS
      })
      lastError = null
      break
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) {
    throw new Error(`模块压缩包下载失败：${safeText(lastError?.message || lastError) || '未知错误'}`)
  }

  const bundleFile = await Filesystem.readFile({
    path: modulePaths.bundleZipPath,
    directory: Directory.Data
  })
  const bundleBytes = base64ToUint8Array(bundleFile?.data || '')
  if (!bundleBytes.length) {
    throw new Error('模块压缩包为空，无法解压')
  }
  const actualSha = await sha256Hex(bundleBytes)
  if (packageSha256 && actualSha && actualSha !== packageSha256) {
    throw new Error(`模块压缩包校验失败：期望 ${packageSha256}，实际 ${actualSha}`)
  }

  const archive = unzipSync(bundleBytes)
  const archiveEntries = Object.entries(archive)
  if (!archiveEntries.length) {
    throw new Error('模块压缩包内容为空')
  }

  // 安卓本地运行统一解压到 site 根目录，保持宿主与线上目录结构一致。
  for (const [entryName, entryBytes] of archiveEntries) {
    const normalizedEntry = normalizeZipEntryPath(entryName)
    if (!normalizedEntry) continue
    await Filesystem.writeFile({
      path: joinRelativePath(modulePaths.siteRootPath, normalizedEntry),
      directory: Directory.Data,
      data: uint8ArrayToBase64(entryBytes),
      recursive: true
    })
  }

  const resolvedEntryPath = await locateCapacitorEntryPath(
    modulePaths.versionRootPath,
    requestedEntryPath
  )
  const localPreviewUrl = await buildCapacitorLocalPreviewUrl(
    modulePaths.versionRootPath,
    resolvedEntryPath
  )

  updateModuleState(moduleId, {
    channel: resolvedChannel,
    version,
    module_name: moduleName,
    package_url: packageUrl,
    package_urls: packageUrls,
    package_sha256: packageSha256 || actualSha,
    requested_entry_path: requestedEntryPath,
    resolved_entry_path: resolvedEntryPath,
    entry_path: requestedEntryPath,
    min_compatible_version: minCompatibleVersion,
    open_url: openUrl,
    preview_url: localPreviewUrl,
    preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
    local_preview_url: localPreviewUrl,
    site_root_path: modulePaths.siteRootPath,
    bundle_zip_path: modulePaths.bundleZipPath,
    cache_dir: modulePaths.versionRootPath,
    bundle_path: modulePaths.bundleZipPath,
    manifest_url: manifestUrl,
    manifest_checked_at: manifestCheckedAt,
    source: 'download'
  })

  pushDebugLog('MoreModules', `安卓模块已切换到真本地 bundle：${moduleId}`, 'info', {
    preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
    entry_path: resolvedEntryPath,
    preview_url: localPreviewUrl
  })

  return {
    ready: true,
    launch_mode: 'in_app',
    version,
    package_url: packageUrl,
    package_urls: packageUrls,
    cache_dir: modulePaths.versionRootPath,
    bundle_path: modulePaths.bundleZipPath,
    bundle_zip_path: modulePaths.bundleZipPath,
    site_root_path: modulePaths.siteRootPath,
    preview_url: localPreviewUrl,
    local_preview_url: localPreviewUrl,
    open_url: openUrl,
    min_compatible_version: minCompatibleVersion,
    source: 'download',
    module_id: moduleId,
    module_name: moduleName,
    channel: resolvedChannel,
    requested_entry_path: requestedEntryPath,
    resolved_entry_path: resolvedEntryPath,
    preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
    local_ready: true
  }
}

export const resolveModuleHostPreviewSource = (payload = {}, options = {}) => {
  const raw = payload && typeof payload === 'object' ? payload : {}
  const moduleId = safeText(raw.module_id || raw.moduleId)
  const localState =
    options && Object.prototype.hasOwnProperty.call(options, 'localState')
      ? options.localState
      : getLocalModuleState(moduleId)
  const requestedEntryPath = normalizeRelativeModulePath(
    raw.requested_entry_path ||
      raw.requestedEntryPath ||
      raw.entry_path ||
      raw.entryPath ||
      localState?.requested_entry_path ||
      localState?.entry_path ||
      'index.html',
    'index.html'
  )
  const packageUrl = safeText(raw.package_url || raw.packageUrl || localState?.package_url)
  const packageUrls = toUniqueTextList(
    raw.package_urls || raw.packageUrls || localState?.package_urls || packageUrl
  )
  const openUrl = safeText(raw.open_url || raw.openUrl || localState?.open_url)
  const rawPreviewUrl = safeText(raw.preview_url || raw.previewUrl || localState?.preview_url)
  const previewMode = safeText(raw.preview_mode || raw.previewMode || localState?.preview_mode)
  const localPreviewUrl = safeText(
    raw.local_preview_url || raw.localPreviewUrl || localState?.local_preview_url
  )
  const candidateUrls = buildRemoteOpenUrlCandidates({
    manifestUrl: safeText(raw.manifest_url || raw.manifestUrl || localState?.manifest_url),
    channel: safeText(raw.channel || localState?.channel || DEFAULT_CHANNEL),
    moduleId,
    version: safeText(raw.version || localState?.version),
    packageUrl,
    packageUrls,
    entryPath: requestedEntryPath,
    openUrl
  })

  let resolvedPreviewUrl = ''
  let sourceKind = 'invalid'

  if (isTauriRuntime()) {
    const tauriPreviewUrl = safeText(rawPreviewUrl || localState?.preview_url)
    if (isLocalModuleBridgePreviewUrl(tauriPreviewUrl) || previewMode === PREVIEW_MODE_TAURI_LOCAL) {
      resolvedPreviewUrl = tauriPreviewUrl
      sourceKind = PREVIEW_MODE_TAURI_LOCAL
    }
  } else if (localPreviewUrl) {
    resolvedPreviewUrl = localPreviewUrl
    sourceKind = PREVIEW_MODE_CAPACITOR_LOCAL
  } else if (
    rawPreviewUrl &&
    !isLocalModuleBridgePreviewUrl(rawPreviewUrl) &&
    (!isCapacitorRuntime() || previewMode === PREVIEW_MODE_REMOTE)
  ) {
    resolvedPreviewUrl = rawPreviewUrl
    sourceKind = PREVIEW_MODE_REMOTE
  } else if (
    openUrl &&
    !isLocalModuleBridgePreviewUrl(openUrl) &&
    (!isCapacitorRuntime() || previewMode === PREVIEW_MODE_REMOTE)
  ) {
    resolvedPreviewUrl = openUrl
    sourceKind = PREVIEW_MODE_REMOTE
  } else if (candidateUrls.length && !isCapacitorRuntime()) {
    resolvedPreviewUrl = candidateUrls[0]
    sourceKind = PREVIEW_MODE_REMOTE
  }

  return {
    resolvedPreviewUrl,
    sourceKind,
    candidateUrls,
    previewMode: sourceKind && sourceKind !== 'invalid' ? sourceKind : previewMode,
    moduleId,
    packageUrl,
    packageUrls,
    entryPath: requestedEntryPath,
    openUrl: openUrl || candidateUrls[0] || '',
    localPreviewUrl,
    siteRootPath: safeText(raw.site_root_path || raw.siteRootPath || localState?.site_root_path),
    bundleZipPath: safeText(raw.bundle_zip_path || raw.bundleZipPath || localState?.bundle_zip_path),
    resolvedEntryPath: safeText(
      raw.resolved_entry_path || raw.resolvedEntryPath || localState?.resolved_entry_path
    ),
    manifestUrl: safeText(raw.manifest_url || raw.manifestUrl || localState?.manifest_url)
  }
}

export const normalizeModuleHostSessionPayload = async (payload = {}, options = {}) => {
  const raw = payload && typeof payload === 'object' ? payload : {}
  const moduleId = safeText(raw.module_id || raw.moduleId)
  const localState =
    options && Object.prototype.hasOwnProperty.call(options, 'localState')
      ? options.localState
      : getLocalModuleState(moduleId)
  const resolved = resolveModuleHostPreviewSource(raw, {
    ...options,
    localState
  })
  const rawPreviewUrl = safeText(raw.preview_url || raw.previewUrl || localState?.preview_url)
  const rawPreviewMode = safeText(raw.preview_mode || raw.previewMode || localState?.preview_mode)
  let resolvedPreviewUrl = safeText(resolved.resolvedPreviewUrl)
  let sourceKind = safeText(resolved.sourceKind)
  let localPreviewUrl = safeText(
    raw.local_preview_url || raw.localPreviewUrl || resolved.localPreviewUrl
  )
  let siteRootPath = safeText(raw.site_root_path || raw.siteRootPath || resolved.siteRootPath)
  let bundleZipPath = safeText(raw.bundle_zip_path || raw.bundleZipPath || resolved.bundleZipPath)
  let resolvedEntryPath = safeText(
    raw.resolved_entry_path || raw.resolvedEntryPath || resolved.resolvedEntryPath
  )
  let invalidReason = ''
  const bridgeBlocked =
    isLocalModuleBridgePreviewUrl(rawPreviewUrl) ||
    isLocalModuleBridgePreviewUrl(resolvedPreviewUrl) ||
    rawPreviewMode === PREVIEW_MODE_TAURI_LOCAL

  if (isTauriRuntime()) {
    return {
      ...raw,
      module_id: moduleId || resolved.moduleId,
      channel: safeText(raw.channel || localState?.channel || DEFAULT_CHANNEL) || DEFAULT_CHANNEL,
      version: safeText(raw.version || localState?.version),
      preview_url: resolvedPreviewUrl,
      preview_mode: sourceKind === 'invalid' ? rawPreviewMode : sourceKind || rawPreviewMode,
      local_preview_url: localPreviewUrl,
      site_root_path: siteRootPath,
      bundle_zip_path: bundleZipPath,
      resolved_entry_path: resolvedEntryPath,
      entry_path: safeText(raw.entry_path || raw.entryPath || resolved.entryPath),
      open_url: safeText(raw.open_url || raw.openUrl || resolved.openUrl),
      package_url: safeText(raw.package_url || raw.packageUrl || resolved.packageUrl),
      package_urls: Array.isArray(raw.package_urls)
        ? raw.package_urls
        : Array.isArray(raw.packageUrls)
          ? raw.packageUrls
          : resolved.packageUrls,
      manifest_url: safeText(raw.manifest_url || raw.manifestUrl || resolved.manifestUrl),
      invalid_reason: ''
    }
  }

  if (isCapacitorRuntime()) {
    const versionRootPath = resolveCapacitorVersionRootPath({
      moduleId: moduleId || resolved.moduleId,
      channel: safeText(raw.channel || localState?.channel || DEFAULT_CHANNEL),
      version: safeText(raw.version || localState?.version),
      cacheDir: safeText(raw.cache_dir || raw.cacheDir || localState?.cache_dir),
      siteRootPath: siteRootPath || safeText(localState?.site_root_path)
    })
    const shouldRecoverLocal =
      !!(localPreviewUrl || versionRootPath || siteRootPath || bundleZipPath) &&
      (
        bridgeBlocked ||
        rawPreviewMode === PREVIEW_MODE_CAPACITOR_LOCAL ||
        sourceKind === PREVIEW_MODE_CAPACITOR_LOCAL ||
        !resolvedPreviewUrl
      )

    if (shouldRecoverLocal && versionRootPath) {
      try {
        const recoveredEntryPath = await locateCapacitorEntryPath(
          versionRootPath,
          resolved.entryPath || 'index.html'
        )
        const recoveredPreviewUrl = await buildCapacitorLocalPreviewUrl(
          versionRootPath,
          recoveredEntryPath
        )
        resolvedPreviewUrl = recoveredPreviewUrl
        sourceKind = PREVIEW_MODE_CAPACITOR_LOCAL
        localPreviewUrl = recoveredPreviewUrl
        resolvedEntryPath = recoveredEntryPath
        siteRootPath = siteRootPath || joinRelativePath(versionRootPath, 'site')
        bundleZipPath = bundleZipPath || joinRelativePath(versionRootPath, 'bundle.zip')
        updateModuleState(moduleId || resolved.moduleId, {
          preview_url: recoveredPreviewUrl,
          preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
          local_preview_url: recoveredPreviewUrl,
          resolved_entry_path: recoveredEntryPath,
          site_root_path: siteRootPath,
          bundle_zip_path: bundleZipPath,
          cache_dir: versionRootPath
        })
        if (bridgeBlocked) {
          pushDebugLog('MoreModules', `安卓宿主入口已重写为本地 bundle：${moduleId || resolved.moduleId}`, 'info', {
            preview_mode: PREVIEW_MODE_CAPACITOR_LOCAL,
            preview_url: recoveredPreviewUrl,
            entry_path: recoveredEntryPath
          })
        }
      } catch (error) {
        if (
          bridgeBlocked ||
          rawPreviewMode === PREVIEW_MODE_CAPACITOR_LOCAL ||
          sourceKind === PREVIEW_MODE_CAPACITOR_LOCAL
        ) {
          resolvedPreviewUrl = ''
          sourceKind = 'invalid'
          localPreviewUrl = ''
          resolvedEntryPath = ''
          invalidReason = 'local-cache-missing'
          updateModuleState(moduleId || resolved.moduleId, {
            preview_url: '',
            preview_mode: '',
            local_preview_url: '',
            resolved_entry_path: ''
          })
          pushDebugLog('MoreModules', `安卓宿主入口恢复失败：${moduleId || resolved.moduleId}`, 'warn', {
            invalid_reason: invalidReason,
            error: safeText(error?.message || error)
          })
        }
      }
    } else if (bridgeBlocked) {
      resolvedPreviewUrl = ''
      sourceKind = 'invalid'
      invalidReason = 'tauri-bridge-blocked'
      pushDebugLog('MoreModules', `安卓宿主入口已拦截桌面本地桥：${moduleId || resolved.moduleId}`, 'warn', {
        preview_mode: rawPreviewMode,
        preview_url: rawPreviewUrl
      })
    }
  } else if (bridgeBlocked) {
    resolvedPreviewUrl = ''
    sourceKind = 'invalid'
    invalidReason = 'tauri-bridge-blocked'
  }

  return {
    ...raw,
    module_id: moduleId || resolved.moduleId,
    channel: safeText(raw.channel || localState?.channel || DEFAULT_CHANNEL) || DEFAULT_CHANNEL,
    version: safeText(raw.version || localState?.version),
    preview_url: resolvedPreviewUrl,
    preview_mode: sourceKind === 'invalid' ? '' : sourceKind || rawPreviewMode,
    local_preview_url: localPreviewUrl,
    site_root_path: siteRootPath,
    bundle_zip_path: bundleZipPath,
    resolved_entry_path: resolvedEntryPath,
    entry_path: safeText(raw.entry_path || raw.entryPath || resolved.entryPath),
    open_url: safeText(raw.open_url || raw.openUrl || resolved.openUrl),
    package_url: safeText(raw.package_url || raw.packageUrl || resolved.packageUrl),
    package_urls: Array.isArray(raw.package_urls)
      ? raw.package_urls
      : Array.isArray(raw.packageUrls)
        ? raw.packageUrls
        : resolved.packageUrls,
    manifest_url: safeText(raw.manifest_url || raw.manifestUrl || resolved.manifestUrl),
    local_ready: !!resolvedPreviewUrl && raw.local_ready !== false,
    invalid_reason: invalidReason
  }
}

export const prepareModuleBundle = async ({ channel, moduleInfo, manifest }) => {
  const moduleId = safeText(moduleInfo?.id || manifest?.module_id)
  const openUrlCandidates = buildOpenUrlCandidates({ manifest, channel })
  const openUrl = safeText(openUrlCandidates[0])
  const packageUrl = safeText(manifest?.package_url)
  const packageUrls = toUniqueTextList(manifest?.package_urls || packageUrl)

  if (isTauriRuntime()) {
    try {
      const prepared = await invokeNativeBridge(
        'prepare_module_bundle',
        {
          request: {
            channel: normalizeChannel(channel),
            moduleId,
            moduleName: safeText(moduleInfo?.name || manifest?.module_name || moduleId),
            version: safeText(manifest?.version),
            packageUrl,
            packageUrls,
            packageSha256: safeText(manifest?.package_sha256),
            minCompatibleVersion: safeText(manifest?.min_compatible_version),
            entryPath: safeText(manifest?.entry_path || 'index.html')
          }
        },
        `模块本地准备 ${moduleId}`
      )
      const preparedPreviewUrl = safeText(prepared?.preview_url || openUrl)
      updateModuleState(moduleId, {
        channel: normalizeChannel(channel),
        version: safeText(prepared?.version || manifest?.version),
        module_name: safeText(prepared?.module_name || moduleInfo?.name || manifest?.module_name || moduleId),
        package_url: packageUrl,
        package_urls: packageUrls,
        package_sha256: safeText(manifest?.package_sha256),
        requested_entry_path: normalizeRelativeModulePath(manifest?.entry_path, 'index.html'),
        resolved_entry_path: safeText(prepared?.entry_path || manifest?.entry_path || 'index.html'),
        entry_path: normalizeRelativeModulePath(manifest?.entry_path, 'index.html'),
        min_compatible_version: safeText(manifest?.min_compatible_version),
        open_url: safeText(manifest?.open_url || openUrl),
        preview_url: preparedPreviewUrl,
        preview_mode: PREVIEW_MODE_TAURI_LOCAL,
        cache_dir: safeText(prepared?.cache_dir),
        site_root_path: safeText(prepared?.cache_dir),
        bundle_zip_path: safeText(prepared?.bundle_path),
        bundle_path: safeText(prepared?.bundle_path),
        manifest_url: safeText(manifest?.url),
        source: safeText(prepared?.source || 'download'),
        manifest_checked_at: new Date().toISOString()
      })
      return {
        ready: true,
        launch_mode: safeText(prepared?.source) === 'cache' ? 'cache' : 'in_app',
        version: safeText(prepared?.version || manifest?.version),
        package_url: packageUrl,
        package_urls: packageUrls,
        cache_dir: safeText(prepared?.cache_dir),
        site_root_path: safeText(prepared?.cache_dir),
        bundle_zip_path: safeText(prepared?.bundle_path),
        bundle_path: safeText(prepared?.bundle_path),
        preview_url: preparedPreviewUrl,
        open_url: safeText(manifest?.open_url || openUrl),
        min_compatible_version: safeText(manifest?.min_compatible_version),
        source: safeText(prepared?.source || 'download'),
        module_id: moduleId,
        module_name: safeText(prepared?.module_name || moduleInfo?.name || manifest?.module_name || moduleId),
        channel: normalizeChannel(channel),
        requested_entry_path: normalizeRelativeModulePath(manifest?.entry_path, 'index.html'),
        resolved_entry_path: safeText(prepared?.entry_path || manifest?.entry_path || 'index.html'),
        preview_mode: PREVIEW_MODE_TAURI_LOCAL,
        local_ready: true
      }
    } catch (error) {
      throw new Error(safeText(error?.message || error) || '模块本地准备失败')
    }
  }

  if (isCapacitorRuntime()) {
    return await prepareCapacitorLocalModuleBundle({
      channel,
      moduleInfo,
      manifest,
      moduleId,
      packageUrl,
      packageUrls,
      openUrlCandidates
    })
  }

  const bestOpenUrl = await pickFastestOpenUrl(openUrlCandidates)
  if (bestOpenUrl) {
    updateModuleState(moduleId, {
      channel: normalizeChannel(channel),
      version: safeText(manifest?.version),
      module_name: safeText(moduleInfo?.name || manifest?.module_name || moduleId),
      package_url: packageUrl,
      package_urls: packageUrls,
      requested_entry_path: normalizeRelativeModulePath(manifest?.entry_path, 'index.html'),
      entry_path: normalizeRelativeModulePath(manifest?.entry_path, 'index.html'),
      min_compatible_version: safeText(manifest?.min_compatible_version),
      open_url: bestOpenUrl,
      preview_url: bestOpenUrl,
      preview_mode: PREVIEW_MODE_REMOTE,
      manifest_url: safeText(manifest?.url),
      manifest_checked_at: new Date().toISOString()
    })
    return {
      ready: true,
      launch_mode: 'remote',
      version: safeText(manifest?.version),
      open_url: bestOpenUrl,
      preview_url: bestOpenUrl,
      package_url: packageUrl,
      package_urls: packageUrls,
      min_compatible_version: safeText(manifest?.min_compatible_version),
      module_id: moduleId,
      module_name: safeText(moduleInfo?.name || manifest?.module_name || moduleId),
      channel: normalizeChannel(channel),
      requested_entry_path: normalizeRelativeModulePath(manifest?.entry_path, 'index.html'),
      preview_mode: PREVIEW_MODE_REMOTE,
      local_ready: false
    }
  }

  throw new Error('模块启动失败')
}

export const prepareAndOpenModule = prepareModuleBundle

export const getModuleCdnBase = () => resolveModuleCdnBase()
