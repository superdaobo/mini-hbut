/**
 * useScheduleImport 目标学期一致性修复的定向单测（#820 批量导入 P1 / P2）。
 *
 * 覆盖清单：
 *   P1-a：目标学期 ≠ 已加载学期（allExistingCourses 基线失效）→ commitImport 阻断，
 *         零请求，提示先切学期；
 *   P1-b：retryFailedImport 重试前先刷新已加载学期 custom 数据（服务端真值进入
 *         复检基线）→ 「超时但服务端已成功」条目被 exact-duplicate 复检 skip，
 *         绝不重复写入；刷新失败 → 阻断重试；上次 added 条目并入基线兜底；
 *   P2-a：retry 遇 blocked=validation 走专用提示、回预览、不覆盖上次汇总；
 *   P2-b：commitImport blocked=validation 时字段级错误明细追加进 globalDiagnostics。
 */
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { postMock, showToastMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  showToastMock: vi.fn()
}))

// axios 在 vitest.config 中被 alias 到自研适配器，这里整体替换为可断言的 mock
vi.mock('axios', () => ({
  default: { post: postMock }
}))

// showToast 用 mock 捕获，文案断言走 zh-CN 字典原文
vi.mock('../../../utils/toast', () => ({
  showToast: showToastMock
}))

import { useScheduleImport } from './useScheduleImport'
import type {
  ImportCommitResult,
  ImportPreviewCourse,
  ParsedImportCourse
} from '../utils/importTypes'

const SEMESTER_MISMATCH_TEXT =
  '目标学期与当前已加载的课表学期不一致，请先在课表页切换到目标学期后再导入'
const RETRY_REFRESH_FAILED_TEXT = '重试前刷新课表数据失败，请检查网络后重试'
const validationBlockedText = (n: number) =>
  `有 ${n} 门课程未通过写入前校验，已全部拦截（未写入任何数据），请修正后重试`

/** 断言 toast 是否出现过指定文案 */
const hasToast = (text: string) =>
  showToastMock.mock.calls.some((args) => args[0] === text)

/** 构造一条 ParsedImportCourse（默认值可按需覆盖） */
const makeCourse = (overrides: Partial<ParsedImportCourse> = {}): ParsedImportCourse => ({
  name: '高等数学',
  teacher: '张三',
  room: 'A101',
  weekday: 1,
  period: 1,
  djs: 2,
  weeks: [1, 2, 3, 4],
  sourceIndex: 0,
  diagnostics: [],
  ...overrides
})

/** 构造一条预览条目（默认可导入：selected + 无 hard error + 非 exact） */
const makePreviewItem = (
  sourceIndex: number,
  courseOverrides: Partial<ParsedImportCourse> = {},
  overrides: Partial<ImportPreviewCourse> = {}
): ImportPreviewCourse => ({
  key: `import-${sourceIndex}`,
  course: makeCourse({ sourceIndex, ...courseOverrides }),
  selected: true,
  duplicateKind: 'none',
  conflicts: [],
  diagnostics: [],
  ...overrides
})

type HarnessOptions = {
  /** loadCustomCourses 被调用时的行为（默认成功且不改 customScheduleData） */
  loadCustomCourses?: (semester: string) => Promise<boolean> | boolean
  /** loadCustomCourses 被调用时写入 customScheduleData 的列表（模拟服务端真值） */
  customListOnLoad?: any[]
}

const makeHarness = (options: HarnessOptions = {}) => {
  const data = {
    remoteScheduleData: ref<any[]>([]),
    customScheduleData: ref<any[]>([]),
    scheduleData: ref<any[]>([]),
    loadCustomCourses: vi.fn(async (semester: string) => {
      if (options.customListOnLoad) {
        data.customScheduleData.value = options.customListOnLoad
      }
      return options.loadCustomCourses ? options.loadCustomCourses(semester) : true
    })
  }
  const semester = {
    semester: ref('2025-2026-1'),
    semesterDraft: ref('2025-2026-1'),
    selectedWeek: ref(1),
    currentWeek: ref(1),
    totalWeeks: ref(25),
    startDateStr: ref('')
  }
  const editor = {
    refreshCustomCourseViews: vi.fn(async () => {})
  }
  const importApi = useScheduleImport({
    props: { studentId: '2510231000' },
    data,
    semester,
    editor
  } as never)
  return { importApi, data, semester, editor }
}

