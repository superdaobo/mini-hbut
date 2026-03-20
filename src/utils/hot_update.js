import { BaseDirectory, copyFile, exists, mkdir, readFile, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { getNativeAppVersion, invokeNative, isTauriRuntime } from '../platform/native'
import { pushDebugLog } from './debug_logger'
import {
  createEmptyHotBundleState,
  isManifestCompatible,
  mergeHotBundleState,
  normalizeHotManifest,
  sha256Hex,
  verifyHotBundleSignature
} from './hot_update_core.js'

const DOWNLOAD_DIR = 'hot-update/downloads'
const BUNDLE_DIR = 'hot-update/bundles'
const STATE_PATH = 'hot-update/state.json'

const textEncoder = new TextEncoder()

const ensureEnabled = async () => {
  if (!isTauriRuntime()) {
    throw new Error('当前运行时不支持本地热更新框架')
  }
  const config = await invokeNative('get_debug_runtime_config').catch(() => null)
  if (!config?.enableHotUpdateFramework) {
    throw new Error('debug.enable_hot_update_framework 未开启')
  }
  return config
}

const ensureDir = async (path) => {
  await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {})
}

const ensureCacheDir = async (path) => {
  await mkdir(path, { baseDir: BaseDirectory.AppCache, recursive: true }).catch(() => {})
}

const readState = async () => {
  if (!(await exists(STATE_PATH, { baseDir: BaseDirectory.AppData }))) {
    return createEmptyHotBundleState()
  }
  try {
    const raw = await readTextFile(STATE_PATH, { baseDir: BaseDirectory.AppData })
    return mergeHotBundleState(createEmptyHotBundleState(), JSON.parse(raw))
  } catch {
    return createEmptyHotBundleState()
  }
}

const writeState = async (state) => {
  await ensureDir('hot-update')
  const nextState = mergeHotBundleState(await readState(), state)
  await writeTextFile(STATE_PATH, JSON.stringify(nextState, null, 2), {
    baseDir: BaseDirectory.AppData
  })
  return nextState
}

const fetchManifestJson = async (manifestUrl, fetcher = fetch) => {
  const response = await fetcher(manifestUrl, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`拉取热更新清单失败：HTTP ${response.status}`)
  }
  return response.json()
}

const toUint8Array = async (response) => {
  const buffer = await response.arrayBuffer()
  return new Uint8Array(buffer)
}

export const getHotUpdateStorageLayout = () => ({
  downloadsDir: DOWNLOAD_DIR,
  bundlesDir: BUNDLE_DIR,
  statePath: STATE_PATH
})

export const checkHotBundleManifest = async (manifestUrl, options = {}) => {
  await ensureEnabled()
  const raw = await fetchManifestJson(manifestUrl, options.fetcher)
  const manifest = normalizeHotManifest(raw)
  const nativeVersion = await getNativeAppVersion()
  const compatibility = isManifestCompatible(manifest, {
    nativeVersion,
    bootstrapVersion: nativeVersion
  })
  pushDebugLog('HotUpdate', `manifest 检查完成：${manifest.version}`, 'info', compatibility)
  return {
    manifest,
    compatible: compatibility.compatible,
    reasons: compatibility.reasons,
    nativeVersion
  }
}

export const downloadHotBundle = async (manifest, options = {}) => {
  await ensureEnabled()
  const normalized = normalizeHotManifest(manifest)
  await ensureCacheDir(DOWNLOAD_DIR)
  const response = await (options.fetcher || fetch)(normalized.bundle_url, {
    cache: 'no-store'
  })
  if (!response.ok) {
    throw new Error(`下载热更新资源失败：HTTP ${response.status}`)
  }
  const bytes = await toUint8Array(response)
  const downloadPath = `${DOWNLOAD_DIR}/${normalized.version}.zip`
  await import('@tauri-apps/plugin-fs').then(({ writeFile }) =>
    writeFile(downloadPath, bytes, { baseDir: BaseDirectory.AppCache })
  )
  pushDebugLog('HotUpdate', `bundle 下载完成：${normalized.version}`, 'info', {
    bytes: bytes.byteLength,
    downloadPath
  })
  return {
    manifest: normalized,
    downloadPath,
    bytes,
    size: bytes.byteLength
  }
}

