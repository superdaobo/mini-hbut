#!/usr/bin/env node
/**
 * 确定性写入 iOS 定位权限 usage 描述（#1370）。
 *
 * ## 为什么需要这个脚本
 *
 * iOS 上 WKWebView 调用定位 API 前，宿主 App 必须在 Info.plist 声明
 * `NSLocationWhenInUseUsageDescription`，否则系统**不弹定位权限框**，
 * 定位请求直接失败（静默失败：前端只能拿到一个拒绝/失败的回调，没有弹窗可点）。
 *
 * Tauri 的 iOS 工程在 `src-tauri/gen/apple/`（gen/ 被 gitignore），CI 每次
 * `npm exec -- tauri ios init` 现场重新生成，默认模板**不含**该 key —— 与 #1000
 * 深链 scheme 是同一类「生成物每次重写、没有稳定注入通道」的问题，因此同样
 * 需要一个在 `tauri ios init` 之后、xcodebuild 之前运行的确定性补丁脚本。
 *
 * ## 做法
 *
 * 把固定的中文文案写入 gen/apple 下的 Info.plist（只认 `_iOS` 工程目录）：
 *   - 缺失 → 插入到根 `</dict>` 之前（与 Tauri 模板同缩进风格：单 tab）
 *   - 已存在且值相同 → no-op（字节不变）
 *   - 已存在但值不同 → 只替换 `<string>` 的值，不动缩进与文件其余结构
 *
 * 用法：
 *   node scripts/patch_ios_location_usage.mjs          # 写入（幂等）
 *   node scripts/patch_ios_location_usage.mjs --check  # 只校验，缺失或值不对则 exit 1
 *
 * 退出码：0 = 成功（或 --check 通过）；1 = 失败（找不到工程 / 校验不通过）
 */
import fs from 'node:fs'
import path from 'node:path'

const APPLE_DIR_LABEL = 'src-tauri/gen/apple'

/** iOS 前台定位权限的 usage 描述键（When-In-Use，非 Always） */
export const LOCATION_USAGE_KEY = 'NSLocationWhenInUseUsageDescription'

/** 写入 Info.plist 的固定中文文案（#1370 评审确定，含 & < > 时由 escapeXmlText 处理） */
export const LOCATION_USAGE_TEXT =
  '用于校园导览与小塔出行的实时定位，方便查看你附近的车辆与场馆。'

const fail = (message, details = []) => {
  console.error(`[ios-location] ✗ ${message}`)
  for (const detail of details) console.error(`[ios-location]   ${detail}`)
  process.exit(1)
}

/** XML 文本转义（& 必须最先，避免二次转义） */
export const escapeXmlText = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** XML 文本反转义（&amp; 必须最后还原，保证 `&amp;lt;` → `&lt;` 而不是 `<`） */
export const unescapeXmlText = (value) =>
  String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/**
 * 找到 `<key>NSLocationWhenInUseUsageDescription</key>` 之后第一个
 * `<string>…</string>` 的 span（纯函数）。string 内不会有嵌套 <string>，
 * 直接找第一个 `</string>` 即可。
 */
const findUsageStringSpan = (xml) => {
  const keyIndex = xml.indexOf(`<key>${LOCATION_USAGE_KEY}</key>`)
  if (keyIndex < 0) return null
  const openIndex = xml.indexOf('<string>', keyIndex)
  if (openIndex < 0) return null
  const closeIndex = xml.indexOf('</string>', openIndex)
  if (closeIndex < 0) return null
  const valueStart = openIndex + '<string>'.length
  return {
    start: openIndex,
    valueStart,
    end: closeIndex + '</string>'.length,
    value: xml.slice(valueStart, closeIndex)
  }
}

/** 判断 plist XML 是否已含期望的 usage 描述（按反转义后的语义值比较） */
export const hasLocationUsage = (xml, text = LOCATION_USAGE_TEXT) => {
  const span = findUsageStringSpan(xml)
  return span !== null && unescapeXmlText(span.value) === text
}

/**
 * 幂等写入定位 usage 描述（纯函数）。
 * 已存在则只替换值；缺失则插入到根 `</dict>` 之前（保持 Tauri 模板的单 tab 缩进）。
 */
export const upsertLocationUsage = (xml, text = LOCATION_USAGE_TEXT) => {
  const escaped = escapeXmlText(text)
  const span = findUsageStringSpan(xml)
  if (span) {
    if (unescapeXmlText(span.value) === text) return { xml, changed: false }
    // 只替换 <string> 的值（保留前后标签与缩进）
    const closeStart = span.end - '</string>'.length
    const next = `${xml.slice(0, span.valueStart)}${escaped}${xml.slice(closeStart)}`
    return { xml: next, changed: true }
  }
  const rootCloseIndex = xml.lastIndexOf('</dict>')
  if (rootCloseIndex < 0) {
    throw new Error(`Info.plist 缺少根 </dict>，无法插入 ${LOCATION_USAGE_KEY}`)
  }
  const block = `\t<key>${LOCATION_USAGE_KEY}</key>\n\t<string>${escaped}</string>\n`
  const next = `${xml.slice(0, rootCloseIndex)}${block}${xml.slice(rootCloseIndex)}`
  return { xml: next, changed: true }
}

/** 递归收集 `gen/apple` 下的 Info.plist（只认 `_iOS` 工程目录；与 deep_link 脚本同一发现逻辑，不硬编码 app 名） */
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

  const appleDir = path.join(rootDir, ...APPLE_DIR_LABEL.split('/'))
  if (!fs.existsSync(appleDir)) {
    fail(`${APPLE_DIR_LABEL} 不存在（iOS 工程只能在 macOS 生成）`, [
      '请先执行 `npm exec -- tauri ios init`（iOS CI 里该步已内置）'
    ])
  }
  const plists = collectIosInfoPlists(appleDir)
  if (plists.length === 0) fail(`在 ${APPLE_DIR_LABEL} 下找不到 *_iOS/Info.plist`)

  let touched = 0
  for (const plistPath of plists) {
    const rel = path.relative(rootDir, plistPath).split(path.sep).join('/')
    const xml = fs.readFileSync(plistPath, 'utf8')
    if (checkOnly) {
      if (!hasLocationUsage(xml)) {
        fail(`${rel} 缺失或值不对：${LOCATION_USAGE_KEY}`, [
          'WKWebView 下定位权限框不会弹，定位将直接失败',
          `期望值：${LOCATION_USAGE_TEXT}`
        ])
      }
      console.log(`[ios-location] ✓ ${rel} 已含 ${LOCATION_USAGE_KEY}`)
      continue
    }
    const { xml: next, changed } = upsertLocationUsage(xml)
    if (changed) {
      fs.writeFileSync(plistPath, next)
      touched += 1
      console.log(`[ios-location] ✓ 已写入 ${rel}：${LOCATION_USAGE_KEY}`)
    } else {
      console.log(`[ios-location] = ${rel} 已是最新（幂等跳过）`)
    }
  }

  if (!checkOnly) {
    console.log(`[ios-location] 完成：${LOCATION_USAGE_KEY}，改动文件 ${touched} 个`)
  }
}

// 仅在被直接执行时跑 main（被 spec import 时不执行）
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main()
}