const okAdd = { data: { success: true } }

beforeEach(() => {
  postMock.mockReset()
  showToastMock.mockClear()
})

describe('useScheduleImport 目标学期一致性（P1 修复）', () => {
  it('openImportDialog 默认目标学期 = 当前学期，semesterMismatched 为 false', () => {
    const { importApi } = makeHarness()
    expect(importApi.semesterMismatched.value).toBe(false)
    importApi.openImportDialog()
    expect(importApi.targetSemester.value).toBe('2025-2026-1')
    expect(importApi.semesterMismatched.value).toBe(false)
  })

  it('目标学期切到非当前学期后 semesterMismatched 为 true', () => {
    const { importApi } = makeHarness()
    importApi.targetSemester.value = '2025-2026-2'
    expect(importApi.semesterMismatched.value).toBe(true)
  })

  it('commitImport：目标学期 ≠ 已加载学期时阻断，零请求并提示先切学期', async () => {
    const { importApi } = makeHarness()
    importApi.previewCourses.value = [makePreviewItem(0)]
    importApi.targetSemester.value = '2025-2026-2'

    await importApi.commitImport()

    expect(hasToast(SEMESTER_MISMATCH_TEXT)).toBe(true)
    expect(postMock).not.toHaveBeenCalled()
    expect(importApi.committing.value).toBe(false)
    expect(importApi.stage.value).toBe('input')
  })

  it('commitImport：学期一致时正常提交并刷新视图', async () => {
    postMock.mockResolvedValue(okAdd)
    const { importApi, editor } = makeHarness()
    importApi.openImportDialog()
    importApi.previewCourses.value = [makePreviewItem(0)]

    await importApi.commitImport()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(importApi.importResult.value?.added).toBe(1)
    expect(editor.refreshCustomCourseViews).toHaveBeenCalledWith('2025-2026-1')
    expect(hasToast(SEMESTER_MISMATCH_TEXT)).toBe(false)
  })

  it('commitImport blocked=validation：字段级错误明细进入全局诊断，零请求', async () => {
    const { importApi } = makeHarness()
    // weeks 为空触发写入前硬校验失败（条目自身无 error 诊断，否则会被筛选跳过）
    importApi.openImportDialog()
    importApi.previewCourses.value = [makePreviewItem(0, { weeks: [] })]
    importApi.globalDiagnostics.value = [
      { level: 'info', code: 'merged_duplicate_weeks', message: '已自动合并 1 条仅周次不同的重复记录' }
    ]
    // 真实流程：用户解析后已处于 preview 阶段
    importApi.stage.value = 'preview'

    await importApi.commitImport()

    // 零写入
    expect(postMock).not.toHaveBeenCalled()
    // 专用拦截提示
    expect(hasToast(validationBlockedText(1))).toBe(true)
    // 字段级明细追加进全局诊断区（带定位信息），解析期诊断保留
    expect(importApi.globalDiagnostics.value).toHaveLength(2)
    const blocked = importApi.globalDiagnostics.value[1]
    expect(blocked.level).toBe('error')
    expect(blocked.code).toBe('commit_validation_blocked')
    expect(blocked.sourceIndex).toBe(0)
    expect(blocked.courseName).toBe('高等数学')
    expect(blocked.message).toContain('周次')
    // 留在预览阶段供修正
    expect(importApi.stage.value).toBe('preview')
  })
})

