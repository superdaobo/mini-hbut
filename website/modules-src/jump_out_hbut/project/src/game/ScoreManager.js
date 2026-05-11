/**
 * 分数管理器
 * 本次得分 = floor(baseScore × multiplier)
 * 总分 = 所有单次得分之和
 */
export class ScoreManager {
  constructor() {
    this._total = 0
  }

  /**
   * 计算并累加得分
   * @param {number} baseScore - 平台基础分
   * @param {number} multiplier - 连击倍率
   * @returns {number} 本次得分（floor 取整，非负整数）
   */
  addScore(baseScore, multiplier) {
    const score = Math.floor(baseScore * multiplier)
    this._total += score
    return score
  }

  /**
   * 获取总分
   * @returns {number} 总分
   */
  getTotal() {
    return this._total
  }

  /**
   * 重置分数
   */
  reset() {
    this._total = 0
  }
}
