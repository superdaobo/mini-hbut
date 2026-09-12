/**
 * #820 Phase-1 持久化提交层单测。
 *
 * 覆盖清单：
 *   buildPersistPayload 剥离 preview-only 字段；semester 来自参数而非 course；
 *   color 三级回退（override > requestedColor > 默认）；非法 requestedColor 回退默认；
 *   weeks 规范化；
 *   commitImportCourses 筛选规则（未选中 / exact duplicate / 有 error 诊断 → skipped）；
 *   axios 模拟下：单条失败不影响其他条目、汇总 added/skipped/failed 正确、异常被捕获为 failed。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

// axios 在 vitest.config 中被 alias 到自研适配器，这里整体替换为可断言的 mock
vi.mock('axios', () => ({
  default: { post: postMock }
}))

import { buildPersistPayload, commitImportCourses } from './importCommit'
import type { ImportCommitContext } from './importCommit'
import type {
  ImportDiagnostic,
  ImportPreviewCourse,
  ParsedImportCourse
} from './importTypes'
import { COURSE_COLOR_PRESETS, DEFAULT_COURSE_COLOR } from '../../../utils/course_color'

/** custom/add 请求体（测试断言用） */
interface AddBody {
  student_id: string
  semester: string
  name: string
  teacher: string
  room: string
  weekday: number
  period: number
  djs: number
  weeks: number[]
  color: string
}

/** 读取第 i 次 axios.post 的 url / body */
function urlAt(i: number): string {
  return postMock.mock.calls[i][0] as string
}
function bodyAt(i: number): AddBody {
  return postMock.mock.calls[i][1] as AddBody
}

/** 构造一条 ParsedImportCourse（默认值可按需覆盖） */
function makeCourse(overrides: Partial<ParsedImportCourse> = {}): ParsedImportCourse {
  return {
    name: '高等数学',
    teacher: '张三',
    room: 'A101',
    weekday: 1,
    period: 1,
    djs: 2,
    weeks: [1, 2, 3],
    sourceIndex: 0,
    diagnostics: [],
    ...overrides
  }
}

/** 构造一条 ImportPreviewCourse（默认全部可提交） */
function makePreview(overrides: Partial<ImportPreviewCourse> = {}): ImportPreviewCourse {
  const course = overrides.course ?? makeCourse()
  return {
    key: `k-${course.sourceIndex}`,
    course,
    selected: true,
    duplicateKind: 'none',
    conflicts: [],
    diagnostics: [],
    ...overrides
  }
}

const CTX: ImportCommitContext = {
  apiBase: '/api',
  studentId: '20230001',
  semester: '2024-2025-1'
}

beforeEach(() => {
  postMock.mockReset()
})

