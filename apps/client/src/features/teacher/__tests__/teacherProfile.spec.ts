// Teacher Portal V2（E2 #1022）：教师个人资料组合函数与展示契约测试。
//
// 覆盖：
//   1. `useTeacherProfile` 的状态映射（ready / empty / error）；
//   2. 错误 kind → i18n key 映射（README §5，禁止直接展示 message）；
//   3. 视图只用有真实只读来源的四个字段，**不出现**部门名称 / 职称 / 邮箱，
//      也不引用学生资料数据模型；
//   4. 视图 / 组合函数引用的 `teacher.*` key 必须存在于字典（防 key 拼写漂移）。
//
// fixture 全部脱敏：工号 / 姓名 / 部门 ID 均为占位值。

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { messages } from '../../../utils/app_i18n'
import { normalizeTeacherProfile } from '../utils/normalizeTeacherData'

const { fetchTeacherProfileMock } = vi.hoisted(() => ({ fetchTeacherProfileMock: vi.fn() }))

vi.mock('../api/teacherApi', () => ({
  fetchTeacherProfile: fetchTeacherProfileMock
}))

const { teacherProfileErrorMessageKey, useTeacherProfile } = await import(
  '../composables/useTeacherProfile'
)

const root = process.cwd()
const readSource = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

/**
 * 反复剥离 HTML 注释直到稳定。
 *
 * 单次 `replace` 可被嵌套构造绕过（`<!--<!--x-->-->` 剥一次仍留 `<!--x-->`），
 * CodeQL `js/incomplete-multi-character-sanitization` 会据此报警；循环到不再变化为止。
 */
const stripHtmlComments = (source: string): string => {
  let current = source
  for (let pass = 0; pass < 16; pass += 1) {
    const next = current.replace(/<!--[\s\S]*?-->/g, '')
    if (next === current) return next
    current = next
  }
  return current
}

/**
 * 剥离注释后的源码（HTML 注释 + JS 块注释 + 行注释）。
 *
 * 与 `i18n_coverage.spec.ts` 同口径：注释里可以解释「为什么不展示职称/邮箱」，
 * 但**真实代码**不得出现这些字段，因此断言必须基于剥离注释后的代码。
 */
const stripComments = (source: string): string =>
  stripHtmlComments(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const index = line.indexOf('//')
      return index >= 0 ? line.slice(0, index) : line
    })
    .join('\n')

/** 脱敏资料载荷（与 Rust `build_profile_payload` 的输出形状一致）。 */
const sanitizedProfile = {
  accountId: '2000000000',
  name: '示例教师',
  roleId: 'js',
  departmentId: '205'
}

beforeEach(() => {
  fetchTeacherProfileMock.mockReset()
})

describe('useTeacherProfile（状态映射）', () => {
  it('初始为 idle，reload 后进入 ready 并暴露资料', async () => {
    fetchTeacherProfileMock.mockResolvedValue({
      status: 'ready',
      data: sanitizedProfile,
      error: null
    })

    const { status, profile, loading, reload } = useTeacherProfile()
    expect(status.value).toBe('idle')
    expect(loading.value).toBe(true)
    expect(profile.value).toBeNull()

    await reload()

    expect(fetchTeacherProfileMock).toHaveBeenCalledTimes(1)
    expect(status.value).toBe('ready')
    expect(loading.value).toBe(false)
    expect(profile.value).toEqual(sanitizedProfile)
  })

  it('空态走 isEmpty 而非错误态', async () => {
    fetchTeacherProfileMock.mockResolvedValue({
      status: 'empty',
      data: null,
      error: { kind: 'empty', message: '' }
    })

    const { status, isEmpty, hasError, profile, reload } = useTeacherProfile()
    await reload()

    expect(status.value).toBe('empty')
    expect(isEmpty.value).toBe(true)
    expect(hasError.value).toBe(false)
    expect(profile.value).toBeNull()
  })

  it('错误态把 kind 映射为 i18n key（不暴露 message）', async () => {
    fetchTeacherProfileMock.mockResolvedValue({
      status: 'error',
      data: null,
      error: { kind: 'expired', message: '会话已过期，请重新登录' }
    })

    const { hasError, errorMessageKey, profile, reload } = useTeacherProfile()
    await reload()

    expect(hasError.value).toBe(true)
    expect(profile.value).toBeNull()
    expect(errorMessageKey.value).toBe('teacher.error.expired')
    expect(errorMessageKey.value).not.toContain('会话已过期')
  })

  it('刷新失败时清空资料并进入错误态（不展示过期内容）', async () => {
    fetchTeacherProfileMock.mockResolvedValueOnce({
      status: 'ready',
      data: sanitizedProfile,
      error: null
    })
    const { profile, reload, status } = useTeacherProfile()
    await reload()
    expect(profile.value).toEqual(sanitizedProfile)

    fetchTeacherProfileMock.mockResolvedValueOnce({
      status: 'error',
      data: null,
      error: { kind: 'timeout', message: 'timeout' }
    })
    await reload()

    expect(status.value).toBe('error')
    expect(profile.value).toBeNull()
  })
})

