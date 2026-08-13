#!/usr/bin/env node
/**
 * Mini-HBUT 移动端 Deep Link scheme contract 守卫（#628 L5：generated mobile scheme contract）。
 *
 * 背景：
 * - `minihbut://identity` 是 App Approval 的统一入口（#621/#622/#623/#627），
 *   桌面与移动端共用 `src-tauri/tauri.conf.json` 的 plugins.deep-link 单一 source；
 * - 移动端发布以 Tauri 生成工程为准（`src-tauri/gen/android/**`、`gen/ios/**`），
 *   生成目录不是 source of truth，禁止手改；CI 每次 `tauri android init`/build 重新生成；
 * - Windows 无法生成 iOS 工程（需要 macOS/Xcode），因此 iOS 侧本脚本输出 SKIP 指引，
 *   由 macOS CI（ios-testflight.yml）在生成后执行同一守卫；
 * - 本守卫防止“tauri.conf.json 配置被改/删除，但 gen 产物还是旧的”这类静默回归，
 *   以及 Android 生成工程 intent-filter 丢失 minihbut scheme。
 *
 * 用法（主仓库根目录执行）：
 *   node scripts/check_mobile_scheme_contract.mjs            # 全量检查（含 gen 产物，存在即检查）
 *   node scripts/check_mobile_scheme_contract.mjs --skip-gen # 只检查静态配置（移动工程尚未生成时用）
 *   node scripts/check_mobile_scheme_contract.mjs --self-test# 内嵌逻辑自测（不依赖仓库文件）
 *
 * 退出码：0=全部通过（或仅有 SKIP）；1=任一 contract 失败（机械失败，供 CI 门禁）。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const results = []

function ok(message) {
  results.push({ level: 'ok', message })
  console.log(`[mobile-scheme] ✓ ${message}`)
}
function warn(message) {
  results.push({ level: 'warn', message })
  console.warn(`[mobile-scheme] ⚠ ${message}`)
}
function fail(message) {
  results.push({ level: 'fail', message })
  console.error(`[mobile-scheme] ✗ ${message}`)
}

/** 读取 JSON 配置文件（缺失返回 null） */
function readJson(relPath) {
  const full = path.join(repoRoot, relPath)
  if (!fs.existsSync(full)) return null
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch (err) {
    fail(`无法解析 ${relPath}：${err.message}`)
    return null
  }
}

/**
 * 提取 AndroidManifest.xml 中“未限定 host”的 scheme 注册（tauri-plugin-deep-link 注入形态）。
 *
 * tauri-plugin-deep-link 的 build.rs 在 Android cargo 构建时注入：
 *   <data android:scheme="minihbut" />
 * （无 host —— 官方文档：mobile custom scheme 配置要 omit the host）。
 * host 限定的注册（如小组件遗留的 <data android:scheme="minihbut" android:host="schedule" />）
 * 不能匹配 `minihbut://identity`，因此不作为 contract 证据。
 *
 * @returns {string[]} 无 host 限定的 scheme 列表（去重、保序）
 */
export function extractUnhostedManifestSchemes(xml) {
  const schemes = []
  const seen = new Set()
  // 匹配 <data .../> 与 <data ...>...</data> 两种写法，属性顺序任意
  const dataTagRe = /<data\b([^>]*)\/?>/g
  for (const match of xml.matchAll(dataTagRe)) {
    const attrs = match[1] ?? ''
    if (/\bandroid:host\s*=/.test(attrs)) continue // host 限定 → 不是 identity 深链入口
    const schemeMatch = attrs.match(/android:scheme\s*=\s*"([^"]+)"/)
    if (schemeMatch) {
      for (const s of schemeMatch[1].split(/\s+/)) {
        if (s && !seen.has(s)) {
          seen.add(s)
          schemes.push(s)
        }
      }
    }
  }
  return schemes
}

/** 兼容旧名：提取全部 scheme 属性值（含 host 限定），供自测对比 */
export function extractManifestSchemes(xml) {
  const schemes = []
  const seen = new Set()
  const dataTagRe = /<data\b([^>]*)\/?>/g
  for (const match of xml.matchAll(dataTagRe)) {
    const attrs = match[1] ?? ''
    const schemeMatch = attrs.match(/android:scheme\s*=\s*"([^"]+)"/)
    if (schemeMatch) {
      for (const s of schemeMatch[1].split(/\s+/)) {
        if (s && !seen.has(s)) {
          seen.add(s)
          schemes.push(s)
        }
      }
    }
  }
  return schemes
}

