import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve(process.cwd(), process.env.DIST_DIR || 'dist')
const bundleRoot = path.resolve(process.cwd(), process.env.BUNDLE_ROOT || 'src-tauri/target/release/bundle')
const baselineDir = process.env.BASELINE_DIR ? path.resolve(process.cwd(), process.env.BASELINE_DIR) : ''

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

const walkFiles = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, out)
      continue
    }
    out.push(fullPath)
  }
  return out
}

const sumFiles = (files) => files.reduce((total, filePath) => total + fs.statSync(filePath).size, 0)

const detectArtifactKey = (fileName) => {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('x64-setup.exe')) return 'windows_setup'
  if (lower.endsWith('.msi')) return 'windows_msi'
  if (lower.endsWith('arm64.apk')) return 'android_apk'
  if (lower.endsWith('_ios.ipa')) return 'ios_ipa'
  if (lower.endsWith('.appimage')) return 'linux_appimage'
  if (lower.endsWith('.app.zip') || lower.endsWith('universal.app.zip')) return 'mac_zip'
  if (lower.endsWith('.dmg')) return 'mac_dmg'
  return ''
}

const scanArtifacts = (rootDir) => {
  const artifacts = {}
  for (const filePath of walkFiles(rootDir)) {
    const key = detectArtifactKey(path.basename(filePath))
    if (!key) continue
    const stat = fs.statSync(filePath)
    const size = stat.size
    const mtimeMs = stat.mtimeMs
    if (
      !artifacts[key] ||
      mtimeMs > artifacts[key].mtimeMs ||
      (mtimeMs === artifacts[key].mtimeMs && size > artifacts[key].size)
    ) {
      artifacts[key] = {
        path: filePath,
        size,
        mtimeMs
      }
    }
  }
  return artifacts
}

const distFiles = walkFiles(distDir)
const distTotal = sumFiles(distFiles)
const topDistFiles = distFiles
  .map((filePath) => ({ filePath, size: fs.statSync(filePath).size }))
  .sort((a, b) => b.size - a.size)
  .slice(0, 20)

console.log(`[size-report] dist 总大小: ${formatSize(distTotal)}`)
for (const item of topDistFiles) {
  console.log(`[size-report] dist: ${formatSize(item.size)}  ${path.relative(process.cwd(), item.filePath)}`)
}

const currentArtifacts = scanArtifacts(bundleRoot)
const baselineArtifacts = baselineDir ? scanArtifacts(baselineDir) : {}

const orderedKeys = [
  'windows_setup',
  'windows_msi',
  'android_apk',
  'ios_ipa',
  'mac_zip',
  'mac_dmg',
  'linux_appimage'
]

for (const key of orderedKeys) {
  const current = currentArtifacts[key]
  if (!current) continue
  const baseline = baselineArtifacts[key]
  const delta = baseline ? current.size - baseline.size : null
  const deltaText = delta === null
    ? ''
    : ` | 对比基线 ${delta >= 0 ? '+' : ''}${formatSize(delta)}`
  console.log(`[size-report] artifact:${key} => ${formatSize(current.size)}  ${path.relative(process.cwd(), current.path)}${deltaText}`)
}

if (!Object.keys(currentArtifacts).length) {
  console.warn(`[size-report] 未在 ${bundleRoot} 中找到平台安装包`)
}
