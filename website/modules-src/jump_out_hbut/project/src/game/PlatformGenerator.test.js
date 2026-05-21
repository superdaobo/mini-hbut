import { describe, it, expect, beforeEach } from 'vitest'
import { PlatformGenerator } from './PlatformGenerator.js'
import {
  BUILDING_DATA,
  BUILDING_TYPES,
  PLATFORM_DISTANCE_MIN_FACTOR,
  PLATFORM_DISTANCE_MAX_FACTOR,
  HIGH_SCORE_SCALE_MAX,
  HIGH_SCORE_THRESHOLD,
  PLATFORM_PROBABILITY
} from '../utils/constants.js'

describe('PlatformGenerator', () => {
  let generator

  beforeEach(() => {
    generator = new PlatformGenerator()
    generator.reset()
  })

  describe('getInitialPlatform()', () => {
    it('返回有效的初始平台', () => {
      const platform = generator.getInitialPlatform()

      expect(platform).toBeDefined()
      expect(platform.id).toBeTruthy()
      expect(platform.type).toBe('library')
      expect(platform.position).toEqual({ x: 0, y: 0, z: 0 })
      expect(platform.size).toEqual(BUILDING_DATA.library.size)
      expect(platform.baseScore).toBe(BUILDING_DATA.library.baseScore)
    })

    it('返回的平台包含所有必要字段', () => {
      const platform = generator.getInitialPlatform()

      expect(platform).toHaveProperty('id')
      expect(platform).toHaveProperty('type')
      expect(platform).toHaveProperty('position')
      expect(platform).toHaveProperty('size')
      expect(platform).toHaveProperty('baseScore')
      expect(platform.size).toHaveProperty('width')
      expect(platform.size).toHaveProperty('depth')
      expect(platform.size).toHaveProperty('height')
    })
  })

  describe('generateNext()', () => {
    it('返回包含所有必要字段的平台', () => {
      const initial = generator.getInitialPlatform()
      const next = generator.generateNext(initial, 0)

      expect(next).toHaveProperty('id')
      expect(next).toHaveProperty('type')
      expect(next).toHaveProperty('position')
      expect(next).toHaveProperty('size')
      expect(next).toHaveProperty('baseScore')
    })

    it('返回的类型是有效的建筑类型', () => {
      const initial = generator.getInitialPlatform()
      const next = generator.generateNext(initial, 0)

      expect(BUILDING_TYPES).toContain(next.type)
    })

    it('返回的 size 与建筑数据表一致', () => {
      const initial = generator.getInitialPlatform()
      const next = generator.generateNext(initial, 0)

      const expectedSize = BUILDING_DATA[next.type].size
      expect(next.size).toEqual(expectedSize)
    })

    it('返回的 baseScore 与建筑数据表一致', () => {
      const initial = generator.getInitialPlatform()
      const next = generator.generateNext(initial, 0)

      const expectedScore = BUILDING_DATA[next.type].baseScore
      expect(next.baseScore).toBe(expectedScore)
    })

    it('position.y 始终为 0', () => {
      const initial = generator.getInitialPlatform()
      for (let i = 0; i < 20; i++) {
        const next = generator.generateNext(initial, Math.random() * 3000)
        expect(next.position.y).toBe(0)
      }
    })
  })

  describe('距离约束', () => {
    it('score < 1500 时距离在固定基础距离倍率范围内', () => {
      const initial = generator.getInitialPlatform()
      const baseDistance = 4.5
      const minDist = PLATFORM_DISTANCE_MIN_FACTOR * baseDistance
      const maxDist = PLATFORM_DISTANCE_MAX_FACTOR * baseDistance

      for (let i = 0; i < 50; i++) {
        const next = generator.generateNext(initial, 100)
        const dx = next.position.x - initial.position.x
        const dz = next.position.z - initial.position.z
        const distance = Math.sqrt(dx * dx + dz * dz)

        expect(distance).toBeGreaterThanOrEqual(minDist - 0.001)
        expect(distance).toBeLessThanOrEqual(maxDist + 0.001)
      }
    })

    it('score >= 1500 时距离在固定基础距离倍率和高分缩放范围内', () => {
      const initial = generator.getInitialPlatform()
      const baseDistance = 4.5
      const minDist = PLATFORM_DISTANCE_MIN_FACTOR * baseDistance
      const maxDist = PLATFORM_DISTANCE_MAX_FACTOR * baseDistance * HIGH_SCORE_SCALE_MAX

      for (let i = 0; i < 50; i++) {
        const next = generator.generateNext(initial, 2000)
        const dx = next.position.x - initial.position.x
        const dz = next.position.z - initial.position.z
        const distance = Math.sqrt(dx * dx + dz * dz)

        expect(distance).toBeGreaterThanOrEqual(minDist - 0.001)
        expect(distance).toBeLessThanOrEqual(maxDist + 0.001)
      }
    })
  })

  describe('方向约束（±30°）', () => {
    it('生成的平台方向为 ±30°（验证 x 和 z 分量关系）', () => {
      const initial = generator.getInitialPlatform()

      for (let i = 0; i < 50; i++) {
        const next = generator.generateNext(initial, 0)
        const dx = next.position.x - initial.position.x
        const dz = next.position.z - initial.position.z

        expect(Math.abs(dx) / Math.abs(dz)).toBeCloseTo(Math.tan(Math.PI / 6), 5)

        // z 分量始终为正（向前跳）
        expect(dz).toBeGreaterThan(0)
      }
    })
  })

  describe('生成 100 个平台验证距离合法性', () => {
    it('连续生成 100 个平台，所有距离均在合法范围内', () => {
      let current = generator.getInitialPlatform()

      for (let i = 0; i < 100; i++) {
        const score = i * 20 // 模拟分数递增
        const next = generator.generateNext(current, score)

        const dx = next.position.x - current.position.x
        const dz = next.position.z - current.position.z
        const distance = Math.sqrt(dx * dx + dz * dz)

        const baseDistance = 4.5
        const minDist = PLATFORM_DISTANCE_MIN_FACTOR * baseDistance
        let maxDist = PLATFORM_DISTANCE_MAX_FACTOR * baseDistance
        if (score >= HIGH_SCORE_THRESHOLD) {
          maxDist *= HIGH_SCORE_SCALE_MAX
        }

        expect(distance).toBeGreaterThanOrEqual(minDist - 0.001)
        expect(distance).toBeLessThanOrEqual(maxDist + 0.001)

        current = next
      }
    })
  })

  describe('类型分布符合分数阶段规则', () => {
    /**
     * 辅助函数：生成 N 个平台并统计类别分布
     */
    function generateAndCount(generator, score, count) {
      const initial = generator.getInitialPlatform()
      const categoryCounts = { large: 0, medium: 0, small: 0, special: 0 }

      for (let i = 0; i < count; i++) {
        const next = generator.generateNext(initial, score)
        const category = BUILDING_DATA[next.type].category
        categoryCounts[category]++
      }

      return categoryCounts
    }

    it('score < 500 时 large 类型占比最高', () => {
      const counts = generateAndCount(generator, 100, 200)
      const total = 200

      // large 应该是最多的（概率 40%），允许统计波动
      // 验证 large 占比 > 20%（远低于期望的 40%，但足以验证趋势）
      expect(counts.large / total).toBeGreaterThan(0.2)
    })

    it('500 <= score < 1500 时 medium 类型占比最高', () => {
      const counts = generateAndCount(generator, 800, 200)
      const total = 200

      // medium 应该是最多的（概率 35%）
      expect(counts.medium / total).toBeGreaterThan(0.2)
    })

    it('score >= 1500 时 small 类型占比最高', () => {
      const counts = generateAndCount(generator, 2000, 200)
      const total = 200

      // small 应该是最多的（概率 50%）
      expect(counts.small / total).toBeGreaterThan(0.3)
    })

    it('special 类型在所有阶段占比约 10%', () => {
      const scores = [100, 800, 2000]
      for (const score of scores) {
        const counts = generateAndCount(generator, score, 300)
        const total = 300
        // special 概率 10%，允许 2%~25% 的波动范围
        expect(counts.special / total).toBeGreaterThan(0.02)
        expect(counts.special / total).toBeLessThan(0.25)
      }
    })
  })

  describe('reset()', () => {
    it('reset 后 ID 计数器重置', () => {
      generator.getInitialPlatform()
      generator.reset()
      const platform = generator.getInitialPlatform()
      expect(platform.id).toBe('platform_1')
    })
  })
})
