import fs from 'node:fs'
import path from 'node:path'

const MODULES_ROOT = path.resolve(process.argv[2] || 'website/dist/modules')
const KEEP_VERSIONS = Math.max(1, Number.parseInt(process.env.MODULE_KEEP_VERSIONS || '1', 10) || 1)
const RESERVED_DIR_NAMES = new Set(['site'])

const removeDir = (targetPath) => {
  if (!fs.existsSync(targetPath)) return
  fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
}

const listChannels = (root) => {
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
}

const listModuleDirs = (channelDir) =>
  fs
    .readdirSync(channelDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(channelDir, entry.name))

const listVersionDirs = (moduleDir) =>
  fs
    .readdirSync(moduleDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !RESERVED_DIR_NAMES.has(entry.name))
    .map((entry) => path.join(moduleDir, entry.name))

const pruneModuleDir = (moduleDir) => {
  const versionDirs = listVersionDirs(moduleDir)
  if (versionDirs.length <= KEEP_VERSIONS) return 0

  const sorted = versionDirs.sort((left, right) => path.basename(right).localeCompare(path.basename(left)))
  const keep = new Set(sorted.slice(0, KEEP_VERSIONS))
  let removed = 0

  for (const versionDir of versionDirs) {
    if (keep.has(versionDir)) continue
    removeDir(versionDir)
    removed += 1
  }

  return removed
}

const main = () => {
  if (!fs.existsSync(MODULES_ROOT)) {
    console.log(`[modules-prune] skip missing path: ${MODULES_ROOT}`)
    return
  }

  let removedVersions = 0
  for (const channelDir of listChannels(MODULES_ROOT)) {
    for (const moduleDir of listModuleDirs(channelDir)) {
      removedVersions += pruneModuleDir(moduleDir)
    }
  }

  console.log(`[modules-prune] removed ${removedVersions} old version dirs under ${MODULES_ROOT}`)
}

main()
