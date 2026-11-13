/**
 * 考试块领域层（课表考试叠加）纯函数测试。
 *
 * 覆盖：时间解析（多分隔符 / 全角 / 单时间兜底 / 非法）、日期归一、
 * 记录归一（两种字段口径 + 缺时间不丢考试）与按周定位。
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_EXAM_DURATION_MINUTES,
  examDayIndexInWeek,
  normalizeExamDate,
  normalizeScheduleExam,
  parseExamTimeRange
} from './examTypes'

describe('parseExamTimeRange', () => {
  it('解析标准区间与常见分隔符', () => {
    expect(parseExamTimeRange('09:00-11:00')).toEqual({ startMinute: 540, endMinute: 660 })
    expect(parseExamTimeRange('14:30~16:30')).toEqual({ startMinute: 870, endMinute: 990 })
    expect(parseExamTimeRange('19:00—21:00')).toEqual({ startMinute: 1140, endMinute: 1260 })
  })

  it('兼容全角数字与全角冒号', () => {
    expect(parseExamTimeRange('０９：００～１１：００')).toEqual({
      startMinute: 540,
      endMinute: 660
    })
  })

  it('带日期前缀时只取时刻', () => {
    expect(parseExamTimeRange('2026-07-15 09:00~11:00')).toEqual({
      startMinute: 540,
      endMinute: 660
    })
  })

  it('只有开始时间时按默认时长补全', () => {
    expect(parseExamTimeRange('09:00')).toEqual({
      startMinute: 540,
      endMinute: 540 + DEFAULT_EXAM_DURATION_MINUTES
    })
  })

  it('空值 / 无时刻 / 倒置 / 跨日越界一律返回 null', () => {
    expect(parseExamTimeRange('')).toBeNull()
    expect(parseExamTimeRange(null)).toBeNull()
    expect(parseExamTimeRange('上午')).toBeNull()
    expect(parseExamTimeRange('11:00-09:00')).toBeNull()
    expect(parseExamTimeRange('25:00-26:00')).toBeNull()
  })
})

describe('normalizeExamDate', () => {
  it('归一常见日期写法', () => {
    expect(normalizeExamDate('2026-07-15')).toBe('2026-07-15')
    expect(normalizeExamDate('2026/7/5')).toBe('2026-07-05')
    expect(normalizeExamDate('2026.07.05')).toBe('2026-07-05')
    expect(normalizeExamDate('2026-07-15 09:00')).toBe('2026-07-15')
  })

  it('非法或不存在日期返回空串', () => {
    expect(normalizeExamDate('2026-02-30')).toBe('')
    expect(normalizeExamDate('七月十五')).toBe('')
    expect(normalizeExamDate('')).toBe('')
  })
})

describe('normalizeScheduleExam', () => {
  it('归一前端 API 口径（exam_date / exam_time / seat_no）', () => {
    const exam = normalizeScheduleExam({
      course_name: '高等数学 A',
      exam_date: '2026-07-15',
      exam_time: '09:00-11:00',
      location: '一教 201',
      seat_no: '18'
    })
    expect(exam).not.toBeNull()
    expect(exam).toMatchObject({
      courseName: '高等数学 A',
      date: '2026-07-15',
      startMinute: 540,
      endMinute: 660,
      timeTbd: false,
      location: '一教 201',
      seatNo: '18'
    })
    expect(exam?.id).toContain('2026-07-15')
  })

  it('兼容后端 DTO 口径（start_time + end_time / seat_number）', () => {
    expect(
      normalizeScheduleExam({
        course_name: '程序设计基础',
        date: '2026-07-18',
        start_time: '14:00',
        end_time: '16:00',
        location: '实训楼 401',
        seat_number: '06'
      })
    ).toMatchObject({
      date: '2026-07-18',
      startMinute: 840,
      endMinute: 960,
      seatNo: '06'
    })
  })

  it('缺时间不丢考试：timeTbd = true 且时刻为 null', () => {
    const exam = normalizeScheduleExam({
      course_name: '大学英语',
      exam_date: '2026-07-20',
      exam_time: '',
      location: '二教 305'
    })
    expect(exam).toMatchObject({
      date: '2026-07-20',
      startMinute: null,
      endMinute: null,
      timeTbd: true,
      location: '二教 305'
    })
  })

  it('无合法日期返回 null，非对象输入不抛异常', () => {
    expect(normalizeScheduleExam({ course_name: '无日期' })).toBeNull()
    expect(normalizeScheduleExam({ exam_date: '2026-02-30' })).toBeNull()
    expect(normalizeScheduleExam(null)).toBeNull()
    expect(normalizeScheduleExam('bad')).toBeNull()
  })

  it('无显式 id 时用「日期 + 课程 + 时间 + 考场」组成稳定键', () => {
    const raw = {
      course_name: '线性代数',
      exam_date: '2026-07-16',
      exam_time: '14:00-16:00',
      location: '三教 102'
    }
    expect(normalizeScheduleExam(raw)?.id).toBe(normalizeScheduleExam(raw)?.id)
  })
})

describe('examDayIndexInWeek', () => {
  const week = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19']

  it('命中周内日期返回 1..7', () => {
    expect(examDayIndexInWeek('2026-07-13', week)).toBe(1)
    expect(examDayIndexInWeek('2026/7/15', week)).toBe(3)
    expect(examDayIndexInWeek('2026-07-19', week)).toBe(7)
  })

  it('不在本周或日期非法返回 null', () => {
    expect(examDayIndexInWeek('2026-07-20', week)).toBeNull()
    expect(examDayIndexInWeek('bad', week)).toBeNull()
    expect(examDayIndexInWeek('2026-07-15', [])).toBeNull()
  })
})
