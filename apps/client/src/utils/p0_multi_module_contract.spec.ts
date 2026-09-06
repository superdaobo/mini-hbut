import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CENTER_FETCH_DEBOUNCE_MS,
  SCAN_CONCURRENCY,
  SCAN_MAX_POINTS,
  SCAN_REFRESH_INTERVAL_MS,
  batteryLevelTier
} from './towergo_map'
import { resolveCampusGuideBaseUrl, CAMPUS_GUIDE_CONFIG } from '../features/campus-guide/config'
import { resolveInsideScenic } from '../features/campus-guide/services/location-service'
import type { GeoPoint } from '../features/campus-guide/types'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')
const readTree = (relativePath: string, extensionPattern: RegExp) => {
  const root = path.join(process.cwd(), relativePath)
  if (!existsSync(root)) return ''
  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile() && extensionPattern.test(entry.name)) files.push(absolute)
    }
  }
  walk(root)
  return files.sort().map((file) => readFileSync(file, 'utf8')).join('\n')
}
const appSources = () => read('src/App.vue') + '\n' + readTree('src/app', /\.(?:ts|vue)$/)
const towerGoSources = () =>
  read('src/components/TowerGoView.vue') + '\n' + readTree('src/features/towergo', /\.(?:ts|vue)$/)

