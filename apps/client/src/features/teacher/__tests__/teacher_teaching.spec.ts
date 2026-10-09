// Teacher Portal V2（E5 #1025）：我的教学组合函数契约测试。
//
// 覆盖：
//   1. **6 条教学任务 对 4 个教学班**（粒度不同）只按 `jxbid` 关联——不误合并、不丢失；
//   2. HTML 字段清洗（课程名 / 教学班名 / 院系名）；
//   3. 错误态与空态（按 kind 映射 i18n key，不直接展示后端 message）；
//   4. 作用域隔离（不同教师账号 / 学期缓存不串用）与过期响应丢弃。
//
// fixture 全部脱敏：无真实工号、姓名、教学班名单、Cookie。

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  TeacherDataErrorKind,
  TeacherLoadState,
  TeacherTeachingData,
  TeachingClass,
  TeachingTask
} from '../types'

const apiMock = vi.hoisted(() => ({ fetchTeacherTeaching: vi.fn() }))

vi.mock('../api/teacherApi', () => ({
  fetchTeacherTeaching: apiMock.fetchTeacherTeaching
}))

import {
  linkTeachingData,
  resolveInitialTeachingSemester,
  sanitizeTeachingClass,
  sanitizeTeachingTask,
  teacherTeachingErrorKey,
  useTeacherTeaching
} from '../composables/useTeacherTeaching'

const makeTask = (
  id: string,
  jxbid: string,
  kcmc: string,
  name: string
): TeachingTask => ({
  id,
  xnxq: '2026-2027-1',
  kcmc,
  name,
  jxbid,
  jxbzc: '班级甲,班级乙',
  bjrs: 49,
  xf: '1.5'
})

const makeClass = (
  id: string,
  jxbid: string,
  kcmc: string,
  name: string,
  xs = '24'
): TeachingClass => ({
  id,
  kcmc,
  kcbh: '20605010A',
  xnxq: '2026-2027-1',
  name,
  jxbid,
  jxbzc: '班级甲,班级乙',
  bjrs: 49,
  xf: '1.5',
  xs,
  kkyxmc: '示例学院'
})

/** 6 条教学任务（实测粒度）。 */
const SIX_TASKS: TeachingTask[] = [
  makeTask('t1', 'jx-1', '课程一', '课程一【理论】1001'),
  makeTask('t2', 'jx-2', '课程二', '课程二【理论】1002'),
  makeTask('t3', 'jx-3', '课程三', '课程三【理论】1003'),
  makeTask('t4', 'jx-4', '课程四', '课程四【理论】1004'),
  makeTask('t5', 'jx-5', '课程五', '课程五【理论】1005'),
  makeTask('t6', 'jx-6', '课程六', '课程六【理论】1006')
]

/** 4 个教学班（实测粒度），顺序与任务**故意错位**。 */
const FOUR_CLASSES: TeachingClass[] = [
  makeClass('c1', 'jx-3', '课程三', '课程三【理论】1003', '16'),
  makeClass('c2', 'jx-1', '课程一', '课程一【理论】1001', '24'),
  makeClass('c3', 'jx-2', '课程二', '课程二【理论】1002', '32'),
  makeClass('c4', 'jx-4', '课程四', '课程四【理论】1004', '48')
]

const DATA: TeacherTeachingData = { tasks: SIX_TASKS, classes: FOUR_CLASSES }

const readyState = (data: TeacherTeachingData): TeacherLoadState<TeacherTeachingData> => ({
  status: 'ready',
  data,
  error: null
})

const emptyState = (): TeacherLoadState<TeacherTeachingData> => ({
  status: 'empty',
  data: null,
  error: { kind: 'empty', message: '' }
})

const errorState = (
  kind: TeacherDataErrorKind
): TeacherLoadState<TeacherTeachingData> => ({
  status: 'error',
  data: null,
  error: { kind, message: `mock ${kind}` }
})

const newHook = (accountId = 'A', semester = '2026-2027-1') =>
  useTeacherTeaching({ accountId: () => accountId, initialSemester: semester })

beforeEach(() => {
  apiMock.fetchTeacherTeaching.mockReset()
})

