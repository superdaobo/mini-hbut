import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const outDir = path.join(root, 'dist-hot')
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const version = String(pkg.version || '0.0.0').trim()
const zipName = `mini-hbut-web-${version}.zip`
const zipPath = path.join(outDir, zipName)
const manifestPath = path.join(outDir, 'hot-manifest.json')

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })

const ensureDistExists = async () => {
  const stat = await fs.stat(distDir).catch(() => null)
  if (!stat?.isDirectory()) {
    throw new Error('dist 目录不存在，请先执行 npm run build')
  }
}

await ensureDistExists()
await fs.mkdir(outDir, { recursive: true })
await fs.rm(zipPath, { force: true }).catch(() => {})

if (process.platform === 'win32') {
  const scriptPath = path.join(outDir, 'pack_hot_bundle.ps1')
  await fs.writeFile(
    scriptPath,
    [
      "$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))",
      'Set-Location -LiteralPath $root',
      `Compress-Archive -Path ".\\dist\\*" -DestinationPath ".\\dist-hot\\${zipName}" -Force`
    ].join('\n'),
    'utf8'
  )
  await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath])
} else {
  await run('zip', ['-qr', zipPath, '.'], { cwd: distDir })
}

const bundleBytes = await fs.readFile(zipPath)
const sha256 = createHash('sha256').update(bundleBytes).digest('hex')
const manifest = {
  version,
  bundle_url: `./${zipName}`,
  sha256,
  signature: `sha256:${sha256}`,
  min_bootstrap_version: version,
  max_bootstrap_version: version,
  min_native_version: version,
  max_native_version: version,
  notes: ''
}

await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
console.log(`[hot-update] bundle ready: ${zipPath}`)
console.log(`[hot-update] manifest ready: ${manifestPath}`)
