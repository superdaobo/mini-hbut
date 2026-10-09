import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { setCachedDataMock } = vi.hoisted(() => ({ setCachedDataMock: vi.fn() }))

vi.mock('./api.js', () => ({
  setCachedData: setCachedDataMock,
  getCachedData: vi.fn(() => null),
  clearCacheByPrefix: vi.fn()
}))

import { applyAcademicFromCloud } from './cloud_sync_apply.js'
import { LOGIN_ROLE_KEY } from './login_role.js'

const createStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    snapshot: () => Object.fromEntries(store)
  }
}

const SID = '2024000000'

/** 云端学业快照：含学生专属数据（成绩 / 排名 / 学籍）+ 教师同样需要的课表元信息。 */
const academicPayload = () => ({
  grades: [{ kcmc: '高等数学', kcbm: 'X1', xf: '4', cj: '90', xnxq: '2026-2027-1' }],
  grades_by_semester: {
    '2026-2027-1': [{ kcmc: '高等数学', kcbm: 'X1', xf: '4', cj: '90' }]
  },
  ranking: { zymc: '计算机', pm: 1, zrs: 100 },
  personal_info: { xm: '张三', xh: SID },
  schedule_meta: { semester: '2026-2027-1', current_week: 6 }
})

const writtenKeys = () => setCachedDataMock.mock.calls.map((call) => String(call[0]))
const studentOnlyWrites = () =>
  writtenKeys().filter(
    (key) =>
      key.startsWith('grades:') ||
      key.startsWith('ranking:') ||
      key.startsWith('studentinfo:') ||
      key.startsWith('student_info:')
  )

let storage: ReturnType<typeof createStorage>

beforeEach(() => {
  setCachedDataMock.mockClear()
  storage = createStorage()
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('云同步的身份隔离：教师端不同步学业数据', () => {
  it('教师身份：不写入任何成绩/排名/学籍缓存，但保留课表元信息', () => {
    storage.setItem(LOGIN_ROLE_KEY, 'teacher')

    const result = applyAcademicFromCloud(SID, academicPayload())

    expect(studentOnlyWrites()).toEqual([])
    expect(result.gradesCached).toBe(false)
    expect(result.rankingCached).toBe(false)
    expect(result.personalInfoCached).toBe(false)
    // 课表元信息属于教师同样需要的数据，必须继续应用
    expect(result.scheduleMetaApplied).toBe(true)
    expect(storage.snapshot()['hbu_schedule_meta']).toBeTruthy()
  })

  it('学生身份（对照组）：成绩/排名/学籍照常写入 —— 证明上面的差异确实由身份驱动', () => {
    storage.setItem(LOGIN_ROLE_KEY, 'student')

    const result = applyAcademicFromCloud(SID, academicPayload())

    expect(result.gradesCached).toBe(true)
    expect(result.rankingCached).toBe(true)
    expect(result.personalInfoCached).toBe(true)
    expect(studentOnlyWrites().length).toBeGreaterThan(0)
    expect(writtenKeys().some((key) => key.startsWith('grades:'))).toBe(true)
  })

  it('身份缺失（历史设备）按学生处理，不误伤既有用户', () => {
    // 不写 LOGIN_ROLE_KEY
    const result = applyAcademicFromCloud(SID, academicPayload())
    expect(result.gradesCached).toBe(true)
    expect(result.personalInfoCached).toBe(true)
  })

  it('教师身份下传入空/非法 academic 仍然安全', () => {
    storage.setItem(LOGIN_ROLE_KEY, 'teacher')

    expect(() => applyAcademicFromCloud(SID, null)).not.toThrow()
    expect(applyAcademicFromCloud(SID, null).gradesCached).toBe(false)
    expect(applyAcademicFromCloud('', academicPayload()).gradesCached).toBe(false)
    expect(studentOnlyWrites()).toEqual([])
  })
})
