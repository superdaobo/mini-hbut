/**
 * 个人日程 CRUD 的提醒 reconcile 触发契约（#839）
 *
 * 断言 add / update / delete 成功后触发 reconcile，且失败路径绝不触发；
 * 提醒调度与日程 CRUD 结果解耦（reconcile 失败不影响返回值）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(async () => ({ success: true })),
  invoke: vi.fn(async () => ({ success: true, data: { id: 'ev-1' } }))
}))

vi.mock('../local_reminder_scheduler', () => ({
  reconcileLocalReminders: mocks.reconcile
}))

vi.mock('./bridge', () => ({
  hasTauri: true,
  invoke: mocks.invoke,
  mockResponse: (payload: unknown) => payload,
  bridgePost: vi.fn(),
  errorMessage: (error: unknown) => String(error)
}))

import { handleScheduleEventPost } from './schedule_event'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.invoke.mockImplementation(async () => ({ success: true, data: { id: 'ev-1' } }))
})

describe('日程 CRUD 成功后触发提醒 reconcile', () => {
  it('add 成功 → 触发 reconcile', async () => {
    await handleScheduleEventPost('/v2/schedule/event/add', { student_id: '2021001', title: '复习' })
    expect(mocks.reconcile).toHaveBeenCalledWith({
      studentId: '2021001',
      reason: 'schedule-event-crud'
    })
  })

  it('update 成功 → 触发 reconcile', async () => {
    await handleScheduleEventPost('/v2/schedule/event/update', { studentId: '2021002', event_id: 'ev-1' })
    expect(mocks.reconcile).toHaveBeenCalledWith({
      studentId: '2021002',
      reason: 'schedule-event-crud'
    })
  })

  it('delete 成功 → 触发 reconcile', async () => {
    await handleScheduleEventPost('/v2/schedule/event/delete', { student_id: '2021003', event_id: 'ev-1' })
    expect(mocks.reconcile).toHaveBeenCalledWith({
      studentId: '2021003',
      reason: 'schedule-event-crud'
    })
  })

  it('缺少 student_id 时不触发（无账号上下文）', async () => {
    await handleScheduleEventPost('/v2/schedule/event/add', { title: '复习' })
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  it('CRUD 失败 → 不触发 reconcile', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('db error'))
    const result = (await handleScheduleEventPost('/v2/schedule/event/delete', {
      student_id: '2021001',
      event_id: 'ev-1'
    })) as { success?: boolean }
    expect(result.success).toBe(false)
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  it('非日程端点 → 返回 null 且不触发', async () => {
    expect(await handleScheduleEventPost('/v2/schedule/custom/add', { student_id: '2021001' })).toBeNull()
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })
})
