import { createEmptyHotBundleState, isManifestCompatible, mergeHotBundleState } from './hot_update_core.js'

const normalizeVersion = (value) => String(value || '').trim()

const normalizeContext = (context = {}) => ({
  nativeVersion: normalizeVersion(context.nativeVersion),
  bootstrapVersion: normalizeVersion(context.bootstrapVersion || context.nativeVersion)
})

export const resolveHotBundleLaunchPlan = ({
  state,
  stagedManifest,
  currentManifest,
  nativeVersion,
  bootstrapVersion
} = {}) => {
  const safeState = mergeHotBundleState(createEmptyHotBundleState(), state || {})
  const context = normalizeContext({ nativeVersion, bootstrapVersion })
  const failedVersions = new Set(
    Array.isArray(safeState.failed_versions) ? safeState.failed_versions.map((item) => String(item)) : []
  )

  if (safeState.staged?.version && safeState.staged.activate_on_next_launch) {
    const stagedVersion = String(safeState.staged.version)
    if (failedVersions.has(stagedVersion)) {
      return {
        action: 'builtin',
        source: 'failed-version',
        version: stagedVersion,
        reason: '目标热更新版本已被标记为失败版本'
      }
    }
    if (!stagedManifest) {
      return {
        action: 'builtin',
        source: 'missing-staged-manifest',
        version: stagedVersion,
        reason: '缺少 staged manifest，无法激活热更新包'
      }
    }
    const compatibility = isManifestCompatible(stagedManifest, context)
    if (!compatibility.compatible) {
      return {
        action: 'builtin',
        source: 'incompatible-staged',
        version: stagedVersion,
        reason: compatibility.reasons.join('；'),
        compatibility
      }
    }
    return {
      action: 'staged',
      source: 'staged',
      version: stagedVersion,
      bundlePath: safeState.staged.bundle_path || '',
      manifestPath: safeState.staged.manifest_path || '',
      compatibility
    }
  }

  if (safeState.current?.version && currentManifest) {
    const compatibility = isManifestCompatible(currentManifest, context)
    if (compatibility.compatible) {
      return {
        action: 'current',
        source: 'current',
        version: String(safeState.current.version),
        bundlePath: safeState.current.bundle_path || '',
        manifestPath: safeState.current.manifest_path || '',
        compatibility
      }
    }
  }

  return {
    action: 'builtin',
    source: 'builtin',
    version: '',
    reason: '未命中可激活的热更新包'
  }
}

export const applyHotBundleLaunchSuccess = (state, launchedVersion, launchedMeta = {}) => {
  const safeState = mergeHotBundleState(createEmptyHotBundleState(), state || {})
  const version = normalizeVersion(launchedVersion)
  if (!version) {
    return safeState
  }
  if (safeState.staged?.version === version) {
    return mergeHotBundleState(safeState, {
      current: {
        version,
        bundle_path: launchedMeta.bundlePath || safeState.staged.bundle_path || '',
        manifest_path: launchedMeta.manifestPath || safeState.staged.manifest_path || '',
        activated_at: new Date().toISOString()
      },
      staged: null,
      rollback: null
    })
  }
  return mergeHotBundleState(safeState, {
    current: {
      version,
      bundle_path: launchedMeta.bundlePath || safeState.current?.bundle_path || '',
      manifest_path: launchedMeta.manifestPath || safeState.current?.manifest_path || '',
      activated_at: new Date().toISOString()
    }
  })
}

export const applyHotBundleLaunchFailure = (state, failedVersion, reason = '') => {
  const safeState = mergeHotBundleState(createEmptyHotBundleState(), state || {})
  const version = normalizeVersion(failedVersion)
  if (!version) {
    return safeState
  }
  const failedVersions = new Set(
    Array.isArray(safeState.failed_versions) ? safeState.failed_versions.map((item) => String(item)) : []
  )
  failedVersions.add(version)
  return mergeHotBundleState(safeState, {
    staged: safeState.staged?.version === version ? null : safeState.staged,
    rollback: {
      version,
      reason: String(reason || '').trim(),
      rolled_back_at: new Date().toISOString()
    },
    failed_versions: Array.from(failedVersions)
  })
}
