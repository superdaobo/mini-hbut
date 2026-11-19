import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumePendingGradeTeacher,
  peekPendingGradeTeacher,
  writePendingGradeTeacher,
  PENDING_TTL_MS
} from './grade_distribution_pending'

// #1321 一次性教师预填：课表课程详情 → 给分记录 导航的桥接存储
describe('grade_distribution_pending', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 模块级状态在文件内跨用例残留，消费一次保证从空状态开始
    consumePendingGradeTeacher()
  })

  afterEach(() => {
    vi.useRealTimers()
    consumePendingGradeTeacher()
  })

  it('写入后可 peek 读取，consume 后为空（一次性）', () => {
    writePendingGradeTeacher('张三')
    expect(peekPendingGradeTeacher()).toBe('张三')
    // peek 不消费
    expect(peekPendingGradeTeacher()).toBe('张三')
    expect(consumePendingGradeTeacher()).toBe('张三')
    expect(consumePendingGradeTeacher()).toBe('')
    expect(peekPendingGradeTeacher()).toBe('')
  })

  it('写入时 trim 姓名', () => {
    writePendingGradeTeacher('  李四  ')
    expect(peekPendingGradeTeacher()).toBe('李四')
  })

  it('TTL 过期后失效', () => {
    writePendingGradeTeacher('王五')
    vi.advanceTimersByTime(PENDING_TTL_MS + 1)
    expect(peekPendingGradeTeacher()).toBe('')
    expect(consumePendingGradeTeacher()).toBe('')
  })

  it('空值 / 超长（>20）写入被拒绝', () => {
    writePendingGradeTeacher('')
    expect(peekPendingGradeTeacher()).toBe('')
    writePendingGradeTeacher('   ')
    expect(peekPendingGradeTeacher()).toBe('')
    writePendingGradeTeacher('a'.repeat(21))
    expect(peekPendingGradeTeacher()).toBe('')
  })

  it('新写入覆盖旧写入', () => {
    writePendingGradeTeacher('旧教师')
    writePendingGradeTeacher('新教师')
    expect(consumePendingGradeTeacher()).toBe('新教师')
  })
})
