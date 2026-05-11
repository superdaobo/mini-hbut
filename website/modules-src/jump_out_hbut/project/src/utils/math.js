/**
 * 纯数学工具函数
 * 所有函数无副作用，可独立调用
 */

/**
 * 将值限制在 [min, max] 范围内
 * @param {number} value - 输入值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 限制后的值
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * 线性插值
 * @param {number} a - 起始值
 * @param {number} b - 结束值
 * @param {number} t - 插值因子 [0, 1]
 * @returns {number} 插值结果
 */
export function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * 生成 [min, max) 范围内的随机浮点数
 * @param {number} min - 最小值（包含）
 * @param {number} max - 最大值（不包含）
 * @returns {number} 随机浮点数
 */
export function randomRange(min, max) {
  return min + Math.random() * (max - min)
}

/**
 * 归一化 2D 向量（XZ 平面）
 * 如果向量长度为 0，返回 { x: 0, z: 0 }
 * @param {number} x - X 分量
 * @param {number} z - Z 分量
 * @returns {{ x: number, z: number }} 归一化后的向量
 */
export function normalize2D(x, z) {
  const length = Math.sqrt(x * x + z * z)
  if (length === 0) {
    return { x: 0, z: 0 }
  }
  return { x: x / length, z: z / length }
}

/**
 * 计算抛物线 Y 坐标
 * 公式：y = height * 4 * t * (1 - t)
 * t=0 时 y=0，t=0.5 时 y=height（峰值），t=1 时 y=0
 * @param {number} t - 跳跃进度 [0, 1]
 * @param {number} height - 跳跃峰值高度
 * @returns {number} 当前 Y 坐标偏移
 */
export function computeParabolicY(t, height) {
  return height * 4 * t * (1 - t)
}
