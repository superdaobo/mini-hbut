import { describe, it, expect } from 'vitest'
import {
  MAX_CHARGE_MS,
  MIN_JUMP_DISTANCE,
  MAX_JUMP_DISTANCE,
  JUMP_HEIGHT_BASE,
  JUMP_HEIGHT_ADDITIONAL,
  JUMP_DURATION_BASE,
  JUMP_DURATION_ADDITIONAL,
  COMBO_MULTIPLIER_TABLE,
  getComboMultiplier,
  BUILDING_DATA,
  BUILDING_TYPES,
  CAMERA_CONFIG,
  PERFECT_LANDING_THRESHOLD,
  NORMAL_LANDING_THRESHOLD,
  PLATFORM_PROBABILITY
} from './constants.js'

describe('constants.js', () => {
  it('蓄力常量正确', () => {
    expect(MAX_CHARGE_MS).toBe(1500)
  })

  it('跳跃距离常量正确', () => {
    expect(MIN_JUMP_DISTANCE).toBe(2.0)
    expect(MAX_JUMP_DISTANCE).toBe(8.0)
  })

  it('跳跃高度公式参数正确', () => {
    expect(JUMP_HEIGHT_BASE).toBe(2.0)
    expect(JUMP_HEIGHT_ADDITIONAL).toBe(1.5)
  })

  it('跳跃时长公式参数正确', () => {
    expect(JUMP_DURATION_BASE).toBe(350)
    expect(JUMP_DURATION_ADDITIONAL).toBe(250)
  })

  it('连击倍率表完整', () => {
    expect(COMBO_MULTIPLIER_TABLE).toHaveLength(4)
    expect(getComboMultiplier(0)).toBe(1.0)
    expect(getComboMultiplier(1)).toBe(1.0)
    expect(getComboMultiplier(2)).toBe(1.5)
    expect(getComboMultiplier(3)).toBe(2.0)
    expect(getComboMultiplier(4)).toBe(2.5)
    expect(getComboMultiplier(10)).toBe(2.5)
  })

  it('建筑数据表包含 13 种建筑', () => {
    expect(BUILDING_TYPES).toHaveLength(13)
  })

  it('建筑数据与 design.md 一致', () => {
    expect(BUILDING_DATA.library.size).toEqual({ width: 3.0, depth: 2.5, height: 2.0 })
    expect(BUILDING_DATA.library.baseScore).toBe(1)
    expect(BUILDING_DATA.library.color).toBe('#5B7B8A')

    expect(BUILDING_DATA.engineering.size).toEqual({ width: 2.8, depth: 2.2, height: 2.5 })
    expect(BUILDING_DATA.engineering.color).toBe('#8B4513')

    expect(BUILDING_DATA.gymnasium.size).toEqual({ width: 3.2, depth: 3.2, height: 1.8 })
    expect(BUILDING_DATA.gymnasium.color).toBe('#A8A8A8')

    expect(BUILDING_DATA.south_gate.size).toEqual({ width: 2.2, depth: 1.5, height: 1.8 })
    expect(BUILDING_DATA.south_gate.baseScore).toBe(2)
    expect(BUILDING_DATA.south_gate.color).toBe('#8B0000')

    expect(BUILDING_DATA.north_gate.size).toEqual({ width: 2.0, depth: 1.5, height: 1.6 })
    expect(BUILDING_DATA.north_gate.color).toBe('#4A4A4A')

    expect(BUILDING_DATA.canteen.size).toEqual({ width: 2.5, depth: 2.0, height: 1.2 })
    expect(BUILDING_DATA.canteen.color).toBe('#D2691E')

    expect(BUILDING_DATA.teaching.size).toEqual({ width: 2.2, depth: 1.8, height: 1.8 })
    expect(BUILDING_DATA.teaching.color).toBe('#6B8E9B')

    expect(BUILDING_DATA.laboratory.size).toEqual({ width: 2.0, depth: 1.8, height: 2.0 })
    expect(BUILDING_DATA.laboratory.color).toBe('#B0B0B0')

    expect(BUILDING_DATA.admin.size).toEqual({ width: 2.2, depth: 1.8, height: 1.6 })
    expect(BUILDING_DATA.admin.color).toBe('#F5DEB3')

    expect(BUILDING_DATA.activity_center.size).toEqual({ width: 2.0, depth: 2.0, height: 1.5 })
    expect(BUILDING_DATA.activity_center.color).toBe('#4682B4')

    expect(BUILDING_DATA.dormitory.size).toEqual({ width: 1.7, depth: 1.5, height: 2.2 })
    expect(BUILDING_DATA.dormitory.baseScore).toBe(3)
    expect(BUILDING_DATA.dormitory.color).toBe('#CD5C5C')

    expect(BUILDING_DATA.metro_station.size).toEqual({ width: 1.7, depth: 1.7, height: 0.9 })
    expect(BUILDING_DATA.metro_station.color).toBe('#003DA5')

    expect(BUILDING_DATA.nanhu_bridge.size).toEqual({ width: 2.6, depth: 1.8, height: 0.6 })
    expect(BUILDING_DATA.nanhu_bridge.baseScore).toBe(4)
    expect(BUILDING_DATA.nanhu_bridge.color).toBe('#808080')
    // 极端细长比应消除（宽/深更接近正方形）
    expect(BUILDING_DATA.nanhu_bridge.size.width / BUILDING_DATA.nanhu_bridge.size.depth).toBeLessThan(2)
  })

  it('相机配置参数正确', () => {
    expect(CAMERA_CONFIG.type).toBe('OrthographicCamera')
    expect(CAMERA_CONFIG.frustumSize).toBe(12)
    expect(CAMERA_CONFIG.near).toBe(0.1)
    expect(CAMERA_CONFIG.far).toBe(1000)
    expect(CAMERA_CONFIG.position).toEqual({ x: 10, y: 10, z: 10 })
    expect(CAMERA_CONFIG.lookAt).toEqual({ x: 0, y: 0, z: 0 })
    expect(CAMERA_CONFIG.followEasing).toBe('easeOutCubic')
    expect(CAMERA_CONFIG.followDuration).toBe(300)
  })

  it('落点判定阈值正确', () => {
    expect(PERFECT_LANDING_THRESHOLD).toBe(0.32)
    expect(NORMAL_LANDING_THRESHOLD).toBe(1.06)
  })

  it('平台概率分布总和为 1', () => {
    for (const [, dist] of Object.entries(PLATFORM_PROBABILITY)) {
      const sum = dist.large + dist.medium + dist.small + dist.special
      expect(sum).toBeCloseTo(1.0)
    }
  })
})
