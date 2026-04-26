import { getNativeAppVersion, isCapacitorRuntime, isTauriRuntime } from '../platform/native'
import { pushDebugLog } from './debug_logger'
import { openExternal } from './external_link'

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
const DEFAULT_REMOTE_JSON_TIMEOUT_MS = 8000

const withCacheBust = (url) => {
  const text = safeText(url)
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

const isAbsoluteHttpUrl = (url) => /^https?:\/\//i.test(safeText(url))
const isLocalModuleBridgePreviewUrl = (url) =>
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

  if (isAbsoluteHttpUrl(targetUrl)) {
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

const fetchJsonWithRetry = async (urlOrUrls, timeoutMsList = [DEFAULT_REMOTE_JSON_TIMEOUT_MS]) => {
  const candidates = toUniqueTextList(urlOrUrls).map((item) => toAbsoluteUrl(item))
  if (!candidates.length) {
    throw new Error('远程配置地址为空')
  }
  let lastError = null
  for (const candidate of candidates) {
    for (let index = 0; index < timeoutMsList.length; index += 1) {
      try {
        const payload = await fetchJsonNoStore(
          candidate,
          Number(timeoutMsList[index]) || DEFAULT_REMOTE_JSON_TIMEOUT_MS
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
        [6000, 9000]
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
      [7000, 10000]
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

const buildOpenUrlCandidates = ({ manifest, channel }) => {
  const preferredChannel =
    safeText(manifest?.channel) ||
    normalizeChannel(channel) ||
    detectModuleChannelHintFromPath(extractModuleRelativePath(manifest?.url))
  const entryPath = safeText(manifest?.entry_path || 'index.html')
  const explicit = toAbsoluteUrl(manifest?.open_url, safeText(manifest?.url))
  if (explicit) {
    return buildRemoteUrlCandidates(explicit, preferredChannel, 'open')
  }
  const packageCandidates = toUniqueTextList(manifest?.package_urls || manifest?.package_url)
  const siteCandidates = packageCandidates.map((candidate) => {
    if (candidate.includes('/bundle.zip')) {
      return candidate.replace(/\/bundle\.zip(?:\?.*)?$/i, `/site/${entryPath}`)
    }
    return `${candidate.replace(/\/+$/, '')}/site/${entryPath}`
  })
  return rotateRemoteCandidates(
    toUniqueTextList([
      ...siteCandidates,
      `${resolveModuleCdnBase()}/${normalizeChannel(preferredChannel)}/${safeText(manifest?.module_id)}/${safeText(manifest?.version)}/site/${entryPath}`
    ]),
    'open',
    `${normalizeChannel(preferredChannel)}/${safeText(manifest?.module_id)}/${safeText(manifest?.version)}/site/${entryPath}`
  )
}

export const prepareModuleBundle = async ({ channel, moduleInfo, manifest }) => {
  const moduleId = safeText(moduleInfo?.id || manifest?.module_id)
  const openUrlCandidates = buildOpenUrlCandidates({ manifest, channel })
  const openUrl = safeText(openUrlCandidates[0])
  const packageUrl = safeText(manifest?.package_url)
  const packageUrls = toUniqueTextList(manifest?.package_urls || packageUrl)

  if (!isCapacitorRuntime()) {
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
      if (!isTauriRuntime() && isLocalModuleBridgePreviewUrl(preparedPreviewUrl)) {
        throw new Error('当前运行时不支持桌面本地模块预览地址')
      }
      updateModuleState(moduleId, {
        channel: normalizeChannel(channel),
        version: safeText(prepared?.version || manifest?.version),
        module_name: safeText(prepared?.module_name || moduleInfo?.name || manifest?.module_name || moduleId),
        package_url: packageUrl,
        package_sha256: safeText(manifest?.package_sha256),
        entry_path: safeText(manifest?.entry_path || 'index.html'),
        min_compatible_version: safeText(manifest?.min_compatible_version),
        open_url: preparedPreviewUrl,
        preview_url: preparedPreviewUrl,
        cache_dir: safeText(prepared?.cache_dir),
        bundle_path: safeText(prepared?.bundle_path),
        source: safeText(prepared?.source || 'download'),
        manifest_checked_at: new Date().toISOString()
      })
      return {
        ready: true,
        launch_mode: safeText(prepared?.source) === 'cache' ? 'cache' : 'in_app',
        version: safeText(prepared?.version || manifest?.version),
        package_url: packageUrl,
        cache_dir: safeText(prepared?.cache_dir),
        bundle_path: safeText(prepared?.bundle_path),
        preview_url: preparedPreviewUrl,
        min_compatible_version: safeText(manifest?.min_compatible_version),
        source: safeText(prepared?.source || 'download'),
        module_id: moduleId,
        module_name: safeText(prepared?.module_name || moduleInfo?.name || manifest?.module_name || moduleId),
        channel: normalizeChannel(channel),
        local_ready: true
      }
    } catch (error) {
      if (isTauriRuntime() || !isNativeBridgeUnavailableError(error)) {
        throw new Error(safeText(error?.message || error) || '模块本地准备失败')
      }
      pushDebugLog('MoreModules', `模块本地准备不可用，回退官网打开：${moduleId}`, 'warn', {
        error: describeError(error)
      })
    }
  } else {
    // Capacitor 移动端统一走 HTTPS 远端页面，避免误用桌面本地桥地址。
    pushDebugLog('MoreModules', `Capacitor 环境跳过本地模块桥接：${moduleId}`, 'info', {
      channel: normalizeChannel(channel),
      packageUrl
    })
  }

  for (const candidate of openUrlCandidates) {
    const opened = await openExternal(candidate)
    if (opened) {
      updateModuleState(moduleId, {
        channel: normalizeChannel(channel),
        version: safeText(manifest?.version),
        min_compatible_version: safeText(manifest?.min_compatible_version),
        open_url: candidate
      })
      return {
        ready: true,
        launch_mode: 'remote',
        version: safeText(manifest?.version),
        open_url: candidate,
        preview_url: candidate,
        min_compatible_version: safeText(manifest?.min_compatible_version),
        module_id: moduleId,
        module_name: safeText(moduleInfo?.name || manifest?.module_name || moduleId),
        channel: normalizeChannel(channel),
        local_ready: false
      }
    }
  }

  throw new Error('模块启动失败')
}

export const prepareAndOpenModule = prepareModuleBundle

export const getModuleCdnBase = () => resolveModuleCdnBase()
