/**
 * 游戏常量定义
 * 所有数值与 design.md 保持一致
 */

// ========== 蓄力系统 ==========
/** 最大蓄力时间（毫秒） */
export const MAX_CHARGE_MS = 1500

// ========== 跳跃参数 ==========
/** 最小跳跃距离（单位） */
export const MIN_JUMP_DISTANCE = 2.0
/** 最大跳跃距离（单位） */
export const MAX_JUMP_DISTANCE = 8.0

/**
 * 跳跃高度公式参数
 * JUMP_HEIGHT = BASE + chargePercent * ADDITIONAL
 */
export const JUMP_HEIGHT_BASE = 2.0
export const JUMP_HEIGHT_ADDITIONAL = 1.5

/**
 * 跳跃时长公式参数（毫秒）
 * duration = BASE + chargePercent * ADDITIONAL
 */
export const JUMP_DURATION_BASE = 350
export const JUMP_DURATION_ADDITIONAL = 250

// ========== 连击倍率表 ==========
/**
 * 连击倍率表
 * key: 连击次数阈值, value: 对应倍率
 */
export const COMBO_MULTIPLIER_TABLE = [
  { minCount: 0, maxCount: 1, multiplier: 1.0 },
  { minCount: 2, maxCount: 2, multiplier: 1.5 },
  { minCount: 3, maxCount: 3, multiplier: 2.0 },
  { minCount: 4, maxCount: Infinity, multiplier: 2.5 }
]

/**
 * 根据连击次数获取倍率
 * @param {number} count - 连击次数
 * @returns {number} 倍率
 */
export function getComboMultiplier(count) {
  if (count >= 4) return 2.5
  if (count === 3) return 2.0
  if (count === 2) return 1.5
  return 1.0
}

// ========== 建筑数据表 ==========
/**
 * 建筑平台数据
 * type: 建筑类型标识
 * category: 分类（large/medium/small/special）
 * size: { width, depth, height }
 * baseScore: 基础分
 * color: 主色调（十六进制）
 */
export const BUILDING_DATA = {
  library: {
    category: 'large',
    size: { width: 3.0, depth: 2.5, height: 2.0 },
    baseScore: 1,
    color: '#5B7B8A'
  },
  engineering: {
    category: 'large',
    size: { width: 2.8, depth: 2.2, height: 2.5 },
    baseScore: 1,
    color: '#8B4513'
  },
  gymnasium: {
    category: 'large',
    size: { width: 3.2, depth: 3.2, height: 1.8 },
    baseScore: 1,
    color: '#A8A8A8'
  },
  south_gate: {
    category: 'medium',
    size: { width: 2.2, depth: 1.5, height: 1.8 },
    baseScore: 2,
    color: '#8B0000'
  },
  north_gate: {
    category: 'medium',
    size: { width: 2.0, depth: 1.5, height: 1.6 },
    baseScore: 2,
    color: '#4A4A4A'
  },
  canteen: {
    category: 'medium',
    size: { width: 2.5, depth: 2.0, height: 1.2 },
    baseScore: 2,
    color: '#D2691E'
  },
  teaching: {
    category: 'medium',
    size: { width: 2.2, depth: 1.8, height: 1.8 },
    baseScore: 2,
    color: '#6B8E9B'
  },
  laboratory: {
    category: 'medium',
    size: { width: 2.0, depth: 1.8, height: 2.0 },
    baseScore: 2,
    color: '#B0B0B0'
  },
  admin: {
    category: 'medium',
    size: { width: 2.2, depth: 1.8, height: 1.6 },
    baseScore: 2,
    color: '#F5DEB3'
  },
  activity_center: {
    category: 'medium',
    size: { width: 2.0, depth: 2.0, height: 1.5 },
    baseScore: 2,
    color: '#4682B4'
  },
  dormitory: {
    category: 'small',
    size: { width: 1.5, depth: 1.2, height: 2.2 },
    baseScore: 3,
    color: '#CD5C5C'
  },
  metro_station: {
    category: 'small',
    size: { width: 1.5, depth: 1.5, height: 0.8 },
    baseScore: 3,
    color: '#003DA5'
  },
  nanhu_bridge: {
    category: 'special',
    size: { width: 4.0, depth: 1.0, height: 0.5 },
    baseScore: 4,
    color: '#808080'
  }
}

/** 所有建筑类型列表 */
export const BUILDING_TYPES = Object.keys(BUILDING_DATA)

// ========== 相机配置 ==========
export const CAMERA_CONFIG = {
  type: 'OrthographicCamera',
  frustumSize: 12,
  near: 0.1,
  far: 1000,
  position: { x: 10, y: 10, z: 10 },
  lookAt: { x: 0, y: 0, z: 0 },
  followEasing: 'easeOutCubic',
  followDuration: 300
}

/**
 * 下一平台入画约束（相对当前站立平台 / 相机 lookAt）
 * 正交相机 frustumSize=12 时半高 6；竖屏半宽更窄，取保守半径。
 * 目标：落跳前下一平台中心主要落在可见区内。
 */
export const PLATFORM_VISIBILITY = {
  /** 相对当前平台中心，下一平台中心允许的最大平面距离 */
  maxCenterDistance: 6.0,
  /** 生成距离硬上限（同时受跳跃上限约束） */
  maxGenerateDistance: 6.0,
  /** 窄屏/默认 aspect 下用于测试的可见半径（世界单位，与生成上限一致） */
  visibleRadiusFromCameraTarget: 6.0
}

// ========== 落点判定阈值 ==========
/** 完美着陆阈值（距中心 35% 以内） */
export const PERFECT_LANDING_THRESHOLD = 0.35
/** 普通着陆阈值（距中心 110% 以内，稍微宽容） */
export const NORMAL_LANDING_THRESHOLD = 1.1

// ========== 平台生成参数 ==========
/** 平台间距倍率范围（确保在跳跃距离范围内） */
export const PLATFORM_DISTANCE_MIN_FACTOR = 0.8
export const PLATFORM_DISTANCE_MAX_FACTOR = 1.6
/** 高分难度缩放范围 */
export const HIGH_SCORE_SCALE_MIN = 1.0
export const HIGH_SCORE_SCALE_MAX = 1.15
/** 高分阈值 */
export const HIGH_SCORE_THRESHOLD = 1500

// ========== 平台类型概率分布 ==========
/**
 * 按分数阶段的建筑类型概率分布
 * large / medium / small / special
 */
export const PLATFORM_PROBABILITY = {
  low: { large: 0.4, medium: 0.3, small: 0.2, special: 0.1 },       // score < 500
  mid: { large: 0.25, medium: 0.35, small: 0.3, special: 0.1 },     // 500 <= score < 1500
  high: { large: 0.15, medium: 0.25, small: 0.5, special: 0.1 }     // score >= 1500
}
