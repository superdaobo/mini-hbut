/**
 * #841 最终 QA：当前周个人日程数据层的数据一致性回归。
 *
 * 覆盖 Big Check 3 的关键风险：
 * - 一周只发一次 list-range，不按 7 天拆请求；
 * - 快速切周 / 切账号时旧慢响应不得覆盖新上下文；
 * - 登出或周日期暂时为空必须主动让在途请求失效；
 * - 请求失败安全退化为空数组，不影响课表；
 * - transport snake_case 在边界统一归一为 camelCase。
 */
import { nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useScheduleEventData } from './useScheduleEventData'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))
vi.mock('axios', () => ({ default: { post: postMock } }))

const buildWeek = (firstIso: string) => {
  const start = new Date(`${firstIso}T00:00:00`)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    return { iso, isToday: false }
  })
}

const rawEvent = (
  id: string,
  date: string,
  title = id,
): Record<string, unknown> => ({
  id,
  title,
  date,
  start_time: '19:00',
  end_time: '20:00',
  location: '电气楼 402',
  note: '',
  color: '#2f6fed',
  reminder_minutes: 10,
  created_at: '2026-09-18T00:00:00Z',
  updated_at: '2026-09-18T00:00:00Z',
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = async () => {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

const makeHarness = (studentId = 'student_A', firstIso = '2026-09-14') => {
  const props = reactive({ studentId })
  const weekDates = ref(buildWeek(firstIso))
  const data = useScheduleEventData({
    props,
    semester: { weekDates },
  })
  return { props, weekDates, data }
}

beforeEach(() => {
  postMock.mockReset()
})

describe('useScheduleEventData (#841 data consistency)', () => {
  it('当前周只发一次 list-range，并把 snake_case payload 归一为领域对象', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        data: [rawEvent('ev-1', '2026-09-18', '蓝电技术部开会')],
      },
    })

    const { data } = makeHarness()
    await flush()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith('/api/v2/schedule/event/list-range', {
      student_id: 'student_A',
      start_date: '2026-09-14',
      end_date: '2026-09-20',
    })
    expect(data.weekEvents.value).toEqual([
      expect.objectContaining({
        id: 'ev-1',
        title: '蓝电技术部开会',
        date: '2026-09-18',
        startTime: '19:00',
        endTime: '20:00',
        reminderMinutes: 10,
      }),
    ])
    expect(data.getEventsForDay(5).map((event) => event.id)).toEqual(['ev-1'])
  })

  it('快速切周：新周先返回后，旧周慢响应不得覆盖新周数据', async () => {
    const oldRequest = deferred<any>()
    postMock
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValueOnce({
        data: { success: true, data: [rawEvent('new-week', '2026-09-25')] },
      })

    const { weekDates, data } = makeHarness()
    expect(postMock).toHaveBeenCalledTimes(1)

    weekDates.value = buildWeek('2026-09-21')
    await flush()

    expect(postMock).toHaveBeenCalledTimes(2)
    expect(data.weekEvents.value.map((event) => event.id)).toEqual(['new-week'])

    oldRequest.resolve({
      data: { success: true, data: [rawEvent('old-week', '2026-09-18')] },
    })
    await flush()

    expect(data.weekEvents.value.map((event) => event.id)).toEqual(['new-week'])
  })

  it('切换学生：student_A 的慢响应不得污染 student_B', async () => {
    const requestA = deferred<any>()
    postMock
      .mockImplementationOnce(() => requestA.promise)
      .mockResolvedValueOnce({
        data: { success: true, data: [rawEvent('event-B', '2026-09-18')] },
      })

    const { props, data } = makeHarness('student_A')
    props.studentId = 'student_B'
    await flush()

    expect(postMock).toHaveBeenLastCalledWith('/api/v2/schedule/event/list-range', {
      student_id: 'student_B',
      start_date: '2026-09-14',
      end_date: '2026-09-20',
    })
    expect(data.weekEvents.value.map((event) => event.id)).toEqual(['event-B'])

    requestA.resolve({
      data: { success: true, data: [rawEvent('event-A', '2026-09-18')] },
    })
    await flush()

    expect(data.weekEvents.value.map((event) => event.id)).toEqual(['event-B'])
  })

  it('登出 / studentId 变空会立即清空并让在途请求失效', async () => {
    const requestA = deferred<any>()
    postMock.mockImplementationOnce(() => requestA.promise)

    const { props, data } = makeHarness('student_A')
    expect(data.loadingWeekEvents.value).toBe(true)

    props.studentId = ''
    await flush()

    expect(data.weekEvents.value).toEqual([])
    expect(data.loadingWeekEvents.value).toBe(false)

    requestA.resolve({
      data: { success: true, data: [rawEvent('stale-A', '2026-09-18')] },
    })
    await flush()

    expect(data.weekEvents.value).toEqual([])
    expect(data.loadingWeekEvents.value).toBe(false)
  })

  it('周日期暂时为空也会清空并让在途请求失效', async () => {
    const request = deferred<any>()
    postMock.mockImplementationOnce(() => request.promise)

    const { weekDates, data } = makeHarness()
    weekDates.value = []
    await flush()

    expect(data.weekEvents.value).toEqual([])
    expect(data.loadingWeekEvents.value).toBe(false)

    request.resolve({
      data: { success: true, data: [rawEvent('stale-week', '2026-09-18')] },
    })
    await flush()

    expect(data.weekEvents.value).toEqual([])
  })

  it('当前请求失败时安全退化为空数组，不制造旧数据或假成功', async () => {
    postMock.mockRejectedValue(new Error('bridge offline'))

    const { data } = makeHarness()
    await flush()

    expect(data.weekEvents.value).toEqual([])
    expect(data.loadingWeekEvents.value).toBe(false)
  })

  it('非法记录被过滤，不污染当前周领域数据', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        data: [
          rawEvent('valid', '2026-09-18'),
          { id: 'bad-date', date: '2026-02-30', start_time: '09:00', end_time: '10:00' },
          { id: 'bad-time', date: '2026-09-18', start_time: '10:00', end_time: '09:00' },
        ],
      },
    })

    const { data } = makeHarness()
    await flush()

    expect(data.weekEvents.value.map((event) => event.id)).toEqual(['valid'])
  })
})
