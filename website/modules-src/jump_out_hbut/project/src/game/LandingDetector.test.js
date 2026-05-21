import { describe, it, expect } from 'vitest'
import { LandingDetector } from './LandingDetector.js'

describe('LandingDetector', () => {
  let detector

  // 创建一个标准测试平台：中心在 (5, 0, 5)，尺寸 2.0 × 2.0
  const makePlatform = (x = 5, z = 5, width = 2.0, depth = 2.0) => ({
    id: 'test-platform',
    type: 'library',
    position: { x, y: 0, z },
    size: { width, depth, height: 1.0 }
  })

  beforeEach(() => {
    detector = new LandingDetector()
  })

  describe('落点判定分类', () => {
    it('落在平台正中心 → perfect', () => {
      const platform = makePlatform()
      const result = detector.detect({ x: 5, y: 0, z: 5 }, [platform])

      expect(result.success).toBe(true)
      expect(result.type).toBe('perfect')
      expect(result.platform).toBe(platform)
      expect(result.offset).toBe(0)
    })

    it('落在 20% 偏移处 → perfect（在 30% 阈值内）', () => {
      const platform = makePlatform(5, 5, 2.0, 2.0)
      // 20% 偏移：dx = 0.2 * (width/2) = 0.2 * 1.0 = 0.2
      const result = detector.detect({ x: 5.2, y: 0, z: 5 }, [platform])

      expect(result.success).toBe(true)
      expect(result.type).toBe('perfect')
      expect(result.offset).toBeCloseTo(0.2)
    })

    it('落在 50% 偏移处 → normal', () => {
      const platform = makePlatform(5, 5, 2.0, 2.0)
      // 50% 偏移：dx = 0.5 * (width/2) = 0.5 * 1.0 = 0.5
      const result = detector.detect({ x: 5.5, y: 0, z: 5 }, [platform])

      expect(result.success).toBe(true)
      expect(result.type).toBe('normal')
      expect(result.offset).toBeCloseTo(0.5)
    })

    it('落在 90% 偏移处 → normal（边缘但仍在平台上）', () => {
      const platform = makePlatform(5, 5, 2.0, 2.0)
      // 90% 偏移：dx = 0.9 * (width/2) = 0.9 * 1.0 = 0.9
      const result = detector.detect({ x: 5.9, y: 0, z: 5 }, [platform])

      expect(result.success).toBe(true)
      expect(result.type).toBe('normal')
      expect(result.offset).toBeCloseTo(0.9)
    })

    it('落在平台外（超出 100%）→ miss', () => {
      const platform = makePlatform(5, 5, 2.0, 2.0)
      // 150% 偏移：dx = 1.5 * (width/2) = 1.5 * 1.0 = 1.5
      const result = detector.detect({ x: 6.5, y: 0, z: 5 }, [platform])

      expect(result.success).toBe(false)
      expect(result.type).toBe('miss')
      expect(result.platform).toBeUndefined()
      expect(result.offset).toBeUndefined()
    })
  })

  describe('多平台检测', () => {
    it('优先检测最后一个平台（目标平台）', () => {
      const platform1 = makePlatform(0, 0, 2.0, 2.0)
      const platform2 = makePlatform(5, 5, 2.0, 2.0)

      // 落在 platform2 中心
      const result = detector.detect({ x: 5, y: 0, z: 5 }, [platform1, platform2])

      expect(result.success).toBe(true)
      expect(result.type).toBe('perfect')
      expect(result.platform).toBe(platform2)
    })

    it('目标平台未命中时回退检测前面的平台', () => {
      const platform1 = makePlatform(0, 0, 2.0, 2.0)
      const platform2 = makePlatform(5, 5, 2.0, 2.0)

      // 落在 platform1 中心（目标平台 platform2 未命中）
      const result = detector.detect({ x: 0, y: 0, z: 0 }, [platform1, platform2])

      expect(result.success).toBe(true)
      expect(result.type).toBe('perfect')
      expect(result.platform).toBe(platform1)
    })

    it('所有平台都未命中 → miss', () => {
      const platform1 = makePlatform(0, 0, 2.0, 2.0)
      const platform2 = makePlatform(5, 5, 2.0, 2.0)

      // 落在两个平台之间的空白区域
      const result = detector.detect({ x: 2.5, y: 0, z: 2.5 }, [platform1, platform2])

      expect(result.success).toBe(false)
      expect(result.type).toBe('miss')
    })
  })

  describe('非对称平台尺寸', () => {
    it('宽平台（width > depth）Z 方向偏移更敏感', () => {
      // 宽 4.0，深 1.0 的平台（类似南湖桥）
      const platform = makePlatform(0, 0, 4.0, 1.0)

      // X 方向偏移 0.5 单位 → offsetX = 0.5 / 2.0 = 0.25（perfect 范围）
      // Z 方向偏移 0.5 单位 → offsetZ = 0.5 / 0.5 = 1.0（normal 边缘）
      const result = detector.detect({ x: 0.5, y: 0, z: 0.5 }, [platform])

      expect(result.success).toBe(true)
      expect(result.type).toBe('normal')
      // maxOffset = max(0.25, 1.0) = 1.0
      expect(result.offset).toBeCloseTo(1.0)
    })
  })

  describe('边界值', () => {
    it('恰好在 0.3 阈值上 → perfect', () => {
      const platform = makePlatform(0, 0, 2.0, 2.0)
      // offsetX = 0.3 * 1.0 = 0.3
      const result = detector.detect({ x: 0.3, y: 0, z: 0 }, [platform])

      expect(result.success).toBe(true)
      expect(result.type).toBe('perfect')
      expect(result.offset).toBeCloseTo(0.3)
    })

    it('恰好在 1.0 阈值上 → normal', () => {
      const platform = makePlatform(0, 0, 2.0, 2.0)
      // offsetX = 1.0 * 1.0 = 1.0
      const result = detector.detect({ x: 1.0, y: 0, z: 0 }, [platform])

      expect(result.success).toBe(true)
      expect(result.type).toBe('normal')
      expect(result.offset).toBeCloseTo(1.0)
    })

    it('空平台列表 → miss', () => {
      const result = detector.detect({ x: 0, y: 0, z: 0 }, [])

      expect(result.success).toBe(false)
      expect(result.type).toBe('miss')
    })
  })

  describe('安全落点钳制', () => {
    it('宽容命中但实际落点超过平台几何边界时，返回钳制到边缘的 safePosition', () => {
      const platform = makePlatform(0, 0, 2.0, 2.0)
      // NORMAL_LANDING_THRESHOLD 为 1.1，x=1.05 会被判定为 normal，
      // 但平台实际右边界是 x=1.0，角色应被钳制回几何边界内。
      const result = detector.detect({ x: 1.05, y: 3, z: 0.25 }, [platform])

      expect(result.success).toBe(true)
      expect(result.type).toBe('normal')
      expect(result.safePosition).toEqual({ x: 1, y: 3, z: 0.25 })
    })

    it('平台范围内命中时 safePosition 保持原始落点，不强制吸附中心', () => {
      const platform = makePlatform(0, 0, 2.0, 2.0)
      const position = { x: 0.4, y: 2, z: -0.5 }
      const result = detector.detect(position, [platform])

      expect(result.success).toBe(true)
      expect(result.safePosition).toEqual(position)
    })
  })
})
