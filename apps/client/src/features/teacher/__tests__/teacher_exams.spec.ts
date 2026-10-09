// Teacher Portal V2（E6 #1026）：考试与监考组合函数契约测试。
//
// 覆盖：
//   1. 双标签载荷映射与 HTML 字段清洗（只展示实测字段）；
//   2. 空态 / 错误态（按 kind 映射 i18n key，不直接展示后端 message）；
//   3. 时间筛选（全部 / 未开始 / 已结束）与 `isExamPast`；
//   4. 作用域隔离（不同教师账号 / 学期缓存不串用）与过期响应丢弃；
//   5. 监考 → 教师作用域提醒事件（与学生提醒隔离）。
//
// fixture 全部脱敏：无真实工号、姓名、教学班名单、Cookie。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type {
  Invigilation,
  TeacherDataErrorKind,
  TeacherExam,
  TeacherExamData,
  TeacherLoadState
} from '../types'

const apiMock = vi.hoisted(() => ({ fetchTeacherExams: vi.fn() }))

vi.mock('../api/teacherApi', () => ({
  fetchTeacherExams: apiMock.fetchTeacherExams
}))

import {
  EXAMS_SEMESTER_PATTERN,
  filterByTimeline,
  isExamPast,
  resolveInitialExamsSemester,
  sanitizeInvigilation,
  sanitizeTeacherExam,
  teacherExamsErrorKey,
  useTeacherExams
} from '../composables/useTeacherExams'

const makeInvigilation = (overrides: Partial<Invigilation> = {}): Invigilation => ({
  id: 'inv-1',
  xnxq: '2026-2027-1',
  xqmc: '本部',
  zjk: '主监考',
  ksrq: '2026-08-30',
  kscc: '第1场',
  kcmc: '示例课程甲',
  jsmc: '2-302',
  ksrs: 23,
  ...overrides
})

const makeExam = (overrides: Partial<TeacherExam> = {}): TeacherExam => ({
  id: 'exam-1',
  kcmc: '示例课程甲',
  jsmc: '2-302',
  jkjs: '示例教师甲(主)',
  kssj: '2026-08-30 14:30~18:00',
  ksrs: 23,
  ksrq: '2026-08-30',
  jxbmc: '示例教学班',
  bjmc: '示例班级',
  jsname: '示例教师甲',
  kcbh: '00000000A',
  ...overrides
})

const DATA: TeacherExamData = {
  invigilations: [makeInvigilation()],
  exams: [makeExam()]
}

const readyState = (data: TeacherExamData): TeacherLoadState<TeacherExamData> => ({
  status: 'ready',
  data,
  error: null
})

const emptyState = (): TeacherLoadState<TeacherExamData> => ({
  status: 'empty',
  data: null,
  error: { kind: 'empty', message: '' }
})

const errorState = (kind: TeacherDataErrorKind): TeacherLoadState<TeacherExamData> => ({
  status: 'error',
  data: null,
  error: { kind, message: `mock ${kind}` }
})

const newHook = (accountId = 'T0001', semester = '2026-2027-1') =>
  useTeacherExams({ accountId: () => accountId, initialSemester: semester })

beforeEach(() => {
  apiMock.fetchTeacherExams.mockReset()
})

describe('E6 考试与监考：载荷映射与字段清洗', () => {
  it('ready 时映射监考与教学班考试，并清洗 HTML 字段', async () => {
    apiMock.fetchTeacherExams.mockResolvedValue(
      readyState({
        invigilations: [makeInvigilation({ kcmc: '<b>课程甲</b>', jsmc: '<i>2-302</i>' })],
        exams: [makeExam({ kcmc: '<span>课程乙</span>', jxbmc: '<em>教学班乙</em>' })]
      })
    )
    const hook = newHook()
    await hook.load()
    expect(hook.state.value.status).toBe('ready')
    expect(hook.invigilations.value[0].kcmc).toBe('课程甲')
    expect(hook.invigilations.value[0].jsmc).toBe('2-302')
    expect(hook.exams.value[0].kcmc).toBe('课程乙')
    expect(hook.exams.value[0].jxbmc).toBe('教学班乙')
  })

  it('sanitize 纯函数直接清洗 HTML', () => {
    expect(sanitizeInvigilation(makeInvigilation({ kcmc: '<b>课程</b>' })).kcmc).toBe('课程')
    expect(sanitizeTeacherExam(makeExam({ jxbmc: '<b>教学班</b>' })).jxbmc).toBe('教学班')
  })

  it('空态与错误态映射为对应 i18n key', async () => {
    apiMock.fetchTeacherExams.mockResolvedValueOnce(emptyState())
    const hook = newHook()
    await hook.load()
    expect(hook.state.value.status).toBe('empty')

    apiMock.fetchTeacherExams.mockResolvedValueOnce(errorState('expired'))
    await hook.retry()
    expect(hook.state.value.status).toBe('error')
    expect(hook.errorKey.value).toBe('teacher.error.expired')
    expect(teacherExamsErrorKey('unauthorized')).toBe('teacher.error.unauthorized')
    expect(teacherExamsErrorKey('errorHtml')).toBe('teacher.error.errorHtml')
  })

  it('监考 → 教师作用域提醒事件（与学生域隔离）', async () => {
    apiMock.fetchTeacherExams.mockResolvedValue(readyState(DATA))
    const hook = newHook()
    await hook.load()
    expect(hook.reminderEvents.value.length).toBe(1)
    const event = hook.reminderEvents.value[0]
    expect(event.type).toBe('teacher-invigilation')
    expect(event.reminderKey.startsWith('teacher:T0001:2026-2027-1:')).toBe(true)
    expect(event.reminderKey.startsWith('mini-hbut|r1|')).toBe(false)
    expect(event.scopeKey).toBe('teacher:T0001:2026-2027-1:exams')
  })
})

