import { describe, expect, it } from 'vitest'
import {
  getForecastTemperatureBounds,
  getTemperatureColor,
  getTemperatureRangeScale,
  getTemperatureRangeStyle
} from './weather_visuals'

describe('weather visual helpers', () => {
  it('builds forecast bounds from displayed daily high and low temperatures', () => {
    const bounds = getForecastTemperatureBounds([
      { temp_low: 19, temp_high: 28 },
      { temp_low: 24, temp_high: 32 },
      { temp_low: 21, temp_high: 27 }
    ])

    expect(bounds).toEqual({ min: 19, max: 32, span: 13 })
  })

  it('ignores invalid forecast temperatures when building bounds', () => {
    const bounds = getForecastTemperatureBounds([
      { temp_low: 'bad', temp_high: 29 },
      { temp_low: 22, temp_high: null },
      { temp_low: 24, temp_high: 31 }
    ])

    expect(bounds).toEqual({ min: 24, max: 31, span: 7 })
  })

  it('scales one day range inside the displayed forecast bounds', () => {
    const scale = getTemperatureRangeScale(21, 27, { min: 19, max: 32, span: 13 })

    expect(scale.leftPct).toBeCloseTo(15.38, 2)
    expect(scale.widthPct).toBeCloseTo(46.15, 2)
  })

  it('keeps equal-temperature or missing bounds visible without dividing by zero', () => {
    expect(getTemperatureRangeScale(24, 24, { min: 24, max: 24, span: 0 })).toEqual({
      leftPct: 46,
      widthPct: 8
    })

    expect(getTemperatureRangeScale('bad', 24, { min: 20, max: 30, span: 10 })).toEqual({
      leftPct: 46,
      widthPct: 8
    })
  })

  it('keeps tiny daily ranges visible while preserving their center position', () => {
    const scale = getTemperatureRangeScale(24, 24.2, { min: 20, max: 30, span: 10 })

    expect(scale.widthPct).toBe(8)
    expect(scale.leftPct).toBe(37)
  })

  it('returns a Vue style object using left and width percentages', () => {
    const style = getTemperatureRangeStyle(21, 27, { min: 19, max: 32, span: 13 })

    expect(style.left).toBe('15.38%')
    expect(style.width).toBe('46.15%')
  })

  it('maps temperatures to readable text colors instead of fixed low-blue and high-red classes', () => {
    expect(getTemperatureColor(-2, 'text')).toBe('#2563eb')
    expect(getTemperatureColor(18, 'text')).toBe('#0f766e')
    expect(getTemperatureColor(27, 'text')).toBe('#c2410c')
    expect(getTemperatureColor(34, 'text')).toBe('#dc2626')
    expect(getTemperatureColor(29, 'text')).not.toBe('#2563eb')
  })

  it('uses actual low and high temperatures for range gradient colors', () => {
    const warmRange = getTemperatureRangeStyle(27, 34, { min: 24, max: 36, span: 12 })

    expect(warmRange.background).toBe('linear-gradient(90deg, #fb923c 0%, #f87171 100%)')
    expect(warmRange.background).not.toContain('#60a5fa')

    const coldRange = getTemperatureRangeStyle(2, 8, { min: -2, max: 12, span: 14 })
    expect(coldRange.background).toBe('linear-gradient(90deg, #60a5fa 0%, #2dd4bf 100%)')
  })
})
