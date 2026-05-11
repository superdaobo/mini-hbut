import { describe, it, expect } from 'vitest'
import { clamp, lerp, randomRange, normalize2D, computeParabolicY } from './math.js'

describe('math.js', () => {
  describe('clamp', () => {
    it('值在范围内时不变', () => {
      expect(clamp(5, 0, 10)).toBe(5)
    })

    it('值小于 min 时返回 min', () => {
      expect(clamp(-1, 0, 10)).toBe(0)
    })

    it('值大于 max 时返回 max', () => {
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it('值等于边界时返回边界值', () => {
      expect(clamp(0, 0, 10)).toBe(0)
      expect(clamp(10, 0, 10)).toBe(10)
    })
  })

  describe('lerp', () => {
    it('t=0 时返回 a', () => {
      expect(lerp(0, 10, 0)).toBe(0)
    })

    it('t=1 时返回 b', () => {
      expect(lerp(0, 10, 1)).toBe(10)
    })

    it('t=0.5 时返回中间值', () => {
      expect(lerp(0, 10, 0.5)).toBe(5)
    })

    it('支持负数', () => {
      expect(lerp(-10, 10, 0.5)).toBe(0)
    })
  })

  describe('randomRange', () => {
    it('返回值在 [min, max) 范围内', () => {
      for (let i = 0; i < 100; i++) {
        const val = randomRange(2, 5)
        expect(val).toBeGreaterThanOrEqual(2)
        expect(val).toBeLessThan(5)
      }
    })

    it('min === max 时返回 min', () => {
      expect(randomRange(3, 3)).toBe(3)
    })
  })

  describe('normalize2D', () => {
    it('单位向量归一化后不变', () => {
      const result = normalize2D(1, 0)
      expect(result.x).toBeCloseTo(1)
      expect(result.z).toBeCloseTo(0)
    })

    it('非单位向量归一化后长度为 1', () => {
      const result = normalize2D(3, 4)
      const length = Math.sqrt(result.x ** 2 + result.z ** 2)
      expect(length).toBeCloseTo(1)
      expect(result.x).toBeCloseTo(0.6)
      expect(result.z).toBeCloseTo(0.8)
    })

    it('零向量返回 { x: 0, z: 0 }', () => {
      const result = normalize2D(0, 0)
      expect(result.x).toBe(0)
      expect(result.z).toBe(0)
    })

    it('负值向量归一化正确', () => {
      const result = normalize2D(-1, -1)
      const expected = 1 / Math.sqrt(2)
      expect(result.x).toBeCloseTo(-expected)
      expect(result.z).toBeCloseTo(-expected)
    })
  })

  describe('computeParabolicY', () => {
    it('t=0 时 y=0', () => {
      expect(computeParabolicY(0, 3)).toBe(0)
    })

    it('t=1 时 y=0', () => {
      expect(computeParabolicY(1, 3)).toBe(0)
    })

    it('t=0.5 时 y=height（峰值）', () => {
      expect(computeParabolicY(0.5, 3)).toBeCloseTo(3)
    })

    it('对称性：t 和 1-t 的值相等', () => {
      const height = 2.5
      expect(computeParabolicY(0.3, height)).toBeCloseTo(computeParabolicY(0.7, height))
    })

    it('height=0 时始终返回 0', () => {
      expect(computeParabolicY(0.5, 0)).toBe(0)
    })
  })
})
