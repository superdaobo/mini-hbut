const REQUIRED_MANIFEST_FIELDS = [
  'version',
  'bundle_url',
  'sha256',
  'signature',
  'min_bootstrap_version',
  'max_bootstrap_version',
  'min_native_version',
  'max_native_version'
]

const normalizeVersion = (input) =>
  String(input || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]

const parseVersion = (input) =>
  normalizeVersion(input)
    .split('.')
    .map((item) => Number.parseInt(item, 10))
    .map((item) => (Number.isFinite(item) ? item : 0))

export const compareVersions = (left, right) => {
  const a = parseVersion(left)
  const b = parseVersion(right)
  const length = Math.max(a.length, b.length, 3)
  for (let index = 0; index < length; index += 1) {
    const av = a[index] || 0
    const bv = b[index] || 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}

export const normalizeHotManifest = (raw) => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('热更新清单为空')
  }
  const manifest = {}
  REQUIRED_MANIFEST_FIELDS.forEach((field) => {
    const value = String(raw[field] || '').trim()
    if (!value) {
      throw new Error(`热更新清单缺少字段: ${field}`)
    }
    manifest[field] = value
  })
  manifest.notes = String(raw.notes || '').trim()
  return manifest
}

export const isManifestCompatible = (manifest, context) => {
  const normalized = normalizeHotManifest(manifest)
  const nativeVersion = normalizeVersion(context?.nativeVersion)
  const bootstrapVersion = normalizeVersion(context?.bootstrapVersion || nativeVersion)
  const reasons = []

  if (compareVersions(bootstrapVersion, normalized.min_bootstrap_version) < 0) {
    reasons.push(`bootstrap 版本过低：${bootstrapVersion} < ${normalized.min_bootstrap_version}`)
  }
  if (compareVersions(bootstrapVersion, normalized.max_bootstrap_version) > 0) {
    reasons.push(`bootstrap 版本过高：${bootstrapVersion} > ${normalized.max_bootstrap_version}`)
  }
  if (compareVersions(nativeVersion, normalized.min_native_version) < 0) {
    reasons.push(`native 版本过低：${nativeVersion} < ${normalized.min_native_version}`)
  }
  if (compareVersions(nativeVersion, normalized.max_native_version) > 0) {
    reasons.push(`native 版本过高：${nativeVersion} > ${normalized.max_native_version}`)
  }

  return {
    compatible: reasons.length === 0,
    reasons,
    manifest: normalized
  }
}

export const sha256Hex = async (bytes) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

export const verifyHotBundleSignature = async (manifest, digestHex) => {
  const signature = String(manifest?.signature || '').trim()
  if (!signature) {
    return { ok: true, skipped: true, reason: 'signature empty' }
  }
  if (signature === digestHex) {
    return { ok: true, skipped: false, scheme: 'digest-equals' }
  }
  if (signature.startsWith('sha256:')) {
    return {
      ok: signature.slice('sha256:'.length).trim().toLowerCase() === String(digestHex || '').toLowerCase(),
      skipped: false,
      scheme: 'sha256'
    }
  }
  return {
    ok: false,
    skipped: false,
    scheme: 'unsupported',
    reason: `不支持的签名方案: ${signature}`
  }
}

export const createEmptyHotBundleState = () => ({
  current: null,
  staged: null,
  rollback: null,
  failed_versions: [],
  updated_at: new Date().toISOString()
})

export const mergeHotBundleState = (currentState, patch) => {
  const base = {
    ...createEmptyHotBundleState(),
    ...(currentState || {})
  }
  const failedVersions = new Set(Array.isArray(base.failed_versions) ? base.failed_versions : [])
  if (Array.isArray(patch?.failed_versions)) {
    patch.failed_versions.forEach((item) => {
      if (item) failedVersions.add(String(item))
    })
  }
  return {
    ...base,
    ...(patch || {}),
    failed_versions: Array.from(failedVersions),
    updated_at: new Date().toISOString()
  }
}
