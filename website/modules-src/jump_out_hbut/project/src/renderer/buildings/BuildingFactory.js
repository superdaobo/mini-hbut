import { BUILDING_DATA } from '../../utils/constants.js'
import { create as createLibrary } from './Library.js'
import { create as createEngineering } from './EngineeringBuilding.js'
import { create as createGymnasium } from './Gymnasium.js'
import { create as createSouthGate } from './SouthGate.js'
import { create as createNorthGate } from './NorthGate.js'
import { create as createCanteen } from './Canteen.js'
import { create as createTeaching } from './TeachingBuilding.js'
import { create as createLaboratory } from './Laboratory.js'
import { create as createDormitory } from './Dormitory.js'
import { create as createAdmin } from './AdminBuilding.js'
import { create as createActivityCenter } from './ActivityCenter.js'
import { create as createMetroStation } from './MetroStation.js'
import { create as createNanhuBridge } from './NanhuBridge.js'

/**
 * 建筑创建函数映射表
 * key: 建筑类型标识（与 BUILDING_DATA 一致）
 */
const CREATORS = {
  library: createLibrary,
  engineering: createEngineering,
  gymnasium: createGymnasium,
  south_gate: createSouthGate,
  north_gate: createNorthGate,
  canteen: createCanteen,
  teaching: createTeaching,
  laboratory: createLaboratory,
  dormitory: createDormitory,
  admin: createAdmin,
  activity_center: createActivityCenter,
  metro_station: createMetroStation,
  nanhu_bridge: createNanhuBridge
}

/**
 * 根据建筑类型创建 Three.js 模型
 * @param {string} type - 建筑类型标识
 * @returns {THREE.Group} 建筑模型组
 */
export function create(type) {
  const creator = CREATORS[type]
  if (!creator) throw new Error(`Unknown building type: ${type}`)
  return creator()
}

/**
 * 获取建筑尺寸
 * @param {string} type - 建筑类型标识
 * @returns {{ width: number, depth: number, height: number }}
 */
export function getSize(type) {
  return BUILDING_DATA[type].size
}

/**
 * 获取建筑基础分
 * @param {string} type - 建筑类型标识
 * @returns {number}
 */
export function getBaseScore(type) {
  return BUILDING_DATA[type].baseScore
}
