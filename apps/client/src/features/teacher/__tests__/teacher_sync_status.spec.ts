// src/features/teacher/__tests__/teacher_sync_status.spec.ts
//
// Teacher Portal V2（#1066）：同步状态语义与时间格式化纯函数契约测试。
//
// 覆盖：诚实状态映射（已同步 / 正在更新 / 已缓存 / 尚未同步 / 更新失败）、
// 相对时间分桶、无时区解析、空/非法时间、时钟差（未来时间）。

import { describe, expect, it } from 'vitest'

import {
  describeTeacherSyncTime,
  parseTeacherSyncTime,
  resolveTeacherSyncStatus,
  teacherSyncStatusKey,
  type TeacherSyncStatusInput
} from '../cache/teacher_sync_status'

const NOW = new Date(2026, 9, 16, 23, 40, 0).getTime() // 本地 2026-10-16 23:40
const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString()

const baseInput: TeacherSyncStatusInput = {
  phase: 'ready',
  hasData: true,
  fromCache: false,
  stale: false,
  hasSyncTime: true,
  offline: false,
  errorKind: null
}

describe('#1066 同步状态语义（诚实优先）', () => {
  it('网络成功 → synced', () => {
    expect(resolveTeacherSyncStatus(baseInput)).toBe('synced')
  })

  it('新鲜缓存 → synced；过期缓存 → cached', () => {
    expect(resolveTeacherSyncStatus({ ...baseInput, fromCache: true })).toBe('synced')
    expect(resolveTeacherSyncStatus({ ...baseInput, fromCache: true, stale: true })).toBe('cached')
    expect(resolveTeacherSyncStatus({ ...baseInput, fromCache: true, offline: true })).toBe('cached')
  })

  it('请求在飞且已有时间 → updating（保留原时间）；无时间 → never', () => {
    expect(resolveTeacherSyncStatus({ ...baseInput, phase: 'loading' })).toBe('updating')
    expect(resolveTeacherSyncStatus({ ...baseInput, phase: 'loading', hasSyncTime: false })).toBe('never')
  })

  it('从未成功 → never', () => {
    expect(resolveTeacherSyncStatus({ ...baseInput, phase: 'idle', hasSyncTime: false, hasData: false })).toBe('never')
    expect(resolveTeacherSyncStatus({ ...baseInput, phase: 'empty', hasSyncTime: false, hasData: false })).toBe('never')
  })

  it('成功空数组（empty）且有同步时间 → synced（空 ≠ 失败）', () => {
    expect(resolveTeacherSyncStatus({ ...baseInput, phase: 'empty', hasData: false })).toBe('synced')
  })

  it('失败无缓存 → failed；超时/离线且有缓存 → cached；其它错误有缓存 → failed', () => {
    expect(resolveTeacherSyncStatus({ ...baseInput, phase: 'error', hasData: false })).toBe('failed')
    expect(
      resolveTeacherSyncStatus({ ...baseInput, phase: 'error', errorKind: 'timeout' })
    ).toBe('cached')
    expect(resolveTeacherSyncStatus({ ...baseInput, phase: 'error', offline: true })).toBe('cached')
    expect(
      resolveTeacherSyncStatus({ ...baseInput, phase: 'error', errorKind: 'expired' })
    ).toBe('failed')
  })

  it('状态 → i18n key 前缀正确', () => {
    expect(teacherSyncStatusKey('synced')).toBe('teacher.sync.status.synced')
    expect(teacherSyncStatusKey('never')).toBe('teacher.sync.status.never')
  })
})

describe('#1066 时间格式化（假时钟）', () => {
  it('空 / 非法时间 → null（视图展示「尚未同步」）', () => {
    expect(describeTeacherSyncTime('', NOW)).toBeNull()
    expect(describeTeacherSyncTime(null, NOW)).toBeNull()
    expect(describeTeacherSyncTime('not-a-time', NOW)).toBeNull()
  })

  it('1 分钟内 → justNow', () => {
    expect(describeTeacherSyncTime(iso(30 * 1000), NOW)).toEqual({
      key: 'teacher.sync.justNow',
      params: {}
    })
  })

  it('1 小时内 → minutesAgo 带分钟数', () => {
    expect(describeTeacherSyncTime(iso(3 * 60 * 1000), NOW)).toEqual({
      key: 'teacher.sync.minutesAgo',
      params: { n: '3' }
    })
  })

  it('同一自然日 → todayAt（今天 HH:MM）', () => {
    expect(describeTeacherSyncTime(iso(2 * 60 * 60 * 1000), NOW)).toEqual({
      key: 'teacher.sync.todayAt',
      params: { time: '21:40' }
    })
  })

  it('昨天 → yesterdayAt', () => {
    expect(describeTeacherSyncTime(iso(25 * 60 * 60 * 1000), NOW)).toEqual({
      key: 'teacher.sync.yesterdayAt',
      params: { time: '22:40' }
    })
  })

  it('更早 → 绝对日期 + 时间', () => {
    expect(describeTeacherSyncTime(iso(5 * 24 * 60 * 60 * 1000), NOW)).toEqual({
      key: 'teacher.sync.at',
      params: { date: '2026-10-11', time: '23:40' }
    })
  })

  it('时钟差（未来时间）不显示负数相对时间，改用绝对时间', () => {
    const descriptor = describeTeacherSyncTime(iso(-60 * 60 * 1000), NOW)
    expect(descriptor?.key).toBe('teacher.sync.at')
  })

  it('无时区「YYYY-MM-DD HH:MM」按本地时间解析', () => {
    const parsed = parseTeacherSyncTime('2026-10-16 23:40')
    expect(parsed).not.toBeNull()
    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(9)
    expect(parsed?.getDate()).toBe(16)
    expect(parsed?.getHours()).toBe(23)
    expect(parsed?.getMinutes()).toBe(40)
  })

  it('ISO 8601 带时区正确解析', () => {
    const parsed = parseTeacherSyncTime('2026-10-16T12:00:00.000Z')
    expect(parsed?.toISOString()).toBe('2026-10-16T12:00:00.000Z')
  })
})