/** 检查静态 source-of-truth 配置（本地可验证，任何环境都必须过） */
function checkStaticConfig() {
  console.log('\n== 静态配置检查（source of truth，必须全部通过） ==')

  const tauriConf = readJson('src-tauri/tauri.conf.json')
  if (!tauriConf) return
  const deepLink = tauriConf.plugins?.deepLink ?? tauriConf.plugins?.['deep-link']
  if (!deepLink) {
    fail('tauri.conf.json 缺少 plugins.deep-link 配置（#621 深链配置被删除）')
    return
  }
  const desktopSchemes = deepLink.desktop?.schemes ?? []
  if (Array.isArray(desktopSchemes) && desktopSchemes.includes('minihbut')) {
    ok('tauri.conf.json plugins.deep-link.desktop.schemes 包含 minihbut')
  } else {
    fail(`tauri.conf.json desktop schemes 缺少 minihbut：${JSON.stringify(desktopSchemes)}`)
  }
  const mobile = deepLink.mobile ?? []
  const mobileOk = Array.isArray(mobile) && mobile.some((m) =>
    (Array.isArray(m?.scheme) ? m.scheme : [m?.scheme]).includes('minihbut'),
  )
  if (mobileOk) {
    ok('tauri.conf.json plugins.deep-link.mobile 包含 minihbut scheme')
  } else {
    fail(`tauri.conf.json mobile schemes 缺少 minihbut：${JSON.stringify(mobile)}`)
  }

  const cargo = fs.existsSync('src-tauri/Cargo.toml') ? fs.readFileSync('src-tauri/Cargo.toml', 'utf8') : ''
  if (cargo.includes('tauri-plugin-deep-link')) {
    ok('src-tauri/Cargo.toml 声明 tauri-plugin-deep-link')
  } else {
    fail('src-tauri/Cargo.toml 缺少 tauri-plugin-deep-link（深链插件被移除）')
  }
  if (cargo.includes('tauri-plugin-single-instance')) {
    ok('src-tauri/Cargo.toml 声明 tauri-plugin-single-instance（单实例转发深链）')
  } else {
    fail('src-tauri/Cargo.toml 缺少 tauri-plugin-single-instance（#621 依赖）')
  }

  const pkg = readJson('package.json')
  const jsDepOk = pkg?.dependencies?.['@tauri-apps/plugin-deep-link']
    || pkg?.devDependencies?.['@tauri-apps/plugin-deep-link']
  if (jsDepOk) {
    ok('package.json 声明 @tauri-apps/plugin-deep-link（JS 侧监听）')
  } else {
    fail('package.json 缺少 @tauri-apps/plugin-deep-link（JS 侧监听缺失）')
  }

  const capability = fs.existsSync('src-tauri/capabilities/main.json')
    ? fs.readFileSync('src-tauri/capabilities/main.json', 'utf8')
    : ''
  if (capability.includes('deep-link:default')) {
    ok('src-tauri/capabilities/main.json 包含 deep-link:default 权限')
  } else {
    fail('src-tauri/capabilities/main.json 缺少 deep-link:default 权限')
  }

  // 插件注册顺序 contract：single-instance 必须早于 deep-link 注册（#621）
  const lib = fs.existsSync('src-tauri/src/lib.rs') ? fs.readFileSync('src-tauri/src/lib.rs', 'utf8') : ''
  const siPos = lib.indexOf('tauri_plugin_single_instance::init')
  const dlPos = lib.indexOf('tauri_plugin_deep_link::init')
  if (siPos >= 0 && dlPos >= 0 && siPos < dlPos) {
    ok('lib.rs 插件顺序：single-instance 注册先于 deep-link（Windows/Linux 转发契约）')
  } else {
    fail(`lib.rs 插件顺序异常（single_instance=${siPos}, deep_link=${dlPos}）`)
  }
  if (lib.includes('register_all')) {
    ok('lib.rs 存在 deep-link register_all()（Windows debug / Linux 注册）')
  } else {
    fail('lib.rs 缺少 deep-link register_all()（Windows dev 模式无法注册 scheme）')
  }

  const deepLinkTs = fs.existsSync('src/platform/deep_link.ts')
    ? fs.readFileSync('src/platform/deep_link.ts', 'utf8')
    : ''
  if (deepLinkTs.includes('parseMiniHbutDeepLink') && deepLinkTs.includes('onOpenUrl')) {
    ok('src/platform/deep_link.ts 提供统一 parser + onOpenUrl 监听')
  } else {
    fail('src/platform/deep_link.ts 缺失 parseMiniHbutDeepLink/onOpenUrl 统一层（#621 契约）')
  }
}

