import { describe, expect, it } from 'vitest'

import { getChaoxingClassConfig, normalizeChaoxingClassConfig, normalizeRemoteConfig } from './remote_config'

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

describe('remote config chaoxing_class (#360)', () => {
  it('defaults to historical fixed class when block missing', () => {
    const config = normalizeRemoteConfig({})
    expect(config.chaoxing_class).toMatchObject({
      enabled: true,
      invite_code: '73202625',
      course_id: '264356359',
      clazz_id: '148246853',
      course_name: '库来西库',
      teacher_name: '周金阳',
      cpi: '509967218'
    })
  })

  it('allows remote invite_code / course override', () => {
    const config = normalizeRemoteConfig({
      chaoxing_class: {
        invite_code: '99990001',
        course_id: '111',
        clazz_id: '222',
        course_name: '测试班',
        teacher_name: '张三',
        cpi: '333'
      }
    })
    expect(config.chaoxing_class.invite_code).toBe('99990001')
    expect(config.chaoxing_class.course_id).toBe('111')
    expect(config.chaoxing_class.clazz_id).toBe('222')
    expect(config.chaoxing_class.course_name).toBe('测试班')
  })

  it('normalizeChaoxingClassConfig accepts camelCase aliases', () => {
    const block = normalizeChaoxingClassConfig({
      inviteCode: '88880002',
      courseId: 'c1',
      clazzId: 'z1'
    })
    expect(block.invite_code).toBe('88880002')
    expect(block.course_id).toBe('c1')
    expect(block.clazz_id).toBe('z1')
  })

  it('getChaoxingClassConfig reads from provided config object', () => {
    const got = getChaoxingClassConfig({
      chaoxing_class: { invite_code: '77770003', course_id: '9', clazz_id: '8' }
    })
    expect(got.invite_code).toBe('77770003')
    expect(got.course_id).toBe('9')
  })
})
