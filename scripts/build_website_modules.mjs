import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'

const CHANNEL = String(process.env.MODULE_CHANNEL || 'main').trim().toLowerCase() === 'dev' ? 'dev' : 'main'
const BASE_URL = String(process.env.MODULE_BASE_URL || 'https://hbut.6661111.xyz/modules').trim().replace(/\/+$/, '')
const SOURCE_ROOT = path.resolve(process.env.MODULE_SOURCE_ROOT || 'website/modules-src')
const OUTPUT_ROOT = path.resolve(process.env.MODULE_OUTPUT_ROOT || `website/public/modules/${CHANNEL}`)
const SHA = String(process.env.GITHUB_SHA || 'local').trim().slice(0, 7) || 'local'
const MODULE_VERSION =
  String(process.env.MODULE_VERSION || '').trim() ||
  `${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${SHA}`

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true })

const copyDir = (source, target) => {
  ensureDir(target)
  for (const item of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, item.name)
    const dst = path.join(target, item.name)
    if (item.isDirectory()) {
      copyDir(src, dst)
    } else if (item.isFile()) {
      fs.copyFileSync(src, dst)
    }
  }
}

const sanitizeToken = (value, field) => {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${field} 不能为空`)
  if (!/^[A-Za-z0-9._-]+$/.test(text)) {
    throw new Error(`${field} 含非法字符: ${text}`)
  }
  return text
}

const listModuleDirs = () => {
  if (!fs.existsSync(SOURCE_ROOT)) return []
  return fs
    .readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => path.join(SOURCE_ROOT, item.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'module.json')))
}

const zipDirectory = (sourceDir, zipPath) => {
  ensureDir(path.dirname(zipPath))
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true })
  try {
    execSync(`zip -rq "${zipPath}" .`, {
      cwd: sourceDir,
      stdio: 'inherit'
    })
    return
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error
    }
  }
  execSync(`tar -a -cf "${zipPath}" *`, {
    cwd: sourceDir,
    stdio: 'inherit'
  })
}

const sha256File = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const modules = []
for (const moduleDir of listModuleDirs()) {
  const metaPath = path.join(moduleDir, 'module.json')
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  const moduleId = sanitizeToken(meta.id, 'module.id')
  const moduleName = String(meta.name || moduleId).trim() || moduleId
  const entryPath = String(meta.entry_path || 'index.html').trim() || 'index.html'
  const sourceRel = String(meta.source_dir || 'project').trim() || 'project'
  const sourceDir = path.resolve(moduleDir, sourceRel)
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`模块 ${moduleId} 缺少源码目录: ${sourceDir}`)
  }

  console.log(`[modules] building ${moduleId} from ${sourceDir}`)
  execSync('npm ci --prefer-offline --no-audit --no-fund', { cwd: sourceDir, stdio: 'inherit' })
  execSync('npm run build', { cwd: sourceDir, stdio: 'inherit' })

  const distDir = path.resolve(sourceDir, String(meta.dist_dir || 'dist').trim() || 'dist')
  if (!fs.existsSync(distDir)) {
    throw new Error(`模块 ${moduleId} 缺少构建输出目录: ${distDir}`)
  }

  const versionDir = path.join(OUTPUT_ROOT, moduleId, MODULE_VERSION)
  const siteDir = path.join(versionDir, 'site')
  const bundleZip = path.join(versionDir, 'bundle.zip')
  ensureDir(versionDir)
  if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true })
  copyDir(distDir, siteDir)
  zipDirectory(distDir, bundleZip)

  const packageSha = sha256File(bundleZip)
  const packageSize = fs.statSync(bundleZip).size
  const packageUrl = `${BASE_URL}/${CHANNEL}/${moduleId}/${MODULE_VERSION}/bundle.zip`
  const openUrl = `${BASE_URL}/${CHANNEL}/${moduleId}/${MODULE_VERSION}/site/${entryPath}`

  const manifest = {
    schema_version: 1,
    module_id: moduleId,
    module_name: moduleName,
    version: MODULE_VERSION,
    package_url: packageUrl,
    package_sha256: packageSha,
    package_size: packageSize,
    entry_path: entryPath,
    published_at: new Date().toISOString(),
    release_notes: String(meta.release_notes || '').trim(),
    open_url: openUrl
  }

  fs.writeFileSync(path.join(versionDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  ensureDir(path.join(OUTPUT_ROOT, moduleId))
  fs.writeFileSync(path.join(OUTPUT_ROOT, moduleId, 'manifest.json'), JSON.stringify(manifest, null, 2))

  modules.push({
    id: moduleId,
    name: moduleName,
    manifest_url: `${BASE_URL}/${CHANNEL}/${moduleId}/manifest.json`,
    key_required: !!meta.key_required,
    order: Number(meta.order || 999),
    icon: String(meta.icon || '').trim(),
    description: String(meta.description || '').trim()
  })
}

modules.sort((a, b) => a.order - b.order)
ensureDir(OUTPUT_ROOT)
const catalog = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  channel: CHANNEL,
  modules
}
fs.writeFileSync(path.join(OUTPUT_ROOT, 'catalog.json'), JSON.stringify(catalog, null, 2))
console.log(`[modules] catalog generated: ${path.join(OUTPUT_ROOT, 'catalog.json')}`)