/** 检查生成工程（gen/android、gen/ios 存在时；Windows 本地无法生成 iOS） */
function checkGeneratedProjects(skipGen) {
  console.log('\n== 生成工程检查（移动端 contract；CI 重新生成后必须通过） ==')
  if (skipGen) {
    warn('--skip-gen：跳过 gen 产物检查（移动工程尚未生成时的早期阶段使用）')
    return
  }

  const androidManifest = 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'
  if (fs.existsSync(androidManifest)) {
    const xml = fs.readFileSync(androidManifest, 'utf8')
    const unhosted = extractUnhostedManifestSchemes(xml)
    if (unhosted.includes('minihbut')) {
      ok(`gen/android AndroidManifest.xml 声明无 host 的 minihbut scheme（tauri deep-link 注入形态）`)
    } else {
      const all = extractManifestSchemes(xml)
      fail(
        `gen/android AndroidManifest.xml 缺少无 host 的 minihbut scheme。` +
          (all.includes('minihbut')
            ? '现有 minihbut 注册是 host 限定（如 host=schedule），无法匹配 `minihbut://identity`。'
            : `现有 schemes：${all.join(', ') || '无'}。`) +
          'tauri-plugin-deep-link 的 build.rs 在 Android cargo 构建时注入无 host 的 ' +
          '<data android:scheme="minihbut" />；请在 CI/android 构建环境执行 `npx tauri android build` ' +
          '（构建即注入，无需手改 gen 目录），随后再次运行本守卫。',
      )
    }
  } else {
    warn('src-tauri/gen/android 不存在：Android 工程尚未生成（CI android 构建后本项自然生效）')
  }

  if (fs.existsSync('src-tauri/gen/ios')) {
    const plists = []
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (e.name === 'Info.plist') plists.push(full)
      }
    }
    walk('src-tauri/gen/ios')
    let found = false
    for (const plist of plists) {
      const text = fs.readFileSync(plist, 'utf8')
      if (text.includes('minihbut') && text.includes('CFBundleURLSchemes')) {
        found = true
        ok(`gen/ios ${path.relative(repoRoot, plist)} 声明 minihbut URL scheme`)
      }
    }
    if (!found) fail('gen/ios Info.plist 未找到 minihbut CFBundleURLSchemes')
  } else {
    warn(
      'src-tauri/gen/ios 不存在：iOS 工程只能在 macOS/Xcode 生成（Windows 无法本地生成）。' +
        'macOS CI（ios-testflight.yml）生成后必须再次运行本守卫。',
    )
  }
}

/** 内嵌自测：不依赖仓库文件验证解析逻辑 */
function selfTest() {
  console.log('\n== 内嵌自测（fixture） ==')
  const fixture = `
    <manifest>
      <application>
        <activity>
          <intent-filter>
            <action android:name="android.intent.action.MAIN" />
          </intent-filter>
          <!-- tauri-plugin-deep-link build.rs 注入：无 host -->
          <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <data android:scheme="minihbut" />
          </intent-filter>
          <!-- 小组件遗留：host 限定，不应算 identity 深链入口 -->
          <intent-filter>
            <data android:host="schedule" android:scheme="minihbut" />
          </intent-filter>
          <data android:scheme="https" android:host="example.com" />
        </activity>
      </application>
    </manifest>`
  const unhosted = extractUnhostedManifestSchemes(fixture)
  if (unhosted.includes('minihbut')) {
    ok(`extractUnhostedManifestSchemes 识别无 host minihbut（${unhosted.join(', ')}）`)
  } else {
    fail(`extractUnhostedManifestSchemes 未识别无 host minihbut：${unhosted.join(', ')}`)
  }
  const all = extractManifestSchemes(fixture)
  if (all.includes('minihbut') && all.includes('https')) {
    ok(`extractManifestSchemes 识别全部 scheme（${all.join(', ')}）`)
  } else {
    fail(`extractManifestSchemes 解析异常：${all.join(', ')}`)
  }
  const noData = extractUnhostedManifestSchemes('<manifest><application/></manifest>')
  if (noData.length === 0) ok('无 <data> 元素时返回空数组（不误报）')
  else fail(`无 <data> 元素时应返回空数组：${noData.join(', ')}`)
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--self-test')) {
    selfTest()
    const failed = results.filter((r) => r.level === 'fail').length
    console.log(`\n[mobile-scheme] 自测完成：${results.length - failed} 通过 / ${failed} 失败`)
    process.exit(failed === 0 ? 0 : 1)
  }
  checkStaticConfig()
  checkGeneratedProjects(args.includes('--skip-gen'))
  const failed = results.filter((r) => r.level === 'fail').length
  console.log(`\n[mobile-scheme] 结果：${results.filter((r) => r.level === 'ok').length} 通过 / ${failed} 失败` +
    ` / ${results.filter((r) => r.level === 'warn').length} 警告`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
