import { describe, expect, it, vi } from 'vitest'
import { escapeCssAttributeValue, resolveDebugScreenshotBackgroundColor } from './debug_bridge'

describe('escapeCssAttributeValue（CSS 属性值选择器转义）', () => {
  it('回退实现逐字符转义引号与反斜杠（无原生 CSS.escape 时）', () => {
    expect(escapeCssAttributeValue('a"b')).toBe('a\\"b')
    expect(escapeCssAttributeValue('a\\b')).toBe('a\\\\b')
    expect(escapeCssAttributeValue("a'b")).toBe("a\\'b")
    expect(escapeCssAttributeValue('plain-module-id')).toBe('plain-module-id')
    expect(escapeCssAttributeValue('')).toBe('')
    expect(escapeCssAttributeValue(null as unknown as string)).toBe('')
    expect(escapeCssAttributeValue('a"b\\c\'d')).toBe('a\\"b\\\\c\\\'d')
  })

  it('优先使用原生 CSS.escape 并透传原值', () => {
    const escape = vi.fn((value: string) => `native:${value}`)
    vi.stubGlobal('CSS', { escape })
    try {
      expect(escapeCssAttributeValue('a"b\\c')).toBe('native:a"b\\c')
      expect(escape).toHaveBeenCalledWith('a"b\\c')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('resolveDebugScreenshotBackgroundColor', () => {
  it('未显式传入背景色时应交给截图服务按当前夜晚模式解析', () => {
    expect(resolveDebugScreenshotBackgroundColor({})).toBeNull()
  })

  it('应兼容 camelCase 和 snake_case 背景色字段', () => {
    expect(resolveDebugScreenshotBackgroundColor({ backgroundColor: '#102030' })).toBe('#102030')
    expect(resolveDebugScreenshotBackgroundColor({ background_color: '#203040' })).toBe('#203040')
  })
})
