import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('./TowerGoView.vue', import.meta.url), 'utf8')

describe('TowerGoView simplified contract', () => {
  it('no longer contains login, ride-control, or order-processing sections', () => {
    const vue = source()

    // Should NOT contain any of the removed features
    expect(vue).not.toContain('登录小塔出行')
    expect(vue).not.toContain('handleReturnBike')
    expect(vue).not.toContain('handleFreezeOrder')
    expect(vue).not.toContain('handlePayCloseOrder')
    expect(vue).not.toContain('confirmRealAction')
    expect(vue).not.toContain('扫码用车')
    expect(vue).not.toContain('骑行控制')
    expect(vue).not.toContain('订单处理')
    expect(vue).not.toContain('寻车铃')
  })

  it('uses center single-fetch (not grid scan) with region end + battery icons', () => {
    const vue = source()

    expect(vue).toContain('定位')
    expect(vue).toContain('刷新视野')
    // #490：地图中心单次 eBikeLocation
    expect(vue).toContain('fetchNearBikesAtCenter')
    expect(vue).toContain('refreshVehiclesAtMapCenter')
    expect(vue).toContain('readMapCenter')
    expect(vue).toContain('bindMapRegionChange')
    expect(vue).toContain('CENTER_FETCH_DEBOUNCE_MS')
    expect(vue).toContain('getNearBike')
    expect(vue).toContain('loadMapData')
    expect(vue).toContain('renderVehicleMarkers')
    expect(vue).toContain('selectVehicle')
    expect(vue).toContain('teardownTowerGoRuntime')
    expect(vue).toContain('SCAN_REFRESH_INTERVAL_MS')
    expect(vue).toContain('activeScanToken += 1')
    expect(vue).toContain('startNavigateToSelected')
    expect(vue).toContain('fetchWalkingRoute')
    expect(vue).toContain('watchPosition')
    expect(vue).toContain('towergo-view--fullscreen')
    expect(vue).toContain('handleBack')
    // fixed + 超高 z-index，避免 GL 吞点击
    expect(vue).toContain('position: fixed')
    expect(vue).toContain('z-index: 2147483000')
    expect(vue).toContain('tg-back-btn')
    // 对齐小程序 region end：仅 dragend/zoomend/idle，禁止网格主路径
    expect(vue).toContain("'dragend'")
    expect(vue).toContain("'zoomend'")
    expect(vue).not.toContain('createServiceAreaScanPoints')
    expect(vue).not.toContain('scanViewportVehicles')
    expect(vue).not.toContain('scannedCellKeys')
    expect(vue).not.toContain('runScanPoints')
    expect(vue).not.toContain('SCAN_MAX_POINTS')
    expect(vue).not.toContain('bounds_changed')
    expect(vue).not.toContain('center_changed')
    expect(vue).toContain("@pointerdown.stop.prevent=\"handleBack\"")
    // 电量档官方风格 marker
    expect(vue).toContain('buildTowerGoMarkerStyles')
    expect(vue).toContain('MarkerStyle')
    expect(vue).toContain('officialVehiclePinSvg')
    expect(vue).toContain('batteryLevelTier')
    expect(vue).toContain('vehicleStyleId')
    expect(vue).toContain('BATTERY_ICON_TIERS')
    expect(vue).toContain('appleUserDotSvg')
    expect(vue).toMatch(/onBeforeUnmount\(\(\) => \{\s*teardownTowerGoRuntime\(\)/)
  })

  it('shows more than 8 vehicles in the list', () => {
    const vue = source()

    // The old limit was .slice(0, 8) — now it should be higher (e.g. 50)
    expect(vue).toContain('.slice(0, 50)')
    expect(vue).not.toContain('.slice(0, 8)')
  })

  it('keeps the map fallback usable on short viewports', () => {
    const vue = source()

    expect(vue).toContain('max-height: 480px')
    expect(vue).toContain('overflow-y: auto')
  })
})
