import { describe, expect, it } from 'vitest'
import { normalizePunchCardList, normalizeShirtInfo, normalizeStudentCardInfo } from './phase2-normalize'

describe('phase2 normalize', () => {
  it('normalizes punch card list with checked totals', () => {
    const result = normalizePunchCardList({
      card_list: [
        { card_id: 1, name: '图书馆', number: 3, is_check: true, latitude: 30.1, longitude: 114.3 },
        { card_id: 2, name: '体育馆', number: 8, is_check: false, latitude: 30.2, longitude: 114.4 }
      ]
    })
    expect(result.total).toBe(2)
    expect(result.checkedTotal).toBe(1)
    expect(result.card_list[0].numberArr).toEqual(['0', '0', '0', '0', '3'])
    expect(result.card_list[0].point).toEqual({ latitude: 30.1, longitude: 114.3 })
  })

  it('normalizes shirt info by position_z', () => {
    const result = normalizeShirtInfo({
      enroll: 1,
      number: 12,
      list: [
        { id: 'a', name: '正面A', position_z: 0 },
        { id: 'b', name: '背面B', position_z: 1 }
      ]
    })
    expect(result.isJoin).toBe(true)
    expect(result.frontList).toHaveLength(1)
    expect(result.behindList).toHaveLength(1)
  })

  it('normalizes student card info', () => {
    const result = normalizeStudentCardInfo({
      name: '张三',
      college: '计算机学院',
      student_no: '20260001'
    })
    expect(result.name).toBe('张三')
    expect(result.college).toBe('计算机学院')
    expect(result.student_no).toBe('20260001')
  })
})