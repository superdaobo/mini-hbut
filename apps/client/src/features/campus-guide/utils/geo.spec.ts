import { describe, expect, it } from 'vitest'
import { distanceMeters, distanceUnit, isPointInPolygon } from './geo'

describe('campus guide geo utils', () => {
  it('detects point inside a square polygon', () => {
    const polygon = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 2 },
      { latitude: 2, longitude: 2 },
      { latitude: 2, longitude: 0 }
    ]
    expect(isPointInPolygon({ latitude: 1, longitude: 1 }, polygon)).toBe(true)
    expect(isPointInPolygon({ latitude: 3, longitude: 3 }, polygon)).toBe(false)
  })

  it('formats distance labels', () => {
    expect(distanceUnit(520)).toBe('距你520米')
    expect(distanceUnit(1520)).toBe('距你1.5公里')
  })

  it('computes haversine distance', () => {
    const from = { latitude: 30.4819, longitude: 114.313 }
    const to = { latitude: 30.4829, longitude: 114.314 }
    const meters = distanceMeters(from, to)
    expect(meters).toBeGreaterThan(100)
    expect(meters).toBeLessThan(200)
  })
})