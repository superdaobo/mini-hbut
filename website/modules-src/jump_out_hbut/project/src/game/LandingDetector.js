import { PERFECT_LANDING_THRESHOLD, NORMAL_LANDING_THRESHOLD } from '../utils/constants.js'
import { clamp } from '../utils/math.js'

/**
 * 落点判定器
 * 检测角色落点是否在平台上，并判定着陆质量
 *
 * 判定逻辑：
 *   offsetX = |landPos.x - platform.center.x| / (platform.width / 2)
 *   offsetZ = |landPos.z - platform.center.z| / (platform.depth / 2)
 *   maxOffset = max(offsetX, offsetZ)
 *
 *   maxOffset <= PERFECT_LANDING_THRESHOLD (0.32) → perfect
 *   maxOffset <= NORMAL_LANDING_THRESHOLD (1.06)  → normal
 *   maxOffset > NORMAL_LANDING_THRESHOLD          → miss
 */
export class LandingDetector {
  /**
   * 检测落点
   * @param {{ x: number, y: number, z: number }} position - 角色落点位置
   * @param {Array<{ id: string, type: string, position: { x: number, y: number, z: number }, size: { width: number, depth: number, height: number } }>} platforms - 平台列表（建议最后一个为目标平台）
   * @returns {{ success: boolean, type: 'perfect' | 'normal' | 'miss', platform?: object, offset?: number }}
   */
  detect(position, platforms) {
    // 从最后一个平台开始检查（目标平台优先）
    for (let i = platforms.length - 1; i >= 0; i--) {
      const platform = platforms[i]

      // 计算落点相对于平台中心的归一化偏移
      const offsetX = Math.abs(position.x - platform.position.x) / (platform.size.width / 2)
      const offsetZ = Math.abs(position.z - platform.position.z) / (platform.size.depth / 2)
      const maxOffset = Math.max(offsetX, offsetZ)

      // 在平台范围内（maxOffset <= 1.0）
      if (maxOffset <= NORMAL_LANDING_THRESHOLD) {
        const safePosition = {
          x: clamp(
            position.x,
            platform.position.x - platform.size.width / 2,
            platform.position.x + platform.size.width / 2
          ),
          y: position.y,
          z: clamp(
            position.z,
            platform.position.z - platform.size.depth / 2,
            platform.position.z + platform.size.depth / 2
          )
        }

        if (maxOffset <= PERFECT_LANDING_THRESHOLD) {
          return {
            success: true,
            type: 'perfect',
            platform,
            offset: maxOffset,
            safePosition
          }
        }
        return {
          success: true,
          type: 'normal',
          platform,
          offset: maxOffset,
          safePosition
        }
      }
    }

    // 没有命中任何平台
    return {
      success: false,
      type: 'miss',
      platform: undefined,
      offset: undefined
    }
  }
}