describe('buildPersistPayload（纯函数 / 字段剥离）', () => {
  it('只输出持久化字段，剥离全部 preview-only 字段', () => {
    const preview = [
      makePreview({
        key: 'k-0',
        selected: true,
        duplicateKind: 'possible',
        conflicts: [
          {
            withCourseName: '线性代数',
            overlapWeeks: [2],
            overlapPeriodStart: 1,
            overlapPeriodEnd: 2,
            source: 'official'
          }
        ],
        diagnostics: [{ level: 'warning', code: 'X', message: 'warn' }],
        colorOverride: '#123456'
      })
    ]

    const payloads = buildPersistPayload(preview, CTX.semester)

    expect(payloads).toHaveLength(1)
    const payload = payloads[0]
    expect(Object.keys(payload).sort()).toEqual(
      ['semester', 'name', 'teacher', 'room', 'weekday', 'period', 'djs', 'weeks', 'color'].sort()
    )
    expect(payload).not.toHaveProperty('selected')
    expect(payload).not.toHaveProperty('duplicateKind')
    expect(payload).not.toHaveProperty('conflicts')
    expect(payload).not.toHaveProperty('diagnostics')
    expect(payload).not.toHaveProperty('key')
    expect(payload).not.toHaveProperty('sourceIndex')
    expect(payload).not.toHaveProperty('colorOverride')
    // 原始 preview 不被修改
    expect(preview[0].selected).toBe(true)
  })

  it('semester 来自参数，而非 course / AI payload', () => {
    // 模拟 AI 在 course 上偷偷塞入 semester 字段
    const course = makeCourse({ sourceIndex: 0 }) as ParsedImportCourse & { semester?: string }
    course.semester = 'AI-伪造学期'
    const payloads = buildPersistPayload([makePreview({ course })], 'REAL-SEMESTER')
    expect(payloads[0].semester).toBe('REAL-SEMESTER')
  })

  it('color 三级回退：colorOverride > requestedColor > 默认', () => {
    const override = makePreview({
      course: makeCourse({ sourceIndex: 0, requestedColor: COURSE_COLOR_PRESETS[2].hex }),
      colorOverride: '#ABCDEF'
    })
    const requested = makePreview({
      course: makeCourse({ sourceIndex: 1, requestedColor: COURSE_COLOR_PRESETS[3].hex })
    })
    const fallback = makePreview({ course: makeCourse({ sourceIndex: 2 }) })

    const payloads = buildPersistPayload([override, requested, fallback], CTX.semester)
    expect(payloads[0].color).toBe('#abcdef') // override 优先，且规范化为小写
    expect(payloads[1].color).toBe(COURSE_COLOR_PRESETS[3].hex.toLowerCase()) // 其次 requestedColor
    expect(payloads[2].color).toBe(DEFAULT_COURSE_COLOR) // 最后默认
  })

  it('非法 requestedColor 回退到默认；3 位 hex 也能被规范化', () => {
    const invalid = makePreview({
      course: makeCourse({ sourceIndex: 0, requestedColor: 'not-a-color' })
    })
    const shorthand = makePreview({
      course: makeCourse({ sourceIndex: 1, requestedColor: '#fff' })
    })
    const payloads = buildPersistPayload([invalid, shorthand], CTX.semester)
    expect(payloads[0].color).toBe(DEFAULT_COURSE_COLOR)
    expect(payloads[1].color).toBe('#ffffff')
  })

  it('weeks 经 normalizeWeeks 去重升序并过滤非法值', () => {
    const preview = [makePreview({ course: makeCourse({ sourceIndex: 0, weeks: [3, 1, 1, 2, 0] }) })]
    const payloads = buildPersistPayload(preview, CTX.semester)
    expect(payloads[0].weeks).toEqual([1, 2, 3])
  })

  it('空输入 → 空数组', () => {
    expect(buildPersistPayload([], CTX.semester)).toEqual([])
  })
})

describe('commitImportCourses（筛选规则）', () => {
  it('未选中 / exact duplicate / 有 error 诊断的条目一律 skipped 且不发起请求', async () => {
    const errorDiag: ImportDiagnostic = { level: 'error', code: 'E', message: 'bad' }
    const preview = [
      makePreview({ course: makeCourse({ sourceIndex: 0 }), selected: false }),
      makePreview({ course: makeCourse({ sourceIndex: 1 }), duplicateKind: 'exact' }),
      makePreview({ course: makeCourse({ sourceIndex: 2 }), diagnostics: [errorDiag] }),
      // error 落在 course.diagnostics 上也应被拦截
      makePreview({ course: makeCourse({ sourceIndex: 3, diagnostics: [errorDiag] }) })
    ]

    const result = await commitImportCourses(preview, CTX)

    expect(postMock).not.toHaveBeenCalled()
    expect(result.added).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(4)
    expect(result.ok).toBe(true)
    expect(result.items.map((i) => i.status)).toEqual([
      'skipped',
      'skipped',
      'skipped',
      'skipped'
    ])
  })

  it('possible duplicate 与 warning 诊断不阻断提交', async () => {
    postMock.mockResolvedValueOnce({ data: { success: true } })
    const preview = [
      makePreview({
        course: makeCourse({ sourceIndex: 0 }),
        duplicateKind: 'possible',
        diagnostics: [{ level: 'warning', code: 'W', message: 'warn' }]
      })
    ]
    const result = await commitImportCourses(preview, CTX)
    expect(result.added).toBe(1)
    expect(postMock).toHaveBeenCalledTimes(1)
  })
})

