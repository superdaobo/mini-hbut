// src/features/teacher/cache/teacherSnapshotStore.ts
//
// Teacher Portal V2（#1065）：教师只读业务数据**统一快照缓存**。
//
// 背景：此前 `useTeacherTeaching` / `useTeacherExams` 的 `memoryCache` 建在
// composable 函数内部，视图每次挂载都重新 `new Map`，跨页面即失效；
// `useTeacherProfile` / `useTeacherNotifications` 则完全不缓存。
//
// 本模块提供**进程级单例**快照存储，供各教师 composable 共享，实现：
//   1. 统一快照契约（`role / accountId / semester / resource / queryKey /
//      schemaVersion / data / lastSuccessfulSyncAt / source / stale`）；
//   2. **身份 + 学期 + 业务 + 查询** 四重隔离，杜绝教师 A 显示教师 B 或学生数据；
//   3. 版本化（`schemaVersion`）、容量上限与恢复失败兜底；
//   4. 可一键关闭（回退直连），不影响学生端。
//
// 安全红线（对照 Epic #1060 / #1065 边界）：
//   - **绝不**存放 Cookie / 密码 / 会话凭据；只存教务**只读**业务数据；
//   - 未知工号（`accountId` 为空）时**拒绝**构造 key（fail-closed），
//     避免所有未识别账号落到同一个 `teacher:_` 通配作用域互相串号；
//   - 键沿用 `teacher_scope.ts` 冻结契约 `teacher:{accountId}:{semester}:{kind}`。

import {
  buildTeacherScopedKey,
  canPersistTeacherState,
  normalizeScopeAccountId,
  TEACHER_SCOPE_PREFIX
} from '../utils/teacher_scope'

/** 快照结构版本：字段/语义变更时递增，旧版本快照一律丢弃（不猜测迁移）。 */
export const TEACHER_SNAPSHOT_SCHEMA_VERSION = 1

/** 教师只读资源类别（缓存 key 中的 kind；共用课表/空教室也纳入同一契约）。 */
export const TEACHER_SNAPSHOT_RESOURCES = [
  'teaching',
  'exams',
  'profile',
  'notices',
  'schedule',
  'classroom'
] as const

export type TeacherSnapshotResource = (typeof TEACHER_SNAPSHOT_RESOURCES)[number]

/** 快照数据来源：网络成功写入 vs 命中本地缓存。 */
export type TeacherSnapshotSource = 'network' | 'cache'

/** 快照元信息（跨页面 / 重启共享，供同步时间栏消费）。 */
export interface TeacherSnapshotMeta {
  schemaVersion: number
  /** 固定为 teacher：显式声明身份域，杜绝与学生域混用。 */
  role: 'teacher'
  accountId: string
  semester: string
  resource: TeacherSnapshotResource
  /** 查询参数（分页 / 筛选）的稳定字符串；无查询时为空串。 */
  queryKey: string
  /** 最后一次**成功**同步时间（ISO 8601）；空串表示尚未成功同步。 */
  lastSuccessfulSyncAt: string
  source: TeacherSnapshotSource
  /** 是否已超过该资源 TTL（可能过期）。 */
  stale: boolean
  /** 本次快照写入/读取的本地时刻（ISO 8601）。 */
  updatedAt: string
}

/** 一条完整快照：元信息 + 业务数据。 */
export interface TeacherSnapshot<T> {
  meta: TeacherSnapshotMeta
  data: T
}

/** 各资源默认 TTL（毫秒）：超过即标记为「可能过期」，触发后台再验证。 */
export const TEACHER_SNAPSHOT_TTL_MS: Record<TeacherSnapshotResource, number> = {
  teaching: 5 * 60 * 1000,
  exams: 5 * 60 * 1000,
  profile: 30 * 60 * 1000,
  notices: 60 * 1000,
  schedule: 60 * 1000,
  classroom: 60 * 1000
}

/** 单进程内存快照容量上限：超出按 `updatedAt` 淘汰最旧项。 */
export const TEACHER_SNAPSHOT_MAX_ENTRIES = 48

/** 持久化存储键前缀（仅存只读业务数据，绝不含凭据）。 */
export const TEACHER_SNAPSHOT_STORAGE_PREFIX = 'hbu_teacher_snapshot_v1'

/** 一键关闭教师本地缓存的开关键（值为 '0' 时关闭；缺省/其它值视为开启）。 */
export const TEACHER_CACHE_ENABLED_STORAGE_KEY = 'hbu_teacher_cache_enabled'

/** 进程级内存快照表：键为作用域键，值为成功快照。 */
const memorySnapshots = new Map<string, TeacherSnapshot<unknown>>()

