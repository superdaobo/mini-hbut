import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const BASE_URL = String(process.env.MODULE_BASE_URL || 'https://hbut.6661111.xyz/modules').trim().replace(/\/+$/, '')
const SOURCE_ROOT = path.resolve(process.env.MODULE_SOURCE_ROOT || 'website/modules-src')
const OUTPUT_ROOT = path.resolve(process.env.MODULE_OUTPUT_ROOT || 'website/public/modules')
const PUBLISH_CHANNELS = Object.freeze(['main', 'dev', 'latest'])
const SHARED_CHANNEL = 'latest'
const SOURCE_CHANNEL = String(
  process.env.MODULE_SOURCE_CHANNEL || process.env.MODULE_CHANNEL || process.env.GITHUB_REF_NAME || 'local'
)
  .trim()
  .toLowerCase()
const resolveChannelOutputRoot = (channel) => path.join(OUTPUT_ROOT, channel)
const SHA = String(process.env.GITHUB_SHA || 'local').trim().slice(0, 7) || 'local'
const MODULE_VERSION =
  String(process.env.MODULE_VERSION || '').trim() ||
  `${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${SHA}`

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true })

const resolveBinary = (binary) => {
  if (process.platform === 'win32' && binary === 'npm') {
    return 'npm.cmd'
  }
  return binary
}

const runCommand = (binary, args, options = {}) => {
  const cwd = options.cwd || process.cwd()
  const resolvedBinary = resolveBinary(binary)
  const isWindowsBatch = process.platform === 'win32' && /\.cmd$/i.test(resolvedBinary)
  try {
    if (isWindowsBatch) {
      execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', resolvedBinary, ...args], {
        cwd,
        stdio: 'inherit'
      })
    } else {
      execFileSync(resolvedBinary, args, {
        cwd,
        stdio: 'inherit'
      })
    }
  } catch (error) {
    const detail = [
      `[modules] command failed`,
      `binary=${resolvedBinary}`,
      `args=${JSON.stringify(args)}`,
      `cwd=${cwd}`
    ].join(' ')
    console.error(detail)
    throw error
  }
}

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

const resolveVersionField = (value, field) => {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text === 'self' || text === '__MODULE_VERSION__') {
    return MODULE_VERSION
  }
  return sanitizeToken(text, field)
}

const listModuleDirs = () => {
  if (!fs.existsSync(SOURCE_ROOT)) return []
  return fs
    .readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => path.join(SOURCE_ROOT, item.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'module.json')))
}

const installModuleDeps = (sourceDir) => {
  try {
    runCommand('npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund'], {
      cwd: sourceDir
    })
    return
  } catch (error) {
    console.warn(`[modules] npm ci failed, fallback to npm install: ${error.message}`)
  }

  runCommand('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
    cwd: sourceDir
  })
}

const zipDirectoryWithPython = (sourceDir, zipPath) => {
  const script = [
    'import os, sys, zipfile',
    'source_dir, zip_path = sys.argv[1], sys.argv[2]',
    "with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as archive:",
    '    for root, _, files in os.walk(source_dir):',
    '        for file_name in files:',
    '            file_path = os.path.join(root, file_name)',
    "            arcname = os.path.relpath(file_path, source_dir).replace(os.sep, '/')",
    '            archive.write(file_path, arcname)'
  ].join('\n')

  let lastError = null
  for (const binary of ['python', 'python3']) {
    try {
      execFileSync(binary, ['-c', script, sourceDir, zipPath], { stdio: 'inherit' })
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('未找到可用的 Python 解释器，无法打包 ZIP')
}

const zipDirectory = (sourceDir, zipPath) => {
  ensureDir(path.dirname(zipPath))
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true })
  try {
    runCommand('zip', ['-rq', zipPath, '.'], {
      cwd: sourceDir
    })
    return
  } catch (error) {
    console.warn(`[modules] zip command unavailable, fallback to python zipfile: ${error.message}`)
  }
  zipDirectoryWithPython(sourceDir, zipPath)
}

