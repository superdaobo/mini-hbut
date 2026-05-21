import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BUILDING_TYPES } from '../../utils/constants.js'
import { create, getSize } from './BuildingFactory.js'

function collectMeshes(group) {
  const meshes = []
  group.traverse((object) => {
    if (object.isMesh) meshes.push(object)
  })
  return meshes
}

function collectTags(group) {
  const tags = new Set(group.userData?.hbutTags || [])
  group.traverse((object) => {
    const objectTags = object.userData?.hbutTags || []
    objectTags.forEach((tag) => tags.add(tag))
    if (object.userData?.campusRole) tags.add(object.userData.campusRole)
  })
  return tags
}

function getMeshBounds(group) {
  const box = new THREE.Box3().setFromObject(group)
  const size = new THREE.Vector3()
  box.getSize(size)
  return size
}

describe('BuildingFactory campus visuals', () => {
  it('所有建筑都带有湖工校园语义、可识别标识和细节层', () => {
    for (const type of BUILDING_TYPES) {
      const building = create(type)
      const meshes = collectMeshes(building)
      const tags = collectTags(building)

      expect(building.userData.campusLandmark, type).toBe(true)
      expect(building.userData.displayName, type).toMatch(/湖工|HBUT|南湖|门|楼|馆|站|桥|舍|食堂|中心/)
      expect(tags.has('campus-sign'), `${type} 缺少校园标识牌`).toBe(true)
      expect(tags.has('detail-layer'), `${type} 缺少窗格/功能细节层`).toBe(true)
      expect(tags.has('landing-safe-outline'), `${type} 缺少平台边界提示`).toBe(true)
      expect(meshes.length, `${type} mesh 数量过高会影响移动端`).toBeLessThanOrEqual(36)
    }
  })

  it('建筑视觉不能明显超出平台尺寸，避免装饰造成穿插错觉', () => {
    for (const type of BUILDING_TYPES) {
      const building = create(type)
      const size = getSize(type)
      const bounds = getMeshBounds(building)

      expect(bounds.x, `${type} 宽度超过平台预算`).toBeLessThanOrEqual(size.width + 0.35)
      expect(bounds.z, `${type} 深度超过平台预算`).toBeLessThanOrEqual(size.depth + 0.35)
      expect(bounds.y, `${type} 高度超过平台预算`).toBeLessThanOrEqual(size.height + 0.4)
    }
  })
})
