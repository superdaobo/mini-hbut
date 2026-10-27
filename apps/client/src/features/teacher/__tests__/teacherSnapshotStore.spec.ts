// src/features/teacher/__tests__/teacherSnapshotStore.spec.ts
//
// Teacher Portal V2（#1065）：统一教师快照缓存契约测试。
//
// 覆盖：
//   1. key 隔离（账号 / 学期 / 资源 / 查询）与「未知工号 fail-closed」；
//   2. 学生域永不进入教师键；
//   3. 读写往返、`source`/`stale` 语义、空数组缓存；
//   4. schemaVersion 版本升级（旧版本一律丢弃）；
//   5. 容量上限、按 scope 清理、一键关闭、持久化恢复。
//
// 测试环境为 node（无 DOM），因此显式注入内存版 localStorage 桩，
// 以便覆盖持久化 / 恢复路径。fixture 全部脱敏，绝不含 Cookie / 密码。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TEACHER_CACHE_ENABLED_STORAGE_KEY,
  TEACHER_SNAPSHOT_MAX_ENTRIES,
  TEACHER_SNAPSHOT_SCHEMA_VERSION,
  TEACHER_SNAPSHOT_STORAGE_PREFIX,
  buildTeacherSnapshotKey,
  clearAllTeacherSnapshots,
  clearTeacherSnapshotMemoryOnly,
  clearTeacherSnapshotScope,
  isTeacherCacheEnabled,
  isTeacherSnapshotStale,
  readTeacherSnapshot,
  resetTeacherSnapshotStore,
  setTeacherCacheEnabled,
  stableQueryString,
  teacherSnapshotMemorySize,
  teacherSnapshotStorageKey,
  writeTeacherSnapshot
} from '../cache/teacherSnapshotStore'

const RESOURCE = 'teaching' as const

/** 内存版 localStorage 桩（支持 key/length，供容量淘汰与列举使用）。 */
const installStorage = (map = new Map<string, string>()): Map<string, string> => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, String(value)),
    removeItem: (key: string) => map.delete(key),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size
    }
  })
  return map
}

const write = (overrides: Partial<Parameters<typeof writeTeacherSnapshot>[0]> = {}) =>
  writeTeacherSnapshot({
    scopeKey: buildTeacherSnapshotKey({
      resource: RESOURCE,
      accountId: '20240001',
      semester: '2026-2027-1'
    }),
    accountId: '20240001',
    semester: '2026-2027-1',
    resource: RESOURCE,
    queryKey: '',
    data: { tasks: [{ id: 't1' }], classes: [] },
    ...overrides
  })

