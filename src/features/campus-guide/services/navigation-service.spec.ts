import { describe, expect, it } from 'vitest'
import { CAMPUS_GUIDE_CONFIG } from '../config'
import {
  buildTencentWalkRouteUrl,
  isValidGeoPoint,
  openExternalMapNavigation,
  resolveNavEndPoint
} from './navigation-service'

describe('campus guide navigation service', () => {
  it('resolves end point from spot fields with fallbacks', () => {
    const fromPoint = resolveNavEndPoint({
      spot_id: 1,
      name: '图书馆',
      point: { latitude: 30.48, longitude: 114.31 }
    })
    expect(fromPoint).toEqual({ latitude: 30.48, longitude: 114.31 })

    const fromLatLng = resolveNavEndPoint({
      spot_id: 2,
      name: '南门',
      latitude: 30.49,
      longitude: 114.32
    })
    expect(fromLatLng).toEqual({ latitude: 30.49, longitude: 114.32 })
  })

  it('rejects invalid geo points', () => {
    expect(isValidGeoPoint({ latitude: 91, longitude: 114.31 })).toBe(false)
    expect(isValidGeoPoint({ latitude: 30.48, longitude: Number.NaN })).toBe(false)
    expect(resolveNavEndPoint({ spot_id: 3, name: '无效点' })).toBeNull()
  })

  it('builds tencent walk url with encoded chinese name and referer key', () => {
    const url = buildTencentWalkRouteUrl(
      { latitude: 30.48, longitude: 114.31 },
      '图书馆'
    )
    expect(url).toContain('to=' + encodeURIComponent('图书馆'))
    expect(url).toContain('tocoord=30.48,114.31')
    expect(url).toContain('referer=' + encodeURIComponent(CAMPUS_GUIDE_CONFIG.qqMapKey))
  })

  it('includes fromcoord when start point is valid', () => {
    const url = buildTencentWalkRouteUrl(
      { latitude: 30.48, longitude: 114.31 },
      '图书馆',
      { latitude: 30.47, longitude: 114.3 }
    )
    expect(url).toContain('fromcoord=30.47,114.3')
  })

  it('returns null url for invalid end coordinates', () => {
    expect(
      buildTencentWalkRouteUrl({ latitude: Number.NaN, longitude: 114.31 }, '图书馆')
    ).toBeNull()
  })

  it('openExternalMapNavigation returns false for invalid end', async () => {
    await expect(
      openExternalMapNavigation({ latitude: 999, longitude: 114.31 }, '图书馆')
    ).resolves.toBe(false)
  })
})
