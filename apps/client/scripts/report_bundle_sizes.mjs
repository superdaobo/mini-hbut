#!/usr/bin/env node
// 同 commit 可归因包体基线脚本（Issue #590）
// - 记录基线元数据：commit SHA、构建入口、关键环境变量、目标架构、构建类型
// - dist 总大小 + top chunk；平台安装包（APK/IPA 等）+ 包内最大条目归因
// - Rust native 二进制（.so / .dll / .a / 可执行文件）
// - before/after 绝对与百分比差值（BASELINE_DIR）
// - --out <path> 输出结构化 JSON，供 CI/后续 Sub-issue 机械对比
// 产物来源可追踪：始终输出选取产物的完整路径与 mtime，同 key 多候选时列出全部候选。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const distDir = path.resolve(process.cwd(), process.env.DIST_DIR || 'dist')
const bundleRoot = path.resolve(process.cwd(), process.env.BUNDLE_ROOT || 'src-tauri/target/release/bundle')
const nativeDir = process.env.NATIVE_BINARY_DIR
  ? path.resolve(process.cwd(), process.env.NATIVE_BINARY_DIR)
  : path.resolve(process.cwd(), 'src-tauri/target/release')
const baselineDir = process.env.BASELINE_DIR ? path.resolve(process.cwd(), process.env.BASELINE_DIR) : ''
const outFile = process.env.OUT ? path.resolve(process.cwd(), process.env.OUT) : ''

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`
const formatBytes = (bytes) => String(bytes)

/** 基线元数据：commit SHA 与构建口径（Issue #590 验收 1） */
const readCommitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

const meta = {
  commit_sha: readCommitSha(),
  measured_at: new Date().toISOString(),
  build_entry: process.env.BUILD_ENTRY || 'npm run build (frontend) + tauri android/ios build',
  env: {
    VITE_APP_STORE_BUILD: process.env.VITE_APP_STORE_BUILD || '',
    MINI_HBUT_BUILD_PROFILE: process.env.MINI_HBUT_BUILD_PROFILE || '',
    TARGET_ARCH: process.env.TARGET_ARCH || '',
    BUILD_TYPE: process.env.BUILD_TYPE || '',
    ANDROID_SHRINK: process.env.ANDROID_SHRINK || '',
    BRIDGE_EXPECTED: process.env.BRIDGE_EXPECTED || ''
  }
}

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

/** 扫描安装包：同 key 多候选时记录全部（来源可追踪），选 mtime 最新者 */
const scanArtifacts = (rootDir) => {
  const artifacts = {}
  for (const filePath of walkFiles(rootDir)) {
    const key = detectArtifactKey(path.basename(filePath))
    if (!key) continue
    const stat = fs.statSync(filePath)
    const candidate = { path: filePath, size: stat.size, mtimeMs: stat.mtimeMs }
    if (!artifacts[key]) {
      artifacts[key] = { current: candidate, candidates: [] }
    }
    artifacts[key].candidates.push(candidate)
    if (candidate.mtimeMs > artifacts[key].current.mtimeMs ||
        (candidate.mtimeMs === artifacts[key].current.mtimeMs && candidate.size > artifacts[key].current.size)) {
      artifacts[key].current = candidate
    }
  }
  return artifacts
}

// ---- 最小 ZIP 中央目录读取（无第三方依赖；仅支持非 zip64 的普通 zip/APK/IPA） ----
const ZIP_EOCD_SIG = 0x06054b50
const ZIP_CENTRAL_SIG = 0x02014b50

const readZipEntries = (filePath) => {
  const fd = fs.openSync(filePath, 'r')
  try {
    const stat = fs.fstatSync(fd)
    if (stat.size < 22) return null
    const tailLen = Math.min(stat.size, 65557)
    const tail = Buffer.alloc(tailLen)
    fs.readSync(fd, tail, 0, tailLen, stat.size - tailLen)
    let eocdIndex = -1
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === ZIP_EOCD_SIG) {
        eocdIndex = i
        break
      }
    }
    if (eocdIndex < 0) return null
    const totalEntries = tail.readUInt16LE(eocdIndex + 10)
    const centralOffset = tail.readUInt32LE(eocdIndex + 16)
    if (centralOffset >= stat.size) return null
    const dir = Buffer.alloc(stat.size - centralOffset)
    fs.readSync(fd, dir, 0, dir.length, centralOffset)
    const entries = []
    let pos = 0
    for (let i = 0; i < totalEntries && pos + 46 <= dir.length; i += 1) {
      if (dir.readUInt32LE(pos) !== ZIP_CENTRAL_SIG) break
      const method = dir.readUInt16LE(pos + 10)
      const compressedSize = dir.readUInt32LE(pos + 20)
      const uncompressedSize = dir.readUInt32LE(pos + 24)
      const nameLen = dir.readUInt16LE(pos + 28)
      const extraLen = dir.readUInt16LE(pos + 30)
      const commentLen = dir.readUInt16LE(pos + 32)
      const name = dir.toString('utf8', pos + 46, pos + 46 + nameLen)
      entries.push({ name, method, compressedSize, uncompressedSize })
      pos += 46 + nameLen + extraLen + commentLen
    }
    return entries
  } finally {
    fs.closeSync(fd)
  }
}

/** 包内归因：top N 条目 + 按顶层路径聚合（Issue #590 验收 4） */
const analyzePackageEntries = (entries) => {
  if (!entries || !entries.length) return null
  const top = [...entries]
    .filter((entry) => !entry.name.endsWith('/'))
    .sort((a, b) => b.uncompressedSize - a.uncompressedSize)
    .slice(0, 12)
    .map((entry) => ({
      name: entry.name,
      method: entry.method === 8 ? 'deflate' : entry.method === 0 ? 'store' : `method:${entry.method}`,
      uncompressedSize: entry.uncompressedSize
    }))
  const byCategory = {}
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue
    const first = entry.name.split('/')[0] || '(root)'
    byCategory[first] = (byCategory[first] || 0) + entry.uncompressedSize
  }
  const categories = Object.entries(byCategory)
    .map(([category, size]) => ({ category, uncompressedSize: size }))
    .sort((a, b) => b.uncompressedSize - a.uncompressedSize)
  return { top, categories }
}

/** Rust native 二进制归因（Issue #590 验收 4） */
const scanNativeBinaries = (rootDir) => {
  const natives = walkFiles(rootDir)
    .filter((filePath) => /\.(so|dll|a|dylib)$/i.test(filePath))
    .map((filePath) => ({ filePath, size: fs.statSync(filePath).size }))
    .sort((a, b) => b.size - a.size)
  const total = natives.reduce((sum, item) => sum + item.size, 0)
  return { total, top: natives.slice(0, 10) }
}

// ---- 报告 ----
const report = { meta, dist: null, artifacts: {}, native: null, deltas: null }

const distFiles = walkFiles(distDir)
const distTotal = sumFiles(distFiles)
report.dist = {
  totalBytes: distTotal,
  fileCount: distFiles.length,
  topChunks: distFiles
    .map((filePath) => ({ name: path.relative(process.cwd(), filePath), size: fs.statSync(filePath).size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 20)
}
console.log(`[size-report] commit: ${meta.commit_sha}`)
console.log(`[size-report] 构建口径: ${meta.build_entry}`)
console.log(`[size-report] dist 总大小: ${formatSize(distTotal)}（${formatBytes(distTotal)} 字节，${distFiles.length} 文件）`)
for (const chunk of report.dist.topChunks) {
  console.log(`[size-report] dist: ${formatSize(chunk.size)}  ${chunk.name}`)
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

report.deltas = {}
for (const key of orderedKeys) {
  const artifact = currentArtifacts[key]
  if (!artifact) continue
  const current = artifact.current
  const baseline = baselineArtifacts[key]?.current
  const delta = baseline ? current.size - baseline.size : null
  const deltaText = delta === null
    ? ''
    : ` | 对比基线 ${delta >= 0 ? '+' : ''}${formatSize(delta)}（${delta >= 0 ? '+' : ''}${((delta / baseline.size) * 100).toFixed(2)}%）`
  console.log(`[size-report] artifact:${key} => ${formatSize(current.size)}（${formatBytes(current.size)} 字节）  ${path.relative(process.cwd(), current.path)}${deltaText}`)
  if (artifact.candidates.length > 1) {
    console.log(`[size-report] artifact:${key} 存在 ${artifact.candidates.length} 个候选（来源追踪）:`)
    for (const candidate of artifact.candidates) {
      console.log(`[size-report]   - ${path.relative(process.cwd(), candidate.path)}（mtime ${new Date(candidate.mtimeMs).toISOString()}）`)
    }
  }
  const entries = readZipEntries(current.path)
  const analysis = analyzePackageEntries(entries)
  report.artifacts[key] = {
    sizeBytes: current.size,
    path: current.path,
    candidates: artifact.candidates.map((c) => c.path),
    package: analysis
  }
  if (analysis) {
    console.log(`[size-report] artifact:${key} 包内 top 条目:`)
    for (const entry of analysis.top) {
      console.log(`[size-report]   ${formatSize(entry.uncompressedSize)}（${formatBytes(entry.uncompressedSize)}B）  ${entry.name}`)
    }
    console.log(`[size-report] artifact:${key} 包内类别聚合:`)
    for (const category of analysis.categories) {
      console.log(`[size-report]   ${category.category}: ${formatSize(category.uncompressedSize)}`)
    }
  }
  if (delta !== null) {
    report.deltas[key] = { beforeBytes: baseline.size, afterBytes: current.size, deltaBytes: delta, deltaPercent: (delta / baseline.size) * 100 }
  }
}

const native = scanNativeBinaries(nativeDir)
report.native = { totalBytes: native.total, top: native.top.map((item) => ({ name: path.relative(process.cwd(), item.filePath), size: item.size })) }
console.log(`[size-report] native 二进制总大小: ${formatSize(native.total)}（${nativeDir}）`)
for (const item of native.top) {
  console.log(`[size-report] native: ${formatSize(item.size)}  ${path.relative(process.cwd(), item.filePath)}`)
}

if (!Object.keys(currentArtifacts).length) {
  console.warn(`[size-report] 未在 ${bundleRoot} 中找到平台安装包（仅 dist/native 可归因）`)
}

if (outFile) {
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2))
  console.log(`[size-report] JSON 已写入: ${outFile}`)
}

// 结果稳定性提示（Issue #590 验收 6）：基线必须同 commit/同参数才可归因
if (baselineDir && Object.keys(report.deltas).length) {
  console.log('[size-report] 注意：BASELINE_DIR 产物需与当前 commit 同源码、同构建参数，差值才可归因（Issue #590）')
}