beforeEach(() => {
  installStorage()
  resetTeacherSnapshotStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('#1065 快照 key：身份 / 学期 / 资源 / 查询 四重隔离', () => {
  it('不同账号 / 学期 / 资源产生不同 key', () => {
    const a = buildTeacherSnapshotKey({ resource: 'teaching', accountId: '20240001', semester: '2026-2027-1' })
    const b = buildTeacherSnapshotKey({ resource: 'teaching', accountId: '20240002', semester: '2026-2027-1' })
    const c = buildTeacherSnapshotKey({ resource: 'teaching', accountId: '20240001', semester: '2027-2028-1' })
    const d = buildTeacherSnapshotKey({ resource: 'exams', accountId: '20240001', semester: '2026-2027-1' })
    expect(new Set([a, b, c, d]).size).toBe(4)
    expect(a).toBe('teacher:20240001:2026-2027-1:teaching')
  })

  it('未知工号返回空 key（fail-closed，杜绝 teacher:_ 通配串号）', () => {
    expect(buildTeacherSnapshotKey({ resource: 'teaching', accountId: '', semester: '2026-2027-1' })).toBe('')
    expect(buildTeacherSnapshotKey({ resource: 'teaching', accountId: '   ', semester: '2026-2027-1' })).toBe('')
    expect(buildTeacherSnapshotKey({ resource: 'teaching', accountId: null, semester: '2026-2027-1' })).toBe('')
  })

  it('教师 key 永不落入学生域前缀', () => {
    const key = buildTeacherSnapshotKey({ resource: 'notices', accountId: '20240001', semester: '' })
    expect(key.startsWith('teacher:')).toBe(true)
    expect(key.startsWith('student:')).toBe(false)
  })

  it('查询参数进入 key 且与顺序无关', () => {
    const k1 = buildTeacherSnapshotKey({ resource: 'notices', accountId: 'A1', semester: '', queryKey: { page: 2, keyword: 'x' } })
    const k2 = buildTeacherSnapshotKey({ resource: 'notices', accountId: 'A1', semester: '', queryKey: { keyword: 'x', page: 2 } })
    const k3 = buildTeacherSnapshotKey({ resource: 'notices', accountId: 'A1', semester: '', queryKey: { page: 3, keyword: 'x' } })
    expect(k1).toBe(k2)
    expect(k1).not.toBe(k3)
    expect(stableQueryString({ b: 1, a: 2 })).toBe('a=2&b=1')
  })
})

describe('#1065 快照读写与语义', () => {
  it('写入后读取：source 变为 cache，lastSuccessfulSyncAt 保留', () => {
    const key = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240001', semester: '2026-2027-1' })
    const now = Date.parse('2026-10-16T12:00:00.000Z')
    expect(write({ now })).toBe(true)
    const snapshot = readTeacherSnapshot<{ tasks: unknown[] }>(key, now)
    expect(snapshot).not.toBeNull()
    expect(snapshot?.meta.source).toBe('cache')
    expect(snapshot?.meta.role).toBe('teacher')
    expect(snapshot?.meta.lastSuccessfulSyncAt).toBe('2026-10-16T12:00:00.000Z')
    expect(snapshot?.meta.stale).toBe(false)
    expect(snapshot?.data.tasks).toHaveLength(1)
  })

  it('超过 TTL 标记 stale（可能过期）', () => {
    const key = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240001', semester: '2026-2027-1' })
    const base = Date.parse('2026-10-16T12:00:00.000Z')
    write({ now: base })
    const later = base + 6 * 60 * 1000 // teaching TTL = 5 分钟
    expect(readTeacherSnapshot(key, later)?.meta.stale).toBe(true)
    expect(
      isTeacherSnapshotStale({ lastSuccessfulSyncAt: new Date(base).toISOString(), resource: RESOURCE }, base + 1000)
    ).toBe(false)
  })

  it('空数组同样缓存（空 ≠ 失败）', () => {
    const key = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240001', semester: '2026-2027-1' })
    write({ data: { tasks: [], classes: [] } })
    const snapshot = readTeacherSnapshot<{ tasks: unknown[]; classes: unknown[] }>(key)
    expect(snapshot?.data.tasks).toEqual([])
    expect(snapshot?.data.classes).toEqual([])
  })

  it('schemaVersion 不符时读取返回 null（版本升级丢弃旧快照）', () => {
    const key = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240001', semester: '2026-2027-1' })
    localStorage.setItem(
      teacherSnapshotStorageKey(key),
      JSON.stringify({
        meta: {
          schemaVersion: TEACHER_SNAPSHOT_SCHEMA_VERSION + 999,
          role: 'teacher',
          accountId: '20240001',
          semester: '2026-2027-1',
          resource: RESOURCE,
          queryKey: '',
          lastSuccessfulSyncAt: '2026-10-16T12:00:00.000Z',
          source: 'network',
          stale: false,
          updatedAt: '2026-10-16T12:00:00.000Z'
        },
        data: { tasks: [], classes: [] }
      })
    )
    expect(readTeacherSnapshot(key)).toBeNull()
  })

  it('role 非 teacher 的快照被拒绝', () => {
    const key = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240001', semester: '2026-2027-1' })
    localStorage.setItem(
      teacherSnapshotStorageKey(key),
      JSON.stringify({
        meta: {
          schemaVersion: TEACHER_SNAPSHOT_SCHEMA_VERSION,
          role: 'student',
          accountId: '20240001',
          semester: '2026-2027-1',
          resource: RESOURCE,
          queryKey: '',
          lastSuccessfulSyncAt: '',
          source: 'network',
          stale: false,
          updatedAt: ''
        },
        data: {}
      })
    )
    expect(readTeacherSnapshot(key)).toBeNull()
  })

  it('损坏 JSON 不抛错，返回 null', () => {
    const key = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240001', semester: '2026-2027-1' })
    localStorage.setItem(teacherSnapshotStorageKey(key), '{not-json')
    expect(() => readTeacherSnapshot(key)).not.toThrow()
    expect(readTeacherSnapshot(key)).toBeNull()
  })
})

describe('#1065 清理 / 容量 / 开关 / 持久化', () => {
  it('按账号清理只移除该账号快照，不影响他人', () => {
    write({ accountId: '20240001' })
    write({
      scopeKey: buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240002', semester: '2026-2027-1' }),
      accountId: '20240002'
    })
    expect(teacherSnapshotMemorySize()).toBe(2)
    const removed = clearTeacherSnapshotScope('20240001')
    expect(removed).toBeGreaterThanOrEqual(1)
    const keyA = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240001', semester: '2026-2027-1' })
    const keyB = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240002', semester: '2026-2027-1' })
    expect(readTeacherSnapshot(keyA)).toBeNull()
    expect(readTeacherSnapshot(keyB)).not.toBeNull()
  })

  it('clearAllTeacherSnapshots 清空全部教师快照且不动其它本地键', () => {
    localStorage.setItem('hbu_other_key', 'keep-me')
    write()
    clearAllTeacherSnapshots()
    expect(teacherSnapshotMemorySize()).toBe(0)
    expect(localStorage.getItem('hbu_other_key')).toBe('keep-me')
  })

  it('容量上限：内存条目数不超过上限', () => {
    for (let index = 0; index < TEACHER_SNAPSHOT_MAX_ENTRIES + 10; index += 1) {
      const accountId = `2024${String(index).padStart(4, '0')}`
      write({
        scopeKey: buildTeacherSnapshotKey({ resource: RESOURCE, accountId, semester: '2026-2027-1' }),
        accountId
      })
    }
    expect(teacherSnapshotMemorySize()).toBeLessThanOrEqual(TEACHER_SNAPSHOT_MAX_ENTRIES)
  })

  it('一键关闭后不再写入（回退直连）', () => {
    setTeacherCacheEnabled(false)
    expect(isTeacherCacheEnabled()).toBe(false)
    expect(write()).toBe(false)
    expect(teacherSnapshotMemorySize()).toBe(0)
    setTeacherCacheEnabled(true)
    expect(isTeacherCacheEnabled()).toBe(true)
  })

  it('持久化恢复：清空内存后仍可从 localStorage 读回', () => {
    const key = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240001', semester: '2026-2027-1' })
    write()
    expect(localStorage.getItem(teacherSnapshotStorageKey(key))).toBeTruthy()
    clearTeacherSnapshotMemoryOnly()
    expect(teacherSnapshotMemorySize()).toBe(0)
    expect(readTeacherSnapshot(key)).not.toBeNull()
  })

  it('存储写入异常不影响内存快照（恢复失败兜底）', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {},
      key: () => null,
      get length() {
        return 0
      }
    })
    expect(write()).toBe(true)
    expect(teacherSnapshotMemorySize()).toBe(1)
  })

  it('持久化键前缀固定（便于一键清理与审计）', () => {
    const key = buildTeacherSnapshotKey({ resource: RESOURCE, accountId: '20240001', semester: '2026-2027-1' })
    expect(teacherSnapshotStorageKey(key)).toBe(`${TEACHER_SNAPSHOT_STORAGE_PREFIX}:${key}`)
    expect(TEACHER_CACHE_ENABLED_STORAGE_KEY).toBe('hbu_teacher_cache_enabled')
  })
})
