import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const repoPath = (relativePath: string) => resolve(process.cwd(), relativePath)
const importModule = async <T = Record<string, unknown>>(relativePath: string): Promise<T> => {
  const fullPath = repoPath(relativePath)
  expect(existsSync(fullPath)).toBe(true)
  return await import(pathToFileURL(fullPath).href) as T
}

describe('TestFlight 演示账号工具', () => {
  it('只接受 reviewer / Test2026 作为测试账号凭据', async () => {
    const mod = await importModule<{
      TEST_ACCOUNT: { username: string; password: string; studentId: string }
      isTestAccountCredentials: (username: string, password: string) => boolean
      isTestAccountStudentId: (studentId: string) => boolean
    }>('src/utils/test_account.js')

    expect(mod.TEST_ACCOUNT).toMatchObject({
      username: 'reviewer',
      password: 'Test2026',
      studentId: '2026000001'
    })
    expect(mod.isTestAccountCredentials(' reviewer ', 'Test2026')).toBe(true)
    expect(mod.isTestAccountCredentials('reviewer', 'wrong')).toBe(false)
    expect(mod.isTestAccountCredentials('2510231106', 'Test2026')).toBe(false)
    expect(mod.isTestAccountStudentId('2026000001')).toBe(true)
    expect(mod.isTestAccountStudentId('2510231106')).toBe(false)
  })

  it('登录后可一次性种入核心校园模块缓存', async () => {
    const account = await importModule<{
      TEST_ACCOUNT: { studentId: string }
    }>('src/utils/test_account.js')
    const fixtures = await importModule<{
      seedTestAccountCaches: (setCachedData: (key: string, data: unknown) => void, studentId?: string) => string[]
    }>('src/utils/test_account_fixtures.js')

    const written = new Map<string, unknown>()
    const keys = fixtures.seedTestAccountCaches((key, data) => written.set(key, data), account.TEST_ACCOUNT.studentId)

    expect(keys).toEqual(expect.arrayContaining([
      `grades:${account.TEST_ACCOUNT.studentId}`,
      `schedule:${account.TEST_ACCOUNT.studentId}`,
      `studentinfo:${account.TEST_ACCOUNT.studentId}`,
      `exams:${account.TEST_ACCOUNT.studentId}:current`,
      `ranking:${account.TEST_ACCOUNT.studentId}:current`,
      `calendar:${account.TEST_ACCOUNT.studentId}:current`,
      `academic:${account.TEST_ACCOUNT.studentId}:1`,
      `training:options:${account.TEST_ACCOUNT.studentId}`,
      `electricity:${account.TEST_ACCOUNT.studentId}:light`
    ]))
    expect(keys).not.toContain('semesters')
    expect(keys).not.toContain('classroom:buildings')
    expect(written.has('semesters')).toBe(false)
    expect(written.has('classroom:buildings')).toBe(false)
    expect(written.get(`grades:${account.TEST_ACCOUNT.studentId}`)).toMatchObject({ success: true })
    expect(written.get(`schedule:${account.TEST_ACCOUNT.studentId}`)).toMatchObject({ success: true })
  })

  it('为缓存、HTTP 和原生命令提供演示响应，敏感动作返回禁用态', async () => {
    const fixtures = await importModule<{
      resolveTestAccountCachePayload: (key: string) => unknown
      resolveTestAccountHttpResponse: (method: string, url: string, data?: Record<string, unknown>) => unknown
      resolveTestAccountNativeResponse: (command: string, args?: Record<string, unknown>) => unknown
      resolveTestAccountForumResponse: (path: string, options?: Record<string, unknown>) => unknown
    }>('src/utils/test_account_fixtures.js')

    expect(fixtures.resolveTestAccountCachePayload('grades:2026000001')).toMatchObject({ success: true })
    expect(fixtures.resolveTestAccountHttpResponse('post', '/api/v2/start_login', {
      username: 'reviewer',
      password: 'Test2026'
    })).toMatchObject({ success: true, data: { student_id: '2026000001' } })
    expect(fixtures.resolveTestAccountHttpResponse('post', '/api/v2/course_selection/select', {})).toMatchObject({
      success: false,
      demo_disabled: true
    })
    expect(fixtures.resolveTestAccountNativeResponse('fetch_student_info')).toMatchObject({
      success: true,
      student_id: '2026000001'
    })
    expect(fixtures.resolveTestAccountNativeResponse('resource_share_direct_url_native')).toMatchObject({
      success: false,
      demo_disabled: true
    })
    expect(fixtures.resolveTestAccountForumResponse('/threads')).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ title: 'TestFlight 演示帖' })
      ])
    })
    expect(fixtures.resolveTestAccountForumResponse('/unknown')).toMatchObject({
      success: false,
      demo_disabled: true
    })
  })

  it('测试账号全局缓存只读 fixture，不覆盖真实全局缓存', async () => {
    vi.resetModules()
    const store = new Map<string, string>([
      ['cache:semesters', '{"data":{"real":true},"timestamp":1}'],
      ['hbu_training_options', '{"real":true}'],
      ['hbu_schedule_meta', '{"real":true}']
    ])
    vi.stubGlobal('localStorage', {
      get length() { return store.size },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key)
    })

    const account = await importModule<{
      markTestAccountSession: () => void
      clearTestAccountSession: () => void
    }>('src/utils/test_account.js')
    account.markTestAccountSession()
    const api = await importModule<{
      fetchWithCache: (key: string, fetcher: () => Promise<unknown>, ttl?: number) => Promise<{ data: unknown; demo?: boolean }>
    }>('src/utils/api.js')

    const result = await api.fetchWithCache('semesters', async () => {
      throw new Error('测试账号不应请求真实学期接口')
    })

    expect(result).toMatchObject({ demo: true })
    expect(store.get('cache:semesters')).toBe('{"data":{"real":true},"timestamp":1}')
    expect(store.get('hbu_training_options')).toBe('{"real":true}')
    expect(store.get('hbu_schedule_meta')).toBe('{"real":true}')
    account.clearTestAccountSession()
    expect(store.get('cache:semesters')).toBe('{"data":{"real":true},"timestamp":1}')
    expect(store.get('hbu_training_options')).toBe('{"real":true}')
    expect(store.get('hbu_schedule_meta')).toBe('{"real":true}')
    vi.unstubAllGlobals()
  })

  it('测试账号会话标记可被写入和清理，且不删除真实全局缓存', async () => {
    const mod = await importModule<{
      markTestAccountSession: () => void
      clearTestAccountSession: () => void
      isTestAccountSession: () => boolean
    }>('src/utils/test_account.js')

    const store = new Map<string, string>([
      ['hbu_training_options', '{"real":true}'],
      ['hbu_schedule_meta', '{"real":true}'],
      ['hbut_resource_dir_cache_v4', '{"real":true}'],
      ['cache:semesters', '{"real":true}'],
      ['cache:classroom:buildings', '{"real":true}']
    ])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key)
    })

    mod.markTestAccountSession()
    expect(mod.isTestAccountSession()).toBe(true)
    mod.clearTestAccountSession()
    expect(mod.isTestAccountSession()).toBe(false)
    expect(store.get('hbu_training_options')).toBe('{"real":true}')
    expect(store.get('hbu_schedule_meta')).toBe('{"real":true}')
    expect(store.get('hbut_resource_dir_cache_v4')).toBe('{"real":true}')
    expect(store.get('cache:semesters')).toBe('{"real":true}')
    expect(store.get('cache:classroom:buildings')).toBe('{"real":true}')
    vi.unstubAllGlobals()
  })
})
