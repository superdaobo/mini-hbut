import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const RELEASES_ROOT = path.resolve(process.env.RELEASES_DIR || 'website/public/releases')
const CURRENT_CHANNEL = normalizeChannel(process.env.RELEASE_CHANNEL || process.env.CHANNEL || '')
const SOURCE_REF = safeText(process.env.SOURCE_REF || process.env.GITHUB_REF_NAME || '')
const SOURCE_SHA = safeText(process.env.SOURCE_SHA || process.env.GITHUB_SHA || '')
const STABLE_TAG_HINT = safeText(process.env.STABLE_TAG || '')
const DEV_VERSION_HINT = safeText(
  process.env.DEV_VERSION || process.env.BETA_VERSION || process.env.DEV_TAG || ''
)
const NOW = new Date().toISOString()
const REPO = safeText(process.env.GITHUB_REPOSITORY || 'superdaobo/mini-hbut')
const GITHUB_TOKEN = safeText(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '')

function safeText(value) {
  return String(value ?? '').trim()
}

function normalizeChannel(value) {
  return safeText(value).toLowerCase() === 'dev' ? 'dev' : 'main'
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function removePath(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return
  fs.rmSync(targetPath, { recursive: true, force: true })
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

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
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

async function fetchGithubReleases() {
  if (!GITHUB_TOKEN) {
    return fetchGithubReleasesViaGh()
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mini-hbut-release-manifest'
  }

  headers.Authorization = `Bearer ${GITHUB_TOKEN}`

  const releases = []
  let page = 1

  while (true) {
    const url = `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`
    const response = await fetch(url, { headers })
    if (!response.ok) {
      throw new Error(`GitHub releases API failed: ${response.status} ${response.statusText}`)
    }

    const batch = await response.json()
    if (!Array.isArray(batch) || !batch.length) {
      break
    }

    releases.push(...batch)
    if (batch.length < 100) {
      break
    }
    page += 1
  }

  return releases
}

function fetchGithubReleasesViaGh() {
  const releases = []
  let page = 1
  const ghBinary = resolveGhBinary()

  while (true) {
    const endpoint = `repos/${REPO}/releases?per_page=100&page=${page}`
    const result = spawnSync(ghBinary, ['api', endpoint], {
      encoding: 'utf8',
      windowsHide: true
    })

    if (result.status !== 0) {
      throw new Error(
        `gh api failed: ${safeText(
          result.stderr || result.stdout || result.error?.message || `exit ${result.status}`
        )}`
      )
    }

    const batch = JSON.parse(result.stdout || '[]')
    if (!Array.isArray(batch) || !batch.length) {
      break
    }

    releases.push(...batch)
    if (batch.length < 100) {
      break
    }
    page += 1
  }

  return releases
}

function resolveGhBinary() {
  if (process.platform !== 'win32') {
    return 'gh'
  }

  const scriptResult = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/check-gh-path.ps1'],
    {
      encoding: 'utf8',
      windowsHide: true,
      cwd: process.cwd()
    }
  )

  if (scriptResult.status === 0) {
    const firstLine = String(scriptResult.stdout || '')
      .split(/\r?\n/)
      .map((item) => safeText(item))
      .find(Boolean)
    if (firstLine && firstLine !== 'NOT_FOUND' && isFile(firstLine)) {
      return firstLine
    }
  }

  const entries = String(process.env.PATH || '')
    .split(';')
    .map((item) => safeText(item))
    .filter(Boolean)

  const exeCandidates = []
  const cmdCandidates = []
  for (const entry of entries) {
    exeCandidates.push(path.join(entry, 'gh.exe'))
    cmdCandidates.push(path.join(entry, 'gh.cmd'))
  }

  for (const candidate of [...exeCandidates, ...cmdCandidates]) {
    if (isFile(candidate)) {
      return candidate
    }
  }

  return 'gh'
}

function buildGithubAssetUrl(tag, fileName) {
  return `https://hbut.6661111.xyz/releases/${tag}/${fileName}`
}

function mapGithubAsset(tag, asset) {
  const name = safeText(asset?.name || '')
  const localPath = name ? path.join(RELEASES_ROOT, tag, name) : ''

  return {
    name,
    browser_download_url: safeText(asset?.browser_download_url || ''),
    cdn_download_url: localPath && isFile(localPath) ? buildGithubAssetUrl(tag, name) : '',
    download_count: Number(asset?.download_count || 0),
    size: Number(asset?.size || 0)
  }
}

function buildStableHistoryFromGithub(releases) {
  const normalized = releases
    .filter((release) => !release?.draft)
    .filter((release) => !release?.prerelease)
    .filter((release) => safeText(release?.tag_name) && safeText(release?.tag_name) !== 'dev-latest')
    .sort((a, b) => compareSemverLike(safeText(a?.tag_name), safeText(b?.tag_name)) * -1)
    .map((release) => {
      const tag = safeText(release?.tag_name)
      const name = safeText(release?.name || tag)
      const body = String(release?.body || '')
      const assets = Array.isArray(release?.assets)
        ? release.assets.map((asset) => mapGithubAsset(tag, asset)).filter((asset) => asset.name)
        : []

      return {
        id: Number(release?.id || 0),
        tag_name: tag,
        name,
        body,
        published_at: safeText(release?.published_at || release?.created_at || NOW),
        prerelease: false,
        draft: false,
        assets,
        html_url: safeText(release?.html_url || `https://github.com/${REPO}/releases/tag/${tag}`)
      }
    })

  return {
    generatedAt: NOW,
    sourceRef: SOURCE_REF,
    sourceSha: SOURCE_SHA,
    source: 'github',
    releases: normalized
  }
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
  const versions = listAssetFiles(devDir)
    .map((file) => parseVersionFromFileName(file))
    .filter(Boolean)
  if (!versions.length) return ''
  return [...versions].sort((a, b) => compareSemverLike(a, b)).at(-1) || ''
}

function buildManifest({
  channel,
  tag,
  version,
  prerelease,
  downloadDir,
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
    downloadDir: safeText(downloadDir || tag),
    prerelease,
    channel,
    generatedAt,
    sourceRef,
    sourceSha,
    assets
  }
}

function copyAliasAssets(sourceDir, targetDir) {
  removePath(targetDir)
  ensureDir(targetDir)
  if (!sourceDir || !fs.existsSync(sourceDir)) return false

  const files = listAssetFiles(sourceDir)
  for (const fileName of files) {
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(targetDir, fileName))
  }

  return files.length > 0
}

