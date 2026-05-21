import { describe, expect, it } from 'vitest'
import PlayerRenderer from './PlayerRenderer.js'

function collectTags(group) {
  const tags = new Set(group.userData?.hbutTags || [])
  group.traverse((object) => {
    const objectTags = object.userData?.hbutTags || []
    objectTags.forEach((tag) => tags.add(tag))
    if (object.userData?.campusRole) tags.add(object.userData.campusRole)
  })
  return tags
}

function collectMeshes(group) {
  const meshes = []
  group.traverse((object) => {
    if (object.isMesh) meshes.push(object)
  })
  return meshes
}

describe('PlayerRenderer campus identity', () => {
  it('角色模型带有湖工跳跃者识别元素且保持移动端轻量', () => {
    const renderer = new PlayerRenderer()
    const group = renderer.init()
    const tags = collectTags(group)
    const meshes = collectMeshes(group)

    expect(group.userData.displayName).toBe('湖工跳跃者')
    expect(tags.has('hbut-player')).toBe(true)
    expect(tags.has('school-emblem')).toBe(true)
    expect(tags.has('direction-marker')).toBe(true)
    expect(meshes.length).toBeLessThanOrEqual(9)
  })
})
