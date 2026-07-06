#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const platform = String(process.argv[2] || '').trim().toLowerCase()
const rootDir = process.cwd()

const fail = (message) => {
  console.error(`[icon-sync] ${message}`)
  process.exit(1)
}

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true })
}

const removeMatching = (dirPath, predicate) => {
  if (!fs.existsSync(dirPath)) return
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (!predicate(entry.name)) continue
    fs.rmSync(path.join(dirPath, entry.name), { force: true })
  }
}

const APP_STORE_ICON_OVERRIDES = {
  'AppIcon-512@2x-appstore.png': 'AppIcon-512@2x.png',
  'AppIcon-1024x1024@1x-appstore.png': 'AppIcon-1024x1024@1x.png'
}

const APP_STORE_SOURCE_ICONS = new Set(Object.keys(APP_STORE_ICON_OVERRIDES))

const pngHasAlphaChannel = (filePath) => {
  const buffer = fs.readFileSync(filePath)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 26 || !buffer.subarray(0, 8).equals(signature)) {
    fail(`无效的 PNG 文件: ${filePath}`)
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    fail(`PNG 缺少 IHDR 块: ${filePath}`)
  }
  const colorType = buffer[25]
  return colorType === 4 || colorType === 6
}

const assertAppStoreOverridesAreOpaque = (sourceDir) => {
  for (const sourceName of APP_STORE_SOURCE_ICONS) {
    const iconPath = path.join(sourceDir, sourceName)
    if (!fs.existsSync(iconPath)) {
      fail(
        `缺少 ${sourceName}，请先运行: python scripts/fix_ios_app_store_icon.py`
      )
    }
    if (pngHasAlphaChannel(iconPath)) {
      fail(
        `${sourceName} 含 alpha 通道，TestFlight 会拒绝上传。请重新运行: python scripts/fix_ios_app_store_icon.py`
      )
    }
  }
}

const shouldSkipIosSourceIcon = (name, sourceDir) => {
  if (name.endsWith('-appstore.png')) return true
  if (name === 'AppIcon-512@2x.png' && fs.existsSync(path.join(sourceDir, 'AppIcon-512@2x-appstore.png'))) {
    return true
  }
  if (
    name === 'AppIcon-1024x1024@1x.png'
    && fs.existsSync(path.join(sourceDir, 'AppIcon-1024x1024@1x-appstore.png'))
  ) {
    return true
  }
  return false
}

const copyFiles = (sourceDir, targetDir, predicate = () => true) => {
  if (!fs.existsSync(sourceDir)) return 0
  ensureDir(targetDir)
  let copied = 0
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (!predicate(entry.name)) continue
    fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name))
    copied += 1
  }
  return copied
}

const copyAndroidIconsToTarget = (sourceRoot, targetRoot) => {
  ensureDir(targetRoot)
  const densityPairs = [
    ['hdpi', 'mipmap-hdpi'],
    ['mdpi', 'mipmap-mdpi'],
    ['xhdpi', 'mipmap-xhdpi'],
    ['xxhdpi', 'mipmap-xxhdpi'],
    ['xxxhdpi', 'mipmap-xxxhdpi']
  ]

  let copied = 0
  for (const [legacyDir, mipmapDir] of densityPairs) {
    const targetDir = path.join(targetRoot, mipmapDir)
    removeMatching(targetDir, (name) => name.startsWith('ic_launcher'))
    copied += copyFiles(path.join(sourceRoot, legacyDir), targetDir, (name) => name.endsWith('.png'))
    copied += copyFiles(path.join(sourceRoot, mipmapDir), targetDir, (name) => name.endsWith('.png'))
  }

  const anydpiTarget = path.join(targetRoot, 'mipmap-anydpi-v26')
  removeMatching(anydpiTarget, (name) => name.startsWith('ic_launcher'))
  copied += copyFiles(
    path.join(sourceRoot, 'mipmap-anydpi-v26'),
    anydpiTarget,
    (name) => name.endsWith('.xml')
  )

  const valuesTarget = path.join(targetRoot, 'values')
  removeMatching(valuesTarget, (name) => name === 'ic_launcher_background.xml')
  copied += copyFiles(
    path.join(sourceRoot, 'values'),
    valuesTarget,
    (name) => name === 'ic_launcher_background.xml'
  )

  if (copied === 0) fail('Android 图标同步失败：未复制任何文件')
  return copied
}

const syncAndroidIcons = () => {
  const sourceRoot = path.join(rootDir, 'src-tauri', 'icons', 'android')
  if (!fs.existsSync(sourceRoot)) fail(`Android 图标源目录不存在: ${sourceRoot}`)

  const targetRoots = [
    path.join(rootDir, 'android', 'app', 'src', 'main', 'res'),
    path.join(rootDir, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res')
  ].filter((dirPath) => fs.existsSync(path.dirname(dirPath)) || fs.existsSync(dirPath))

  if (!targetRoots.length) {
    fail('Android 目标目录不存在，请先执行 cap sync 或 tauri android init')
  }

  let copied = 0
  for (const targetRoot of targetRoots) {
    copied += copyAndroidIconsToTarget(sourceRoot, targetRoot)
  }

  console.log(`[icon-sync] Android 图标已同步到 ${targetRoots.length} 个目标，共复制 ${copied} 个文件`)
}

const syncIosIcons = () => {
  const sourceDir = path.join(rootDir, 'src-tauri', 'icons', 'ios')
  const targetDir = path.join(rootDir, 'src-tauri', 'gen', 'apple', 'Assets.xcassets', 'AppIcon.appiconset')
  if (!fs.existsSync(sourceDir)) fail(`iOS 图标源目录不存在: ${sourceDir}`)
  if (!fs.existsSync(targetDir)) fail(`iOS 目标目录不存在，请先执行 tauri ios init: ${targetDir}`)

  assertAppStoreOverridesAreOpaque(sourceDir)
  removeMatching(targetDir, (name) => name.endsWith('.png'))

  let copied = 0
  for (const [sourceName, targetName] of Object.entries(APP_STORE_ICON_OVERRIDES)) {
    fs.copyFileSync(path.join(sourceDir, sourceName), path.join(targetDir, targetName))
    copied += 1
  }

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.png')) continue
    if (shouldSkipIosSourceIcon(entry.name, sourceDir)) continue
    fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name))
    copied += 1
  }

  if (copied === 0) fail('iOS 图标同步失败：未复制任何 PNG')
  console.log(`[icon-sync] iOS 图标已同步，共复制 ${copied} 个文件`)
}

switch (platform) {
  case 'android':
    syncAndroidIcons()
    break
  case 'ios':
    syncIosIcons()
    break
  default:
    fail('用法: node scripts/sync_tauri_platform_icons.mjs <android|ios>')
}
