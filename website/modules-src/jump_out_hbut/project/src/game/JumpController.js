import { computeParabolicY } from '../utils/math.js'
import {
  MIN_JUMP_DISTANCE,
  MAX_JUMP_DISTANCE,
  JUMP_HEIGHT_BASE,
  JUMP_HEIGHT_ADDITIONAL,
  JUMP_DURATION_BASE,
  JUMP_DURATION_ADDITIONAL
} from '../utils/constants.js'

/**
 * 跳跃控制器
 * 根据蓄力百分比计算跳跃轨迹，每帧更新位置
 */
export class JumpController {
  constructor() {
    /** @type {boolean} 是否正在跳跃 */
    this._jumping = false
    /** @type {number} 跳跃已经过时间（ms） */
    this._elapsed = 0
    /** @type {number} 跳跃总时长（ms） */
    this._duration = 0
    /** @type {number} 跳跃距离 */
    this._distance = 0
    /** @type {number} 跳跃峰值高度 */
    this._peakHeight = 0
    /** @type {{ x: number, y: number, z: number }} 起始位置 */
    this._startPos = { x: 0, y: 0, z: 0 }
    /** @type {{ x: number, z: number }} 方向向量（归一化后的 XZ 分量） */
    this._direction = { x: 0, z: 0 }
  }

  /**
   * 根据蓄力百分比和方向执行跳跃
   * @param {number} chargePercent - 蓄力百分比 [0, 1]
   * @param {'left' | 'right'} direction - 跳跃方向
   * @param {{ x: number, y: number, z: number }} [startPos] - 起始位置，默认 (0,0,0)
   * @returns {{ startPos: { x: number, y: number, z: number }, endPos: { x: number, y: number, z: number }, peakHeight: number, duration: number }}
   */
  jump(chargePercent, direction, startPos = { x: 0, y: 0, z: 0 }) {
    // 计算跳跃距离：1.5 + chargePercent * 4.5
    this._distance = MIN_JUMP_DISTANCE + chargePercent * (MAX_JUMP_DISTANCE - MIN_JUMP_DISTANCE)

    // 计算跳跃峰值高度：2.0 + chargePercent * 1.5
    this._peakHeight = JUMP_HEIGHT_BASE + chargePercent * JUMP_HEIGHT_ADDITIONAL

    // 计算跳跃时长：400 + chargePercent * 200 ms
    this._duration = JUMP_DURATION_BASE + chargePercent * JUMP_DURATION_ADDITIONAL

    // 计算方向向量（±45° 相对于 Z 轴正方向）
    // left → angle = -45°, right → angle = +45°
    const angle = direction === 'left' ? -Math.PI / 4 : Math.PI / 4
    this._direction = {
      x: Math.sin(angle),
      z: Math.cos(angle)
    }

    // 记录起始位置
    this._startPos = { ...startPos }

    // 计算终点位置
    const endPos = {
      x: this._startPos.x + this._direction.x * this._distance,
      y: this._startPos.y,
      z: this._startPos.z + this._direction.z * this._distance
    }

    // 开始跳跃
    this._jumping = true
    this._elapsed = 0

    return {
      startPos: { ...this._startPos },
      endPos,
      peakHeight: this._peakHeight,
      duration: this._duration
    }
  }

  /**
   * 获取当前跳跃进度
   * @returns {number} 进度 [0, 1]，跳跃完成后返回 1，未开始时返回 0
   */
  getProgress() {
    if (this._duration === 0) {
      return 0
    }
    return Math.min(this._elapsed / this._duration, 1)
  }

  /**
   * 是否正在跳跃
   * @returns {boolean}
   */
  isJumping() {
    return this._jumping
  }

  /**
   * 每帧更新，推进跳跃进度
   * @param {number} deltaTime - 帧间隔时间（ms）
   * @returns {{ x: number, y: number, z: number }} 当前位置
   */
  update(deltaTime) {
    if (!this._jumping) {
      return { ...this._startPos }
    }

    this._elapsed += deltaTime

    const t = this.getProgress()

    // 计算当前位置
    const currentPos = {
      x: this._startPos.x + this._direction.x * this._distance * t,
      y: this._startPos.y + computeParabolicY(t, this._peakHeight),
      z: this._startPos.z + this._direction.z * this._distance * t
    }

    // 跳跃完成
    if (this._elapsed >= this._duration) {
      this._jumping = false
    }

    return currentPos
  }

  /**
   * 重置跳跃控制器
   */
  reset() {
    this._jumping = false
    this._elapsed = 0
    this._duration = 0
    this._distance = 0
    this._peakHeight = 0
    this._startPos = { x: 0, y: 0, z: 0 }
    this._direction = { x: 0, z: 0 }
  }
}
