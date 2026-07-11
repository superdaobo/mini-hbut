import { describe, expect, it } from 'vitest'
import {
  HBUT_LOCATION,
  SCAN_CONCURRENCY,
  SCAN_GRID_SPACING_METERS,
  SCAN_MAX_POINTS,
  createServiceAreaScanPoints,
  dedupeVehicles,
  distanceMeters,
  isPointInPolygon,
  normalizePoint,
  normalizeVehicles,
  resolveTowerGoLocation,
  scanCellKey
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

    expect(drifted).toEqual({ ...HBUT_LOCATION, source: 'fallback' })
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
    expect(near.latitude).toBe(30.483)
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

  it('reduces scan point count as spacing increases without dropping below minimum coverage', () => {
    const polygon = [
      { latitude: 30.48, longitude: 114.31 },
      { latitude: 30.48, longitude: 114.316 },
      { latitude: 30.486, longitude: 114.316 },
      { latitude: 30.486, longitude: 114.31 }
    ]
    const dense = createServiceAreaScanPoints({
      serviceData: { points: polygon, centerLat: 30.483, centerLng: 114.313 },
      origin: HBUT_LOCATION,
      spacingMeters: 80,
      maxPoints: 80
    })
    const sparse = createServiceAreaScanPoints({
      serviceData: { points: polygon, centerLat: 30.483, centerLng: 114.313 },
      origin: HBUT_LOCATION,
      spacingMeters: 160,
      maxPoints: 80
    })
    expect(dense.length).toBeGreaterThan(4)
    expect(sparse.length).toBeGreaterThan(4)
    expect(sparse.length).toBeLessThanOrEqual(dense.length)
  })

  it('caps scan points for nearby-first low-impact scans', () => {
    expect(SCAN_CONCURRENCY).toBeLessThanOrEqual(4)
    expect(SCAN_GRID_SPACING_METERS).toBeGreaterThanOrEqual(150)
    expect(SCAN_MAX_POINTS).toBeLessThanOrEqual(48)

    const polygon = [
      { latitude: 30.47, longitude: 114.30 },
      { latitude: 30.47, longitude: 114.33 },
      { latitude: 30.50, longitude: 114.33 },
      { latitude: 30.50, longitude: 114.30 }
    ]
    const points = createServiceAreaScanPoints({
      serviceData: { points: polygon, centerLat: 30.483, centerLng: 114.313 },
      origin: HBUT_LOCATION,
      spacingMeters: SCAN_GRID_SPACING_METERS,
      maxPoints: SCAN_MAX_POINTS,
      nearbyRadiusMeters: 900
    })
    expect(points.length).toBeGreaterThanOrEqual(4)
    expect(points.length).toBeLessThanOrEqual(SCAN_MAX_POINTS)
    // 最近点应为用户原点
    expect(points[0].latitude).toBeCloseTo(HBUT_LOCATION.latitude, 4)
  })

  it('generates scan points from map viewport bounds', () => {
    const polygon = [
      { latitude: 30.47, longitude: 114.30 },
      { latitude: 30.47, longitude: 114.33 },
      { latitude: 30.50, longitude: 114.33 },
      { latitude: 30.50, longitude: 114.30 }
    ]
    // 视口在服务区北侧，远离默认原点附近
    const bounds = {
      minLat: 30.492,
      maxLat: 30.498,
      minLng: 114.31,
      maxLng: 114.32
    }
    const points = createServiceAreaScanPoints({
      serviceData: { points: polygon, centerLat: 30.483, centerLng: 114.313 },
      origin: HBUT_LOCATION,
      spacingMeters: 200,
      maxPoints: 20,
      bounds
    })
    expect(points.length).toBeGreaterThanOrEqual(1)
    expect(points.length).toBeLessThanOrEqual(20)
    // 点应落在视口∩服务区附近，而非全部挤在校区中心
    const midLat = points.reduce((s, p) => s + p.latitude, 0) / points.length
    expect(midLat).toBeGreaterThan(30.485)
  })

  it('builds stable scan cell keys for incremental viewport loading', () => {
    const a = scanCellKey({ latitude: 30.4819, longitude: 114.313 }, 180)
    const b = scanCellKey({ latitude: 30.48191, longitude: 114.31301 }, 180)
    const far = scanCellKey({ latitude: 30.495, longitude: 114.32 }, 180)
    expect(a).toBe(b)
    expect(a).not.toBe(far)
  })

  it('requests fresh geolocation with maximumAge 0 by default', async () => {
    let seenMaximumAge: number | undefined
    await resolveTowerGoLocation({
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
  })
})
