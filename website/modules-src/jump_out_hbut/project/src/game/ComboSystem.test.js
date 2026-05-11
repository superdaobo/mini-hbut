import { describe, it, expect, beforeEach } from 'vitest'
import { ComboSystem } from './ComboSystem.js'

describe('ComboSystem', () => {
  let combo

  beforeEach(() => {
    combo = new ComboSystem()
  })

  describe('初始状态', () => {
    it('初始 count=0, multiplier=1.0', () => {
      const state = combo.getState()
      expect(state.count).toBe(0)
      expect(state.multiplier).toBe(1.0)
    })
  })

  describe('连续 perfect 序列倍率递增', () => {
    it('单次 perfect: count=1, multiplier=1.0', () => {
      const state = combo.recordLanding('perfect')
      expect(state.count).toBe(1)
      expect(state.multiplier).toBe(1.0)
    })

    it('两次连续 perfect: count=2, multiplier=1.5', () => {
      combo.recordLanding('perfect')
      const state = combo.recordLanding('perfect')
      expect(state.count).toBe(2)
      expect(state.multiplier).toBe(1.5)
    })

    it('三次连续 perfect: count=3, multiplier=2.0', () => {
      combo.recordLanding('perfect')
      combo.recordLanding('perfect')
      const state = combo.recordLanding('perfect')
      expect(state.count).toBe(3)
      expect(state.multiplier).toBe(2.0)
    })

    it('四次连续 perfect: count=4, multiplier=2.5（封顶）', () => {
      combo.recordLanding('perfect')
      combo.recordLanding('perfect')
      combo.recordLanding('perfect')
      const state = combo.recordLanding('perfect')
      expect(state.count).toBe(4)
      expect(state.multiplier).toBe(2.5)
    })

    it('五次及以上连续 perfect: multiplier 仍为 2.5（不超过封顶值）', () => {
      for (let i = 0; i < 5; i++) {
        combo.recordLanding('perfect')
      }
      const state = combo.getState()
      expect(state.count).toBe(5)
      expect(state.multiplier).toBe(2.5)

      // 继续 perfect，倍率不变
      const state2 = combo.recordLanding('perfect')
      expect(state2.count).toBe(6)
      expect(state2.multiplier).toBe(2.5)
    })
  })

  describe('normal 着陆重置', () => {
    it('normal 着陆将 count 重置为 0, multiplier 重置为 1.0', () => {
      combo.recordLanding('perfect')
      combo.recordLanding('perfect')
      combo.recordLanding('perfect')
      // 此时 count=3, multiplier=2.0
      const state = combo.recordLanding('normal')
      expect(state.count).toBe(0)
      expect(state.multiplier).toBe(1.0)
    })

    it('连续 normal 着陆保持 count=0', () => {
      combo.recordLanding('normal')
      combo.recordLanding('normal')
      const state = combo.getState()
      expect(state.count).toBe(0)
      expect(state.multiplier).toBe(1.0)
    })
  })

  describe('reset() 后可以重新开始连击', () => {
    it('reset 后状态归零', () => {
      combo.recordLanding('perfect')
      combo.recordLanding('perfect')
      combo.reset()
      const state = combo.getState()
      expect(state.count).toBe(0)
      expect(state.multiplier).toBe(1.0)
    })

    it('reset 后重新开始连击', () => {
      combo.recordLanding('perfect')
      combo.recordLanding('perfect')
      combo.recordLanding('perfect')
      combo.reset()

      // 重新开始
      combo.recordLanding('perfect')
      combo.recordLanding('perfect')
      const state = combo.getState()
      expect(state.count).toBe(2)
      expect(state.multiplier).toBe(1.5)
    })
  })

  describe('交替 perfect/normal：永远无法建立连击', () => {
    it('perfect-normal-perfect-normal 序列中 multiplier 始终为 1.0', () => {
      combo.recordLanding('perfect')
      expect(combo.getState().multiplier).toBe(1.0) // count=1 → 1.0

      combo.recordLanding('normal')
      expect(combo.getState().count).toBe(0)
      expect(combo.getState().multiplier).toBe(1.0)

      combo.recordLanding('perfect')
      expect(combo.getState().count).toBe(1)
      expect(combo.getState().multiplier).toBe(1.0)

      combo.recordLanding('normal')
      expect(combo.getState().count).toBe(0)
      expect(combo.getState().multiplier).toBe(1.0)
    })
  })
})
