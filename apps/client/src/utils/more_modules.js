import { getNativeAppVersion, isCapacitorRuntime, isLikelyAndroidUserAgent, isTauriRuntime, toNativeFileSrc } from '../platform/native'
import { pushDebugLog } from './debug_logger'
import { isRemoteModulesAllowed } from '../config/app_store_policy'
import {
  assertRemoteModulesAllowed,
  DEFAULT_MODULE_CDN_BASE,
  GITHUB_PAGES_MODULE_CDN_BASE,
  GITHUB_REPO,
  GITHUB_RAW_BASE,
  GITHUB_WEBSITE_BRANCH,
  GITHUB_PROXY_PREFIXES,
  MODULE_PUBLIC_REPO_PATH,
  MODULE_CDN_OVERRIDE_STORAGE_KEY,
  MODULE_STATE_STORAGE_KEY,
  MODULE_CATALOG_CACHE_STORAGE_KEY,
  MODULE_MANIFEST_CACHE_STORAGE_KEY,
  MODULE_SOURCE_ROTATION_STORAGE_KEY,
  DEFAULT_CHANNEL,
  SHARED_CHANNEL,
  MODULE_CHANNELS,
  DEFAULT_REMOTE_JSON_TIMEOUT_MS,
  FAST_REMOTE_RACE_TIMEOUT_MS,
  FAST_REMOTE_OPEN_PROBE_TIMEOUT_MS,
  CAPACITOR_MODULE_CACHE_ROOT,
  CAPACITOR_BUNDLE_TIMEOUT_MS,
  PREVIEW_MODE_TAURI_LOCAL,
  PREVIEW_MODE_CAPACITOR_LOCAL,
  PREVIEW_MODE_REMOTE,
  withCacheBust,
  isAbsoluteHttpUrl,
  isLocalModuleBridgePreviewUrl,
  canUseLocalModuleBridgePreview,
  describeError,
  resolveModuleCdnBase,
  isModuleCdnOverrideActive,
  sleep,
  withTimeout,
  fetchWithTimeout,
  parseJsonPayload,
  fetchJsonViaCapacitor,
  probeUrlViaCapacitor,
  isNativeBridgeUnavailableError,
  invokeNativeBridge,
  safeText,
  sanitizeStorageSegment,
  joinRelativePath,
  normalizeRelativeModulePath,
  normalizeZipEntryPath,
  candidateEntryPaths,
  uint8ArrayToBase64,
  base64ToUint8Array,
  sha256Hex,
  buildCapacitorModulePaths,
  safeCapacitorRemoveDir,
  locateCapacitorEntryPath,
  buildCapacitorLocalPreviewUrl,
  resolveCapacitorVersionRootPath,
  normalizeChannel,
  detectChannelFromVersion,
  buildCatalogFetchOrder,
  toAbsoluteUrl,
  toUniqueTextList,
  detectModuleChannelHintFromPath,
  extractModuleRelativePath,
  buildGithubRawUrl,
  buildGithubPagesModuleUrl,
  buildCurrentBaseUrl,
  buildMirrorCandidateUrls,
  readSourceRotationMap,
  writeSourceRotationMap,
  rotateRemoteCandidates,
  shouldRotateRemoteCandidates,
  finalizeRemoteCandidates,
  buildRemoteUrlCandidates,
  readModuleStateMap,
  writeModuleStateMap,
  updateModuleState,
  getLocalModuleState,
  readStorageJson,
  writeStorageJson,
  readCachedCatalogSnapshot,
  writeCachedCatalogSnapshot,
  buildManifestCacheKey,
  readCachedManifestSnapshot,
  writeCachedManifestSnapshot,
  fetchJsonNoStore,
  fetchJsonFromAnyCandidate,
  fetchJsonWithRetry,
  pickFastestOpenUrl,
  resolveModuleChannel,
  normalizeCatalogModule,
  fetchModuleCatalog,
  fetchModuleManifest
} from './more_modules/core.js'
export { isLocalModuleBridgePreviewUrl, canUseLocalModuleBridgePreview, getLocalModuleState, resolveModuleChannel, fetchModuleCatalog, fetchModuleManifest } from './more_modules/core.js'

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
  return finalizeRemoteCandidates(
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

  if (canUseLocalModuleBridgePreview()) {
    const tauriPreviewUrl = safeText(rawPreviewUrl || localState?.preview_url)
    if (isLocalModuleBridgePreviewUrl(tauriPreviewUrl) || previewMode === PREVIEW_MODE_TAURI_LOCAL) {
      resolvedPreviewUrl = tauriPreviewUrl
      sourceKind = PREVIEW_MODE_TAURI_LOCAL
    }
  } else if (localPreviewUrl) {
    // Capacitor WebView 的 _capacitor_file_ 在 iframe 内加载 HTML 文档时
    // 部分安卓/iOS 设备上 shouldInterceptRequest 不能正确拦截，
    // 导致嵌入页面白屏或黑屏。优先使用远端 open_url，本地路径保留为离线降级。
    if (
      isCapacitorRuntime() &&
      openUrl &&
      isAbsoluteHttpUrl(openUrl) &&
      !isLocalModuleBridgePreviewUrl(openUrl)
    ) {
      resolvedPreviewUrl = openUrl
      sourceKind = PREVIEW_MODE_REMOTE
    } else {
      resolvedPreviewUrl = localPreviewUrl
      sourceKind = PREVIEW_MODE_CAPACITOR_LOCAL
    }
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
  assertRemoteModulesAllowed()
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

  if (canUseLocalModuleBridgePreview()) {
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
  assertRemoteModulesAllowed()
  const moduleId = safeText(moduleInfo?.id || manifest?.module_id)
  const openUrlCandidates = buildOpenUrlCandidates({ manifest, channel })
  const openUrl = safeText(openUrlCandidates[0])
  const packageUrl = safeText(manifest?.package_url)
  const packageUrls = toUniqueTextList(manifest?.package_urls || packageUrl)

  if (canUseLocalModuleBridgePreview()) {
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
