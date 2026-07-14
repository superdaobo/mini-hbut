import { describe, expect, it, beforeEach } from 'vitest'

import {
  DEFAULT_CHAOXING_INVITE_CODE,
  getChaoxingClassConfig,
  normalizeChaoxingClassConfig,
  normalizeRemoteConfig,
  persistChaoxingInviteCode,
  resolveChaoxingInviteCode
} from './remote_config'

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

describe('remote config chaoxing_class (invite-only)', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('hbu_chaoxing_invite_code_cache_v1')
    } catch {
      /* ignore */
    }
  })

  it('defaults to built-in invite 18853572 without hardcoded course meta', () => {
    const config = normalizeRemoteConfig({})
    expect(config.chaoxing_class.invite_code).toBe(DEFAULT_CHAOXING_INVITE_CODE)
    expect(config.chaoxing_class.invite_code).toBe('18853572')
    expect(config.chaoxing_class.course_id || '').toBe('')
    expect(config.chaoxing_class.course_name || '').toBe('')
  })

  it('accepts remote invite_code only', () => {
    const config = normalizeRemoteConfig({
      chaoxing_class: {
        invite_code: '99990001'
      }
    })
    expect(config.chaoxing_class.invite_code).toBe('99990001')
    expect(config.chaoxing_class.course_id || '').toBe('')
  })

  it('normalizeChaoxingClassConfig accepts camelCase inviteCode', () => {
    const block = normalizeChaoxingClassConfig({
      inviteCode: '88880002'
    })
    expect(block.invite_code).toBe('88880002')
  })

  it('getChaoxingClassConfig reads invite from provided config', () => {
    const got = getChaoxingClassConfig({
      chaoxing_class: { invite_code: '77770003' }
    })
    expect(got.invite_code).toBe('77770003')
  })

  it('uses cached invite when remote block empty', () => {
    persistChaoxingInviteCode('55550001')
    expect(resolveChaoxingInviteCode({})).toBe('55550001')
    expect(normalizeChaoxingClassConfig({}).invite_code).toBe('55550001')
  })

  it('persists explicit invite when requested', () => {
    normalizeChaoxingClassConfig({ invite_code: '44440001' }, { persistInvite: true })
    expect(resolveChaoxingInviteCode({})).toBe('44440001')
  })
})
