import { describe, expect, it } from 'vitest'
import { resolveDebugScreenshotBackgroundColor } from './debug_bridge'

describe('resolveDebugScreenshotBackgroundColor', () => {
  it('未显式传入背景色时应交给截图服务按当前夜晚模式解析', () => {
    expect(resolveDebugScreenshotBackgroundColor({})).toBeNull()
  })

  it('应兼容 camelCase 和 snake_case 背景色字段', () => {
    expect(resolveDebugScreenshotBackgroundColor({ backgroundColor: '#102030' })).toBe('#102030')
    expect(resolveDebugScreenshotBackgroundColor({ background_color: '#203040' })).toBe('#203040')
  })
})
