import { describe, expect, it } from 'vitest'
import {
  buildModuleCenterCards,
  normalizeModuleCenterChannel
} from './module_center'

describe('module center cards', () => {
  it('keeps the built-in learning record card on the first render', () => {
    const cards = buildModuleCenterCards({ channel: 'main' })

    expect(cards[0]).toMatchObject({
      id: 'shuake',
      name: '学习记录',
      kind: 'internal',
      view: 'more_shuake'
    })
  })

  it('preserves built-in internal modules when catalog data only has remote modules', () => {
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

    expect(cards.map((item) => item.id)).toEqual(['shuake', 'hecheng_hugongda'])
    expect(cards[1].manifest_url).toBe(
      'https://example.com/modules/main/hecheng_hugongda/manifest.json'
    )
  })

  it('normalizes unsupported module center channels to main', () => {
    expect(normalizeModuleCenterChannel('latest')).toBe('latest')
    expect(normalizeModuleCenterChannel('unknown')).toBe('main')
  })
})
