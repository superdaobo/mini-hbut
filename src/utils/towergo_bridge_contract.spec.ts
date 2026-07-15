import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('towergo bridge and location permission contract', () => {
  it('#370 writes location to debug log and keeps map container exclusive', () => {
    const mapUtil = read('src/utils/towergo_map.ts')
    const view = read('src/components/TowerGoView.vue')
    const geo = read('src/composables/useGeolocation.ts')
    const guideLoc = read('src/features/campus-guide/services/location-service.ts')
    expect(mapUtil).toContain('pushDebugLog')
    expect(mapUtil).toContain('coerceChinaLatLng')
    expect(mapUtil).toContain('carLat')
    expect(view).toContain('ensureUserLocationMarker')
    expect(view).toContain('map-fallback--overlay')
    expect(view).toContain('svgToDataUrl')
    // 地图节点必须自闭合独占，fallback 作为兄弟节点
    expect(view).toMatch(/ref="mapContainerRef" class="tg-map tg-map--fs"\s*\/>/)
    expect(geo).toContain("pushDebugLog('Geo'")
    expect(guideLoc).toContain("pushDebugLog(")
    expect(guideLoc).toContain('CampusGuide')
  })

  it('keeps the TowerGo proxy isolated from the main Mini-HBUT /api bridge', () => {
    const vite = read('vite.config.ts')
    const bridge = read('src-tauri/src/http_server.rs')

    expect(vite).toContain("'/towergo'")
    expect(vite).toContain("target: 'http://127.0.0.1:4399'")
    expect(bridge).toContain('.route("/towergo/*path", any(towergo_proxy))')
    expect(bridge).toContain('const TOWERGO_TARGET_BASE: &str = "https://ebike-oper.chinatowercom.cn";')
    expect(bridge).toContain('towergo_sanitize_request_headers')
    expect(bridge).toContain('cfg!(target_os = "ios")')
    expect(bridge).toContain('HBUT_HTTP_BRIDGE_ENABLED')
  })

  it('declares platform location permissions so geolocation can request the system prompt', () => {
    const androidManifest = read('android/app/src/main/AndroidManifest.xml')
    const iosPlist = read('ios/App/App/Info.plist')

    expect(androidManifest).toContain('android.permission.ACCESS_FINE_LOCATION')
    expect(androidManifest).toContain('android.permission.ACCESS_COARSE_LOCATION')
    expect(iosPlist).toContain('NSLocationWhenInUseUsageDescription')
    expect(iosPlist).toContain('小塔出行')
  })
})
