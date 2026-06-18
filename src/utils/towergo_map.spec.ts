import { describe, expect, it } from 'vitest'
import {
  HBUT_LOCATION,
  createServiceAreaScanPoints,
  dedupeVehicles,
  distanceMeters,
  isPointInPolygon,
  normalizePoint,
  normalizeVehicles,
  resolveTowerGoLocation
} from './towergo_map'

describe('towergo map utilities', () => {
  it('normalizes common point shapes and keeps HBUT as the fallback location', async () => {
    expect(HBUT_LOCATION).toMatchObject({ name: '湖北工业大学', latitude: 30.4819, longitude: 114.313 })
    expect(normalizePoint([114.313, 30.4819])).toEqual({ latitude: 30.4819, longitude: 114.313 })
    expect(normalizePoint({ lat: '30.48', lng: '114.31' })).toEqual({ latitude: 30.48, longitude: 114.31 })

    const fallback = await resolveTowerGoLocation({
      geolocation: undefined,
      fallback: HBUT_LOCATION
    })
    expect(fallback).toEqual({ ...HBUT_LOCATION, source: 'fallback' })
  })

  it('falls back when geolocation throws synchronously', async () => {
    const fallback = await resolveTowerGoLocation({
      geolocation: {
        getCurrentPosition: () => {
          throw new Error('permission bridge unavailable')
        }
      } as unknown as Geolocation,
      fallback: HBUT_LOCATION
    })

    expect(fallback).toEqual({ ...HBUT_LOCATION, source: 'fallback' })
  })

  it('detects points inside service polygons and generates bounded scan points', () => {
    const polygon = [
      { latitude: 30.48, longitude: 114.31 },
      { latitude: 30.48, longitude: 114.316 },
      { latitude: 30.486, longitude: 114.316 },
      { latitude: 30.486, longitude: 114.31 }
    ]
    expect(isPointInPolygon({ latitude: 30.482, longitude: 114.313 }, polygon)).toBe(true)
    expect(isPointInPolygon({ latitude: 30.49, longitude: 114.313 }, polygon)).toBe(false)

    const points = createServiceAreaScanPoints({
      serviceData: { points: polygon, centerLat: 30.483, centerLng: 114.313 },
      origin: HBUT_LOCATION,
      spacingMeters: 250
    })
    expect(points.length).toBeGreaterThan(4)
    expect(points[0]).toMatchObject({ latitude: HBUT_LOCATION.latitude, longitude: HBUT_LOCATION.longitude })
    expect(points.every((point) => (
      Math.abs(point.latitude - HBUT_LOCATION.latitude) < 0.02 &&
      Math.abs(point.longitude - HBUT_LOCATION.longitude) < 0.02
    ))).toBe(true)
  })

  it('normalizes vehicles, removes duplicates and sorts by nearest distance', () => {
    const source = {
      list: [
        { carId: 'A', lat: 30.482, lng: 114.313, restBattery: 70 },
        { carId: 'B', lat: 30.49, lng: 114.313, restBattery: 30 },
        { carId: 'A', lat: 30.48195, lng: 114.313, restBattery: 80 }
      ]
    }
    const normalized = normalizeVehicles(source, HBUT_LOCATION)
    const deduped = dedupeVehicles(normalized, HBUT_LOCATION)

    expect(distanceMeters(30.4819, 114.313, 30.482, 114.313)).toBeLessThan(20)
    expect(deduped.map((item) => item.id)).toEqual(['A', 'B'])
    expect(deduped[0].battery).toBe(80)
    expect(deduped[0].distance).toBeLessThan(deduped[1].distance)
  })
})