describe('teacherProfileErrorMessageKey（kind → i18n key）', () => {
  const expectations: Array<[string, string]> = [
    ['empty', 'teacher.error.empty'],
    ['unauthorized', 'teacher.error.unauthorized'],
    ['expired', 'teacher.error.expired'],
    ['errorHtml', 'teacher.error.errorHtml'],
    ['timeout', 'teacher.error.timeout'],
    ['notImplemented', 'teacher.error.notImplemented'],
    ['unknown', 'teacher.error.unknown']
  ]

  it.each(expectations)('%s → %s', (kind, key) => {
    expect(teacherProfileErrorMessageKey(kind as never)).toBe(key)
  })

  it('无错误（null）回落到通用失败文案', () => {
    expect(teacherProfileErrorMessageKey(null)).toBe('teacher.error.unknown')
  })

  it('所有映射目标 key 均存在于字典', () => {
    const dict = messages['zh-CN'] as Record<string, string>
    for (const [, key] of expectations) {
      expect(dict[key], `缺少字典 key: ${key}`).toBeTypeOf('string')
    }
  })
})

describe('TeacherProfileView（展示字段与红线）', () => {
  const viewSource = readSource('src/features/teacher/views/TeacherProfileView.vue')
  const composableSource = readSource('src/features/teacher/composables/useTeacherProfile.ts')
  const viewCode = stripComments(viewSource)
  const composableCode = stripComments(composableSource)

  it('只展示有真实只读来源的四个字段', () => {
    for (const key of [
      'teacher.profile.field.accountId',
      'teacher.profile.field.name',
      'teacher.profile.field.role',
      'teacher.profile.field.departmentId'
    ]) {
      expect(viewCode).toContain(key)
    }
  })

  it('不出现部门名称 / 职称 / 邮箱（无真实来源，不得猜测展示）', () => {
    expect(viewCode).not.toContain('departmentName')
    expect(viewCode).not.toContain('email')
    expect(viewCode).not.toContain('teacher.profile.field.title')
    expect(viewCode).not.toContain('职称')
  })

  it('不引用学生资料数据模型', () => {
    expect(viewCode).not.toContain('studentinfo')
    expect(viewCode).not.toContain('student_id')
    expect(composableCode).not.toContain('studentinfo')
  })

  it('视图与组合函数引用的 teacher.* key 都在字典中', () => {
    const dict = messages['zh-CN'] as Record<string, string>
    const keys = new Set<string>()
    for (const source of [viewSource, composableSource]) {
      for (const match of source.matchAll(/'(teacher\.[A-Za-z0-9_.]+)'/g)) keys.add(match[1])
    }
    expect(keys.size).toBeGreaterThan(0)
    const missing = [...keys].filter((key) => typeof dict[key] !== 'string')
    expect(missing).toEqual([])
  })
})

describe('教师资料归一化（前后端契约形状）', () => {
  it('Rust 返回的四字段载荷可被 normalizeTeacherProfile 直接消费', () => {
    const profile = normalizeTeacherProfile(sanitizedProfile)
    expect(profile).toEqual(sanitizedProfile)
    expect(profile.departmentName).toBeUndefined()
    expect(profile.title).toBeUndefined()
    expect(profile.email).toBeUndefined()
  })

  it('缺少工号与姓名时视为空载荷（视图走空态而非展示空壳）', () => {
    const profile = normalizeTeacherProfile({ roleId: 'js', departmentId: '205' })
    expect(profile.accountId).toBe('')
    expect(profile.name).toBe('')
    expect(!profile.accountId && !profile.name).toBe(true)
  })
})
