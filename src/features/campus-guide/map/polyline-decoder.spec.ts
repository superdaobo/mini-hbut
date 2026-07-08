import { describe, expect, it } from 'vitest'
import { decodeDeltaPolyline, polylineToPoints } from './polyline-decoder'

describe('campus guide polyline decoder', () => {
  it('decodes incremental polyline values in degree format', () => {
    const decoded = decodeDeltaPolyline([30.48, 114.31, 100, 200, 50, -100])
    expect(decoded[0]).toBeCloseTo(30.48, 5)
    expect(decoded[1]).toBeCloseTo(114.31, 5)
    expect(decoded[2]).toBeCloseTo(30.4801, 5)
    expect(decoded[3]).toBeCloseTo(114.3102, 5)
    expect(decoded[4]).toBeCloseTo(30.48015, 5)
    expect(decoded[5]).toBeCloseTo(114.3101, 5)
  })

  it('decodes tencent micro-degree polyline format', () => {
    const decoded = decodeDeltaPolyline([30_480_000, 114_310_000, 100, 200])
    expect(decoded[0]).toBeCloseTo(30.48, 5)
    expect(decoded[1]).toBeCloseTo(114.31, 5)
    expect(decoded[2]).toBeCloseTo(30.4801, 5)
    expect(decoded[3]).toBeCloseTo(114.3102, 5)
  })

  it('converts polyline array to lat/lng points', () => {
    const points = polylineToPoints([30.48, 114.31])
    expect(points).toHaveLength(1)
    expect(points[0].latitude).toBeCloseTo(30.48, 5)
    expect(points[0].longitude).toBeCloseTo(114.31, 5)
  })

  it('returns empty points for empty or invalid polyline', () => {
    expect(polylineToPoints([])).toEqual([])
    expect(polylineToPoints([Number.NaN, 114.31])).toEqual([])
  })

  it('skips invalid coordinate pairs without throwing', () => {
    const points = polylineToPoints([30.48, 114.31, Number.NaN, 200, 50, -100])
    expect(points.length).toBeGreaterThanOrEqual(1)
    expect(points[0].latitude).toBeCloseTo(30.48, 5)
  })
})