describe('commitImportCourses（提交与汇总）', () => {
  it('成功提交时使用 ctx 的 studentId/semester，并规范化 weeks/color', async () => {
    postMock.mockResolvedValueOnce({ data: { success: true } })
    const preview = [
      makePreview({
        course: makeCourse({ sourceIndex: 0, weeks: [5, 4, 4], requestedColor: '#fff' })
      })
    ]

    const result = await commitImportCourses(preview, CTX)

    expect(result.ok).toBe(true)
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.failed).toBe(0)
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(urlAt(0)).toBe('/api/v2/schedule/custom/add')
    expect(bodyAt(0)).toMatchObject({
      student_id: '20230001',
      semester: '2024-2025-1',
      name: '高等数学',
      weekday: 1,
      period: 1,
      djs: 2,
      weeks: [4, 5],
      color: '#ffffff'
    })
  })

  it('单条失败不影响其他条目，汇总 added/skipped/failed 正确且 items 含全部条目', async () => {
    // 提交顺序：idx0 成功、idx2 业务失败、idx3 成功
    postMock
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ data: { success: false, error: '时间冲突' } })
      .mockResolvedValueOnce({ data: { success: true } })

    const preview = [
      makePreview({ course: makeCourse({ sourceIndex: 0 }) }), // added
      makePreview({ course: makeCourse({ sourceIndex: 1 }), selected: false }), // skipped
      makePreview({ course: makeCourse({ sourceIndex: 2 }) }), // failed
      makePreview({ course: makeCourse({ sourceIndex: 3 }) }) // added
    ]

    const result = await commitImportCourses(preview, CTX)

    expect(result.added).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.ok).toBe(false)
    expect(postMock).toHaveBeenCalledTimes(3)

    // items 覆盖全部 4 条，且 key / sourceIndex 可回溯
    expect(result.items).toHaveLength(4)
    expect(result.items.map((i) => i.status)).toEqual(['added', 'skipped', 'failed', 'added'])
    expect(result.items.map((i) => i.sourceIndex)).toEqual([0, 1, 2, 3])
    expect(result.items.map((i) => i.key)).toEqual(['k-0', 'k-1', 'k-2', 'k-3'])
    expect(result.items[2].error).toBe('时间冲突')
  })

  it('axios 抛异常被捕获为该条 failed，不中断整批', async () => {
    postMock
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ data: { success: true } })

    const preview = [
      makePreview({ course: makeCourse({ sourceIndex: 0 }) }),
      makePreview({ course: makeCourse({ sourceIndex: 1 }) })
    ]

    const result = await commitImportCourses(preview, CTX)

    expect(result.failed).toBe(1)
    expect(result.added).toBe(1)
    expect(result.ok).toBe(false)
    expect(result.items[0].status).toBe('failed')
    expect(result.items[0].error).toBe('Network Error')
    expect(result.items[1].status).toBe('added')
  })

  it('成功但响应体缺 success 字段 → 视为失败并带上兜底错误', async () => {
    postMock.mockResolvedValueOnce({ data: {} })
    const result = await commitImportCourses(
      [makePreview({ course: makeCourse({ sourceIndex: 0 }) })],
      CTX
    )
    expect(result.failed).toBe(1)
    expect(result.items[0].error).toBe('新增失败')
  })

  it('空预览 → 全零汇总', async () => {
    const result = await commitImportCourses([], CTX)
    expect(result).toEqual({ ok: true, added: 0, skipped: 0, failed: 0, items: [] })
    expect(postMock).not.toHaveBeenCalled()
  })
})
