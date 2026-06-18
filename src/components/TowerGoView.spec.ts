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

  it('keeps map, location, and full-area scan functionality', () => {
    const vue = source()

    expect(vue).toContain('系统定位')
    expect(vue).toContain('全区扫描')
    expect(vue).toContain('loadMapData')
    expect(vue).toContain('renderVehicleMarkers')
    expect(vue).toContain('selectVehicle')
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
