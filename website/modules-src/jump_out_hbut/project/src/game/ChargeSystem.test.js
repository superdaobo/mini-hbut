import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChargeSystem } from './ChargeSystem.js'
import { MAX_CHARGE_MS } from '../utils/constants.js'

describe('ChargeSystem', () => {
  let chargeSystem

  beforeEach(() => {
    vi.useFakeTimers()
    chargeSystem = new ChargeSystem()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('蓄力百分比计算', () => {
    it('0ms 经过 → 0% 蓄力', () => {
      chargeSystem.startCharge()
      // 不推进时间
      expect(chargeSystem.getChargePercent()).toBe(0)
    })

    it('经过一半最大蓄力时间 → 50% 蓄力', () => {
      chargeSystem.startCharge()
      vi.advanceTimersByTime(MAX_CHARGE_MS / 2)
      expect(chargeSystem.getChargePercent()).toBeCloseTo(0.5)
    })

    it('达到最大蓄力时间 → 100% 蓄力', () => {
      chargeSystem.startCharge()
      vi.advanceTimersByTime(MAX_CHARGE_MS)
      expect(chargeSystem.getChargePercent()).toBeCloseTo(1.0)
    })

    it('超过最大蓄力时间 → 仍然是 100%（上限锁定）', () => {
      chargeSystem.startCharge()
      vi.advanceTimersByTime(MAX_CHARGE_MS * 2)
      expect(chargeSystem.getChargePercent()).toBeCloseTo(1.0)
    })
  })

  describe('isCharging() 状态', () => {
    it('初始状态不在蓄力', () => {
      expect(chargeSystem.isCharging()).toBe(false)
    })

    it('startCharge() 后正在蓄力', () => {
      chargeSystem.startCharge()
      expect(chargeSystem.isCharging()).toBe(true)
    })

    it('stopCharge() 后停止蓄力', () => {
      chargeSystem.startCharge()
      chargeSystem.stopCharge()
      expect(chargeSystem.isCharging()).toBe(false)
    })
  })

  describe('stopCharge() 返回值', () => {
    it('停止蓄力时返回当前百分比', () => {
      chargeSystem.startCharge()
      vi.advanceTimersByTime(MAX_CHARGE_MS / 2)
      const percent = chargeSystem.stopCharge()
      expect(percent).toBeCloseTo(0.5)
    })

    it('停止后 getChargePercent() 返回锁定值', () => {
      chargeSystem.startCharge()
      vi.advanceTimersByTime(MAX_CHARGE_MS * 0.75)
      chargeSystem.stopCharge()
      // 再推进时间，百分比不应继续增长
      vi.advanceTimersByTime(MAX_CHARGE_MS)
      expect(chargeSystem.getChargePercent()).toBeCloseTo(0.75)
    })

    it('未开始蓄力时 stopCharge() 返回 0', () => {
      const percent = chargeSystem.stopCharge()
      expect(percent).toBe(0)
    })
  })

  describe('reset() 重置', () => {
    it('重置后所有状态清零', () => {
      chargeSystem.startCharge()
      vi.advanceTimersByTime(1000)
      chargeSystem.stopCharge()
      chargeSystem.reset()

      expect(chargeSystem.isCharging()).toBe(false)
      expect(chargeSystem.getChargePercent()).toBe(0)
    })

    it('重置后可以重新开始蓄力', () => {
      chargeSystem.startCharge()
      vi.advanceTimersByTime(MAX_CHARGE_MS)
      chargeSystem.stopCharge()
      chargeSystem.reset()

      chargeSystem.startCharge()
      vi.advanceTimersByTime(MAX_CHARGE_MS * 0.25)
      expect(chargeSystem.getChargePercent()).toBeCloseTo(0.25)
    })
  })
})