const sha256File = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const publishBuiltModule = ({
  outputRoot,
  publishChannel,
  moduleId,
  moduleName,
  moduleMeta,
  distDir,
  entryPath,
  version,
  minCompatibleVersion
}) => {
  const moduleRootDir = path.join(outputRoot, moduleId)
  const versionDir = path.join(moduleRootDir, version)
  const siteDir = path.join(versionDir, 'site')
  const latestSiteDir = path.join(moduleRootDir, 'site')
  const bundleZip = path.join(versionDir, 'bundle.zip')

  ensureDir(versionDir)
  if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true })
  copyDir(distDir, siteDir)
  ensureDir(moduleRootDir)
  if (fs.existsSync(latestSiteDir)) fs.rmSync(latestSiteDir, { recursive: true, force: true })
  copyDir(distDir, latestSiteDir)
  zipDirectory(distDir, bundleZip)

  const packageSha = sha256File(bundleZip)
  const packageSize = fs.statSync(bundleZip).size
  const packageUrl = `${BASE_URL}/${publishChannel}/${moduleId}/${version}/bundle.zip`
  const openUrl = `${BASE_URL}/${publishChannel}/${moduleId}/${version}/site/${entryPath}`

  const manifest = {
    schema_version: 1,
    module_id: moduleId,
    module_name: moduleName,
    version,
    package_url: packageUrl,
    package_sha256: packageSha,
    package_size: packageSize,
    entry_path: entryPath,
    published_at: new Date().toISOString(),
    release_notes: String(moduleMeta.release_notes || '').trim(),
    open_url: openUrl,
    published_channel: publishChannel,
    source_channel: SOURCE_CHANNEL || 'local'
  }
  if (minCompatibleVersion) {
    manifest.min_compatible_version = minCompatibleVersion
  }

  fs.writeFileSync(path.join(versionDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(moduleRootDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  return {
    manifest,
    catalogItem: {
      id: moduleId,
      name: moduleName,
      manifest_url: `${BASE_URL}/${publishChannel}/${moduleId}/manifest.json`,
      key_required: !!moduleMeta.key_required,
      order: Number(moduleMeta.order || 999),
      icon: String(moduleMeta.icon || '').trim(),
      description: String(moduleMeta.description || '').trim(),
      min_compatible_version: minCompatibleVersion
    }
  }
}

const catalogModulesByChannel = new Map(PUBLISH_CHANNELS.map((channel) => [channel, []]))
for (const moduleDir of listModuleDirs()) {
  const metaPath = path.join(moduleDir, 'module.json')
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  const moduleId = sanitizeToken(meta.id, 'module.id')
  const moduleName = String(meta.name || moduleId).trim() || moduleId
  const entryPath = String(meta.entry_path || 'index.html').trim() || 'index.html'
  const minCompatibleVersion = resolveVersionField(meta.min_compatible_version, 'module.min_compatible_version')
  const sourceRel = String(meta.source_dir || 'project').trim() || 'project'
  const sourceDir = path.resolve(moduleDir, sourceRel)
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`模块 ${moduleId} 缺少源码目录: ${sourceDir}`)
  }

  console.log(`[modules] building ${moduleId} from ${sourceDir}`)
  installModuleDeps(sourceDir)
  runCommand('npm', ['run', 'build'], { cwd: sourceDir })

  const distDir = path.resolve(sourceDir, String(meta.dist_dir || 'dist').trim() || 'dist')
  if (!fs.existsSync(distDir)) {
    throw new Error(`模块 ${moduleId} 缺少构建输出目录: ${distDir}`)
  }

  for (const publishChannel of PUBLISH_CHANNELS) {
    const published = publishBuiltModule({
      outputRoot: resolveChannelOutputRoot(publishChannel),
      publishChannel,
      moduleId,
      moduleName,
      moduleMeta: meta,
      distDir,
      entryPath,
      version: MODULE_VERSION,
      minCompatibleVersion
    })
    catalogModulesByChannel.get(publishChannel).push(published.catalogItem)
  }
}

ensureDir(OUTPUT_ROOT)
for (const publishChannel of PUBLISH_CHANNELS) {
  const channelModules = catalogModulesByChannel.get(publishChannel) || []
  channelModules.sort((a, b) => a.order - b.order)
  const channelOutputRoot = resolveChannelOutputRoot(publishChannel)
  ensureDir(channelOutputRoot)
  const catalog = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    channel: publishChannel,
    source_channel: SOURCE_CHANNEL || 'local',
    modules: channelModules
  }
  fs.writeFileSync(path.join(channelOutputRoot, 'catalog.json'), JSON.stringify(catalog, null, 2))
  console.log(`[modules] catalog generated: ${path.join(channelOutputRoot, 'catalog.json')}`)
}