// ────────────────────────────────────────────────────────────────
// 开关 / 存储访问（fail-safe）
// ────────────────────────────────────────────────────────────────

const safeStorage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** 教师本地缓存是否启用（默认启用；异常/不可用时降级为「仅内存」）。 */
export const isTeacherCacheEnabled = (): boolean => {
  const storage = safeStorage()
  if (!storage) return true // 无 localStorage：仍允许内存缓存
  try {
    return storage.getItem(TEACHER_CACHE_ENABLED_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * 一键开关教师本地缓存（异常时回退直连）。
 *
 * 关闭时：后续 `writeTeacherSnapshot` 不再落盘（内存也不写），
 * 已存在快照仍可被 `clearAllTeacherSnapshots` 清理；学生端完全不受影响。
 */
export const setTeacherCacheEnabled = (enabled: boolean): void => {
  const storage = safeStorage()
  if (!storage) return
  try {
    if (enabled) storage.removeItem(TEACHER_CACHE_ENABLED_STORAGE_KEY)
    else storage.setItem(TEACHER_CACHE_ENABLED_STORAGE_KEY, '0')
  } catch {
    // 存储不可用：忽略，保持默认启用
  }
}

// ────────────────────────────────────────────────────────────────
// key 构造（身份 + 学期 + 资源 + 查询）
// ────────────────────────────────────────────────────────────────

/** 把查询参数归一化为**稳定**字符串（对象按键排序，避免顺序不同产生分裂键）。 */
export const stableQueryString = (queryKey: unknown): string => {
  if (queryKey === null || queryKey === undefined) return ''
  if (typeof queryKey === 'string') return queryKey.trim()
  if (typeof queryKey !== 'object') return String(queryKey).trim()
  const record = queryKey as Record<string, unknown>
  return Object.keys(record)
    .sort()
    .map((key) => {
      const value = record[key]
      if (value === null || value === undefined) return `${key}=`
      if (Array.isArray(value)) return `${key}=${value.map((item) => String(item)).join(',')}`
      return `${key}=${String(value)}`
    })
    .join('&')
}

/** 稳定短哈希（djb2，仅用于压缩 key 长度，非安全用途）。 */
const hashQuery = (text: string): string => {
  if (!text) return ''
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

export interface TeacherSnapshotKeyInput {
  resource: TeacherSnapshotResource
  accountId: unknown
  semester: unknown
  queryKey?: unknown
}

/**
 * 构造教师快照 key：`teacher:{accountId}:{semester}:{resource}[:q{hash}]`。
 *
 * - 账号不可用（工号缺失）时返回**空串**：调用方据此跳过读写（fail-closed），
 *   杜绝未识别账号共用 `teacher:_` 通配作用域；
 * - 学期缺失退化为 `_`（与 `teacher_scope.ts` 一致），但账号必须可信。
 */
export const buildTeacherSnapshotKey = (input: TeacherSnapshotKeyInput): string => {
  const account = normalizeScopeAccountId(input.accountId)
  if (!canPersistTeacherState(account)) return ''
  const base = buildTeacherScopedKey(input.resource, account, input.semester)
  const query = stableQueryString(input.queryKey)
  return query ? `${base}:q${hashQuery(query)}` : base
}

/** 快照 key 是否合法（非空且属于教师作用域）。 */
export const isTeacherSnapshotKey = (key: unknown): boolean =>
  typeof key === 'string' && key.startsWith(`${TEACHER_SCOPE_PREFIX}:`)

/** 快照落盘键：`hbu_teacher_snapshot_v1:{scopeKey}`。 */
export const teacherSnapshotStorageKey = (scopeKey: string): string =>
  `${TEACHER_SNAPSHOT_STORAGE_PREFIX}:${scopeKey}`

// ────────────────────────────────────────────────────────────────
// 读写
// ────────────────────────────────────────────────────────────────

/** 判定快照是否已过期（超过资源 TTL）。 */
export const isTeacherSnapshotStale = (
  meta: Pick<TeacherSnapshotMeta, 'lastSuccessfulSyncAt' | 'resource'>,
  now: number = Date.now(),
  ttlMs?: number
): boolean => {
  const syncedAt = Date.parse(meta.lastSuccessfulSyncAt)
  if (!Number.isFinite(syncedAt)) return true
  const ttl = ttlMs ?? TEACHER_SNAPSHOT_TTL_MS[meta.resource] ?? 0
  return now - syncedAt > ttl
}

/** 校验一条反序列化结果是否为当前 schema 的合法教师快照。 */
const isUsableSnapshot = (value: unknown): value is TeacherSnapshot<unknown> => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const meta = record.meta as Record<string, unknown> | undefined
  if (!meta || typeof meta !== 'object') return false
  if (Number(meta.schemaVersion) !== TEACHER_SNAPSHOT_SCHEMA_VERSION) return false
  if (meta.role !== 'teacher') return false
  if (typeof meta.accountId !== 'string' || !meta.accountId) return false
  if (typeof meta.resource !== 'string') return false
  if (!('data' in record)) return false
  return true
}

/** 从 localStorage 读取一条快照（schema 不符 / 解析失败一律返回 null）。 */
const readPersistedSnapshot = (scopeKey: string): TeacherSnapshot<unknown> | null => {
  const storage = safeStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(teacherSnapshotStorageKey(scopeKey))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isUsableSnapshot(parsed)) return null
    // 双重身份校验：落盘键中的 accountId 必须与快照内一致（防篡改/错位）。
    if ((parsed.meta as TeacherSnapshotMeta).accountId !== scopeKey.split(':')[1]) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * 读取快照：内存优先，其次持久化。
 *
 * 命中后返回的快照 `meta.source` 置为 `'cache'`，`meta.stale` 按当前时刻重新计算，
 * 供调用方「缓存 / 可能过期」状态判定。
 */
export const readTeacherSnapshot = <T>(scopeKey: string, now: number = Date.now()): TeacherSnapshot<T> | null => {
  if (!isTeacherSnapshotKey(scopeKey)) return null
  const hit = memorySnapshots.get(scopeKey) ?? readPersistedSnapshot(scopeKey)
  if (!hit) return null
  const meta = hit.meta as TeacherSnapshotMeta
  return {
    meta: {
      ...meta,
      source: 'cache',
      stale: isTeacherSnapshotStale(meta, now)
    },
    data: hit.data as T
  }
}

/** 淘汰最旧的内存快照，保持容量上限。 */
const evictMemory = (): void => {
  if (memorySnapshots.size <= TEACHER_SNAPSHOT_MAX_ENTRIES) return
  const entries = [...memorySnapshots.entries()].sort(
    (a, b) => Date.parse(a[1].meta.updatedAt) - Date.parse(b[1].meta.updatedAt)
  )
  const overflow = memorySnapshots.size - TEACHER_SNAPSHOT_MAX_ENTRIES
  for (let index = 0; index < overflow; index += 1) {
    const entry = entries[index]
    if (entry) memorySnapshots.delete(entry[0])
  }
}

/** 列出全部持久化快照键（仅本项目前缀，避免误删其它本地数据）。 */
const listPersistedKeys = (): string[] => {
  const storage = safeStorage()
  if (!storage) return []
  const keys: string[] = []
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key && key.startsWith(`${TEACHER_SNAPSHOT_STORAGE_PREFIX}:`)) keys.push(key)
    }
  } catch {
    return []
  }
  return keys
}

