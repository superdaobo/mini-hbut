import { describe, expect, it } from 'vitest'
import { createCampusBackdrop } from './CampusBackdrop.js'

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

describe('CampusBackdrop', () => {
  it('创建轻量校园背景层，包含南湖、跑道和远景建筑语义', () => {
    const backdrop = createCampusBackdrop()
    const tags = collectTags(backdrop)
    const meshes = collectMeshes(backdrop)

    expect(backdrop.userData.displayName).toBe('湖工校园背景')
    expect(tags.has('nanhu-water')).toBe(true)
    expect(tags.has('campus-track')).toBe(true)
    expect(tags.has('distant-skyline')).toBe(true)
    expect(meshes.length).toBeLessThanOrEqual(18)
  })
})
