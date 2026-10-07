#!/usr/bin/env node
/**
 * 确定性写入 iOS 深链 URL scheme（#1000）。
 *
 * ## 为什么需要这个脚本
 *
 * `minihbut://identity?...` 是「用 Mini-HBUT 登录」的唤起入口。iOS 侧 scheme 由
 * `tauri-plugin-deep-link` 的 **build.rs 在 cargo 构建期**写入生成工程的
 * `gen/apple/<app>_iOS/Info.plist`（`CFBundleURLTypes`）。这条注入链有两个静默失败点：
 *
 * 1. 它依赖 `TAURI_IOS_PROJECT_PATH` / `TAURI_IOS_APP_NAME` 两个环境变量，缺失时
 *    `update_info_plist` 直接 `Ok(())` **什么都不做**（`tauri-plugin-2.5.2/src/build/mobile.rs`）；
 * 2. `tauri ios init` 每次都会**重新生成** Info.plist（`gen/` 被 gitignore），而 cargo 的
 *    fingerprint 感知不到「包外文件被重写」—— 命中 `rust-cache` 的暖构建会**跳过 build.rs**，
 *    于是新生成的 plist 永远拿不到 scheme。
 *
 * 表现就是：iOS 上点「打开 Mini-HBUT App」**毫无反应**（scheme 无人注册），
 * 而桌面端正常（Windows 走注册表，与这条链无关）。
 *
 * ## 做法
 *
 * 在 `tauri ios init` 之后、xcodebuild 之前，从 `tauri.conf.json`（**唯一 source of truth**）
 * 读出 mobile scheme 并写进 Info.plist。写入结构与插件的 build.rs **完全一致**，
 * 因此插件若也成功执行，结果是一个幂等的 no-op —— 不会出现重复注册或两处配置漂移。
 *
 * 用法：
 *   node scripts/patch_ios_deep_link_scheme.mjs          # 写入（幂等）
 *   node scripts/patch_ios_deep_link_scheme.mjs --check  # 只校验，未注册则 exit 1
 *
 * 退出码：0 = 成功（或 --check 通过）；1 = 失败（找不到工程 / 配置无 scheme / 校验不通过）
 */
import fs from 'node:fs'
import path from 'node:path'

const APPLE_DIR_LABEL = 'src-tauri/gen/apple'
const URL_TYPES_KEY = 'CFBundleURLTypes'
const URL_SCHEMES_KEY = 'CFBundleURLSchemes'
const URL_NAME_KEY = 'CFBundleURLName'
const SYSTEM_SCHEMES = new Set(['http', 'https'])

const fail = (message, details = []) => {
  console.error(`[ios-deeplink] ✗ ${message}`)
  for (const detail of details) console.error(`[ios-deeplink]   ${detail}`)
  process.exit(1)
}

/**
 * 从 tauri.conf.json 解析需要注册到 Info.plist 的 scheme 列表（纯函数）。
 *
 * 与 tauri-plugin-deep-link 的 build.rs 同规则：只取 `mobile` 里**非 appLink** 的条目，
 * 并剔除 http/https（那类属于 Universal Link，靠 entitlements 的
 * associated-domains，不能写进 CFBundleURLTypes）。
 */
export const resolveIosSchemes = (tauriConf) => {
  const mobile = tauriConf?.plugins?.['deep-link']?.mobile
  if (!Array.isArray(mobile)) return []
  const schemes = []
  for (const entry of mobile) {
    if (!entry || typeof entry !== 'object') continue
    if (entry.appLink === true) continue
    const list = Array.isArray(entry.scheme) ? entry.scheme : []
    for (const raw of list) {
      const scheme = String(raw ?? '').trim()
      if (!scheme || SYSTEM_SCHEMES.has(scheme.toLowerCase())) continue
      if (!schemes.includes(scheme)) schemes.push(scheme)
    }
  }
  return schemes
}

/** 构造与插件 build.rs 等价的 CFBundleURLTypes 片段（纯函数） */
export const buildUrlTypesBlock = (schemes, indent = '\t') =>
  [
    `${indent}<key>${URL_TYPES_KEY}</key>`,
    `${indent}<array>`,
    ...schemes.map(
      (scheme) =>
        [
          `${indent}\t<dict>`,
          `${indent}\t\t<key>${URL_SCHEMES_KEY}</key>`,
          `${indent}\t\t<array>`,
          `${indent}\t\t\t<string>${scheme}</string>`,
          `${indent}\t\t</array>`,
          `${indent}\t\t<key>${URL_NAME_KEY}</key>`,
          `${indent}\t\t<string>${scheme}</string>`,
          `${indent}\t</dict>`
        ].join('\n')
    ),
    `${indent}</array>`
  ].join('\n')

