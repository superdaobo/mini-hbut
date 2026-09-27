import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolveNpmCliPath } from '../apps/client/scripts/npm_cli_path.mjs'

const BASE_URL = String(process.env.MODULE_BASE_URL || 'https://hbut.6661111.xyz/modules').trim().replace(/\/+$/, '')
const SOURCE_ROOT = path.resolve(process.env.MODULE_SOURCE_ROOT || 'website/modules-src')
const OUTPUT_ROOT = path.resolve(process.env.MODULE_OUTPUT_ROOT || 'website/public/modules')
const PUBLISH_CHANNELS = Object.freeze(['main', 'dev', 'latest'])
const SHARED_CHANNEL = 'latest'
const cliArgs = process.argv.slice(2)
const readCliValue = (name) => {
  const prefix = `--${name}=`
  const inline = cliArgs.find((item) => item.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = cliArgs.indexOf(`--${name}`)
  if (index >= 0) return cliArgs[index + 1] || ''
  return ''
}
const MODULE_FILTER = new Set(
  String(readCliValue('modules') || process.env.MODULE_FILTER || process.env.MODULE_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
)
const SHOULD_MERGE_EXISTING_CATALOG =
  MODULE_FILTER.size > 0 || cliArgs.includes('--merge-catalog') || process.env.MODULE_MERGE_CATALOG === '1'
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

// npm CLI 仅从可信的 process.execPath 推导固定候选路径；兼容 Windows 官方安装器与
// actions/setup-node 的 Unix 布局，不读取 PATH/ComSpec 等环境命令，避免命令注入。
const NPM_CLI_PATH = resolveNpmCliPath()

const runCommand = (binary, args, options = {}) => {
  const cwd = options.cwd || process.cwd()
  const command = binary === 'npm' ? process.execPath : binary
  const commandArgs = binary === 'npm' ? [NPM_CLI_PATH, ...args] : args
  try {
    execFileSync(command, commandArgs, {
      cwd,
      stdio: 'inherit'
    })
  } catch (error) {
    const detail = [
      `[modules] command failed`,
      `binary=${command}`,
      `args=${JSON.stringify(commandArgs)}`,
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

/**
 * Game Platform SDK（website/modules-src/_sdk，无 module.json，不是游戏模块）。
 *
 * 价值（#904）：把「SDK 版本 ↔ 模块产物」绑定起来，回滚时可从 manifest 直接判断
 * 某个历史版本内联的是哪一版 SDK，并在构建期 fail-fast 拦住语法错误/未内联的产物。
 * 未引用 SDK 的模块**产物字节不变**（manifest 不新增字段），避免影响既有模块。
 */
const SDK_DIR = path.join(SOURCE_ROOT, '_sdk')
const SDK_SRC_DIR = path.join(SDK_DIR, 'src')
const SDK_SOURCE_IMPORT_RE = /(?:from|import)\s*\(?\s*['"][^'"]*_sdk\/[^'"]*['"]/g
const SDK_DIST_RESIDUAL_RE = /_sdk[\\/]+src[\\/]/

const listFilesByExt = (dir, extensions) => {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) out.push(...listFilesByExt(full, extensions))
    else if (item.isFile() && extensions.some((ext) => item.name.endsWith(ext))) out.push(full)
  }
  return out
}

const loadSdkPackage = () => {
  if (!fs.existsSync(path.join(SDK_DIR, 'package.json'))) return null
  const meta = JSON.parse(fs.readFileSync(path.join(SDK_DIR, 'package.json'), 'utf8'))
  const version = String(meta.version || '').trim()
  const entry = path.resolve(SDK_DIR, String(meta.main || 'src/index.js'))
  if (!version) throw new Error('[sdk] _sdk/package.json 缺少 version')
  if (!fs.existsSync(entry)) throw new Error(`[sdk] _sdk 入口不存在: ${entry}`)
  // 语法预检：构建前拦下 SDK 自身的语法错误（比模块构建失败更早、更易定位）
  for (const file of listFilesByExt(SDK_SRC_DIR, ['.js'])) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
    } catch (error) {
      throw new Error(`[sdk] 语法错误 ${path.relative(process.cwd(), file)}: ${error.stderr?.toString() || error.message}`)
    }
  }
  const hash = crypto.createHash('sha256')
  for (const file of listFilesByExt(SDK_SRC_DIR, ['.js']).sort()) {
    hash.update(path.relative(SDK_DIR, file).replace(/\\/g, '/'))
    hash.update(fs.readFileSync(file))
  }
  return {
    version,
    protocolVersion: Number(meta?.miniHbut?.protocol_version || 0) || 0,
    entry,
    sha256: hash.digest('hex'),
    sourceFiles: listFilesByExt(SDK_SRC_DIR, ['.js']).length
  }
}

/** 模块源码是否 import 了 SDK（相对路径引用，构建时被内联） */
const moduleUsesSdk = (sourceDir) =>
  listFilesByExt(sourceDir, ['.js', '.mjs', '.ts', '.vue']).some((file) => {
    SDK_SOURCE_IMPORT_RE.lastIndex = 0
    return SDK_SOURCE_IMPORT_RE.test(fs.readFileSync(file, 'utf8'))
  })

/** 校验产物确实内联了 SDK（不残留 _sdk/src 运行时引用） */
const assertSdkInlined = (distDir, moduleId) => {
  const bundles = listFilesByExt(distDir, ['.js', '.mjs', '.html'])
  const residual = bundles.find((file) => SDK_DIST_RESIDUAL_RE.test(fs.readFileSync(file, 'utf8')))
  if (residual) {
    throw new Error(
      `[sdk] 模块 ${moduleId} 的产物 ${path.relative(process.cwd(), residual)} 仍引用 _sdk/src（SDK 未被打包内联）`
    )
  }
  return bundles.length
}

const readJsonIfExists = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
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
  minCompatibleVersion,
  sdkMeta
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
  // 只有真正引用 SDK 的模块才写这两个字段（其余模块 manifest 保持字节不变）
  if (sdkMeta) {
    manifest.sdk_version = sdkMeta.version
    manifest.sdk_sha256 = sdkMeta.sha256
    manifest.sdk_protocol_version = sdkMeta.protocolVersion
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
      min_compatible_version: minCompatibleVersion,
      ...(sdkMeta ? { sdk_version: sdkMeta.version } : {})
    }
  }
}

const catalogModulesByChannel = new Map(PUBLISH_CHANNELS.map((channel) => [channel, []]))
const sdkPackage = loadSdkPackage()
if (sdkPackage) {
  console.log(
    `[sdk] mini-hbut-game-sdk v${sdkPackage.version} (protocol v${sdkPackage.protocolVersion}) files=${sdkPackage.sourceFiles} sha256=${sdkPackage.sha256.slice(0, 12)}`
  )
}
for (const moduleDir of listModuleDirs()) {
  const metaPath = path.join(moduleDir, 'module.json')
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  if (meta.disabled === true) {
    console.log(`[modules] skipping disabled module: ${meta.id || path.basename(moduleDir)}`)
    continue
  }
  const moduleId = sanitizeToken(meta.id, 'module.id')
  if (
    MODULE_FILTER.size > 0 &&
    !MODULE_FILTER.has(moduleId) &&
    !MODULE_FILTER.has(path.basename(moduleDir))
  ) {
    console.log(`[modules] skipping filtered module: ${moduleId}`)
    continue
  }
  const moduleName = String(meta.name || moduleId).trim() || moduleId
  const entryPath = String(meta.entry_path || 'index.html').trim() || 'index.html'
  const minCompatibleVersion = resolveVersionField(meta.min_compatible_version, 'module.min_compatible_version')
  const sourceRel = String(meta.source_dir || 'project').trim() || 'project'
  const sourceDir = path.resolve(moduleDir, sourceRel)
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`模块 ${moduleId} 缺少源码目录: ${sourceDir}`)
  }

  console.log(`[modules] building ${moduleId} from ${sourceDir}`)
  const usesSdk = moduleUsesSdk(sourceDir)
  if (usesSdk && !sdkPackage) {
    throw new Error(`[sdk] 模块 ${moduleId} 引用了 _sdk，但 website/modules-src/_sdk 不可用`)
  }
  installModuleDeps(sourceDir)
  runCommand('npm', ['run', 'build'], { cwd: sourceDir })

  const distDir = path.resolve(sourceDir, String(meta.dist_dir || 'dist').trim() || 'dist')
  if (!fs.existsSync(distDir)) {
    throw new Error(`模块 ${moduleId} 缺少构建输出目录: ${distDir}`)
  }
  if (usesSdk) {
    // 注入校验：产物必须已内联 SDK（保证离线包/远端加载不依赖额外的 SDK 请求）
    const bundleCount = assertSdkInlined(distDir, moduleId)
    console.log(
      `[sdk] ${moduleId} 已内联 SDK v${sdkPackage.version}（dist 文件 ${bundleCount} 个，无 _sdk/src 残留引用）`
    )
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
      minCompatibleVersion,
      sdkMeta: usesSdk ? sdkPackage : null
    })
    catalogModulesByChannel.get(publishChannel).push(published.catalogItem)
  }
}

ensureDir(OUTPUT_ROOT)
for (const publishChannel of PUBLISH_CHANNELS) {
  const channelOutputRoot = resolveChannelOutputRoot(publishChannel)
  const builtModules = catalogModulesByChannel.get(publishChannel) || []
  let channelModules = builtModules
  if (SHOULD_MERGE_EXISTING_CATALOG) {
    const existingCatalog = readJsonIfExists(path.join(channelOutputRoot, 'catalog.json'))
    const mergedById = new Map()
    for (const item of existingCatalog?.modules || []) {
      if (item?.id) mergedById.set(item.id, item)
    }
    for (const item of builtModules) {
      if (item?.id) mergedById.set(item.id, item)
    }
    channelModules = Array.from(mergedById.values())
  }
  channelModules.sort((a, b) => a.order - b.order)
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
