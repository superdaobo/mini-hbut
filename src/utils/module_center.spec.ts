import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULE_CENTER,
  buildModuleCenterCards,
  normalizeModuleCenterChannel
} from './module_center'

const expectedGameOrder = [
  'hecheng_hugongda',
  'jump_out_hbut',
  'hbut_2048',
  'clumsy_bird_hbut',
  'hbut_monopoly',
  'hbut_miner',
  'hbut_memory_match',
  'hbut_gomoku',
  'hbut_stack',
  'hbut_parking',
  'hbut_match3'
]

describe('module center cards', () => {
  it('returns empty modules list when no catalog data', () => {
    const cards = buildModuleCenterCards({ channel: 'main' })
    expect(cards.length).toBeGreaterThanOrEqual(0)
  })

  it('keeps all built-in games in a contiguous stable order for the Tauri entry', () => {
    expect(DEFAULT_MODULE_CENTER.modules.map((item) => item.id)).toEqual(expectedGameOrder)
    expect(DEFAULT_MODULE_CENTER.modules.map((item) => item.order)).toEqual(
      expectedGameOrder.map((_, index) => index + 1)
    )

    const cards = buildModuleCenterCards({ channel: 'main' })
    expect(cards.map((item) => item.id)).toEqual(expectedGameOrder)
    expect(cards.map((item) => item.order)).toEqual(expectedGameOrder.map((_, index) => index + 1))
  })

  it('keeps built-in game entries when the published catalog is stale', () => {
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

    expect(cards.map((item) => item.id)).toEqual(expectedGameOrder)
    expect(cards[0].manifest_url).toBe(
      'https://example.com/modules/main/hecheng_hugongda/manifest.json'
    )
    expect(cards.find((item) => item.id === 'hbut_monopoly')?.manifest_url).toBe(
      'https://hbut.6661111.xyz/modules/main/hbut_monopoly/manifest.json'
    )
  })

  it('keeps built-in game entries when remote config carries a stale configured list', () => {
    const cards = buildModuleCenterCards({
      channel: 'main',
      configuredModules: [
        { id: 'hecheng_hugongda', name: '合成湖工大', order: 1 },
        { id: 'jump_out_hbut', name: '跳出湖工大', order: 2 },
        { id: 'hbut_2048', name: '2048 湖工大版', order: 3 },
        { id: 'clumsy_bird_hbut', name: '笨鸟先飞', order: 4 }
      ],
      catalogModules: [
        {
          id: 'hecheng_hugongda',
          name: '合成湖工大',
          manifest_url: 'https://example.com/modules/main/hecheng_hugongda/manifest.json',
          order: 1
        }
      ]
    })

    expect(cards.map((item) => item.id)).toEqual(expectedGameOrder)
    expect(cards[0].manifest_url).toBe(
      'https://example.com/modules/main/hecheng_hugongda/manifest.json'
    )
  })

  it('preserves configured internal modules alongside built-in and catalog remote modules', () => {
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

    expect(cards.map((item) => item.id)).toEqual(['shuake', ...expectedGameOrder])
    expect(cards[0]).toMatchObject({
      id: 'shuake',
      kind: 'internal',
      view: 'more_shuake',
      key_required: true,
      manifest_url: ''
    })
    expect(cards.find((item) => item.id === 'hecheng_hugongda')?.manifest_url).toBe(
      'https://example.com/modules/main/hecheng_hugongda/manifest.json'
    )
  })

  it('normalizes unsupported module center channels to main', () => {
    expect(normalizeModuleCenterChannel('latest')).toBe('latest')
    expect(normalizeModuleCenterChannel('unknown')).toBe('main')
  })
})
