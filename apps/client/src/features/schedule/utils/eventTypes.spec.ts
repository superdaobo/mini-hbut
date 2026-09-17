/**
 * #836 个人日程领域模型契约测试。
 *
 * 覆盖 `normalizeScheduleEvent`（#835 transport snake_case payload → 前端 camelCase 领域模型）
 * 的归一与拒绝分支，以及 `toScheduleEventPayload` 的字段名契约。
 *
 * 归一失败一律返回 null（而不是半成品），保证非法数据不会流进表单与提交路径。
 */
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_REMINDER_MINUTES,
  REMINDER_OPTIONS,
  isValidCalendarDate,
  normalizeScheduleEvent,
  toScheduleEventPayload,
  type ScheduleEvent
} from './eventTypes'

/** #835 HTTP/Tauri 返回的单条日程 payload（snake_case，不含 student_id） */
const snakeCasePayload = () => ({
  id: 'evt-1',
  title: '小组会议',
  date: '2026-09-18',
  start_time: '14:30',
  end_time: '15:20',
  location: '教三 201',
  note: '带笔记本',
  color: '#72b9ff',
  reminder_minutes: 10,
  created_at: '2026-09-01T10:00:00+08:00',
  updated_at: '2026-09-02T11:00:00+08:00'
})

describe('REMINDER_OPTIONS / ALLOWED_REMINDER_MINUTES', () => {
  it('提供 6 个固定档位且含「不提醒」= null', () => {
    expect(REMINDER_OPTIONS).toHaveLength(6)
    expect(REMINDER_OPTIONS[0]).toEqual({ value: null, labelKey: 'schedule.event.reminder.none' })
    expect(ALLOWED_REMINDER_MINUTES).toEqual([null, 0, 5, 10, 30, 60])
  })

  it('每个档位都带 i18n key（组件不得硬编码中文档位名）', () => {
    for (const option of REMINDER_OPTIONS) {
      expect(option.labelKey.startsWith('schedule.event.reminder.')).toBe(true)
    }
  })
})

describe('isValidCalendarDate', () => {
  it('接受真实日历日期，拒绝格式错误与不存在的日期', () => {
    expect(isValidCalendarDate('2026-09-18')).toBe(true)
    expect(isValidCalendarDate('2024-02-29')).toBe(true)
    expect(isValidCalendarDate('2025-02-29')).toBe(false)
    expect(isValidCalendarDate('2026-13-01')).toBe(false)
    expect(isValidCalendarDate('2026-04-31')).toBe(false)
    expect(isValidCalendarDate('2026/09/18')).toBe(false)
    expect(isValidCalendarDate('2026-9-18')).toBe(false)
    expect(isValidCalendarDate('')).toBe(false)
    expect(isValidCalendarDate(undefined)).toBe(false)
  })
})

describe('normalizeScheduleEvent 归一', () => {
  it('snake_case payload 归一为 camelCase 领域模型', () => {
    const event = normalizeScheduleEvent(snakeCasePayload())
    expect(event).toEqual({
      id: 'evt-1',
      title: '小组会议',
      date: '2026-09-18',
      startTime: '14:30',
      endTime: '15:20',
      location: '教三 201',
      note: '带笔记本',
      color: '#72b9ff',
      reminderMinutes: 10,
      createdAt: '2026-09-01T10:00:00+08:00',
      updatedAt: '2026-09-02T11:00:00+08:00'
    } satisfies ScheduleEvent)
  })

  it('camelCase 输入同样可读（兼容本地草稿/测试夹具回灌）', () => {
    const event = normalizeScheduleEvent({
      id: 'evt-2',
      title: '自习',
      date: '2026-09-19',
      startTime: '08:20',
      endTime: '09:05',
      reminderMinutes: 0
    })
    expect(event?.startTime).toBe('08:20')
    expect(event?.endTime).toBe('09:05')
    expect(event?.reminderMinutes).toBe(0)
  })

  it('兼容 event_id 作为 id 来源', () => {
    const event = normalizeScheduleEvent({ event_id: 'evt-3', ...snakeCasePayload(), id: undefined })
    expect(event?.id).toBe('evt-3')
  })

  it('location / note / color 缺失归一为空串', () => {
    const event = normalizeScheduleEvent({
      id: 'evt-4',
      title: '跑步',
      date: '2026-09-20',
      start_time: '18:00',
      end_time: '19:00'
    })
    expect(event?.location).toBe('')
    expect(event?.note).toBe('')
    expect(event?.color).toBe('')
  })

  it('reminder_minutes 缺失 / 非数字 / 负数一律归一为 null（不提醒）', () => {
    const base = {
      id: 'evt-5',
      title: 'x',
      date: '2026-09-20',
      start_time: '18:00',
      end_time: '19:00'
    }
    expect(normalizeScheduleEvent(base)?.reminderMinutes).toBeNull()
    expect(normalizeScheduleEvent({ ...base, reminder_minutes: 'abc' })?.reminderMinutes).toBeNull()
    expect(normalizeScheduleEvent({ ...base, reminder_minutes: -5 })?.reminderMinutes).toBeNull()
    expect(normalizeScheduleEvent({ ...base, reminder_minutes: 30 })?.reminderMinutes).toBe(30)
  })
})

