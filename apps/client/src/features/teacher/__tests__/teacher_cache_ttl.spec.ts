// src/features/teacher/__tests__/teacher_cache_ttl.spec.ts
//
// Teacher Portal V2（#1065）：教师快照缓存 TTL / 隔离 / 离线保留 组合函数契约测试。
//
// 覆盖（对应 #1065 验收）：
//   1. 假时钟 TTL：TTL 内命中快照不请求；过期后后台再验证；
//   2. 账号 / 学期隔离：教师 A 缓存绝不被教师 B 或其它学期读到；
//   3. 教师 key 永不落入学生域；
//   4. 空数组缓存（空 ≠ 失败）；
//   5. 失败保留上次成功数据（标记 cached / failed），绝不闪空；
//   6. 缓存版本升级（旧 schema 一律丢弃）；
//   7. 同步状态语义（updating 保留原时间）。
//
// fixture 全部脱敏。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TeacherDataErrorKind, TeacherLoadState, TeacherTeachingData } from '../types'

const apiMock = vi.hoisted(() => ({ fetchTeacherTeaching: vi.fn() }))

vi.mock('../api/teacherApi', () => ({
  fetchTeacherTeaching: apiMock.fetchTeacherTeaching
}))

import { useTeacherTeaching } from '../composables/useTeacherTeaching'
import {
  TEACHER_SNAPSHOT_SCHEMA_VERSION,
  buildTeacherSnapshotKey,
  resetTeacherSnapshotStore,
  teacherSnapshotStorageKey
} from '../cache/teacherSnapshotStore'

const makeData = (id: string): TeacherTeachingData => ({
  tasks: [{ id, xnxq: '2026-2027-1', kcmc: '课程', name: '班', jxbid: 'jx-1' }],
  classes: []
})

const ready = (data: TeacherTeachingData): TeacherLoadState<TeacherTeachingData> => ({
  status: 'ready',
  data,
  error: null
})
const emptyState = (): TeacherLoadState<TeacherTeachingData> => ({
  status: 'empty',
  data: null,
  error: { kind: 'empty', message: '' }
})
const errorState = (kind: TeacherDataErrorKind): TeacherLoadState<TeacherTeachingData> => ({
  status: 'error',
  data: null,
  error: { kind, message: `mock ${kind}` }
})

const hook = (accountId = 'T0001', semester = '2026-2027-1') =>
  useTeacherTeaching({ accountId: () => accountId, initialSemester: semester })

const calls = (): number => apiMock.fetchTeacherTeaching.mock.calls.length

/** 测试环境为 node（无 DOM），注入内存版 localStorage 桩以覆盖持久化路径。 */
const installStorage = (): void => {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, String(value)),
    removeItem: (key: string) => map.delete(key),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size
    }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-16T12:00:00.000Z'))
  installStorage()
  apiMock.fetchTeacherTeaching.mockReset()
  resetTeacherSnapshotStore()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('#1065 快照 TTL（假时钟）', () => {
  it('TTL 内第二次 load 命中快照，不重复请求', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValue(ready(makeData('t1')))
    const t = hook()
    await t.load()
    expect(calls()).toBe(1)
    await t.load()
    expect(calls()).toBe(1)
    expect(t.tasks.value[0].id).toBe('t1')
  })

  it('超过 TTL 后 load 触发后台再验证（刷新数据）', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(ready(makeData('t1')))
    const t = hook()
    await t.load()
    expect(calls()).toBe(1)

    vi.setSystemTime(new Date('2026-10-16T12:10:00.000Z')) // > 5 分钟 TTL
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(ready(makeData('t2')))
    await t.load()
    expect(calls()).toBe(2)
    expect(t.tasks.value[0].id).toBe('t2')
  })

  it('手动 retry 绕过 TTL（强制再验证）', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValue(ready(makeData('t1')))
    const t = hook()
    await t.load()
    await t.retry()
    expect(calls()).toBe(2)
  })
})

