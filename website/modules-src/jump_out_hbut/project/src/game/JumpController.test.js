import { describe, it, expect, beforeEach } from 'vitest'
import { JumpController } from './JumpController.js'
import {
  MIN_JUMP_DISTANCE,
  MAX_JUMP_DISTANCE,
  JUMP_DURATION_BASE,
  JUMP_DURATION_ADDITIONAL
} from '../utils/constants.js'

describe('JumpController', () => {
  let jumpController

  beforeEach(() => {
    jumpController = new JumpController()
  })

  describe('jump() 跳跃参数计算', () => {
    it('chargePercent=0.5 → distance=5.0, duration=475ms', () => {
      const trajectory = jumpController.jump(0.5, 'right')
      expect(trajectory.duration).toBe(475)
      // 验证终点距离起点的 XZ 平面距离
      const dx = trajectory.endPos.x - trajectory.startPos.x
      const dz = trajectory.endPos.z - trajectory.startPos.z
      const distance = Math.sqrt(dx * dx + dz * dz)
      expect(distance).toBeCloseTo(5.0)
    })

    it('chargePercent=0 → distance=2.0, duration=350ms', () => {
      const trajectory = jumpController.jump(0, 'left')
      expect(trajectory.duration).toBe(350)
      const dx = trajectory.endPos.x - trajectory.startPos.x
      const dz = trajectory.endPos.z - trajectory.startPos.z
      const distance = Math.sqrt(dx * dx + dz * dz)
      expect(distance).toBeCloseTo(2.0)
    })

    it('chargePercent=1.0 → distance=8.0, duration=600ms', () => {
      const trajectory = jumpController.jump(1.0, 'right')
      expect(trajectory.duration).toBe(600)
      const dx = trajectory.endPos.x - trajectory.startPos.x
      const dz = trajectory.endPos.z - trajectory.startPos.z
      const distance = Math.sqrt(dx * dx + dz * dz)
      expect(distance).toBeCloseTo(8.0)
    })

    it('peakHeight = 2.0 + chargePercent * 1.5', () => {
      const trajectory = jumpController.jump(0.5, 'right')
      // 2.0 + 0.5 * 1.5 = 2.75
      expect(trajectory.peakHeight).toBeCloseTo(2.75)
    })

    it('chargePercent 超过 1 时钳制到最大跳跃距离，避免异常高速穿模', () => {
      const trajectory = jumpController.jump(2.5, 'right')
      const dx = trajectory.endPos.x - trajectory.startPos.x
      const dz = trajectory.endPos.z - trajectory.startPos.z
      const distance = Math.sqrt(dx * dx + dz * dz)

      expect(distance).toBeCloseTo(MAX_JUMP_DISTANCE)
      expect(trajectory.duration).toBe(JUMP_DURATION_BASE + JUMP_DURATION_ADDITIONAL)
    })

    it('chargePercent 小于 0 时钳制到最小跳跃距离，避免反向异常输入', () => {
      const trajectory = jumpController.jump(-0.75, 'left')
      const dx = trajectory.endPos.x - trajectory.startPos.x
      const dz = trajectory.endPos.z - trajectory.startPos.z
      const distance = Math.sqrt(dx * dx + dz * dz)

      expect(distance).toBeCloseTo(MIN_JUMP_DISTANCE)
      expect(trajectory.duration).toBe(JUMP_DURATION_BASE)
    })
  })

  describe('轨迹起点和终点 y 值相等', () => {
    it('chargePercent=0.5 时起点和终点 y 相等', () => {
      const trajectory = jumpController.jump(0.5, 'right')
      expect(trajectory.endPos.y).toBe(trajectory.startPos.y)
    })

    it('chargePercent=0 时起点和终点 y 相等', () => {
      const trajectory = jumpController.jump(0, 'left')
      expect(trajectory.endPos.y).toBe(trajectory.startPos.y)
    })

    it('chargePercent=1.0 时起点和终点 y 相等', () => {
      const trajectory = jumpController.jump(1.0, 'right')
      expect(trajectory.endPos.y).toBe(trajectory.startPos.y)
    })

    it('自定义起始位置时起点和终点 y 相等', () => {
      const startPos = { x: 5, y: 3, z: 2 }
      const trajectory = jumpController.jump(0.7, 'left', startPos)
      expect(trajectory.endPos.y).toBe(trajectory.startPos.y)
      expect(trajectory.startPos.y).toBe(3)
    })
  })

  describe('getProgress() 进度', () => {
    it('跳跃开始时进度为 0', () => {
      jumpController.jump(0.5, 'right')
      expect(jumpController.getProgress()).toBe(0)
    })

    it('跳跃结束时进度为 1', () => {
      const trajectory = jumpController.jump(0.5, 'right')
      // 推进整个跳跃时长
      jumpController.update(trajectory.duration)
      expect(jumpController.getProgress()).toBeCloseTo(1)
    })

    it('跳跃中途进度正确', () => {
      const trajectory = jumpController.jump(0.5, 'right')
      jumpController.update(trajectory.duration / 2) // 推进一半时间
      expect(jumpController.getProgress()).toBeCloseTo(0.5)
    })

    it('未跳跃时进度为 0', () => {
      expect(jumpController.getProgress()).toBe(0)
    })
  })

  describe('isJumping() 状态', () => {
    it('初始状态不在跳跃', () => {
      expect(jumpController.isJumping()).toBe(false)
    })

    it('jump() 后正在跳跃', () => {
      jumpController.jump(0.5, 'right')
      expect(jumpController.isJumping()).toBe(true)
    })

    it('跳跃完成后不再跳跃', () => {
      const trajectory = jumpController.jump(0.5, 'right')
      jumpController.update(trajectory.duration)
      expect(jumpController.isJumping()).toBe(false)
    })

    it('跳跃中途仍在跳跃', () => {
      const trajectory = jumpController.jump(0.5, 'right')
      jumpController.update(trajectory.duration / 2)
      expect(jumpController.isJumping()).toBe(true)
    })
  })

  describe('update(deltaTime) 位置更新', () => {
    it('推进 deltaTime 后位置正确', () => {
      const trajectory = jumpController.jump(0.5, 'right') // duration=475, distance=5.0
      const pos = jumpController.update(trajectory.duration / 2) // t=0.5
      // x(0.5) = 0 + sin(30°) * 5.0 * 0.5
      const expectedX = Math.sin(Math.PI / 6) * 5.0 * 0.5
      const expectedZ = Math.cos(Math.PI / 6) * 5.0 * 0.5
      // y(0.5) = 0 + 2.75 * 4 * 0.5 * 0.5 = 2.75（峰值）
      const expectedY = 2.75 * 4 * 0.5 * 0.5
      expect(pos.x).toBeCloseTo(expectedX)
      expect(pos.y).toBeCloseTo(expectedY)
      expect(pos.z).toBeCloseTo(expectedZ)
    })

    it('跳跃完成时位置为终点', () => {
      const trajectory = jumpController.jump(0.5, 'right')
      const pos = jumpController.update(500) // 完整时长
      // t=1 时 y 偏移 = height * 4 * 1 * 0 = 0
      expect(pos.x).toBeCloseTo(trajectory.endPos.x)
      expect(pos.y).toBeCloseTo(trajectory.endPos.y)
      expect(pos.z).toBeCloseTo(trajectory.endPos.z)
    })

    it('未跳跃时 update 返回起始位置', () => {
      const pos = jumpController.update(100)
      expect(pos).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('多次 update 累积推进进度', () => {
      const trajectory = jumpController.jump(0.5, 'right') // duration=475
      jumpController.update(trajectory.duration * 0.2)
      jumpController.update(trajectory.duration * 0.2)
      expect(jumpController.getProgress()).toBeCloseTo(0.4)
    })
  })

  describe('方向计算', () => {
    it('right 方向为 +30° 相对于 Z 轴', () => {
      const trajectory = jumpController.jump(0.5, 'right')
      const dx = trajectory.endPos.x - trajectory.startPos.x
      const dz = trajectory.endPos.z - trajectory.startPos.z
      // right → sin(30°) > 0, cos(30°) > 0
      expect(dx).toBeGreaterThan(0)
      expect(dz).toBeGreaterThan(0)
      expect(dx / dz).toBeCloseTo(Math.tan(Math.PI / 6))
    })

    it('left 方向为 -30° 相对于 Z 轴', () => {
      const trajectory = jumpController.jump(0.5, 'left')
      const dx = trajectory.endPos.x - trajectory.startPos.x
      const dz = trajectory.endPos.z - trajectory.startPos.z
      // left → sin(-30°) < 0, cos(-30°) > 0
      expect(dx).toBeLessThan(0)
      expect(dz).toBeGreaterThan(0)
      expect(Math.abs(dx) / dz).toBeCloseTo(Math.tan(Math.PI / 6))
    })
  })

  describe('不同高度平台', () => {
    it('跳跃终点应落在目标平台顶部，避免角色进入更高建筑体', () => {
      const startPos = { x: 0, y: 0.5, z: 0 }
      const targetTopY = 2.2
      const trajectory = jumpController.jump(0.5, 'right', startPos, { endY: targetTopY })

      expect(trajectory.startPos.y).toBeCloseTo(startPos.y)
      expect(trajectory.endPos.y).toBeCloseTo(targetTopY)

      const finalPos = jumpController.update(trajectory.duration)
      expect(finalPos.y).toBeCloseTo(targetTopY)
    })

    it('超大 deltaTime 也应钳制在目标平台顶部', () => {
      const targetTopY = 1.2
      const trajectory = jumpController.jump(1, 'right', { x: 0, y: 2, z: 0 }, { endY: targetTopY })
      const finalPos = jumpController.update(trajectory.duration * 4)

      expect(jumpController.isJumping()).toBe(false)
      expect(finalPos.y).toBeCloseTo(targetTopY)
    })
  })

  describe('reset() 重置', () => {
    it('重置后所有状态清零', () => {
      jumpController.jump(0.5, 'right')
      jumpController.update(250)
      jumpController.reset()

      expect(jumpController.isJumping()).toBe(false)
      expect(jumpController.getProgress()).toBe(0)
    })

    it('重置后可以重新跳跃', () => {
      jumpController.jump(0.5, 'right')
      jumpController.update(500)
      jumpController.reset()

      const trajectory = jumpController.jump(1.0, 'left')
      expect(jumpController.isJumping()).toBe(true)
      expect(trajectory.duration).toBe(600)
    })
  })
})
