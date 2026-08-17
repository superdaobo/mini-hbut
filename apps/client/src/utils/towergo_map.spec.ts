import { describe, expect, it } from 'vitest'
import {
  HBUT_LOCATION,
  SCAN_CONCURRENCY,
  SCAN_MAX_POINTS,
  batteryLevelTier,
  createServiceAreaScanPoints,
  dedupeVehicles,
  distanceMeters,
  isPointInPolygon,
  normalizePoint,
  normalizeVehicles,
  resolveTowerGoLocation,
  scanCellKey,
  wgs84ToGcj02
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

  it('falls back when system location drifts beyond the campus threshold', async () => {
    const drifted = await resolveTowerGoLocation({
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 30.7, longitude: 114.5, accuracy: 10 } as GeolocationCoordinates,
            timestamp: Date.now()
          } as GeolocationPosition)
      } as unknown as Geolocation,
      fallback: HBUT_LOCATION,
      maxDriftMeters: 2000
    })

    expect(drifted.source).toBe('fallback')
    expect(drifted.latitude).toBe(HBUT_LOCATION.latitude)
    expect(drifted.longitude).toBe(HBUT_LOCATION.longitude)
  })

  it('keeps system location when within the campus threshold', async () => {
    const near = await resolveTowerGoLocation({
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 30.483, longitude: 114.315, accuracy: 10 } as GeolocationCoordinates,
            timestamp: Date.now()
          } as GeolocationPosition)
      } as unknown as Geolocation,
      fallback: HBUT_LOCATION,
      maxDriftMeters: 2000
    })

    expect(near.source).toBe('system')
    const expected = wgs84ToGcj02(30.483, 114.315)
    expect(near.latitude).toBeCloseTo(expected.latitude, 6)
    expect(near.longitude).toBeCloseTo(expected.longitude, 6)
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
      spacingMeters: 250,
      maxPoints: 20
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

  it('#370 swaps inverted lat/lng and reads nested/alias vehicle fields', () => {
    // 常见写反：lat=114.x lng=30.x
    expect(normalizePoint({ lat: 114.313, lng: 30.482 })).toEqual({
      latitude: 30.482,
      longitude: 114.313
    })
    const nested = normalizeVehicles(
      {
        data: {
          deviceList: [
            {
              car_id: 'C1',
              location: { carLat: 30.483, carLng: 114.314 },
              restBattery: 66
            },
            {
              imei: 'IMEI2',
              lat: 114.32,
              lng: 30.485,
              battery: 40
            }
          ]
        }
      },
      HBUT_LOCATION
    )
    expect(nested.length).toBe(2)
    expect(nested[0].latitude).toBeCloseTo(30.483, 3)
    expect(nested[0].longitude).toBeCloseTo(114.314, 3)
    expect(nested.some((v) => v.latitude > 70)).toBe(false)
  })

  it('#490 center-fetch defaults are single-shot (legacy grid util still callable)', () => {
    expect(SCAN_CONCURRENCY).toBe(1)
    expect(SCAN_MAX_POINTS).toBe(1)
    expect(batteryLevelTier(0)).toBe(0)
    expect(batteryLevelTier(14)).toBe(10)
    expect(batteryLevelTier(15)).toBe(20)
    expect(batteryLevelTier(66)).toBe(70)
    expect(batteryLevelTier(100)).toBe(100)

    // 遗留工具可显式传入 maxPoints，主路径不再使用
    const polygon = [
      { latitude: 30.47, longitude: 114.30 },
      { latitude: 30.47, longitude: 114.33 },
      { latitude: 30.50, longitude: 114.33 },
      { latitude: 30.50, longitude: 114.30 }
    ]
    const points = createServiceAreaScanPoints({
      serviceData: { points: polygon, centerLat: 30.483, centerLng: 114.313 },
      origin: HBUT_LOCATION,
      spacingMeters: 200,
      maxPoints: 12,
      nearbyRadiusMeters: 900
    })
    expect(points.length).toBeGreaterThanOrEqual(1)
    expect(points.length).toBeLessThanOrEqual(12)
  })

  it('builds stable scan cell keys for legacy incremental helpers', () => {
    const a = scanCellKey({ latitude: 30.4819, longitude: 114.313 }, 180)
    const b = scanCellKey({ latitude: 30.48191, longitude: 114.31301 }, 180)
    const far = scanCellKey({ latitude: 30.495, longitude: 114.32 }, 180)
    expect(a).toBe(b)
    expect(a).not.toBe(far)
  })

  it('converts WGS-84 to GCJ-02 near campus and prefers top-level vehicle lat/lng', async () => {
    const wgs = { latitude: 30.4819, longitude: 114.313 }
    const gcj = wgs84ToGcj02(wgs.latitude, wgs.longitude)
    // 国内偏移应非零但在数百米量级
    const drift = distanceMeters(wgs.latitude, wgs.longitude, gcj.latitude, gcj.longitude)
    expect(drift).toBeGreaterThan(50)
    expect(drift).toBeLessThan(1000)

    const fromTop = normalizeVehicles(
      {
        list: [{ carId: 'TOP', lat: 30.482, lng: 114.314, restBattery: 55 }]
      },
      HBUT_LOCATION
    )
    expect(fromTop[0].latitude).toBeCloseTo(30.482, 5)
    expect(fromTop[0].longitude).toBeCloseTo(114.314, 5)
  })

  it('requests fresh geolocation with maximumAge 0 and returns GCJ coordinates', async () => {
    let seenMaximumAge: number | undefined
    const resolved = await resolveTowerGoLocation({
      geolocation: {
        getCurrentPosition: (
          success: PositionCallback,
          _error?: PositionErrorCallback | null,
          options?: PositionOptions
        ) => {
          seenMaximumAge = options?.maximumAge
          success({
            coords: { latitude: 30.483, longitude: 114.315, accuracy: 8 } as GeolocationCoordinates,
            timestamp: Date.now()
          } as GeolocationPosition)
        }
      } as unknown as Geolocation,
      fallback: HBUT_LOCATION
    })
    expect(seenMaximumAge).toBe(0)
    expect(resolved.source).toBe('system')
    const expected = wgs84ToGcj02(30.483, 114.315)
    expect(resolved.latitude).toBeCloseTo(expected.latitude, 6)
    expect(resolved.longitude).toBeCloseTo(expected.longitude, 6)
  })
})