describe('E5 我的教学：6 对 4 按 jxbid 关联（禁止数组索引拼接）', () => {
  it('6 条任务一条不丢，4 个教学班一条不少', () => {
    const links = linkTeachingData(DATA)
    expect(links).toHaveLength(6)
    expect(DATA.classes).toHaveLength(4)
  })

  it('关联按 jxbid 精确命中（顺序错位也不错配）', () => {
    const links = linkTeachingData(DATA)
    // 若按数组索引拼接，t1 会错配到 c1(jx-3)；按 jxbid 应命中 c2(jx-1)。
    expect(links[0].linkedClass?.id).toBe('c2')
    expect(links[1].linkedClass?.id).toBe('c3')
    expect(links[2].linkedClass?.id).toBe('c1')
    expect(links[3].linkedClass?.id).toBe('c4')
    // t5/t6 在教学班列表中不存在 → 明确为 null，绝不错配到别的班。
    expect(links[4].linkedClass).toBeNull()
    expect(links[5].linkedClass).toBeNull()
  })

  it('任务缺 jxbid 或 jxbid 为空串时不关联任何教学班', () => {
    const links = linkTeachingData({
      tasks: [
        { ...makeTask('t1', '', '课程一', '班一') },
        { ...makeTask('t2', '   ', '课程二', '班二') }
      ],
      classes: FOUR_CLASSES
    })
    expect(links.every((link) => link.linkedClass === null)).toBe(true)
  })

  it('同一 jxbid 出现多个教学班时取首个（确定性，不随机）', () => {
    const links = linkTeachingData({
      tasks: [makeTask('t1', 'jx-1', '课程一', '班一')],
      classes: [
        makeClass('c-first', 'jx-1', '课程一', '班一'),
        makeClass('c-second', 'jx-1', '课程一', '班一（重复）')
      ]
    })
    expect(links[0].linkedClass?.id).toBe('c-first')
  })
})

describe('E5 我的教学：HTML 字段清洗', () => {
  it('教学任务课程名/教学班名含 HTML 时清洗为纯文本', () => {
    const cleaned = sanitizeTeachingTask({
      ...makeTask('t1', 'jx-1', '<b>课程一</b><script>alert(1)</script>', '班一<span>理论</span>')
    })
    expect(cleaned.kcmc).not.toContain('<')
    expect(cleaned.kcmc).not.toContain('script')
    expect(cleaned.kcmc).toContain('课程一')
    expect(cleaned.name).toBe('班一理论')
  })

  it('教学班院系名/教学班名含 HTML 时清洗为纯文本', () => {
    const cleaned = sanitizeTeachingClass({
      ...makeClass('c1', 'jx-1', '课程一', '班一'),
      kkyxmc: '<a href="javascript:alert(1)">示例学院</a>'
    })
    expect(cleaned.kkyxmc).not.toContain('<')
    expect(cleaned.kkyxmc).not.toContain('javascript:')
    expect(cleaned.kkyxmc).toContain('示例学院')
  })

  it('可选字段缺失时清洗结果不新增字段（不臆造）', () => {
    const task: TeachingTask = { id: 't1', xnxq: '2026-2027-1', kcmc: '课程', name: '班', jxbid: 'jx-1' }
    const cleaned = sanitizeTeachingTask(task)
    expect('jxbzc' in cleaned).toBe(false)
    expect('ksxsname' in cleaned).toBe(false)
  })
})

describe('E5 我的教学：加载状态与错误映射', () => {
  it('加载成功进入 ready，并暴露 6 任务 / 4 教学班', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(readyState(DATA))
    const t = newHook()
    await t.load()
    expect(t.isReady.value).toBe(true)
    expect(t.tasks.value).toHaveLength(6)
    expect(t.classes.value).toHaveLength(4)
    expect(t.errorKey.value).toBe('')
  })

  it('空结果进入 empty（非错误），errorKey 指向 teacher.error.empty', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(emptyState())
    const t = newHook()
    await t.load()
    expect(t.isEmpty.value).toBe(true)
    expect(t.errorKey.value).toBe('teacher.error.empty')
  })

  it.each(['unauthorized', 'expired', 'errorHtml', 'timeout', 'unknown'] as const)(
    '错误 kind=%s 映射到对应 i18n key',
    async (kind) => {
      apiMock.fetchTeacherTeaching.mockResolvedValueOnce(errorState(kind))
      const t = newHook()
      await t.load()
      expect(t.isError.value).toBe(true)
      expect(t.errorKey.value).toBe(`teacher.error.${kind}`)
    }
  )

  it('teacherTeachingErrorKey 覆盖全部错误 kind', () => {
    expect(teacherTeachingErrorKey('unauthorized')).toBe('teacher.error.unauthorized')
    expect(teacherTeachingErrorKey('expired')).toBe('teacher.error.expired')
    expect(teacherTeachingErrorKey('errorHtml')).toBe('teacher.error.errorHtml')
    expect(teacherTeachingErrorKey('notImplemented')).toBe('teacher.error.notImplemented')
  })

  it('重试强制绕过缓存并重新拉取', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValue(readyState(DATA))
    const t = newHook()
    await t.load()
    await t.retry()
    expect(apiMock.fetchTeacherTeaching).toHaveBeenCalledTimes(2)
  })
})

