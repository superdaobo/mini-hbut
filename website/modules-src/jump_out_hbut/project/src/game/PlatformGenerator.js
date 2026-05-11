/**
 * 平台生成器
 * 负责生成下一个跳跃目标平台，包括方向、距离、建筑类型选择
 */
import { randomRange } from '../utils/math.js'
import {
  BUILDING_DATA,
  BUILDING_TYPES,
  PLATFORM_PROBABILITY,
  PLATFORM_DISTANCE_MIN_FACTOR,
  PLATFORM_DISTANCE_MAX_FACTOR,
  HIGH_SCORE_SCALE_MIN,
  HIGH_SCORE_SCALE_MAX,
  HIGH_SCORE_THRESHOLD
} from '../utils/constants.js'

/** 平台 ID 计数器 */
let _idCounter = 0

/**
 * 生成唯一平台 ID
 * @returns {string}
 */
function generateId() {
  return `platform_${++_idCounter}`
}

/**
 * 根据分数获取当前阶段的概率分布
 * @param {number} score - 当前分数
 * @returns {{ large: number, medium: number, small: number, special: number }}
 */
function getStageProb(score) {
  if (score >= 1500) return PLATFORM_PROBABILITY.high
  if (score >= 500) return PLATFORM_PROBABILITY.mid
  return PLATFORM_PROBABILITY.low
}

/**
 * 根据概率分布选择建筑类别
 * @param {{ large: number, medium: number, small: number, special: number }} prob
 * @returns {string} 类别名称
 */
function pickCategory(prob) {
  const r = Math.random()
  let cumulative = 0

  cumulative += prob.large
  if (r < cumulative) return 'large'

  cumulative += prob.medium
  if (r < cumulative) return 'medium'

  cumulative += prob.small
  if (r < cumulative) return 'small'

  return 'special'
}

/**
 * 从指定类别中随机选择一个建筑类型
 * @param {string} category - 建筑类别
 * @returns {string} 建筑类型 key
 */
function pickTypeFromCategory(category) {
  const candidates = BUILDING_TYPES.filter(
    type => BUILDING_DATA[type].category === category
  )
  if (candidates.length === 0) {
    // fallback: 返回第一个建筑
    return BUILDING_TYPES[0]
  }
  const idx = Math.floor(Math.random() * candidates.length)
  return candidates[idx]
}

export class PlatformGenerator {
  constructor() {
    this._idCounter = 0
    this._lastDirection = 'left' // 交替方向：上一次是 left，下一次就是 right
  }

  /**
   * 获取初始平台（游戏开始时的第一个平台）
   * @returns {Platform}
   */
  getInitialPlatform() {
    const type = 'library' // 初始平台使用图书馆（大型建筑，容易站稳）
    const data = BUILDING_DATA[type]
    return {
      id: generateId(),
      type,
      position: { x: 0, y: 0, z: 0 },
      size: { ...data.size },
      baseScore: data.baseScore
    }
  }

  /**
   * 生成下一个平台
   * @param {Platform} currentPlatform - 当前平台
   * @param {number} score - 当前分数
   * @returns {Platform}
   */
  generateNext(currentPlatform, score) {
    // 1. 交替方向：right → left → right → left...（整体向上移动）
    const direction = this._lastDirection === 'left' ? 'right' : 'left'
    this._lastDirection = direction

    // 2. 根据分数阶段选择建筑类型
    const prob = getStageProb(score)
    const category = pickCategory(prob)
    const type = pickTypeFromCategory(category)
    const data = BUILDING_DATA[type]

    // 3. 计算距离（使用固定基准距离，不依赖当前平台宽度）
    // 基准距离 = 跳跃范围的中间值附近，确保大部分跳跃可达
    const baseDistance = 4.5 // 跳跃范围 2.0~8.0 的中间偏下
    let distance = baseDistance * randomRange(
      PLATFORM_DISTANCE_MIN_FACTOR,
      PLATFORM_DISTANCE_MAX_FACTOR
    )

    // 高分时增加距离缩放
    if (score >= HIGH_SCORE_THRESHOLD) {
      distance *= randomRange(HIGH_SCORE_SCALE_MIN, HIGH_SCORE_SCALE_MAX)
    }

    // 4. 计算位置
    // 方向角度：left = -30°, right = +30°（相对 Z 轴正方向，60° zigzag）
    const angle = direction === 'left' ? -Math.PI / 6 : Math.PI / 6
    const nextX = currentPlatform.position.x + distance * Math.sin(angle)
    const nextZ = currentPlatform.position.z + distance * Math.cos(angle)

    return {
      id: generateId(),
      type,
      position: { x: nextX, y: 0, z: nextZ },
      size: { ...data.size },
      baseScore: data.baseScore,
      direction // 记录方向，供 GameEngine 使用
    }
  }

  /**
   * 重置生成器状态
   */
  reset() {
    _idCounter = 0
    this._lastDirection = 'left'
  }
}
