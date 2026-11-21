import { describe, expect, it } from 'vitest'
import { toGcj, toGcjPoint } from './coordinate'
import { HBUT_LOCATION, distanceMeters, wgs84ToGcj02 } from './towergo_map'

describe('coordinate utils (unified GCJ-02 exit)', () => {
  it('toGcj converts the campus center like wgs84ToGcj02', () => {
    const converted = toGcj(HBUT_LOCATION.latitude, HBUT_LOCATION.longitude)
    const reference = wgs84ToGcj02(HBUT_LOCATION.latitude, HBUT_LOCATION.longitude)
    expect(converted).toEqual(reference)
    // 基准值：武汉地区 GCJ 偏移（约南 271m / 东 522m）
    expect(converted.latitude).toBeCloseTo(30.479467, 4)
    expect(converted.longitude).toBeCloseTo(114.318446, 4)
    const offset = distanceMeters(
      HBUT_LOCATION.latitude,
      HBUT_LOCATION.longitude,
      converted.latitude,
      converted.longitude
    )
    expect(offset).toBeGreaterThan(400)
    expect(offset).toBeLessThan(800)
  })

  it('toGcj passes through out-of-China / invalid input unchanged', () => {
    // 境外坐标不纠偏
    expect(toGcj(40.7128, -74.006)).toEqual({ latitude: 40.7128, longitude: -74.006 })
    // 非有限值原样返回，调用方自行兜底
    const weird = toGcj(Number.NaN, 114.313)
    expect(Number.isNaN(weird.latitude)).toBe(true)
  })

  it('toGcjPoint preserves all other fields', () => {
    const point = {
      latitude: 30.4819,
      longitude: 114.313,
      accuracy: 12.5,
      name: '当前位置',
      source: 'system' as const
    }
    const converted = toGcjPoint(point)
    expect(converted).not.toBe(point)
    expect(converted.name).toBe('当前位置')
    expect(converted.source).toBe('system')
    expect(converted.accuracy).toBe(12.5)
    const expected = wgs84ToGcj02(30.4819, 114.313)
    expect(converted.latitude).toBeCloseTo(expected.latitude, 9)
    expect(converted.longitude).toBeCloseTo(expected.longitude, 9)
  })
})
