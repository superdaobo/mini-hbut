#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const appleDirLabel = 'src-tauri/gen/apple'
const appleDir = path.join(rootDir, ...appleDirLabel.split('/'))
const patchMarker = 'Mini-HBUT iOS edge-to-edge WebView patch'

const fail = (message, details = []) => {
  console.error(`[tauri-ios-edge] ${message}`)
  for (const detail of details) {
    console.error(`[tauri-ios-edge] ${detail}`)
  }
  process.exit(1)
}

const walk = (dirPath, files = []) => {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walk(entryPath, files)
    } else if (entry.isFile() && entry.name.endsWith('.swift')) {
      files.push(entryPath)
    }
  }
  return files
}

const toPosix = (filePath) => filePath.split(path.sep).join('/')

const findBridgeSwiftFile = (swiftFiles) => swiftFiles.find((filePath) => {
  const source = fs.readFileSync(filePath, 'utf8')
  return source.includes('@_cdecl("on_webview_created")')
    && source.includes('WKWebView')
    && source.includes('UIViewController')
})

const parseLockedTauriVersion = () => {
  const lockPath = path.join(rootDir, 'src-tauri', 'Cargo.lock')
  if (!fs.existsSync(lockPath)) return null

  const lock = fs.readFileSync(lockPath, 'utf8')
  const match = lock.match(/\[\[package\]\]\s+name = "tauri"\s+version = "([^"]+)"/)
  return match?.[1] || null
}

const findCargoTauriBridgeFile = () => {
  const version = parseLockedTauriVersion()
  if (!version) return null

  const cargoHome = process.env.CARGO_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '', '.cargo')
  const registrySrc = path.join(cargoHome, 'registry', 'src')
  if (!fs.existsSync(registrySrc)) return null

  for (const indexDir of fs.readdirSync(registrySrc, { withFileTypes: true })) {
    if (!indexDir.isDirectory()) continue
    const candidate = path.join(
      registrySrc,
      indexDir.name,
      `tauri-${version}`,
      'mobile',
      'ios-api',
      'Sources',
      'Tauri',
      'Tauri.swift'
    )
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

const patchSwiftBridgeFile = (targetFile) => {
  let source = fs.readFileSync(targetFile, 'utf8')

  if (source.includes(patchMarker)) {
    console.log(`[tauri-ios-edge] 已存在补丁，跳过: ${toPosix(path.relative(rootDir, targetFile))}`)
    return
  }

  const helper = `
// ${patchMarker}
private func configureMiniHbutEdgeToEdgeWebView(_ webview: WKWebView, _ viewController: UIViewController) {
  viewController.edgesForExtendedLayout = [.top, .bottom]
  viewController.extendedLayoutIncludesOpaqueBars = true
  viewController.additionalSafeAreaInsets = .zero

  if #available(iOS 11.0, *) {
    webview.scrollView.contentInsetAdjustmentBehavior = .never
  }
  webview.scrollView.contentInset = .zero
  webview.scrollView.scrollIndicatorInsets = .zero
  webview.frame = viewController.view.bounds
  webview.autoresizingMask = [.flexibleWidth, .flexibleHeight]

  DispatchQueue.main.async {
    webview.frame = viewController.view.bounds
  }
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
    webview.frame = viewController.view.bounds
  }
}
`

  const callbackPattern = /(@_cdecl\("on_webview_created"\)\s*func\s+onWebviewCreated\s*\(\s*webview:\s*WKWebView,\s*viewController:\s*UIViewController\s*\)\s*\{)/
  if (!callbackPattern.test(source)) {
    fail(
      '找到了 Swift 桥接文件，但没有匹配到预期的 on_webview_created 回调签名。',
      [`目标文件: ${toPosix(path.relative(rootDir, targetFile))}`]
    )
  }

  source = source.replace(callbackPattern, `${helper}\n$1\n  configureMiniHbutEdgeToEdgeWebView(webview, viewController)`)

  fs.writeFileSync(targetFile, source)
  console.log(`[tauri-ios-edge] 已补丁 Tauri iOS WebView: ${toPosix(path.relative(rootDir, targetFile))}`)
}

if (!fs.existsSync(appleDir)) {
  fail(`Tauri iOS 生成目录不存在，请先执行 npm run tauri ios init: ${toPosix(path.relative(rootDir, appleDir))}`)
}

const swiftFiles = walk(appleDir)
const targetFile = findBridgeSwiftFile(swiftFiles) || findCargoTauriBridgeFile()

if (!targetFile) {
  fail(
    '没有找到可补丁的 Tauri iOS WebView 桥接文件，请确认已执行 cargo fetch。',
    [
      `扫描目录: ${toPosix(path.relative(rootDir, appleDir))}`,
      `Swift 文件: ${swiftFiles.map((filePath) => toPosix(path.relative(rootDir, filePath))).join(', ') || '(none)'}`,
      `锁定 Tauri 版本: ${parseLockedTauriVersion() || '(unknown)'}`,
    ]
  )
}

patchSwiftBridgeFile(targetFile)
