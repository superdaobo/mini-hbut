import { getComboMultiplier } from '../utils/constants.js'

/**
 * 连击系统
 * 连续 perfect 着陆递增连击计数，normal 着陆重置
 * 倍率表：count<=1→1.0, 2→1.5, 3→2.0, >=4→2.5
 */
export class ComboSystem {
  constructor() {
    this._count = 0
    this._multiplier = 1.0
  }

  /**
   * 记录一次着陆
   * @param {'perfect' | 'normal'} type - 着陆类型
   * @returns {ComboState} 当前连击状态
   */
  recordLanding(type) {
    if (type === 'perfect') {
      this._count++
    } else {
      // normal 着陆重置连击
      this._count = 0
    }
    this._multiplier = getComboMultiplier(this._count)
    return this.getState()
  }

  /**
   * 获取当前连击状态
   * @returns {{ count: number, multiplier: number }}
   */
  getState() {
    return {
      count: this._count,
      multiplier: this._multiplier
    }
  }

  /**
   * 重置连击系统
   */
  reset() {
    this._count = 0
    this._multiplier = 1.0
  }
}
