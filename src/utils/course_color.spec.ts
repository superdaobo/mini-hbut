import { describe, expect, it } from 'vitest'
import {
  COURSE_COLOR_PRESETS,
  contrastTextForHex,
  findPresetByHex,
  getPresetHexList,
  hexToHsv,
  hsvToHex,
  isValidHexColor,
  mixHexWithWhite,
  normalizeHexColor,
  normalizeOptionalCourseColor,
} from './course_color'

describe('course_color palette & hex helpers', () => {
  it('exposes a stable non-empty preset palette of #RRGGBB colors', () => {
    expect(COURSE_COLOR_PRESETS.length).toBeGreaterThanOrEqual(8)
    const hexes = getPresetHexList()
    expect(hexes).toHaveLength(COURSE_COLOR_PRESETS.length)
    for (const hex of hexes) {
      expect(isValidHexColor(hex)).toBe(true)
      expect(normalizeHexColor(hex)).toBe(hex.toLowerCase())
    }
  })

  it('validates hex inputs including 3/6/8 digit forms', () => {
    expect(isValidHexColor('#fff')).toBe(true)
    expect(isValidHexColor('#FFFFFF')).toBe(true)
    expect(isValidHexColor('#aabbccdd')).toBe(true)
    expect(isValidHexColor('not-a-color')).toBe(false)
    expect(isValidHexColor('#gg0000')).toBe(false)
    expect(isValidHexColor(null)).toBe(false)
    expect(isValidHexColor(123)).toBe(false)
  })

  it('normalizes 3-digit and 8-digit hex to lowercase #rrggbb', () => {
    expect(normalizeHexColor('#AbC')).toBe('#aabbcc')
    expect(normalizeHexColor('72B9FF')).toBe('#72b9ff')
    expect(normalizeHexColor('#72b9ffaa')).toBe('#72b9ff')
    expect(normalizeHexColor('  #E7F4FF  ')).toBe('#e7f4ff')
    expect(normalizeHexColor('')).toBe(null)
    expect(normalizeHexColor('#12')).toBe(null)
    expect(normalizeHexColor('xyz')).toBe(null)
    // 无 # 的 3 位字母不得当作颜色
    expect(normalizeHexColor('bad')).toBe(null)
  })

  it('treats empty optional color as unset and rejects invalid values', () => {
    expect(normalizeOptionalCourseColor('')).toBe('')
    expect(normalizeOptionalCourseColor('   ')).toBe('')
    expect(normalizeOptionalCourseColor(null)).toBe('')
    expect(normalizeOptionalCourseColor(undefined)).toBe('')
    expect(normalizeOptionalCourseColor('#72B9FF')).toBe('#72b9ff')
    expect(normalizeOptionalCourseColor('nope')).toBe(null)
  })

  it('finds presets by hex case-insensitively', () => {
    const first = COURSE_COLOR_PRESETS[0]
    expect(findPresetByHex(first.hex.toUpperCase())?.id).toBe(first.id)
    expect(findPresetByHex('#000000')).toBe(null)
  })

  it('picks readable contrast text for light and dark backgrounds', () => {
    expect(contrastTextForHex('#ffffff')).toBe('#0f172a')
    expect(contrastTextForHex('#111111')).toBe('#ffffff')
  })

  it('mixes hex toward white for soft card backgrounds', () => {
    const mixed = mixHexWithWhite('#000000', 0.2)
    expect(normalizeHexColor(mixed)).toBe('#cccccc')
    expect(mixHexWithWhite('bad')).toBe('#f8fafc')
  })

  it('round-trips hex through HSV for saturated colors', () => {
    const samples = ['#ff0000', '#00ff00', '#0000ff', '#72b9ff', '#111111']
    for (const hex of samples) {
      const hsv = hexToHsv(hex)
      expect(hsv).not.toBeNull()
      if (!hsv) continue
      const back = hsvToHex(hsv.h, hsv.s, hsv.v)
      expect(normalizeHexColor(back)).toBe(hex.toLowerCase())
    }
  })
})