describe('E5 我的教学：作用域隔离（不同账号 / 学期不串用）', () => {
  it('不同账号 / 学期得到不同作用域键', () => {
    expect(newHook('A', '2026-2027-1').scopeKey.value).toBe('teacher:A:2026-2027-1:teaching')
    expect(newHook('B', '2026-2027-1').scopeKey.value).toBe('teacher:B:2026-2027-1:teaching')
    expect(newHook('A', '2027-2028-1').scopeKey.value).toBe('teacher:A:2027-2028-1:teaching')
  })

  it('同作用域第二次加载命中内存缓存（不重复请求）', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(readyState(DATA))
    const t = newHook()
    await t.load()
    await t.load()
    expect(apiMock.fetchTeacherTeaching).toHaveBeenCalledTimes(1)
  })

  it('切换学期后旧响应被丢弃，不会覆盖新数据', async () => {
    let resolveFirst: (value: TeacherLoadState<TeacherTeachingData>) => void = () => {}
    apiMock.fetchTeacherTeaching.mockImplementationOnce(
      () => new Promise<TeacherLoadState<TeacherTeachingData>>((resolve) => {
        resolveFirst = resolve
      })
    )
    const t = newHook('A', '2026-2027-1')
    const firstLoad = t.load()

    const newData: TeacherTeachingData = {
      tasks: [makeTask('n1', 'jx-n', '新学期课程', '新学期班级')],
      classes: [makeClass('cn', 'jx-n', '新学期课程', '新学期班级')]
    }
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(readyState(newData))
    await t.setSemester('2027-2028-1')
    expect(t.semester.value).toBe('2027-2028-1')

    // 旧请求此刻才返回 → 必须被丢弃，不能覆盖新学期数据。
    resolveFirst(readyState(DATA))
    await firstLoad
    expect(t.state.value.data).toEqual(newData)
  })

  it('clearCache 后同作用域会重新请求', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValue(readyState(DATA))
    const t = newHook()
    await t.load()
    t.clearCache()
    await t.load()
    expect(apiMock.fetchTeacherTeaching).toHaveBeenCalledTimes(2)
  })

  it('切换学期会清空当前数据并重新加载', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(readyState(DATA))
    const t = newHook()
    await t.load()
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(emptyState())
    await t.setSemester('2027-2028-1')
    expect(t.isEmpty.value).toBe(true)
  })

  it('非法学期输入不触发切换（不把垃圾值发给接口）', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValue(readyState(DATA))
    const t = newHook()
    await t.load()
    await t.setSemester('not-a-semester')
    expect(t.semester.value).toBe('2026-2027-1')
    expect(apiMock.fetchTeacherTeaching).toHaveBeenCalledTimes(1)
  })
})

describe('E5 我的教学：初始学期解析', () => {
  it('显式学期优先', () => {
    expect(resolveInitialTeachingSemester('2025-2026-2')).toBe('2025-2026-2')
  })

  it('显式学期被标准化（2026-2027-01 → 2026-2027-1）', () => {
    expect(resolveInitialTeachingSemester('2026-2027-01')).toBe('2026-2027-1')
  })

  it('缺省时回落到按日期推算的合法学期格式', () => {
    expect(resolveInitialTeachingSemester()).toMatch(/^\d{4}-\d{4}-[12]$/)
  })
})
