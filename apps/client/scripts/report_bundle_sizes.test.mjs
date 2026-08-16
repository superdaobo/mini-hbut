// report_bundle_sizes.mjs 单元测试（Issue #590）
// 构造临时 dist/bundle/基线产物，验证同 commit 归因、zip 包内解析与 before/after 差值。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'

const repoRoot = process.cwd()
const scriptPath = path.join(repoRoot, 'scripts', 'report_bundle_sizes.mjs')

/** 构造最小 zip（deflate 条目），仅支持非 zip64 */
const makeZip = (entries) => {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const { name, content } of entries) {
    const data = deflateSync(Buffer.from(content))
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(Buffer.byteLength(content), 22)
    local.writeUInt16LE(nameBuf.length, 26)
    localParts.push(local, nameBuf, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(Buffer.byteLength(content), 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, ...centralParts, eocd])
}

const runReport = (env) => {
  const stdout = execFileSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
  const jsonPath = env.OUT
  const json = JSON.parse(fs.readFileSync(path.resolve(repoRoot, env.OUT), 'utf8'))
  return { stdout, json }
}

test('report_bundle_sizes 输出 commit 元数据与 dist 归因', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'size-report-'))
  try {
    const distDir = path.join(tmp, 'dist')
    fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(distDir, 'assets', 'ForumView-x.js'), 'x'.repeat(10_000))
    fs.writeFileSync(path.join(distDir, 'assets', 'CourseSelectionView-y.js'), 'y'.repeat(5_000))
    fs.writeFileSync(path.join(distDir, 'index.html'), '<html></html>')

    const outFile = path.join(tmp, 'report.json')
    const { stdout, json } = runReport({
      DIST_DIR: distDir,
      BUNDLE_ROOT: path.join(tmp, 'no-bundle'),
      NATIVE_BINARY_DIR: path.join(tmp, 'no-native'),
      OUT: outFile
    })

    assert.match(stdout, /\[size-report\] commit: [0-9a-f]{7,}/)
    assert.equal(json.meta.commit_sha.length >= 7, true)
    assert.equal(json.dist.totalBytes, 10_000 + 5_000 + 13)
    assert.equal(json.dist.fileCount, 3)
    assert.equal(json.dist.topChunks[0].name.includes('ForumView'), true)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('zip 包内归因：解析 APK 条目与类别聚合', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'size-report-apk-'))
  try {
    const bundleDir = path.join(tmp, 'bundle')
    fs.mkdirSync(bundleDir, { recursive: true })
    const apk = makeZip([
      { name: 'lib/arm64-v8a/libhbut_helper.so', content: 'a'.repeat(200_000) },
      { name: 'assets/dist/assets/ForumView-x.js', content: 'b'.repeat(50_000) },
      { name: 'classes.dex', content: 'c'.repeat(30_000) },
      { name: 'resources.arsc', content: 'd'.repeat(10_000) }
    ])
    fs.writeFileSync(path.join(bundleDir, 'mini-hbut-arm64.apk'), apk)

    const outFile = path.join(tmp, 'report.json')
    const { json } = runReport({
      DIST_DIR: path.join(tmp, 'no-dist'),
      BUNDLE_ROOT: bundleDir,
      NATIVE_BINARY_DIR: path.join(tmp, 'no-native'),
      OUT: outFile
    })

    const apkReport = json.artifacts.android_apk
    assert.ok(apkReport.sizeBytes > 0)
    assert.ok(apkReport.package, '应解析出包内条目')
    assert.ok(apkReport.package.top.some((entry) => entry.name.includes('libhbut_helper.so')))
    const libCategory = apkReport.package.categories.find((c) => c.category === 'lib')
    assert.equal(libCategory.uncompressedSize, 200_000)
    const assetsCategory = apkReport.package.categories.find((c) => c.category === 'assets')
    assert.equal(assetsCategory.uncompressedSize, 50_000)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('before/after 差值：绝对与百分比', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'size-report-delta-'))
  try {
    const makeBundle = (dir, size) => {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'mini-hbut-arm64.apk'), Buffer.alloc(size))
    }
    const baselineDir = path.join(tmp, 'baseline')
    const currentDir = path.join(tmp, 'current')
    makeBundle(baselineDir, 100_000)
    makeBundle(currentDir, 120_000)

    const outFile = path.join(tmp, 'report.json')
    const { stdout, json } = runReport({
      DIST_DIR: path.join(tmp, 'no-dist'),
      BUNDLE_ROOT: currentDir,
      BASELINE_DIR: baselineDir,
      NATIVE_BINARY_DIR: path.join(tmp, 'no-native'),
      OUT: outFile
    })

    assert.match(stdout, /对比基线 \+0\.02 MB（\+20\.00%）/)
    const delta = json.deltas.android_apk
    assert.equal(delta.beforeBytes, 100_000)
    assert.equal(delta.afterBytes, 120_000)
    assert.equal(delta.deltaBytes, 20_000)
    assert.equal(delta.deltaPercent, 20)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
