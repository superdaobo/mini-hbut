/**
 * StateMachine - 游戏状态机
 * 状态：idle → charging → jumping → landed → gameover
 * 仅在 idle 状态接受新的蓄力输入（防快速连点）
 */

/** 合法状态转换表 */
const TRANSITIONS = {
  idle: ['charging'],
  charging: ['jumping'],
  jumping: ['landed', 'gameover'],
  landed: ['idle'],
  gameover: []
}

export class StateMachine {
  constructor() {
    /** @type {string} 当前状态 */
    this._state = 'idle'
    /** @type {Function|null} 状态变化回调 */
    this._onChange = null
  }

  /**
   * 获取当前状态
   * @returns {'idle'|'charging'|'jumping'|'landed'|'gameover'}
   */
  getState() {
    return this._state
  }

  /**
   * 尝试转换到目标状态
   * @param {string} targetState - 目标状态
   * @returns {boolean} 转换是否成功
   */
  transition(targetState) {
    const allowed = TRANSITIONS[this._state]
    if (!allowed || !allowed.includes(targetState)) {
      return false
    }

    const prevState = this._state
    this._state = targetState

    if (this._onChange) {
      this._onChange(targetState, prevState)
    }

    return true
  }

  /**
   * 是否可以开始蓄力（仅 idle 状态允许）
   * @returns {boolean}
   */
  canCharge() {
    return this._state === 'idle'
  }

  /**
   * 设置状态变化回调
   * @param {Function} callback - (newState, prevState) => void
   */
  onChange(callback) {
    this._onChange = callback
  }

  /**
   * 重置状态机到 idle
   */
  reset() {
    const prevState = this._state
    this._state = 'idle'
    if (this._onChange && prevState !== 'idle') {
      this._onChange('idle', prevState)
    }
  }
}