describe('#1065 身份 / 学期 / 学生域隔离', () => {
  it('教师 A 的缓存不被教师 B 读到（各自请求）', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(ready(makeData('a')))
    const a = hook('T0001')
    await a.load()
    expect(a.tasks.value[0].id).toBe('a')

    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(ready(makeData('b')))
    const b = hook('T0002')
    await b.load()
    expect(b.tasks.value[0].id).toBe('b')
    expect(calls()).toBe(2)
  })

  it('不同学期各自独立缓存（切回旧学期命中旧快照）', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(ready(makeData('s1')))
    const t = hook('T0001', '2026-2027-1')
    await t.load()

    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(ready(makeData('s2')))
    await t.setSemester('2026-2027-2')
    expect(t.tasks.value[0].id).toBe('s2')
    expect(calls()).toBe(2)

    await t.setSemester('2026-2027-1')
    expect(t.tasks.value[0].id).toBe('s1')
    expect(calls()).toBe(2)
  })

  it('快照键恒为教师域，绝不落入学生域', () => {
    const t = hook('T0001')
    expect(t.snapshotKey.value.startsWith('teacher:T0001:2026-2027-1:teaching')).toBe(true)
    expect(t.snapshotKey.value).not.toContain('student')
  })

  it('未知工号不写缓存（fail-closed），每次进入都请求', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValue(ready(makeData('x')))
    const t = hook('')
    await t.load()
    await t.load()
    expect(calls()).toBe(2)
    expect(t.snapshotKey.value).toBe('')
  })
})

describe('#1065 空态 / 失败 / 版本', () => {
  it('成功空数组被缓存（空 ≠ 失败），再次进入仍为 empty 且不请求', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(emptyState())
    const t = hook()
    await t.load()
    expect(t.isEmpty.value).toBe(true)
    expect(t.lastSuccessfulSyncAt.value).not.toBe('')
    expect(t.syncStatus.value).toBe('synced')

    await t.load()
    expect(calls()).toBe(1)
    expect(t.isEmpty.value).toBe(true)
  })

  it('刷新失败保留上次成功数据，并标记 cached（超时）/ failed（其它）', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(ready(makeData('old')))
    const t = hook()
    await t.load()
    expect(t.tasks.value[0].id).toBe('old')

    vi.setSystemTime(new Date('2026-10-16T12:10:00.000Z'))
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(errorState('timeout'))
    await t.load()
    expect(t.tasks.value[0].id).toBe('old') // 保留旧数据，绝不闪空
    expect(t.isError.value).toBe(true)
    expect(t.syncStatus.value).toBe('cached')

    vi.setSystemTime(new Date('2026-10-16T12:20:00.000Z'))
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(errorState('expired'))
    await t.load()
    expect(t.tasks.value[0].id).toBe('old')
    expect(t.syncStatus.value).toBe('failed')
  })

  it('正在更新时保留原同步时间（updating）', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(ready(makeData('t1')))
    const t = hook()
    await t.load()
    const syncedAt = t.lastSuccessfulSyncAt.value

    vi.setSystemTime(new Date('2026-10-16T12:10:00.000Z'))
    let release: (value: TeacherLoadState<TeacherTeachingData>) => void = () => {}
    apiMock.fetchTeacherTeaching.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve })
    )
    const pending = t.load()
    expect(t.syncStatus.value).toBe('updating')
    expect(t.lastSuccessfulSyncAt.value).toBe(syncedAt)

    release(ready(makeData('t2')))
    await pending
    expect(t.syncStatus.value).toBe('synced')
  })

  it('缓存版本升级：旧 schema 快照被丢弃并重新请求', async () => {
    const key = buildTeacherSnapshotKey({
      resource: 'teaching',
      accountId: 'T0001',
      semester: '2026-2027-1'
    })
    localStorage.setItem(
      teacherSnapshotStorageKey(key),
      JSON.stringify({
        meta: {
          schemaVersion: TEACHER_SNAPSHOT_SCHEMA_VERSION + 1,
          role: 'teacher',
          accountId: 'T0001',
          semester: '2026-2027-1',
          resource: 'teaching',
          queryKey: '',
          lastSuccessfulSyncAt: '2026-10-16T11:00:00.000Z',
          source: 'network',
          stale: false,
          updatedAt: '2026-10-16T11:00:00.000Z'
        },
        data: makeData('stale')
      })
    )
    apiMock.fetchTeacherTeaching.mockResolvedValueOnce(ready(makeData('fresh')))
    const t = hook()
    await t.load()
    expect(calls()).toBe(1)
    expect(t.tasks.value[0].id).toBe('fresh')
  })

  it('clearCache 只清理当前账号，切换账号后需重新请求', async () => {
    apiMock.fetchTeacherTeaching.mockResolvedValue(ready(makeData('t1')))
    const t = hook('T0001')
    await t.load()
    t.clearCache()
    await t.load()
    expect(calls()).toBe(2)
  })
})
