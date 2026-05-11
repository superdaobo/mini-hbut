import { clamp } from '../utils/math.js'
import { MAX_CHARGE_MS } from '../utils/constants.js'

/**
 * 蓄力系统
 * 按住蓄力，线性累积百分比，达到 MAX_CHARGE_MS 自动锁定为 100%
 */
export class ChargeSystem {
  constructor() {
    /** @type {boolean} 是否正在蓄力 */
    this._charging = false
    /** @type {number|null} 蓄力开始时间戳 */
    this._startTime = null
    /** @type {number} 停止蓄力时锁定的百分比 */
    this._finalPercent = 0
  }

  /**
   * 开始蓄力
   */
  startCharge() {
    this._charging = true
    this._startTime = Date.now()
    this._finalPercent = 0
  }

  /**
   * 停止蓄力，返回最终蓄力百分比
   * @returns {number} 蓄力百分比 0-1
   */
  stopCharge() {
    if (!this._charging) {
      return this._finalPercent
    }
    this._finalPercent = this.getChargePercent()
    this._charging = false
    this._startTime = null
    return this._finalPercent
  }

  /**
   * 获取当前蓄力百分比
   * @returns {number} 蓄力百分比 0-1
   */
  getChargePercent() {
    if (!this._charging || this._startTime === null) {
      return this._finalPercent
    }
    const elapsed = Date.now() - this._startTime
    return clamp(elapsed / MAX_CHARGE_MS, 0, 1)
  }

  /**
   * 是否正在蓄力
   * @returns {boolean}
   */
  isCharging() {
    return this._charging
  }

  /**
   * 重置所有状态
   */
  reset() {
    this._charging = false
    this._startTime = null
    this._finalPercent = 0
  }
}
