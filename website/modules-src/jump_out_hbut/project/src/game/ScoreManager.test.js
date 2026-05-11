import { describe, it, expect, beforeEach } from 'vitest'
import { ScoreManager } from './ScoreManager.js'

describe('ScoreManager', () => {
  let score

  beforeEach(() => {
    score = new ScoreManager()
  })

  describe('初始状态', () => {
    it('初始总分为 0', () => {
      expect(score.getTotal()).toBe(0)
    })
  })

  describe('addScore 计算与累加', () => {
    it('addScore(2, 1.0) 返回 2, total = 2', () => {
      const result = score.addScore(2, 1.0)
      expect(result).toBe(2)
      expect(score.getTotal()).toBe(2)
    })

    it('addScore(3, 1.5) 返回 4 (floor(4.5)), total = 4', () => {
      const result = score.addScore(3, 1.5)
      expect(result).toBe(4)
      expect(score.getTotal()).toBe(4)
    })

    it('多次 addScore 累加正确', () => {
      score.addScore(2, 1.0) // 2, total = 2
      score.addScore(3, 1.5) // 4, total = 6
      const result = score.addScore(4, 2.5) // 10, total = 16
      expect(result).toBe(10)
      expect(score.getTotal()).toBe(16)
    })

    it('连续多次调用累加正确性', () => {
      const r1 = score.addScore(2, 1.0) // floor(2) = 2
      expect(r1).toBe(2)
      expect(score.getTotal()).toBe(2)

      const r2 = score.addScore(3, 1.5) // floor(4.5) = 4
      expect(r2).toBe(4)
      expect(score.getTotal()).toBe(6)

      const r3 = score.addScore(4, 2.5) // floor(10) = 10
      expect(r3).toBe(10)
      expect(score.getTotal()).toBe(16)
    })
  })

  describe('floor 取整', () => {
    it('addScore(3, 1.5) = floor(4.5) = 4, 不是 5', () => {
      const result = score.addScore(3, 1.5)
      expect(result).toBe(4)
    })

    it('addScore(1, 2.5) = floor(2.5) = 2', () => {
      const result = score.addScore(1, 2.5)
      expect(result).toBe(2)
    })

    it('addScore(3, 2.0) = floor(6.0) = 6（整数不变）', () => {
      const result = score.addScore(3, 2.0)
      expect(result).toBe(6)
    })
  })

  describe('score 始终为非负整数', () => {
    it('baseScore=0 时得分为 0', () => {
      const result = score.addScore(0, 2.5)
      expect(result).toBe(0)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(result)).toBe(true)
    })

    it('multiplier=1.0 时得分等于 baseScore', () => {
      const result = score.addScore(4, 1.0)
      expect(result).toBe(4)
      expect(Number.isInteger(result)).toBe(true)
    })

    it('所有合法输入组合返回非负整数', () => {
      const cases = [
        [1, 1.0], [2, 1.5], [3, 2.0], [4, 2.5],
        [1, 2.5], [2, 2.0], [3, 1.5], [4, 1.0]
      ]
      for (const [base, mult] of cases) {
        const result = score.addScore(base, mult)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(result)).toBe(true)
      }
    })
  })

  describe('reset()', () => {
    it('reset 后总分归零', () => {
      score.addScore(2, 1.0)
      score.addScore(3, 1.5)
      score.addScore(4, 2.5)
      expect(score.getTotal()).toBe(16)

      score.reset()
      expect(score.getTotal()).toBe(0)
    })

    it('reset 后可以重新累加', () => {
      score.addScore(4, 2.5) // 10
      score.reset()
      score.addScore(1, 1.0) // 1
      expect(score.getTotal()).toBe(1)
    })
  })
})
