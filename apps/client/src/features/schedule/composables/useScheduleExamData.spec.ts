/**
 * 课表考试叠加层数据测试。
 *
 * 覆盖：整学期只请求一次、切周零请求、切学生 / 切学期竞态丢弃、
 * 失败静默降级、非法记录过滤、缺时间考试保留（timeTbd）。
 */
import { nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useScheduleExamData } from './useScheduleExamData'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('axios', () => ({ default: { post: postMock } }))

// 测试里把缓存层收敛为「直接执行 fetcher」，专注数据层自身的竞态与归一逻辑；
// 缓存命中 / 离线回退由 utils/api 的既有测试看守。
vi.mock('../../../utils/api.js', () => ({
  fetchWithCache: async (_key: string, fetcher: () => Promise<unknown>) => ({
    data: await fetcher(),
    fromCache: false,
    timestamp: Date.now()
  })
}))

const buildWeek = (firstIso: string) => {
  const start = new Date(`${firstIso}T00:00:00`)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    return { iso, isToday: false }
  })
}

const rawExam = (course: string, date: string, time = '09:00-11:00') => ({
  course_name: course,
  exam_date: date,
  exam_time: time,
  location: '一教 201',
  seat_no: '18'
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const flush = async () => {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

const makeHarness = (studentId = 'student_A', semester = '2025-2026-1', firstIso = '2026-07-13') => {
  const props = reactive({ studentId })
  const semesterRef = ref(semester)
  const weekDates = ref(buildWeek(firstIso))
  const data = useScheduleExamData({
    props,
    semester: { semester: semesterRef, semesterDraft: semesterRef, weekDates }
  })
  return { props, semesterRef, weekDates, data }
}

beforeEach(() => {
  postMock.mockReset()
})

describe('useScheduleExamData', () => {
  it('首屏拉一次整学期考试，并按周日期取到对应考试', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        data: [rawExam('高等数学 A', '2026-07-15'), rawExam('大学英语', '2026-07-18', '14:00-16:00')]
      }
    })

    const { data } = makeHarness()
    await flush()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith('/api/v2/exams', {
      student_id: 'student_A',
      semester: '2025-2026-1'
    })
    expect(data.semesterExams.value).toHaveLength(2)
    expect(data.getExamsForDay(3).map((exam) => exam.courseName)).toEqual(['高等数学 A'])
    expect(data.getExamsForDay(6).map((exam) => exam.courseName)).toEqual(['大学英语'])
    expect(data.hasExamOnDay(3)).toBe(true)
    expect(data.hasExamOnDay(1)).toBe(false)
  })

  it('切周不重复请求：整学期数据在内存里按周过滤', async () => {
    postMock.mockResolvedValue({
      data: { success: true, data: [rawExam('期末大考', '2026-07-20')] }
    })

    const { weekDates, data } = makeHarness()
    await flush()
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(data.getExamsForDay(3)).toHaveLength(0)

    weekDates.value = buildWeek('2026-07-20')
    await flush()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(data.getExamsForDay(1).map((exam) => exam.courseName)).toEqual(['期末大考'])
  })

  it('切学期重新请求，旧学期慢响应不得覆盖新学期', async () => {
    const oldRequest = deferred<any>()
    postMock
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValueOnce({
        data: { success: true, data: [rawExam('新学期考试', '2026-07-15')] }
      })

    const { semesterRef, data } = makeHarness()
    expect(postMock).toHaveBeenCalledTimes(1)

    semesterRef.value = '2026-2027-1'
    await flush()

    expect(postMock).toHaveBeenCalledTimes(2)
    expect(postMock).toHaveBeenLastCalledWith('/api/v2/exams', {
      student_id: 'student_A',
      semester: '2026-2027-1'
    })
    expect(data.semesterExams.value.map((exam) => exam.courseName)).toEqual(['新学期考试'])

    oldRequest.resolve({ data: { success: true, data: [rawExam('旧学期考试', '2026-07-15')] } })
    await flush()

    expect(data.semesterExams.value.map((exam) => exam.courseName)).toEqual(['新学期考试'])
  })

  it('切学生重新请求，旧学生慢响应不得污染新学生', async () => {
    const requestA = deferred<any>()
    postMock
      .mockImplementationOnce(() => requestA.promise)
      .mockResolvedValueOnce({
        data: { success: true, data: [rawExam('学生 B 的考试', '2026-07-15')] }
      })

    const { props, data } = makeHarness('student_A')
    props.studentId = 'student_B'
    await flush()

    expect(postMock).toHaveBeenLastCalledWith('/api/v2/exams', {
      student_id: 'student_B',
      semester: '2025-2026-1'
    })
    expect(data.semesterExams.value.map((exam) => exam.courseName)).toEqual(['学生 B 的考试'])

    requestA.resolve({ data: { success: true, data: [rawExam('学生 A 的考试', '2026-07-15')] } })
    await flush()

    expect(data.semesterExams.value.map((exam) => exam.courseName)).toEqual(['学生 B 的考试'])
  })

  it('登出（studentId 变空）立即清空并让在途请求失效', async () => {
    const requestA = deferred<any>()
    postMock.mockImplementationOnce(() => requestA.promise)

    const { props, data } = makeHarness('student_A')
    props.studentId = ''
    await flush()

    expect(data.semesterExams.value).toEqual([])
    expect(data.loadingExams.value).toBe(false)

    requestA.resolve({ data: { success: true, data: [rawExam('过期考试', '2026-07-15')] } })
    await flush()

    expect(data.semesterExams.value).toEqual([])
  })

  it('请求失败安全退化为空数组，不制造假成功', async () => {
    postMock.mockRejectedValue(new Error('bridge offline'))

    const { data } = makeHarness()
    await flush()

    expect(data.semesterExams.value).toEqual([])
    expect(data.loadingExams.value).toBe(false)
  })

  it('非法记录被过滤，缺时间的考试保留并标记 timeTbd', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        data: [
          rawExam('有效考试', '2026-07-15'),
          { course_name: '坏日期', exam_date: '2026-02-30', exam_time: '09:00' },
          { course_name: '无时间', exam_date: '2026-07-16', exam_time: '', location: '二教 305' }
        ]
      }
    })

    const { data } = makeHarness()
    await flush()

    expect(data.semesterExams.value.map((exam) => exam.courseName)).toEqual(['有效考试', '无时间'])
    const noTime = data.semesterExams.value.find((exam) => exam.courseName === '无时间')
    expect(noTime?.timeTbd).toBe(true)
    expect(noTime?.startMinute).toBeNull()
  })
})
