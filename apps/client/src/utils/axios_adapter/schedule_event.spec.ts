/**
 * 个人日程 CRUD / 云恢复的提醒与变更广播契约（#839 #851）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(async () => ({ success: true })),
  invoke: vi.fn(async () => ({ success: true, data: { id: 'ev-1' } })),
  emitChanged: vi.fn()
}))

vi.mock('../local_reminder_scheduler', () => ({
  reconcileLocalReminders: mocks.reconcile
}))

vi.mock('../schedule_event_signal', () => ({
  emitScheduleEventChanged: mocks.emitChanged
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

describe('日程 CRUD 成功后的提醒与变更广播', () => {
  it('add 成功 → reconcile + crud 变更信号', async () => {
    await handleScheduleEventPost('/v2/schedule/event/add', {
      student_id: '2021001',
      title: '复习'
    })
    expect(mocks.reconcile).toHaveBeenCalledWith({
      studentId: '2021001',
      reason: 'schedule-event-crud'
    })
    expect(mocks.emitChanged).toHaveBeenCalledWith('2021001', 'crud')
  })

  it('update 成功 → 触发 reconcile', async () => {
    await handleScheduleEventPost('/v2/schedule/event/update', {
      studentId: '2021002',
      event_id: 'ev-1'
    })
    expect(mocks.reconcile).toHaveBeenCalledWith({
      studentId: '2021002',
      reason: 'schedule-event-crud'
    })
  })

  it('delete 成功 → 触发 reconcile', async () => {
    await handleScheduleEventPost('/v2/schedule/event/delete', {
      student_id: '2021003',
      event_id: 'ev-1'
    })
    expect(mocks.reconcile).toHaveBeenCalledWith({
      studentId: '2021003',
      reason: 'schedule-event-crud'
    })
  })

  it('list-all 走全量查询 command，不触发 reconcile', async () => {
    await handleScheduleEventPost('/v2/schedule/event/list-all', { student_id: '2021001' })
    expect(mocks.invoke).toHaveBeenCalledWith('list_schedule_events_all', {
      studentId: '2021001'
    })
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  it('replace-all 成功 → reconcile + cloud-restore 信号', async () => {
    await handleScheduleEventPost('/v2/schedule/event/replace-all', {
      student_id: '2021001',
      events: []
    })
    expect(mocks.invoke).toHaveBeenCalledWith('replace_schedule_events', {
      req: { student_id: '2021001', events: [] }
    })
    expect(mocks.reconcile).toHaveBeenCalledWith({
      studentId: '2021001',
      reason: 'schedule-event-crud'
    })
    expect(mocks.emitChanged).toHaveBeenCalledWith('2021001', 'cloud-restore')
  })

  it('缺少 student_id 时不触发副作用', async () => {
    await handleScheduleEventPost('/v2/schedule/event/add', { title: '复习' })
    expect(mocks.reconcile).not.toHaveBeenCalled()
    expect(mocks.emitChanged).not.toHaveBeenCalled()
  })

  it('CRUD 失败 → 不触发副作用', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('db error'))
    const result = (await handleScheduleEventPost('/v2/schedule/event/delete', {
      student_id: '2021001',
      event_id: 'ev-1'
    })) as { success?: boolean }
    expect(result.success).toBe(false)
    expect(mocks.reconcile).not.toHaveBeenCalled()
    expect(mocks.emitChanged).not.toHaveBeenCalled()
  })

  it('非日程端点 → 返回 null 且不触发', async () => {
    expect(await handleScheduleEventPost('/v2/schedule/custom/add', {
      student_id: '2021001'
    })).toBeNull()
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })
})
