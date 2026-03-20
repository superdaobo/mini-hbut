import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  applyHotBundleLaunchFailure,
  applyHotBundleLaunchSuccess,
  resolveHotBundleLaunchPlan
} from '../src/utils/hot_update_bootstrap.js'
import {
  compareVersions as compareVersionsCore,
  createEmptyHotBundleState as createEmptyHotBundleStateCore,
  isManifestCompatible as isManifestCompatibleCore,
  mergeHotBundleState as mergeHotBundleStateCore,
  normalizeHotManifest as normalizeHotManifestCore,
  sha256Hex as sha256HexCore,
  verifyHotBundleSignature as verifyHotBundleSignatureCore
} from '../src/utils/hot_update_core.js'

const root = process.cwd()
const tmpDir = path.join(root, '.tmp-hot-update-test')
await fs.mkdir(tmpDir, { recursive: true })

const bundleBytes = Buffer.from('mini-hbut-hot-update-test-bundle', 'utf8')
const bundlePath = path.join(tmpDir, 'mini-hbut-web-test.zip')
await fs.writeFile(bundlePath, bundleBytes)

const digest = createHash('sha256').update(bundleBytes).digest('hex')
const manifest = normalizeHotManifestCore({
  version: '1.2.7-hotfix.1',
  bundle_url: `file://${bundlePath.replace(/\\/g, '/')}`,
  sha256: digest,
  signature: `sha256:${digest}`,
  min_bootstrap_version: '1.2.7',
  max_bootstrap_version: '1.2.7',
  min_native_version: '1.2.7',
  max_native_version: '1.2.7',
  notes: 'mock manifest'
})

assert.equal(compareVersionsCore('1.2.8', '1.2.7'), 1)
assert.equal(compareVersionsCore('1.2.7', '1.2.7'), 0)
assert.equal(compareVersionsCore('1.2.6', '1.2.7'), -1)

const digestByCore = await sha256HexCore(bundleBytes)
assert.equal(digestByCore, digest)

const signatureOk = await verifyHotBundleSignatureCore(manifest, digest)
assert.equal(signatureOk.ok, true)

const compatible = isManifestCompatibleCore(manifest, {
  nativeVersion: '1.2.7',
  bootstrapVersion: '1.2.7'
})
assert.equal(compatible.compatible, true)

const incompatible = isManifestCompatibleCore(manifest, {
  nativeVersion: '1.2.6',
  bootstrapVersion: '1.2.7'
})
assert.equal(incompatible.compatible, false)
assert.ok(incompatible.reasons.length > 0)

const emptyState = createEmptyHotBundleStateCore()
assert.deepEqual(emptyState.failed_versions, [])

const stagedState = mergeHotBundleStateCore(emptyState, {
  staged: {
    version: manifest.version,
    bundle_path: 'hot-update/bundles/1.2.7-hotfix.1/bundle.zip',
    manifest_path: 'hot-update/bundles/1.2.7-hotfix.1/hot-manifest.json',
    activate_on_next_launch: true
  }
})
assert.equal(stagedState.staged.version, manifest.version)

const plan = resolveHotBundleLaunchPlan({
  state: stagedState,
  stagedManifest: manifest,
  nativeVersion: '1.2.7',
  bootstrapVersion: '1.2.7'
})
assert.equal(plan.action, 'staged')
assert.equal(plan.version, manifest.version)

const activatedState = applyHotBundleLaunchSuccess(stagedState, manifest.version)
assert.equal(activatedState.current.version, manifest.version)
assert.equal(activatedState.staged, null)

const rollbackState = applyHotBundleLaunchFailure(activatedState, manifest.version, 'mock rollback')
assert.equal(rollbackState.rollback.version, manifest.version)
assert.ok(rollbackState.failed_versions.includes(manifest.version))

const fallbackPlan = resolveHotBundleLaunchPlan({
  state: rollbackState,
  stagedManifest: manifest,
  currentManifest: manifest,
  nativeVersion: '1.2.7',
  bootstrapVersion: '1.2.7'
})
assert.equal(fallbackPlan.action, 'current')

console.log('[hot-update-test] 所有断言通过')
