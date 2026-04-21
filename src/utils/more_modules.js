import { getNativeAppVersion, invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from './external_link'

const MODULE_CDN_BASE = 'https://hbut.6661111.xyz/modules'
const MODULE_STATE_STORAGE_KEY = 'hbu_more_module_state_v1'
const DEFAULT_CHANNEL = 'main'
const MODULE_CHANNELS = new Set(['main', 'dev'])

const withCacheBust = (url) => {
  const text = safeText(url)
  if (!text) return ''
  const joiner = text.includes('?') ? '&' : '?'
  return `${text}${joiner}_t=${Date.now()}`
}

const isAbsoluteHttpUrl = (url) => /^https?:\/\//i.test(safeText(url))

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

const toAbsoluteUrl = (input, base = MODULE_CDN_BASE) => {
  const value = safeText(input)
  if (!value) return ''
  try {
    return new URL(value, `${safeText(base).replace(/\/+$/, '')}/`).toString()
  } catch {
    return value
  }
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

const fetchJsonNoStore = async (url) => {
  const targetUrl = toAbsoluteUrl(url, globalThis?.location?.href || MODULE_CDN_BASE)
  if (isTauriRuntime() && isAbsoluteHttpUrl(targetUrl)) {
    return invokeNative('fetch_remote_json', { url: withCacheBust(targetUrl) })
  }

  const response = await fetch(withCacheBust(targetUrl), { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`)
  }
  return response.json()
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
    raw.manifest_url || `${MODULE_CDN_BASE}/${channel}/${id}/manifest.json`,
    `${MODULE_CDN_BASE}/${channel}/`
  )
  return {
    id,
    name: safeText(raw.name || raw.module_name || id),
    manifest_url: manifestUrl,
    key_required: !!raw.key_required,
    order: Number(raw.order || 999),
    icon: safeText(raw.icon || ''),
    description: safeText(raw.description || ''),
    raw
  }
}

export const fetchModuleCatalog = async (inputChannel = '') => {
  const preferred = normalizeChannel(inputChannel)
  const tried = []

  for (const channel of [preferred, preferred === 'dev' ? 'main' : '']) {
    const resolved = normalizeChannel(channel)
    if (!resolved || tried.includes(resolved)) continue
    tried.push(resolved)
    const url = `${MODULE_CDN_BASE}/${resolved}/catalog.json`
    try {
      const payload = await fetchJsonNoStore(url)
      const rawModules = Array.isArray(payload?.modules) ? payload.modules : []
      const modules = rawModules
        .map((item) => normalizeCatalogModule(item, resolved))
        .filter((item) => item.id && item.manifest_url)
        .sort((a, b) => a.order - b.order)

      return {
        channel: resolved,
        url,
        catalog: {
          schema_version: Number(payload?.schema_version || 1),
          generated_at: safeText(payload?.generated_at || payload?.generatedAt || ''),
          modules
        },
        from_fallback: resolved !== preferred
      }
    } catch {
      // try next channel
    }
  }
  throw new Error('无法获取模块清单，请检查网络后重试')
}

export const fetchModuleManifest = async (manifestUrl) => {
  const url = toAbsoluteUrl(manifestUrl)
  if (!url) throw new Error('模块 manifest 地址为空')
  const payload = await fetchJsonNoStore(url)

  const moduleId = safeText(payload?.module_id || payload?.id)
  const version = safeText(payload?.version)
  const packageUrl = toAbsoluteUrl(payload?.package_url, url)
  const entryPath = safeText(payload?.entry_path || 'index.html')
  if (!moduleId || !version || !packageUrl) {
    throw new Error('模块 manifest 字段不完整')
  }

  return {
    url,
    schema_version: Number(payload?.schema_version || 1),
    module_id: moduleId,
    module_name: safeText(payload?.module_name || payload?.name || moduleId),
    version,
    package_url: packageUrl,
    package_sha256: safeText(payload?.package_sha256 || payload?.sha256 || ''),
    package_size: Number(payload?.package_size || 0),
    entry_path: entryPath,
    published_at: safeText(payload?.published_at || ''),
    release_notes: safeText(payload?.release_notes || ''),
    open_url: toAbsoluteUrl(payload?.open_url, url)
  }
}

const resolveOpenUrl = ({ manifest, channel }) => {
  const explicit = toAbsoluteUrl(manifest?.open_url)
  if (explicit) return explicit

  const packageUrl = safeText(manifest?.package_url)
  const entryPath = safeText(manifest?.entry_path || 'index.html')
  if (packageUrl.includes('/bundle.zip')) {
    return packageUrl.replace(/\/bundle\.zip(?:\?.*)?$/i, `/site/${entryPath}`)
  }
  return `${MODULE_CDN_BASE}/${normalizeChannel(channel)}/${safeText(manifest?.module_id)}/${safeText(manifest?.version)}/site/${entryPath}`
}

export const prepareModuleBundle = async ({ channel, moduleInfo, manifest }) => {
  const moduleId = safeText(moduleInfo?.id || manifest?.module_id)
  const openUrl = resolveOpenUrl({ manifest, channel })
  const packageUrl = safeText(manifest?.package_url)

  if (isTauriRuntime()) {
    try {
      const prepared = await invokeNative('prepare_module_bundle', {
        req: {
          channel: normalizeChannel(channel),
          moduleId,
          moduleName: safeText(moduleInfo?.name || manifest?.module_name || moduleId),
          version: safeText(manifest?.version),
          packageUrl,
          packageSha256: safeText(manifest?.package_sha256),
          entryPath: safeText(manifest?.entry_path || 'index.html')
        }
      })
      updateModuleState(moduleId, {
        channel: normalizeChannel(channel),
        version: safeText(prepared?.version || manifest?.version),
        package_url: packageUrl,
        open_url: safeText(prepared?.preview_url || openUrl),
        preview_url: safeText(prepared?.preview_url || openUrl),
        cache_dir: safeText(prepared?.cache_dir),
        bundle_path: safeText(prepared?.bundle_path),
        source: safeText(prepared?.source || 'download')
      })
      return {
        ready: true,
        launch_mode: safeText(prepared?.source) === 'cache' ? 'cache' : 'in_app',
        version: safeText(prepared?.version || manifest?.version),
        package_url: packageUrl,
        cache_dir: safeText(prepared?.cache_dir),
        bundle_path: safeText(prepared?.bundle_path),
        preview_url: safeText(prepared?.preview_url || openUrl),
        source: safeText(prepared?.source || 'download'),
        module_id: moduleId,
        module_name: safeText(prepared?.module_name || moduleInfo?.name || manifest?.module_name || moduleId),
        channel: normalizeChannel(channel),
        local_ready: true
      }
    } catch (error) {
      throw new Error(safeText(error?.message || error) || '模块本地准备失败')
    }
  }

  if (openUrl) {
    const opened = await openExternal(openUrl)
    if (opened) {
      updateModuleState(moduleId, {
        channel: normalizeChannel(channel),
        version: safeText(manifest?.version),
        open_url: openUrl
      })
      return {
        ready: true,
        launch_mode: 'remote',
        version: safeText(manifest?.version),
        open_url: openUrl,
        preview_url: openUrl,
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

export const getModuleCdnBase = () => MODULE_CDN_BASE
