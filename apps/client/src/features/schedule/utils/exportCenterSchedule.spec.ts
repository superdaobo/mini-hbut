import { describe, expect, it } from 'vitest'
import {
  collectExportCenterPersonalEvents,
  personalEventTimeLabel,
  toExportCenterPersonalEvent
} from './exportCenterSchedule'

const event = (overrides = {}) => ({
  id: 'evt-1',
  title: '复习',
  date: '2026-09-18',
  start_time: '19:00',
  end_time: '20:00',
  location: '图书馆',
  note: '带教材',
  color: '#3366ff',
  reminder_minutes: 10,
  created_at: '2026-09-18T00:00:00+08:00',
  updated_at: '2026-09-18T00:00:00+08:00',
  ...overrides
})

describe('export center personal schedule events (#852)', () => {
  it('保留导出中心需要的业务字段，不伪装成课程', () => {
    expect(toExportCenterPersonalEvent(event())).toEqual({
      id: 'evt-1',
      title: '复习',
      date: '2026-09-18',
      start_time: '19:00',
      end_time: '20:00',
      location: '图书馆',
      note: '带教材',
      color: '#3366ff',
      reminder_minutes: 10,
      created_at: '2026-09-18T00:00:00+08:00',
      updated_at: '2026-09-18T00:00:00+08:00'
    })
  })

  it('仅收集学期绝对日期范围内的日程并按日期/时间排序', () => {
    const rows = collectExportCenterPersonalEvents({
      events: [
        event({ id: 'later', date: '2026-09-19', start_time: '10:00', end_time: '11:00' }),
        event({ id: 'outside', date: '2027-01-01' }),
        event({ id: 'early', date: '2026-09-18', start_time: '08:00', end_time: '09:00' })
      ],
      range: { startDate: '2026-09-01', endDate: '2026-12-31' }
    })

    expect(rows.map((item) => item.id)).toEqual(['early', 'later'])
  })

  it('跨学期共享 seenIds 时同一日程只进入一个分组', () => {
    const seenIds = new Set<string>()
    const first = collectExportCenterPersonalEvents({
      events: [event()],
      range: { startDate: '2026-09-01', endDate: '2026-10-01' },
      seenIds
    })
    const second = collectExportCenterPersonalEvents({
      events: [event()],
      range: { startDate: '2026-09-15', endDate: '2026-12-31' },
      seenIds
    })

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(0)
  })

  it('非法日期时间或空标题不会进入导出', () => {
    const rows = collectExportCenterPersonalEvents({
      events: [
        event({ id: 'bad-time', end_time: '18:00' }),
        event({ id: 'bad-date', date: '2026-02-30' }),
        event({ id: 'blank-title', title: '  ' })
      ],
      range: { startDate: '2026-01-01', endDate: '2026-12-31' }
    })

    expect(rows).toEqual([])
  })

  it('长图时间展示保持真实开始/结束时间', () => {
    expect(personalEventTimeLabel(event())).toBe('19:00–20:00')
  })
})