function buildLatestAliasManifest(manifest) {
  if (!manifest) return null
  return {
    ...manifest,
    downloadDir: 'latest'
  }
}

function buildStableHistory(stableEntries) {
  const normalized = stableEntries
    .filter((entry) => entry?.manifest && entry?.tag)
    .sort((a, b) => compareSemverLike(a.tag, b.tag) * -1)
    .map((entry, index) => {
      const assets = Object.values(entry.manifest.assets || {})
        .filter(Boolean)
        .map((fileName) => {
          const filePath = path.join(entry.dirPath, fileName)
          return {
            name: fileName,
            browser_download_url: `https://hbut.6661111.xyz/releases/${entry.tag}/${fileName}`,
            download_count: 0,
            size: getFileSize(filePath)
          }
        })

      return {
        id: index + 1,
        tag_name: entry.tag,
        name: entry.tag,
        body: '',
        published_at: safeText(entry.manifest.generatedAt || NOW),
        prerelease: false,
        draft: false,
        assets,
        html_url: `https://github.com/${REPO}/releases/tag/${entry.tag}`
      }
    })

  return {
    generatedAt: NOW,
    sourceRef: SOURCE_REF,
    sourceSha: SOURCE_SHA,
    source: 'local',
    releases: normalized
  }
}

async function main() {
  ensureDir(RELEASES_ROOT)

  const latestAliasPath = path.join(RELEASES_ROOT, 'latest.json')
  const stableAliasPath = path.join(RELEASES_ROOT, 'stable-latest.json')
  const devAliasPath = path.join(RELEASES_ROOT, 'dev-latest.json')
  const activePath = path.join(RELEASES_ROOT, 'active.json')
  const channelsPath = path.join(RELEASES_ROOT, 'channels.json')
  const historyPath = path.join(RELEASES_ROOT, 'history.json')
  const latestDir = path.join(RELEASES_ROOT, 'latest')

  const existingLatest = readJsonIfExists(latestAliasPath)
  const existingStable =
    readJsonIfExists(stableAliasPath) || (safeText(existingLatest?.channel) === 'main' ? existingLatest : null)
  const existingDev =
    readJsonIfExists(devAliasPath) || (safeText(existingLatest?.channel) === 'dev' ? existingLatest : null)

  const stableTag = pickStableTag(existingStable)
  const stableDir = stableTag ? path.join(RELEASES_ROOT, stableTag) : ''
  const devDir = path.join(RELEASES_ROOT, 'dev-latest')
  const devVersion = pickDevVersion(devDir, existingDev)
  const devHistoryDir = devVersion ? path.join(RELEASES_ROOT, devVersion) : ''

  const stableManifest = stableTag
    ? buildManifest({
        channel: 'main',
        tag: stableTag,
        version: stableTag.replace(/^v/i, ''),
        prerelease: false,
        downloadDir: stableTag,
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
    downloadDir: 'dev-latest',
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
    if (devHistoryDir && fs.existsSync(devHistoryDir)) {
      writeJson(path.join(devHistoryDir, 'manifest.json'), {
        ...devManifest,
        tag: devVersion,
        version: devVersion,
        downloadDir: devVersion
      })
    }
    writeJson(devAliasPath, devManifest)
  } else if (fs.existsSync(devAliasPath)) {
    fs.rmSync(devAliasPath, { force: true })
  }

  // 主站首页和自动更新只允许 stable/main，latest/active 绝不再指向 dev。
  const latestSourceManifest = stableManifest
  const latestManifest = buildLatestAliasManifest(latestSourceManifest)

  if (latestManifest && stableDir && copyAliasAssets(stableDir, latestDir)) {
    writeJson(path.join(latestDir, 'manifest.json'), latestManifest)
    writeJson(latestAliasPath, latestManifest)
    writeJson(activePath, {
      ...latestManifest,
      selectedAt: NOW
    })
  } else {
    removePath(latestDir)
    if (fs.existsSync(latestAliasPath)) {
      fs.rmSync(latestAliasPath, { force: true })
    }
    if (fs.existsSync(activePath)) {
      fs.rmSync(activePath, { force: true })
    }
  }

  writeJson(channelsPath, {
    generatedAt: NOW,
    currentChannel: CURRENT_CHANNEL,
    activeChannel: safeText(latestManifest?.channel || ''),
    latest: latestManifest,
    stable: stableManifest,
    dev: devManifest
  })

  const stableDirs = fs.existsSync(RELEASES_ROOT)
    ? fs
        .readdirSync(RELEASES_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => /^v/i.test(name))
    : []

  let stableHistory = null
  try {
    const githubReleases = await fetchGithubReleases()
    stableHistory = buildStableHistoryFromGithub(githubReleases)
  } catch (error) {
    console.warn('[build_release_manifests] fallback to local stable history:', error?.message || error)
    stableHistory = buildStableHistory(
      stableDirs.map((tag) => {
        const dirPath = path.join(RELEASES_ROOT, tag)
        return {
          tag,
          dirPath,
          manifest: readJsonIfExists(path.join(dirPath, 'manifest.json'))
        }
      })
    )
  }

  writeJson(historyPath, stableHistory)

  console.log(
    JSON.stringify(
      {
        currentChannel: CURRENT_CHANNEL,
        stableTag,
        devVersion,
        activeChannel: safeText(latestManifest?.channel || ''),
        latestVersion: safeText(latestManifest?.version || latestManifest?.tag || ''),
        stableHistorySource: safeText(stableHistory?.source || ''),
        stableHistoryCount: stableHistory.releases.length,
        stableGeneratedAt: safeText(stableManifest?.generatedAt || ''),
        devGeneratedAt: safeText(devManifest?.generatedAt || '')
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