describe('P0 multi-module contracts', () => {
  it('#490 TowerGo defaults to center single-fetch (no multi-point grid main path)', () => {
    // 主路径常量：单次拉车
    expect(SCAN_CONCURRENCY).toBe(1)
    expect(SCAN_MAX_POINTS).toBe(1)
    expect(CENTER_FETCH_DEBOUNCE_MS).toBeGreaterThan(0)
    expect(SCAN_REFRESH_INTERVAL_MS).toBeGreaterThan(60_000)
    expect(batteryLevelTier(66)).toBe(70)
    expect(batteryLevelTier(0)).toBe(0)

    const vue = towerGoSources()
    expect(vue).toContain('fetchNearBikesAtCenter')
    expect(vue).toContain('refreshVehiclesAtMapCenter')
    expect(vue).not.toContain('createServiceAreaScanPoints')
    expect(vue).not.toContain('runScanPoints')
  })

  it('tears down TowerGo runtime on unmount', () => {
    const vue = towerGoSources()
    expect(vue).toContain('teardownTowerGoRuntime')
    expect(vue).toContain('activeScanToken += 1')
    expect(vue).toContain('SCAN_REFRESH_INTERVAL_MS')
    expect(vue).not.toContain('全区扫描')
  })

  it('uses battery-tier MarkerStyle for vehicle and user markers', () => {
    const vue = towerGoSources()
    expect(vue).toContain('buildTowerGoMarkerStyles')
    expect(vue).toContain('MarkerStyle')
    expect(vue).toContain('appleUserDotSvg')
    expect(vue).toContain('officialVehiclePinSvg')
    expect(vue).toContain('vehicleStyleId')
    expect(vue).toContain("styleId: 'user'")
  })

  it('keeps favicon and app-icon SVG under 80KB after slim', () => {
    const fav = read('public/favicon.svg')
    const app = read('src/assets/app-icon.svg')
    expect(Buffer.byteLength(fav, 'utf8')).toBeLessThan(80 * 1024)
    expect(Buffer.byteLength(app, 'utf8')).toBeLessThan(80 * 1024)
    expect(fav).toContain('viewBox="0 0 256 256"')
  })

  it('documents multi-platform size gate and rust size assessment', () => {
    const sizeDoc = read('../../docs/release-size-baseline.md')
    const rustDoc = read('../../docs/rust-install-size-assessment.md')
    expect(sizeDoc).toContain('report_release_asset_sizes.mjs')
    expect(sizeDoc).toContain('> 5%')
    expect(sizeDoc).toContain('APK')
    expect(rustDoc).toContain('strip')
    expect(rustDoc).toContain('LTO')
  })

  it('does not use loopback campus-guide base on Android tauri path', () => {
    const config = read('src/features/campus-guide/config.ts')
    expect(config).toContain('isLikelyAndroidUserAgent')
    expect(config).toContain('VITE_CAMPUS_GUIDE_HTTPS_BASE')
    expect(config).toContain('// Android：绝不走 loopback')
    // production Android must not hard-require 127.0.0.1
    expect(config).toMatch(/if \(isLikelyAndroidUserAgent\(\)\) \{[\s\S]*?return CAMPUS_GUIDE_CONFIG\.apiBase/)
    // iOS still may use local bridge
    expect(config).toContain("localBridgeBaseUrl: 'http://127.0.0.1:4399/campus-guide'")
    expect(CAMPUS_GUIDE_CONFIG.localBridgeBaseUrl).toContain('127.0.0.1')
    // default resolve without tauri → relative
    expect(resolveCampusGuideBaseUrl()).toBe('/campus-guide')
  })

  it('treats near-campus / low-accuracy points as inside scenic to avoid false off-campus', () => {
    const aoi: GeoPoint[][] = [[
      { latitude: 30.48, longitude: 114.31 },
      { latitude: 30.48, longitude: 114.316 },
      { latitude: 30.486, longitude: 114.316 },
      { latitude: 30.486, longitude: 114.31 }
    ]]
    // clearly inside
    expect(resolveInsideScenic({ latitude: 30.482, longitude: 114.313 }, aoi)).toBe(true)
    // far away high accuracy → outside
    expect(
      resolveInsideScenic({ latitude: 31.2, longitude: 121.5, accuracy: 20 }, aoi)
    ).toBe(false)
    // near campus center but outside polygon, accuracy ok → still inside bias
    expect(
      resolveInsideScenic({ latitude: 30.490, longitude: 114.320, accuracy: 30 }, aoi)
    ).toBe(true)
    // poor accuracy outside polygon → inside bias
    expect(
      resolveInsideScenic({ latitude: 30.495, longitude: 114.325, accuracy: 200 }, aoi)
    ).toBe(true)
  })

  it('wires dark-mode POI contrast overrides', () => {
    const dark = read('src/styles/dark-mode.css')
    expect(dark).toContain('html.dark .campus-poi-card')
    expect(dark).toContain('html.dark .campus-poi-head h3')
    expect(dark).toContain('color: #f8fafc')
  })

  it('recovers embed bridge on app resume', () => {
    const app = appSources()
    const embed = read('src/utils/school_website_embed.ts')
    const school = read('src/components/SchoolWebsiteView.vue')
    const more = read('src/components/MoreModuleHostView.vue')

    expect(app).toContain('recoverEmbeddedWebAfterResume')
    expect(app).toContain('hbu-embed-resume')
    expect(app).toContain('recoverSchoolWebsiteBridgeOnResume')
    expect(embed).toContain('recoverSchoolWebsiteBridgeOnResume')
    expect(embed).toContain('/health')
    expect(school).toContain('remountAfterResume')
    expect(school).toContain('hbu-embed-resume')
    // #794 文案 t() 化后锚点同步更新为 i18n key
    expect(school).toContain("t('web.retry')")
    expect(more).toContain('hbu-embed-resume')
    expect(more).toContain('reloadFrame')
  })

  it('hardens resume against reload loops (#451)', () => {
    const app = appSources()
    expect(app).toContain('IOS_RESUME_SOFT_REMOUNT_MS')
    expect(app).toContain('IOS_RESUME_HARD_RELOAD_MS')
    expect(app).toContain('IOS_HARD_RELOAD_MAX_PER_SESSION')
    expect(app).toContain('maybeHardReloadAfterResume')
    expect(app).toContain('iosHardReloadCount')
    expect(app).toContain('SOFT_REMOUNT_MIN_INTERVAL_MS')
    // 3 分钟旧阈值与无节流硬 reload 不应再出现
    expect(app).not.toContain('IOS_RESUME_RELOAD_MS')
    expect(app).toContain('allowHardReload')
    // 健康检查更保守
    expect(app).toContain('v-leave-active')
    expect(app).toContain('getBoundingClientRect')
  })

  it('exposes ensure_http_bridge API for lifecycle resume (#452)', () => {
    const httpServer = read('src-tauri/src/http_server/mod.rs')
    const lib = read('src-tauri/src/lib.rs')
    const docs = read('src-tauri/docs/http_server.md')

    expect(httpServer).toContain('pub fn is_http_bridge_enabled')
    expect(httpServer).toContain('pub async fn ensure_http_bridge')
    expect(httpServer).toContain('pub async fn probe_http_bridge_health')
    expect(httpServer).toContain('EnsureHttpBridgeResult')
    expect(httpServer).toContain('respawned')
    expect(httpServer).toContain('with_graceful_shutdown')
    expect(lib).toContain('http_server::ensure_http_bridge')
    expect(docs).toContain('平台启停矩阵')
    expect(docs).toContain('Android')
    expect(docs).toContain('iOS')
    expect(docs).toContain('ensure_http_bridge')
  })

  it('iOS CI injects bridge feature via the only effective channel: tauri-cli-options-server (#778)', () => {
    // #778 回归根因：xcodebuild → tauri-cli xcode-script 的 cargo features 唯一来源是
    // tools/ci/tauri-cli-options-server.cjs；CARGO_BUILD_FEATURES 非 Cargo 变量、
    // tauri.conf.json build.features 只影响 tauri build 路径。任何一处漏掉 bridge
    // 都会让 iOS Release 包整体裁掉 http_server（v1.4.7-v1.4.9 小游戏白屏/官网降级）。
    const optionsServer = read('../../tools/ci/tauri-cli-options-server.cjs')
    expect(optionsServer).toContain("'mobile-slim'")
    expect(optionsServer).toContain("'bridge'")
    // args 与 features 必须同集（防一处改一处漏）
    expect(optionsServer).toContain('custom-protocol,mobile-slim,bridge')

    // workflow 中两处文档化注入点保持同集（防未来有人只改其一）
    const workflow = read('../../.github/workflows/ios-testflight.yml')
    expect(workflow).toContain('CARGO_BUILD_FEATURES: "mobile-slim,bridge"')
    expect(workflow).toContain("conf.build.features = ['mobile-slim', 'bridge']")

    // bridge feature 必须仍挂在 http_server 模块门控上（裁剪机制本身不能被移除检测）
    const lib = read('src-tauri/src/lib.rs')
    expect(lib).toMatch(/\#\[cfg\(feature = "bridge"\)\]\s*\npub mod http_server;/)
  })

  it('wires ensure-then-remount embed resume path (#453)', () => {
    const app = appSources()
    const embed = read('src/utils/school_website_embed.ts')
    const school = read('src/components/SchoolWebsiteView.vue')
    const more = read('src/components/MoreModuleHostView.vue')

    expect(embed).toContain('invokeEnsureHttpBridge')
    expect(embed).toContain('ensure_http_bridge')
    expect(embed).toContain('recoverSchoolWebsiteBridgeOnResume')
    expect(app).toContain('invokeEnsureHttpBridge')
    expect(app).toContain('forceFallback')
    expect(school).toContain('recoverSchoolWebsiteBridgeOnResume')
    expect(school).toContain('forceFallback')
    // Android 不误导为 HTTP 桥
    expect(school).toContain("t('web.error.embedUnavailable')")
    expect(more).toContain('recoverSchoolWebsiteBridgeOnResume')
    expect(more).toContain('tryCapacitorLocalFallback')
    expect(more).toContain('模块本地服务暂时不可用')
  })
})