/** 持久化容量上限：超出按 updatedAt 淘汰最旧（含内存）。 */
const evictPersisted = (): void => {
  const storage = safeStorage()
  if (!storage) return
  const keys = listPersistedKeys()
  if (keys.length <= TEACHER_SNAPSHOT_MAX_ENTRIES) return
  const stamped = keys
    .map((key) => {
      let updatedAt = 0
      try {
        const parsed = JSON.parse(storage.getItem(key) ?? 'null') as TeacherSnapshot<unknown> | null
        updatedAt = Date.parse(String(parsed?.meta?.updatedAt ?? '')) || 0
      } catch {
        updatedAt = 0
      }
      return { key, updatedAt }
    })
    .sort((a, b) => a.updatedAt - b.updatedAt)
  const overflow = keys.length - TEACHER_SNAPSHOT_MAX_ENTRIES
  for (let index = 0; index < overflow; index += 1) {
    const entry = stamped[index]
    if (entry) {
      try {
        storage.removeItem(entry.key)
      } catch {
        // 忽略单条删除失败
      }
    }
  }
}

export interface WriteTeacherSnapshotInput<T> {
  /** 已由 `buildTeacherSnapshotKey` 构造的作用域键；空串直接拒绝写入。 */
  scopeKey: string
  accountId: string
  semester: string
  resource: TeacherSnapshotResource
  queryKey: string
  data: T
  /** 最后一次成功同步时间（ISO）；缺省用当前时刻（成功请求落地时刻）。 */
  lastSuccessfulSyncAt?: string
  now?: number
}

