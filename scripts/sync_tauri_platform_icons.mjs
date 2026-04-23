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

const syncAndroidIcons = () => {
  const sourceRoot = path.join(rootDir, 'src-tauri', 'icons', 'android')
  const targetRoot = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res')
  if (!fs.existsSync(sourceRoot)) fail(`Android 图标源目录不存在: ${sourceRoot}`)
  if (!fs.existsSync(targetRoot)) fail(`Android 目标目录不存在，请先执行 tauri android init: ${targetRoot}`)

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
  console.log(`[icon-sync] Android 图标已同步，共复制 ${copied} 个文件`)
}

const syncIosIcons = () => {
  const sourceDir = path.join(rootDir, 'src-tauri', 'icons', 'ios')
  const targetDir = path.join(rootDir, 'src-tauri', 'gen', 'apple', 'Assets.xcassets', 'AppIcon.appiconset')
  if (!fs.existsSync(sourceDir)) fail(`iOS 图标源目录不存在: ${sourceDir}`)
  if (!fs.existsSync(targetDir)) fail(`iOS 目标目录不存在，请先执行 tauri ios init: ${targetDir}`)

  removeMatching(targetDir, (name) => name.endsWith('.png'))
  const copied = copyFiles(sourceDir, targetDir, (name) => name.endsWith('.png'))
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
