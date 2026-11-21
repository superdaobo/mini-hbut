import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

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
const towerGoSources = () =>
  read('src/components/TowerGoView.vue') + '\n' + readTree('src/features/towergo', /\.(?:ts|vue)$/)

describe('towergo bridge and location permission contract', () => {
  it('#370 writes location to debug log and keeps map container exclusive', () => {
    const mapUtil = read('src/utils/towergo_map.ts')
    const view = towerGoSources()
    const geo = read('src/composables/useGeolocation.ts')
    const guideLoc = read('src/features/campus-guide/services/location-service.ts')
    expect(mapUtil).toContain('pushDebugLog')
    expect(mapUtil).toContain('coerceChinaLatLng')
    expect(mapUtil).toContain('carLat')
    expect(mapUtil).toContain('wgs84ToGcj02')
    expect(mapUtil).toContain('batteryLevelTier')
    expect(view).toContain('ensureUserLocationMarker')
    expect(view).toContain('map-fallback--overlay')
    expect(view).toContain('svgToDataUrl')
    expect(view).toContain('fetchNearBikesAtCenter')
    expect(view).toContain('officialVehiclePinSvg')
    // 地图节点必须自闭合独占，fallback 作为兄弟节点
    expect(view).toMatch(/ref="mapContainerRef" class="tg-map tg-map--fs"\s*\/>/)
    expect(geo).toContain("pushDebugLog('Geo'")
    expect(guideLoc).toContain("pushDebugLog(")
    expect(guideLoc).toContain('CampusGuide')
  })

  it('keeps the TowerGo proxy isolated from the main Mini-HBUT /api bridge', () => {
    const vite = read('vite.config.ts')
    const bridge =
      read('src-tauri/src/http_server/routes/proxy.rs') +
      '\n' +
      read('src-tauri/src/http_server/mod.rs')

    expect(vite).toContain("'/towergo'")
    expect(vite).toContain("target: 'http://127.0.0.1:4399'")
    expect(bridge).toContain('.route("/towergo/*path", any(towergo_proxy))')
    expect(bridge).toContain('const TOWERGO_TARGET_BASE: &str = "https://ebike-oper.chinatowercom.cn";')
    expect(bridge).toContain('towergo_sanitize_request_headers')
    // #1368：Bridge 默认全平台启用；HBUT_HTTP_BRIDGE_ENABLED 仅作排障开关（0/false 关，1/true 开）
    expect(bridge).toContain('HBUT_HTTP_BRIDGE_ENABLED')
    expect(bridge).toContain('bridge_enabled_from_env')
  })

  it('declares Android location permissions; iOS App Store candidate omits location usage string', () => {
    // #1370：真实发布 APK 由 Tauri 构建（src-tauri/gen/android/ 不入库），定位权限由 CI
    // 注入脚本写入清单。旧 Capacitor 工程 android/app/src/main/AndroidManifest.xml 不
    // 参与发布，断言它会假阳性——改为断言"注入脚本正确 + CI 确实挂载了它"。
    const patchScript = read('scripts/patch_android_location_permission.py')
    const workflow = read('../../.github/workflows/release.yml')
    const iosPlist = read('ios/App/App/Info.plist')
    const policy = read('src/config/app_store_policy.ts')

    // 注入脚本必须指向真实打包工程清单，且包含两条定位权限
    expect(patchScript).toContain('gen/android/app/src/main/AndroidManifest.xml')
    expect(patchScript).toContain('android.permission.ACCESS_FINE_LOCATION')
    expect(patchScript).toContain('android.permission.ACCESS_COARSE_LOCATION')
    // CI 必须在 tauri android init 之后调用注入脚本（init 之前 gen 尚不存在）
    const initIdx = workflow.indexOf('npm run tauri android init')
    const patchIdx = workflow.indexOf('patch_android_location_permission.py')
    expect(initIdx).toBeGreaterThan(-1)
    expect(patchIdx).toBeGreaterThan(initIdx)
    // iOS 1.4.3 App Store 候选：不声明定位（小塔在合规构建中关闭）
    expect(iosPlist).not.toContain('NSLocationWhenInUseUsageDescription')
    expect(policy).toContain('liveMobilityLocation')
    expect(policy).toContain("towergo")
  })
})