/**
 * 写入一条**成功**快照（仅成功数据调用；空数组同样视为成功）。
 *
 * - 关闭开关 / key 非法 / 存储异常时返回 false，但**内存快照仍尽量保留**（除关闭开关）；
 * - 写入后按容量上限淘汰。
 */
export const writeTeacherSnapshot = <T>(input: WriteTeacherSnapshotInput<T>): boolean => {
  if (!isTeacherSnapshotKey(input.scopeKey) || !isTeacherCacheEnabled()) return false
  const now = input.now ?? Date.now()
  const nowIso = new Date(now).toISOString()
  const snapshot: TeacherSnapshot<T> = {
    meta: {
      schemaVersion: TEACHER_SNAPSHOT_SCHEMA_VERSION,
      role: 'teacher',
      accountId: normalizeScopeAccountId(input.accountId),
      semester: input.semester,
      resource: input.resource,
      queryKey: input.queryKey,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt || nowIso,
      source: 'network',
      stale: false,
      updatedAt: nowIso
    },
    data: input.data
  }
  memorySnapshots.set(input.scopeKey, snapshot as TeacherSnapshot<unknown>)
  evictMemory()
  const storage = safeStorage()
  if (storage) {
    try {
      storage.setItem(teacherSnapshotStorageKey(input.scopeKey), JSON.stringify(snapshot))
      evictPersisted()
    } catch {
      // 存储失败（配额/隐私模式）：内存快照仍可用
    }
  }
  return true
}

// ────────────────────────────────────────────────────────────────
// 清理（账号切换 / 退出登录 / 变更角色 / 变更学期 / 筛选）
// ────────────────────────────────────────────────────────────────

/** 键是否属于指定账号（可选限定学期）。 */
const keyMatchesAccount = (scopeKey: string, accountId: string, semester?: string): boolean => {
  const parts = scopeKey.split(':')
  if (parts[0] !== TEACHER_SCOPE_PREFIX || parts[1] !== normalizeScopeAccountId(accountId)) return false
  if (semester === undefined) return true
  return parts[2] === normalizeScopeAccountId(semester)
}

/**
 * 只清理**指定账号（可选指定学期）**的快照。
 *
 * 账号切换 / 退出登录时调用，杜绝教师 A 的缓存被教师 B 读到；学生域键不受影响。
 */
export const clearTeacherSnapshotScope = (accountId: unknown, semester?: unknown): number => {
  const account = normalizeScopeAccountId(accountId)
  if (!account) return 0
  const term = semester === undefined ? undefined : normalizeScopeAccountId(semester)
  let removed = 0
  for (const key of [...memorySnapshots.keys()]) {
    if (keyMatchesAccount(key, account, term)) {
      memorySnapshots.delete(key)
      removed += 1
    }
  }
  const storage = safeStorage()
  if (storage) {
    for (const storageKey of listPersistedKeys()) {
      const scopeKey = storageKey.slice(`${TEACHER_SNAPSHOT_STORAGE_PREFIX}:`.length)
      if (keyMatchesAccount(scopeKey, account, term)) {
        try {
          storage.removeItem(storageKey)
          removed += 1
        } catch {
          // 忽略单条删除失败
        }
      }
    }
  }
  return removed
}

/** 清理全部教师快照（退出登录 / 一键关闭缓存）。学生域键绝不触碰。 */
export const clearAllTeacherSnapshots = (): number => {
  const removed = memorySnapshots.size
  memorySnapshots.clear()
  const storage = safeStorage()
  if (storage) {
    for (const storageKey of listPersistedKeys()) {
      try {
        storage.removeItem(storageKey)
      } catch {
        // 忽略单条删除失败
      }
    }
  }
  return removed
}

/**
 * 重置快照存储（测试隔离用）：清空内存 + 持久化快照，并恢复开关默认值。
 *
 * 生产代码请勿调用（会丢失离线快照）；生产清理请用
 * `clearTeacherSnapshotScope` / `clearAllTeacherSnapshots`。
 */
export const resetTeacherSnapshotStore = (): void => {
  clearAllTeacherSnapshots()
  const storage = safeStorage()
  if (storage) {
    try {
      storage.removeItem(TEACHER_CACHE_ENABLED_STORAGE_KEY)
    } catch {
      // 忽略
    }
  }
}

/** 当前内存快照条目数（测试/可观测性用）。 */
export const teacherSnapshotMemorySize = (): number => memorySnapshots.size

/**
 * 仅清空内存快照，**保留**持久化快照。
 *
 * 仅用于测试「重启后从本地存储恢复」的持久化读取路径；生产代码请勿调用。
 */
export const clearTeacherSnapshotMemoryOnly = (): void => {
  memorySnapshots.clear()
}