describe('normalizeScheduleEvent 拒绝（返回 null，不产出半成品）', () => {
  const base = snakeCasePayload()

  it('缺 id → null', () => {
    expect(normalizeScheduleEvent({ ...base, id: undefined })).toBeNull()
    expect(normalizeScheduleEvent({ ...base, id: '   ' })).toBeNull()
  })

  it('缺 date 或日期非法 → null', () => {
    expect(normalizeScheduleEvent({ ...base, date: undefined })).toBeNull()
    expect(normalizeScheduleEvent({ ...base, date: '2025-02-30' })).toBeNull()
  })

  it('缺 / 非法时间 → null', () => {
    expect(normalizeScheduleEvent({ ...base, start_time: undefined })).toBeNull()
    expect(normalizeScheduleEvent({ ...base, end_time: undefined })).toBeNull()
    expect(normalizeScheduleEvent({ ...base, start_time: '8:20' })).toBeNull()
    expect(normalizeScheduleEvent({ ...base, end_time: '25:00' })).toBeNull()
  })

  it('end <= start（含相等与倒置）→ null', () => {
    expect(normalizeScheduleEvent({ ...base, end_time: '14:30' })).toBeNull()
    expect(normalizeScheduleEvent({ ...base, end_time: '13:00' })).toBeNull()
  })

  it('非对象输入 → null', () => {
    expect(normalizeScheduleEvent(null)).toBeNull()
    expect(normalizeScheduleEvent(undefined)).toBeNull()
    expect(normalizeScheduleEvent('evt-1')).toBeNull()
  })
})

describe('toScheduleEventPayload 字段名契约', () => {
  it('输出 #835 要求的 snake_case 字段，且不含 camelCase 残留', () => {
    const event: ScheduleEvent = {
      id: 'evt-1',
      title: '小组会议',
      date: '2026-09-18',
      startTime: '14:30',
      endTime: '15:20',
      location: '教三 201',
      note: '带笔记本',
      color: '#72b9ff',
      reminderMinutes: 10,
      createdAt: '',
      updatedAt: ''
    }
    const payload = toScheduleEventPayload(event)
    expect(payload).toEqual({
      title: '小组会议',
      date: '2026-09-18',
      start_time: '14:30',
      end_time: '15:20',
      location: '教三 201',
      note: '带笔记本',
      color: '#72b9ff',
      reminder_minutes: 10
    })
    expect(Object.keys(payload)).not.toContain('startTime')
    expect(Object.keys(payload)).not.toContain('reminderMinutes')
  })

  it('student_id / event_id 由提交方补充，本函数不产出（避免 add / update 语义混淆）', () => {
    const payload = toScheduleEventPayload({
      id: 'evt-1',
      title: 'x',
      date: '2026-09-18',
      startTime: '09:00',
      endTime: '10:00',
      location: '',
      note: '',
      color: '',
      reminderMinutes: null,
      createdAt: '',
      updatedAt: ''
    })
    expect(payload).not.toHaveProperty('student_id')
    expect(payload).not.toHaveProperty('event_id')
    expect(payload.reminder_minutes).toBeNull()
  })
})
