/**
 * PerformanceMonitor - 性能监控器
 * 每帧记录帧率，计算滑动窗口平均值
 * 连续 10 帧 < 45fps → 降级 Level 1（关闭阴影、粒子减半）
 * 连续 10 帧 < 30fps → 降级 Level 2（关闭粒子、简化几何体）
 * 暴露 getLevel() 和 onLevelChange 回调
 */

/** 降级阈值常量 */
const LOW_FPS_THRESHOLD = 45
const VERY_LOW_FPS_THRESHOLD = 30
const CONSECUTIVE_FRAMES_TRIGGER = 10

export class PerformanceMonitor {
  constructor() {
    /** 当前降级等级：0=full, 1=reduced, 2=minimal */
    this._level = 0
    /** 帧时间滑动窗口 */
    this._frameTimes = []
    /** 连续低帧率计数（< 45fps） */
    this._lowFrameCount = 0
    /** 连续极低帧率计数（< 30fps） */
    this._veryLowFrameCount = 0
    /** 等级变化回调 */
    this._onLevelChange = null
  }

  /**
   * 每帧调用，记录帧时间并评估性能
   * @param {number} deltaTime - 本帧耗时（毫秒）
   */
  recordFrame(deltaTime) {
    if (deltaTime <= 0) return

    // 计算当前帧 FPS
    const fps = 1000 / deltaTime

    // 滑动窗口记录（保留最近 60 帧）
    this._frameTimes.push(deltaTime)
    if (this._frameTimes.length > 60) {
      this._frameTimes.shift()
    }

    // 评估连续低帧率
    if (fps < VERY_LOW_FPS_THRESHOLD) {
      this._veryLowFrameCount++
      this._lowFrameCount++ // 极低帧率也算低帧率
    } else if (fps < LOW_FPS_THRESHOLD) {
      this._lowFrameCount++
      this._veryLowFrameCount = 0 // 不是极低，重置极低计数
    } else {
      // 帧率正常，重置计数
      this._lowFrameCount = 0
      this._veryLowFrameCount = 0
    }

    // 判断是否需要降级
    this._evaluateLevel()
  }

  /**
   * 获取当前降级等级
   * @returns {0|1|2} 0=full, 1=reduced, 2=minimal
   */
  getLevel() {
    return this._level
  }

  /**
   * 设置等级变化回调
   * @param {Function} callback - (newLevel: number) => void
   */
  onLevelChange(callback) {
    this._onLevelChange = callback
  }

  /**
   * 重置所有状态
   */
  reset() {
    this._level = 0
    this._frameTimes = []
    this._lowFrameCount = 0
    this._veryLowFrameCount = 0
  }

  /**
   * 获取滑动窗口平均 FPS
   * @returns {number}
   */
  getAverageFps() {
    if (this._frameTimes.length === 0) return 60
    const avgDelta = this._frameTimes.reduce((sum, t) => sum + t, 0) / this._frameTimes.length
    return 1000 / avgDelta
  }

  /**
   * 评估是否需要变更降级等级
   */
  _evaluateLevel() {
    let newLevel = this._level

    if (this._veryLowFrameCount >= CONSECUTIVE_FRAMES_TRIGGER) {
      newLevel = 2
    } else if (this._lowFrameCount >= CONSECUTIVE_FRAMES_TRIGGER) {
      newLevel = 1
    }

    // 降级只升不降（避免频繁切换）
    if (newLevel > this._level) {
      this._level = newLevel
      if (this._onLevelChange) {
        this._onLevelChange(this._level)
      }
    }
  }
}

export default PerformanceMonitor
