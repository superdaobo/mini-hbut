import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 裁剪 modules 历史版本目录，避免 website-pages 体积膨胀。
 *
 * 关键约束（#392）：
 * - 根目录 `manifest.json` 的 `version` 对应目录 **必须保留**
 * - 禁止仅用版本名字典序（`2026…` 会压过 `1.4.3-beta.xxx` 误删刚构建版本）
 * - 其余版本按 mtime 新→旧补足 KEEP_VERSIONS
 */

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

const readPreferredVersion = (moduleDir) => {
  const manifestPath = path.join(moduleDir, 'manifest.json')
  try {
    if (!fs.existsSync(manifestPath)) return ''
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    return String(raw?.version || '').trim()
  } catch {
    return ''
  }
}

const dirMtimeMs = (dirPath) => {
  try {
    return fs.statSync(dirPath).mtimeMs || 0
  } catch {
    return 0
  }
}

/**
 * @param {string} moduleDir
 * @param {{ keepVersions?: number }} [options]
 * @returns {number} removed count
 */
export const pruneModuleDir = (moduleDir, options = {}) => {
  const keepVersions = Math.max(1, Number(options.keepVersions || KEEP_VERSIONS) || 1)
  const versionDirs = listVersionDirs(moduleDir)
  if (versionDirs.length <= keepVersions) return 0

  const preferredVersion = readPreferredVersion(moduleDir)
  const preferredDir = preferredVersion ? path.resolve(path.join(moduleDir, preferredVersion)) : ''
  const preferredExists = preferredDir && fs.existsSync(preferredDir)

  const keep = new Set()
  if (preferredExists) {
    keep.add(preferredDir)
  }

  const others = versionDirs
    .map((dir) => path.resolve(dir))
    .filter((dir) => !keep.has(dir))
    .sort((left, right) => dirMtimeMs(right) - dirMtimeMs(left))

  const remainingSlots = Math.max(0, keepVersions - keep.size)
  for (const dir of others.slice(0, remainingSlots)) {
    keep.add(dir)
  }

  if (keep.size === 0) {
    for (const dir of others.slice(0, keepVersions)) {
      keep.add(dir)
    }
  }

  let removed = 0
  for (const versionDir of versionDirs) {
    const resolved = path.resolve(versionDir)
    if (keep.has(resolved)) continue
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

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main()
}