/** 找到 `<key>CFBundleURLTypes</key>` 之后那个 `<array>` 的起止位置（考虑嵌套） */
const findUrlTypesArraySpan = (xml) => {
  const keyIndex = xml.indexOf(`<key>${URL_TYPES_KEY}</key>`)
  if (keyIndex < 0) return null
  const openIndex = xml.indexOf('<array>', keyIndex)
  if (openIndex < 0) return null
  let depth = 0
  let cursor = openIndex
  while (cursor < xml.length) {
    const nextOpen = xml.indexOf('<array>', cursor)
    const nextClose = xml.indexOf('</array>', cursor)
    if (nextClose < 0) return null
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1
      cursor = nextOpen + '<array>'.length
      continue
    }
    depth -= 1
    cursor = nextClose + '</array>'.length
    if (depth === 0) {
      // 起点回退到行首缩进之前：替换块自带缩进，否则每跑一次就多叠一层 tab
      // （会让「幂等」失效 —— 第二次调用仍判为 changed，缩进逐次累积）
      let start = keyIndex
      while (start > 0 && (xml[start - 1] === '\t' || xml[start - 1] === ' ')) start -= 1
      return { start, end: cursor }
    }
  }
  return null
}

/**
 * 幂等写入 CFBundleURLTypes（纯函数）。
 * 已存在则整体替换（保持与插件同结构），否则插入到根 `</dict>` 之前。
 */
export const upsertUrlTypes = (xml, schemes) => {
  const block = buildUrlTypesBlock(schemes)
  const span = findUrlTypesArraySpan(xml)
  if (span) {
    const next = `${xml.slice(0, span.start)}${block}${xml.slice(span.end)}`
    return { xml: next, changed: next !== xml }
  }
  const rootCloseIndex = xml.lastIndexOf('</dict>')
  if (rootCloseIndex < 0) {
    throw new Error('Info.plist 缺少根 </dict>，无法插入 CFBundleURLTypes')
  }
  const next = `${xml.slice(0, rootCloseIndex)}${block}\n${xml.slice(rootCloseIndex)}`
  return { xml: next, changed: next !== xml }
}

/** 校验 scheme 是否已注册（纯函数；只看 CFBundleURLTypes 段内是否出现该字符串） */
export const isSchemeRegistered = (xml, schemes) => {
  const span = findUrlTypesArraySpan(xml)
  if (!span) return false
  const section = xml.slice(span.start, span.end)
  return schemes.every((scheme) => section.includes(`<string>${scheme}</string>`))
}

/** 递归收集 `gen/apple` 下的 Info.plist（只认 `_iOS` 工程目录） */
const collectIosInfoPlists = (dir) => {
  const found = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name === 'Info.plist') found.push(full)
    }
  }
  walk(dir)
  return found.filter((file) => file.split(path.sep).join('/').includes('_iOS/'))
}

const main = () => {
  const checkOnly = process.argv.includes('--check')
  const rootDir = process.cwd()

  const confPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
  if (!fs.existsSync(confPath)) fail(`找不到 ${path.relative(rootDir, confPath)}`)
  const tauriConf = JSON.parse(fs.readFileSync(confPath, 'utf8'))
  const schemes = resolveIosSchemes(tauriConf)
  if (schemes.length === 0) {
    fail('tauri.conf.json 的 plugins.deep-link.mobile 没有可注册的自定义 scheme', [
      '期望形如 [{ "scheme": ["minihbut"], "appLink": false }]'
    ])
  }

  const appleDir = path.join(rootDir, ...APPLE_DIR_LABEL.split('/'))
  if (!fs.existsSync(appleDir)) {
    fail(`${APPLE_DIR_LABEL} 不存在（iOS 工程只能在 macOS 生成）`, [
      '请先执行 `npx tauri ios init`'
    ])
  }
  const plists = collectIosInfoPlists(appleDir)
  if (plists.length === 0) fail(`在 ${APPLE_DIR_LABEL} 下找不到 *_iOS/Info.plist`)

  let touched = 0
  for (const plistPath of plists) {
    const rel = path.relative(rootDir, plistPath).split(path.sep).join('/')
    const xml = fs.readFileSync(plistPath, 'utf8')
    if (checkOnly) {
      if (!isSchemeRegistered(xml, schemes)) {
        fail(`${rel} 未注册 scheme：${schemes.join(', ')}`, [
          'iOS 上 minihbut://identity 将无法唤起 App'
        ])
      }
      console.log(`[ios-deeplink] ✓ ${rel} 已注册 ${schemes.join(', ')}`)
      continue
    }
    const { xml: next, changed } = upsertUrlTypes(xml, schemes)
    if (changed) {
      fs.writeFileSync(plistPath, next)
      touched += 1
      console.log(`[ios-deeplink] ✓ 已写入 ${rel}：${schemes.join(', ')}`)
    } else {
      console.log(`[ios-deeplink] = ${rel} 已是最新（幂等跳过）`)
    }
  }

  if (!checkOnly) {
    console.log(`[ios-deeplink] 完成：scheme=[${schemes.join(', ')}]，改动文件 ${touched} 个`)
  }
}

// 仅在被直接执行时跑 main（被 spec import 时不执行）
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main()
}
