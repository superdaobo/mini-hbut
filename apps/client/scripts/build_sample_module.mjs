#!/usr/bin/env node
/**
 * 样例模块打包 + 签名（#1169 T08）。
 *
 * 产物（默认写到 `dist-modules/account_security-<version>/`）：
 *   bundle.zip      —— 模块包（index.html / main.js / parse.js / style.css）
 *   manifest.json   —— 与 Rust 逐字节一致的规范化字节 + Ed25519 签名
 *
 * 用法：
 *   node scripts/build_sample_module.mjs [--version 1.0.0] [--release-seq 1] [--out <dir>]
 *
 * 说明：
 * - 默认用**测试 seed** 签名（`dev-test-1`，只在 debug 构建被信任）；真实发布必须 `--key-file`。
 * - 打包用平台自带压缩（Windows: Compress-Archive；其它: zip），不引入新依赖。
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { buildManifest } from './sign_module_manifest.mjs'

const seedBytes = Buffer.alloc(32, 7)
const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seedBytes])
const { createPrivateKey, createPublicKey, sign: cryptoSign } = await import('node:crypto')
const testKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]
  if (!key?.startsWith('--')) continue
  args.set(key.slice(2), process.argv[i + 1])
}

const root = process.cwd()
const sourceDir = path.resolve(args.get('source') || path.join(root, 'samples/account_security'))
const moduleId = args.get('module-id') || 'account_security'
const moduleName = args.get('name') || '账号安全概览'
const permissions = args.get('permissions') || 'school.portal_client_ip,school.portal_page_view'
const version = args.get('version') || '1.0.0'
const releaseSeq = Number(args.get('release-seq') || 1)
const outDir = path.resolve(args.get('out') || path.join(root, `dist-modules/${moduleId}-${version}`))

const run = (command, commandArgs) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))))
  })

const stat = await fs.stat(sourceDir).catch(() => null)
if (!stat?.isDirectory()) {
  console.error(`[sample-module] 源目录不存在: ${sourceDir}`)
  process.exit(1)
}

await fs.rm(outDir, { recursive: true, force: true })
await fs.mkdir(outDir, { recursive: true })

const zipPath = path.join(outDir, 'bundle.zip')
// 自动收集源目录里的静态文件（排除清单/说明/类型声明，它们不进包）
const files = (await fs.readdir(sourceDir)).filter(
  (name) =>
    !name.startsWith('.') &&
    !name.endsWith('.d.ts') &&
    !['manifest.json', 'canonical.txt', 'README.md'].includes(name)
)
if (!files.length) {
  console.error(`[sample-module] 源目录没有可打包文件: ${sourceDir}`)
  process.exit(1)
}
const filePaths = files.map((name) => path.join(sourceDir, name))

if (process.platform === 'win32') {
  const scriptPath = path.join(outDir, 'pack.ps1')
  const list = filePaths.map((item) => `'${item.replace(/'/g, "''")}'`).join(',')
  await fs.writeFile(
    scriptPath,
    `Compress-Archive -Path ${list} -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force\n`,
    'utf8'
  )
  await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath])
  await fs.rm(scriptPath, { force: true })
} else {
  await run('zip', ['-q', '-j', zipPath, ...filePaths])
}

const bundle = await fs.readFile(zipPath)
const bundleSha256 = createHash('sha256').update(bundle).digest('hex')

const manifestArgs = {
  'module-id': moduleId,
  version,
  'release-seq': String(releaseSeq),
  channel: 'main',
  name: moduleName,
  entry: 'index.html',
  permissions,
  'bridge-protocol': '1',
  // 扩展字段（不参与签名）：前端要求清单里有 package_url 才能下载
  'package-url': args.get('package-url') || `http://127.0.0.1:8899/modules/${moduleId}-${version}/bundle.zip`
}
const publicKeyB64 = createPublicKey(testKey)
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('base64url')
const { manifest, canonical } = buildManifest({
  args: manifestArgs,
  bundleSha256,
  privateKey: testKey,
  publicKeyB64
})
// buildManifest 内部自己签过 once；这里保证签名值与 canonical 一致（防两侧实现漂移）
void cryptoSign

await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
// 注意：canonical 必须是**不含 signature** 的那份规范化字节（buildManifest 已返回），
// 不能对完整 manifest 再序列化一次（会把 signature 也算进去，和签名输入不一致）。
await fs.writeFile(path.join(outDir, 'canonical.txt'), canonical, 'utf8')

console.log(`[sample-module] 包: ${zipPath} (${bundle.length} 字节)`)
console.log(`[sample-module] sha256: ${bundleSha256}`)
console.log(`[sample-module] 清单: ${path.join(outDir, 'manifest.json')} (release_seq=${releaseSeq})`)
console.log('[sample-module] 签名密钥: 测试 seed（dev-test-1，仅 debug 构建被信任）')
