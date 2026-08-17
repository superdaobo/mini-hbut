import { describe, expect, it } from 'vitest'
import { buildScenicTags } from './normalize'

describe('buildScenicTags', () => {
  it('assembles tags from tag_set and tag_set_map like the mini program', () => {
    const tags = buildScenicTags({
      tag_set: ['building', 'food'],
      tag_set_map: [
        { tag: 'building', name: '教学楼' },
        { tag: 'food', name: '餐饮' },
        { tag: 'parking', name: '停车' }
      ]
    })
    expect(tags).toEqual([
      { tag: 'building', name: '教学楼' },
      { tag: 'food', name: '餐饮' }
    ])
  })

  it('falls back to tags array when already normalized', () => {
    const tags = buildScenicTags({
      tags: [{ tag: 'gate', name: '校门' }]
    })
    expect(tags).toEqual([{ tag: 'gate', name: '校门' }])
  })
})