describe('E6 考试与监考：时间筛选', () => {
  it('isExamPast 正确判定（今天之前为已结束）', () => {
    const today = new Date(2026, 7, 30) // 2026-08-30
    expect(isExamPast('2026-08-29', today)).toBe(true)
    expect(isExamPast('2026-08-30', today)).toBe(false)
    expect(isExamPast('2026-08-31', today)).toBe(false)
    expect(isExamPast('', today)).toBe(false)
    expect(isExamPast('待定', today)).toBe(false)
  })

  it('filterByTimeline 按全部 / 未开始 / 已结束过滤', () => {
    const today = new Date(2026, 7, 30)
    const items = [
      { id: 'past', ksrq: '2026-08-29' },
      { id: 'today', ksrq: '2026-08-30' },
      { id: 'future', ksrq: '2026-09-01' }
    ]
    const dateOf = (item: { ksrq: string }): string => item.ksrq
    expect(filterByTimeline(items, 'all', dateOf, today).map((i) => i.id)).toEqual([
      'past',
      'today',
      'future'
    ])
    expect(filterByTimeline(items, 'past', dateOf, today).map((i) => i.id)).toEqual(['past'])
    expect(filterByTimeline(items, 'upcoming', dateOf, today).map((i) => i.id)).toEqual([
      'today',
      'future'
    ])
  })

  it('学期键校验：非法值不参与切换', () => {
    expect(EXAMS_SEMESTER_PATTERN.test('2026-2027-1')).toBe(true)
    expect(EXAMS_SEMESTER_PATTERN.test('2026-2027-01')).toBe(false)
    expect(EXAMS_SEMESTER_PATTERN.test('垃圾')).toBe(false)
    expect(resolveInitialExamsSemester('2026-2027-2')).toBe('2026-2027-2')
  })
})

describe('E6 考试与监考：作用域隔离与过期响应丢弃', () => {
  it('不同教师账号使用不同作用域键，且缓存不串用', async () => {
    const account = ref('T0001')
    apiMock.fetchTeacherExams.mockResolvedValue(readyState(DATA))
    const hook = useTeacherExams({ accountId: () => account.value, initialSemester: '2026-2027-1' })
    await hook.load()
    const firstScope = hook.scopeKey.value
    expect(firstScope).toBe('teacher:T0001:2026-2027-1:exams')

    account.value = 'T0002'
    await hook.load()
    expect(hook.scopeKey.value).toBe('teacher:T0002:2026-2027-1:exams')
    expect(hook.scopeKey.value).not.toBe(firstScope)
    // 两个作用域各触发一次真实拉取（缓存未命中）
    expect(apiMock.fetchTeacherExams).toHaveBeenCalledTimes(2)
  })

  it('同一作用域重复 load 命中内存缓存，不重复拉取', async () => {
    apiMock.fetchTeacherExams.mockResolvedValue(readyState(DATA))
    const hook = newHook()
    await hook.load()
    await hook.load()
    expect(apiMock.fetchTeacherExams).toHaveBeenCalledTimes(1)
  })

  it('切换学期后，旧学期的过期响应被丢弃', async () => {
    let resolveFirst: (value: TeacherLoadState<TeacherExamData>) => void = () => {}
    const staleData: TeacherExamData = { invigilations: [makeInvigilation({ id: 'stale' })], exams: [] }
    const freshData: TeacherExamData = { invigilations: [makeInvigilation({ id: 'fresh' })], exams: [] }
    apiMock.fetchTeacherExams
      .mockImplementationOnce(
        () =>
          new Promise<TeacherLoadState<TeacherExamData>>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValue(readyState(freshData))

    const hook = newHook('T0001', '2026-2027-1')
    const first = hook.load()
    await hook.setSemester('2026-2027-2')
    resolveFirst(readyState(staleData))
    await first

    expect(hook.state.value.status).toBe('ready')
    expect(hook.state.value.data?.invigilations[0].id).toBe('fresh')
    expect(hook.semester.value).toBe('2026-2027-2')
  })
})
