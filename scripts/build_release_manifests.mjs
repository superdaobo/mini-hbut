import fs from 'node:fs'
import path from 'node:path'

const RELEASES_ROOT = path.resolve(process.env.RELEASES_DIR || 'website/public/releases')
const CURRENT_CHANNEL = normalizeChannel(process.env.RELEASE_CHANNEL || process.env.CHANNEL || '')
const SOURCE_REF = safeText(process.env.SOURCE_REF || process.env.GITHUB_REF_NAME || '')
const SOURCE_SHA = safeText(process.env.SOURCE_SHA || process.env.GITHUB_SHA || '')
const STABLE_TAG_HINT = safeText(process.env.STABLE_TAG || '')
const DEV_VERSION_HINT = safeText(
  process.env.DEV_VERSION || process.env.BETA_VERSION || process.env.DEV_TAG || ''
)
const NOW = new Date().toISOString()

function safeText(value) {
  return String(value ?? '').trim()
}

function normalizeChannel(value) {
  return safeText(value).toLowerCase() === 'dev' ? 'dev' : 'main'
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`)
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function listAssetFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return []
  return fs
    .readdirSync(dirPath)
    .filter((name) => isFile(path.join(dirPath, name)))
    .filter((name) => name !== 'manifest.json')
    .sort((a, b) => a.localeCompare(b))
}

function parseVersionFromFileName(fileName) {
  const match = safeText(fileName).match(/^Mini-HBUT_(.+?)_/i)
  return safeText(match?.[1] || '')
}

function parseTimestamp(value) {
  const ts = Date.parse(safeText(value))
  return Number.isFinite(ts) ? ts : 0
}

function compareSemverLike(left, right) {
  const parse = (input) => {
    const raw = safeText(input).replace(/^v/i, '')
    const [corePart, prereleasePart = ''] = raw.split('-', 2)
    const core = corePart.split('.').map((part) => {
      const match = String(part || '').match(/^(\d+)/)
      return match ? Number(match[1]) : 0
    })
    const prerelease = prereleasePart
      ? prereleasePart
          .split('.')
          .map((part) => (/^\d+$/.test(part) ? Number(part) : String(part || '').toLowerCase()))
      : []
    return {
      core,
      prerelease,
      isPrerelease: prerelease.length > 0
    }
  }

  const a = parse(left)
  const b = parse(right)
  const len = Math.max(a.core.length, b.core.length)
  for (let i = 0; i < len; i += 1) {
    const av = a.core[i] || 0
    const bv = b.core[i] || 0
    if (av !== bv) return av - bv
  }

  if (a.isPrerelease && !b.isPrerelease) return -1
  if (!a.isPrerelease && b.isPrerelease) return 1

  const preLen = Math.max(a.prerelease.length, b.prerelease.length)
  for (let i = 0; i < preLen; i += 1) {
    const av = a.prerelease[i]
    const bv = b.prerelease[i]
    if (av === undefined) return -1
    if (bv === undefined) return 1
    if (av === bv) continue
    if (typeof av === 'number' && typeof bv === 'number') return av - bv
    if (typeof av === 'number') return -1
    if (typeof bv === 'number') return 1
    return String(av).localeCompare(String(bv))
  }

  return 0
}

function mapAssets(files) {
  const assets = {}
  for (const file of files) {
    const lower = file.toLowerCase()
    if (/x64-setup\.exe$/.test(lower)) assets.windows_exe = file
    else if (/\.msi$/.test(lower)) assets.windows_msi = file
    else if (/universal\.app\.zip$/.test(lower)) assets.mac_zip = file
    else if (/universal\.dmg$/.test(lower) || /\.dmg$/.test(lower)) assets.mac_dmg = file
    else if (/arm64\.apk$/.test(lower)) assets.android_apk = file
    else if (/ios\.ipa$/i.test(lower)) assets.ios_ipa = file
    else if (/\.appimage$/i.test(lower)) assets.linux_appimage = file
    else if (/\.deb$/i.test(lower)) assets.linux_deb = file
  }
  return assets
}

function pickStableTag(existingStable) {
  if (STABLE_TAG_HINT) return STABLE_TAG_HINT
  if (safeText(existingStable?.tag)) return safeText(existingStable.tag)
  const entries = fs.existsSync(RELEASES_ROOT)
    ? fs
        .readdirSync(RELEASES_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => /^v/i.test(name))
    : []
  if (!entries.length) return ''
  return [...entries].sort((a, b) => compareSemverLike(a, b)).at(-1) || ''
}

function pickDevVersion(devDir, existingDev) {
  if (DEV_VERSION_HINT) return DEV_VERSION_HINT
  if (safeText(existingDev?.version)) return safeText(existingDev.version)
  const files = listAssetFiles(devDir)
  for (const file of files) {
    const version = parseVersionFromFileName(file)
    if (version) return version
  }
  return ''
}

function buildManifest({
  channel,
  tag,
  version,
  prerelease,
  dirPath,
  previousManifest,
  updateNow
}) {
  const files = listAssetFiles(dirPath)
  if (!files.length) {
    return previousManifest || null
  }

  const assets = mapAssets(files)
  if (!Object.keys(assets).length) {
    return previousManifest || null
  }

  const generatedAt =
    updateNow || !safeText(previousManifest?.generatedAt)
      ? NOW
      : safeText(previousManifest.generatedAt)
  const sourceRef =
    updateNow || !safeText(previousManifest?.sourceRef)
      ? SOURCE_REF
      : safeText(previousManifest.sourceRef)
  const sourceSha =
    updateNow || !safeText(previousManifest?.sourceSha)
      ? SOURCE_SHA
      : safeText(previousManifest.sourceSha)

  return {
    version,
    tag,
    prerelease,
    channel,
    generatedAt,
    sourceRef,
    sourceSha,
    assets
  }
}

function pickActiveManifest(stableManifest, devManifest) {
  if (stableManifest && !devManifest) return stableManifest
  if (devManifest && !stableManifest) return devManifest
  if (!stableManifest && !devManifest) return null
  // active 清单固定优先稳定版，避免站点把 dev/beta 误当成默认更新来源。
  return stableManifest || devManifest
}

function main() {
  ensureDir(RELEASES_ROOT)

  const stableAliasPath = path.join(RELEASES_ROOT, 'latest.json')
  const devAliasPath = path.join(RELEASES_ROOT, 'dev-latest.json')
  const activePath = path.join(RELEASES_ROOT, 'active.json')
  const channelsPath = path.join(RELEASES_ROOT, 'channels.json')

  const existingStable = readJsonIfExists(stableAliasPath)
  const existingDev = readJsonIfExists(devAliasPath)

  const stableTag = pickStableTag(existingStable)
  const stableDir = stableTag ? path.join(RELEASES_ROOT, stableTag) : ''
  const devDir = path.join(RELEASES_ROOT, 'dev-latest')
  const devVersion = pickDevVersion(devDir, existingDev)

  const stableManifest = stableTag
    ? buildManifest({
        channel: 'main',
        tag: stableTag,
        version: stableTag.replace(/^v/i, ''),
        prerelease: false,
        dirPath: stableDir,
        previousManifest: existingStable,
        updateNow: CURRENT_CHANNEL === 'main'
      })
    : existingStable

  const devManifest = buildManifest({
    channel: 'dev',
    tag: 'dev-latest',
    version: devVersion || safeText(existingDev?.version || 'unknown'),
    prerelease: true,
    dirPath: devDir,
    previousManifest: existingDev,
    updateNow: CURRENT_CHANNEL === 'dev'
  })

  if (stableManifest && stableDir) {
    writeJson(path.join(stableDir, 'manifest.json'), stableManifest)
    writeJson(stableAliasPath, stableManifest)
  } else if (fs.existsSync(stableAliasPath)) {
    fs.rmSync(stableAliasPath, { force: true })
  }

  if (devManifest) {
    writeJson(path.join(devDir, 'manifest.json'), devManifest)
    writeJson(devAliasPath, devManifest)
  } else if (fs.existsSync(devAliasPath)) {
    fs.rmSync(devAliasPath, { force: true })
  }

  const activeManifest = pickActiveManifest(stableManifest, devManifest)
  if (activeManifest) {
    writeJson(activePath, {
      ...activeManifest,
      selectedAt: NOW
    })
  } else if (fs.existsSync(activePath)) {
    fs.rmSync(activePath, { force: true })
  }

  writeJson(channelsPath, {
    generatedAt: NOW,
    currentChannel: CURRENT_CHANNEL,
    activeChannel: safeText(activeManifest?.channel || ''),
    stable: stableManifest,
    dev: devManifest
  })

  console.log(
    JSON.stringify(
      {
        currentChannel: CURRENT_CHANNEL,
        stableTag,
        devVersion,
        activeChannel: safeText(activeManifest?.channel || ''),
        stableGeneratedAt: safeText(stableManifest?.generatedAt || ''),
        devGeneratedAt: safeText(devManifest?.generatedAt || '')
      },
      null,
      2
    )
  )
}

main()
