import { describe, expect, it } from 'vitest'

import { normalizeRemoteConfig } from './remote_config'

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
  'hbut_parking'
]

describe('remote config module center defaults', () => {
  it('keeps all built-in game modules when remote config has no module_center block', () => {
    const config = normalizeRemoteConfig({})

    expect(config.module_center.channel).toBe('main')
    expect(config.module_center.modules.map((item) => item.id)).toEqual(expectedGameOrder)
    expect(config.module_center.modules.map((item) => item.order)).toEqual(
      expectedGameOrder.map((_, index) => index + 1)
    )
  })
})
