import { describe, expect, it } from 'vitest'
import {
  buildModuleCenterCards,
  normalizeModuleCenterChannel
} from './module_center'

describe('module center cards', () => {
  it('returns empty modules list when no catalog data', () => {
    const cards = buildModuleCenterCards({ channel: 'main' })
    expect(cards.length).toBeGreaterThanOrEqual(0)
  })

  it('uses catalog remote modules without injecting legacy internal entries', () => {
    const cards = buildModuleCenterCards({
      channel: 'main',
      catalogModules: [
        {
          id: 'hecheng_hugongda',
          name: '合成湖工大',
          manifest_url: 'https://example.com/modules/main/hecheng_hugongda/manifest.json',
          order: 1
        }
      ]
    })

    expect(cards.map((item) => item.id)).toEqual(['hecheng_hugongda'])
    expect(cards[0].manifest_url).toBe(
      'https://example.com/modules/main/hecheng_hugongda/manifest.json'
    )
  })

  it('preserves configured internal modules alongside catalog remote modules', () => {
    const cards = buildModuleCenterCards({
      channel: 'main',
      configuredModules: [
        {
          id: 'shuake',
          name: '学习记录',
          kind: 'internal',
          view: 'more_shuake',
          key_required: true,
          order: 1
        },
        {
          id: 'hecheng_hugongda',
          name: '合成湖工大',
          order: 2
        }
      ],
      catalogModules: [
        {
          id: 'hecheng_hugongda',
          name: '合成湖工大',
          manifest_url: 'https://example.com/modules/main/hecheng_hugongda/manifest.json',
          order: 2
        }
      ]
    })

    expect(cards.map((item) => item.id)).toEqual(['shuake', 'hecheng_hugongda'])
    expect(cards[0]).toMatchObject({
      id: 'shuake',
      kind: 'internal',
      view: 'more_shuake',
      key_required: true,
      manifest_url: ''
    })
    expect(cards[1].manifest_url).toBe(
      'https://example.com/modules/main/hecheng_hugongda/manifest.json'
    )
  })

  it('normalizes unsupported module center channels to main', () => {
    expect(normalizeModuleCenterChannel('latest')).toBe('latest')
    expect(normalizeModuleCenterChannel('unknown')).toBe('main')
  })
})