export const verifyHotBundle = async (manifest, downloadResult) => {
  await ensureEnabled()
  const normalized = normalizeHotManifest(manifest)
  let bytes = downloadResult?.bytes
  if (!(bytes instanceof Uint8Array)) {
    if (!downloadResult?.downloadPath) {
      throw new Error('缺少下载结果，无法校验热更新包')
    }
    bytes = await readFile(downloadResult.downloadPath, { baseDir: BaseDirectory.AppCache })
  }
  const digest = await sha256Hex(bytes)
  if (digest !== normalized.sha256.toLowerCase()) {
    throw new Error(`SHA256 校验失败：${digest} != ${normalized.sha256}`)
  }
  const signatureResult = await verifyHotBundleSignature(normalized, digest)
  if (!signatureResult.ok) {
    throw new Error(signatureResult.reason || '签名校验失败')
  }
  pushDebugLog('HotUpdate', `bundle 校验完成：${normalized.version}`, 'info', {
    digest,
    signature: signatureResult
  })
  return {
    manifest: normalized,
    digest,
    signature: signatureResult,
    size: bytes.byteLength
  }
}

export const stageHotBundle = async (manifest, downloadResult, verifyResult) => {
  await ensureEnabled()
  const normalized = normalizeHotManifest(manifest)
  const compatibility = isManifestCompatible(normalized, {
    nativeVersion: await getNativeAppVersion(),
    bootstrapVersion: await getNativeAppVersion()
  })
  if (!compatibility.compatible) {
    throw new Error(`当前客户端与热更新包不兼容：${compatibility.reasons.join('；')}`)
  }

  const bundleRoot = `${BUNDLE_DIR}/${normalized.version}`
  await ensureDir(bundleRoot)
  const bundleZipPath = `${bundleRoot}/bundle.zip`
  const manifestPath = `${bundleRoot}/hot-manifest.json`
  if (await exists(bundleZipPath, { baseDir: BaseDirectory.AppData })) {
    await remove(bundleZipPath, { baseDir: BaseDirectory.AppData }).catch(() => {})
  }
  await copyFile(downloadResult.downloadPath, bundleZipPath, {
    fromPathBaseDir: BaseDirectory.AppCache,
    toPathBaseDir: BaseDirectory.AppData
  })
  await writeTextFile(manifestPath, JSON.stringify(normalized, null, 2), {
    baseDir: BaseDirectory.AppData
  })

  const state = await writeState({
    staged: {
      version: normalized.version,
      bundle_path: bundleZipPath,
      manifest_path: manifestPath,
      sha256: verifyResult.digest,
      signature: verifyResult.signature,
      activate_on_next_launch: false,
      staged_at: new Date().toISOString()
    }
  })
  pushDebugLog('HotUpdate', `bundle 已 staged：${normalized.version}`, 'info', state.staged)
  return state
}

export const markHotBundleForNextLaunch = async (version) => {
  await ensureEnabled()
  const state = await readState()
  if (!state.staged || state.staged.version !== String(version || '').trim()) {
    throw new Error('未找到待激活的热更新包')
  }
  state.staged.activate_on_next_launch = true
  state.staged.marked_at = new Date().toISOString()
  await writeTextFile(STATE_PATH, JSON.stringify(state, null, 2), { baseDir: BaseDirectory.AppData })
  pushDebugLog('HotUpdate', `标记下次启动切换：${version}`, 'info')
  return state
}

export const rollbackHotBundle = async ({ version, reason = '' } = {}) => {
  await ensureEnabled()
  const state = await readState()
  const failedVersions = Array.isArray(state.failed_versions) ? state.failed_versions.slice() : []
  if (version && !failedVersions.includes(version)) {
    failedVersions.push(version)
  }
  const nextState = await writeState({
    staged: state.staged && (!version || state.staged.version === version) ? null : state.staged,
    rollback: {
      version: version || state.staged?.version || '',
      reason: String(reason || '').trim(),
      rolled_back_at: new Date().toISOString()
    },
    failed_versions: failedVersions
  })
  pushDebugLog('HotUpdate', `执行回滚标记：${version || 'unknown'}`, 'warn', nextState.rollback)
  return nextState
}

export const readHotBundleState = async () => {
  await ensureEnabled()
  return readState()
}

export const writeMockHotBundleState = async (state) => {
  await ensureEnabled()
  return writeState(state)
}

export const writeHotBundleBytesForTest = async (relativePath, bytes) => {
  await ensureEnabled()
  await ensureCacheDir('hot-update')
  await import('@tauri-apps/plugin-fs').then(({ writeFile }) =>
    writeFile(relativePath, bytes instanceof Uint8Array ? bytes : textEncoder.encode(String(bytes || '')), {
      baseDir: BaseDirectory.AppCache
    })
  )
}