describe('useScheduleImport 重试防重复写入（P1 修复）', () => {
  /** 构造一次「部分失败」的上次结果：条目 0 已写入，条目 1 超时失败 */
  const makePreviousResult = (): ImportCommitResult => ({
    ok: false,
    added: 1,
    skipped: 0,
    failed: 1,
    items: [
      { key: 'import-0', sourceIndex: 0, status: 'added' },
      { key: 'import-1', sourceIndex: 1, status: 'failed', error: 'request timeout' }
    ]
  })

  const setupRetry = (importApi: ReturnType<typeof useScheduleImport>) => {
    importApi.openImportDialog()
    importApi.previewCourses.value = [makePreviewItem(0), makePreviewItem(1)]
    importApi.importResult.value = makePreviousResult()
  }

  it('刷新后 existing 含「超时但服务端已成功」条目 → 复检 skip，零重复写入', async () => {
    const { importApi, data } = makeHarness({
      // 服务端真值：超时条目（第 2 条）其实已写入成功
      customListOnLoad: [
        {
          id: 'srv-1',
          name: '大学物理',
          teacher: '李四',
          room: 'B202',
          weekday: 2,
          period: 3,
          djs: 2,
          weeks: [1, 2, 3, 4],
          semester: '2025-2026-1'
        }
      ]
    })
    setupRetry(importApi)
    importApi.previewCourses.value = [
      makePreviewItem(0),
      makePreviewItem(1, {
        name: '大学物理',
        teacher: '李四',
        room: 'B202',
        weekday: 2,
        period: 3,
        djs: 2
      })
    ]
    postMock.mockResolvedValue(okAdd)

    await importApi.retryFailedImport()

    // 重试前先刷新了已加载学期的 custom 数据
    expect(data.loadCustomCourses).toHaveBeenCalledWith('2025-2026-1')
    // 「已写入」条目被 exact-duplicate 复检拦截 → 不发任何写入请求
    expect(postMock).not.toHaveBeenCalled()
    // 汇总如实反映最终状态：失败清零，该条收敛为 skipped
    expect(importApi.importResult.value?.failed).toBe(0)
    expect(importApi.importResult.value?.skipped).toBe(1)
    expect(importApi.importResult.value?.added).toBe(1)
  })

  it('刷新失败时阻断重试，不带陈旧基线重试', async () => {
    const { importApi } = makeHarness({
      loadCustomCourses: () => false
    })
    setupRetry(importApi)
    postMock.mockResolvedValue(okAdd)

    await importApi.retryFailedImport()

    expect(hasToast(RETRY_REFRESH_FAILED_TEXT)).toBe(true)
    expect(postMock).not.toHaveBeenCalled()
    // 上次汇总原样保留
    expect(importApi.importResult.value?.failed).toBe(1)
  })

  it('added 条目并入复检基线：重试集与其完全等价时 skip（兜底）', async () => {
    const { importApi } = makeHarness()
    setupRetry(importApi)
    // 两条完全等价：条目 0 上次已写入；服务端刷新结果为空（兜底场景）
    importApi.previewCourses.value = [
      makePreviewItem(0),
      makePreviewItem(1)
    ]
    postMock.mockResolvedValue(okAdd)

    await importApi.retryFailedImport()

    expect(postMock).not.toHaveBeenCalled()
    expect(importApi.importResult.value?.failed).toBe(0)
    expect(importApi.importResult.value?.skipped).toBe(1)
  })

  it('blocked=validation：专用提示、回预览修正、不覆盖上次汇总', async () => {
    const { importApi } = makeHarness()
    setupRetry(importApi)
    // 失败条目 weeks 为空 → 重试触发写入前硬校验拦截
    importApi.previewCourses.value = [
      makePreviewItem(0),
      makePreviewItem(1, { weeks: [] })
    ]
    postMock.mockResolvedValue(okAdd)
    const previous = importApi.importResult.value

    await importApi.retryFailedImport()

    expect(hasToast(validationBlockedText(1))).toBe(true)
    expect(importApi.stage.value).toBe('preview')
    // 上次汇总未被 blocked 结果覆盖
    expect(importApi.importResult.value).toBe(previous)
    expect(importApi.importResult.value?.failed).toBe(1)
    expect(postMock).not.toHaveBeenCalled()
  })

  it('目标学期 ≠ 已加载学期时重试同样被阻断', async () => {
    const { importApi, data } = makeHarness()
    setupRetry(importApi)
    importApi.targetSemester.value = '2025-2026-2'

    await importApi.retryFailedImport()

    expect(hasToast(SEMESTER_MISMATCH_TEXT)).toBe(true)
    expect(data.loadCustomCourses).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })
})
