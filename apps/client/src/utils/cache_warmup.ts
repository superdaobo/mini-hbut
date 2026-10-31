/**
 * 后台缓存预热（issue #1158 P1：cache warmup）
 *
 * 在线时**静默**预取核心**只读**模块的缓存，让断网后大部分模块都有缓存可用。
 *
 * 设计原则（对齐 issue #1158 验收标准）：
 * - **复用既有 cache key 与 fetcher 语义**：预热写入的 key 与页面读取命中同一 key；
 *   fetcher 发出与页面**完全相同**的 HTTP 请求（相同 URL、相同 payload 字段），
 *   保证 Rust 侧缓存 key 对得上。各 key/fetcher 来源：
 *     - semesters   ← ExamView/RankingView/CalendarView：`fetchWithCache('semesters', GET /v2/semesters)`
 *     - grades      ← GradeCoordinator：`fetchWithCache(\`grades:${sid}\`, POST /v2/quick_fetch)`
 *     - ranking     ← RankingView：`fetchWithCache(\`ranking:${sid}:${sem}\`, POST /v2/ranking)`
 *     - studentinfo ← StudentInfoView：`fetchWithCache(\`studentinfo:${sid}\`, POST /v2/student_info, EXTRA_LONG_TTL)`
 *     - exams       ← ExamView：`fetchWithCache(\`exams:${sid}:${sem}\`, POST /v2/exams)`
 *     - schedule    ← Dashboard：`fetchWithCache(\`schedule:${sid}[:${sem}]\`, POST /v2/schedule/query)`
 * - **只读模块**：semesters / 成绩 / 绩点排名 / 个人信息 / 考试安排 / 课表。
 *   **绝不**预热写操作模块（已读 / 提交 / 预约 / 支付）。
 * - **非阻断、限频、background、失败静默**：预热不延迟页面首屏；默认 30 分钟一次（localStorage 记录）；
 *   任务 priority 为 'background'；单任务失败仅 console.debug，不影响其他任务。
 *
 * 实现细节：不复用 `fetchWithCache` 的维护模式 / SWR 回退逻辑（对预热无意义），而是
 * 「新鲜缓存命中则跳过（不重复请求），否则用页面同款 fetcher 拉取并 `setCachedData` 写回」。
 * 页面主缓存写入路径本就是 `setCachedData(key, payload)`（payload 为 `res.data`），故预热写入
 * 的缓存条目与页面读取命中的完全一致；且「新鲜即跳过」比页面 `forceRemote` 更省网络。
 */
import axios from 'axios'
import type { ApiPayload, FetchWithCacheOptions } from './api.js'
import { getCachedData, setCachedData, DEFAULT_TTL, EXTRA_LONG_TTL } from './api.js'
import { normalizeSemesterList, resolveCurrentSemester } from './semester.js'
import { isTestAccountSession } from './test_account.js'

// 与各视图一致：`import.meta.env.VITE_API_BASE || '/api'`（见 ExamView / state/constants）。
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

/** 限频记录 key（localStorage）：上次成功开跑预热的时间戳（ms）。 */
export const WARMUP_RATE_LIMIT_KEY = 'cache_warmup_last_run'

/** 默认限频窗口：30 分钟内不重复预热。 */
export const DEFAULT_WARMUP_RATE_LIMIT_MS = 30 * 60 * 1000

const DEFAULT_MAX_CONCURRENCY = 3

/** 预热任务：key 与页面一致，fetcher 发出与页面相同的 HTTP 请求。 */
export interface WarmupTask {
  /** 稳定标识（日志 / 去重用）。 */
  id: string
  /** 精确 JS 缓存 key，必须与对应视图读取的 key 一致。 */
  key: string
  /** 拉取器：返回与视图相同结构的 payload（`res.data`）。 */
  fetcher: () => Promise<ApiPayload>
  /** 与该模块页面使用的 TTL 一致，保证写入的缓存条目过期时间与页面一致。 */
  ttl: number
  /** 预热统一 background 优先级（仅记录语义，不驱动 fetchWithCache 行为）。 */
  options: FetchWithCacheOptions
}

export interface WarmupResult {
  /** 是否真正执行了预热（false = 被门控 / 限频跳过）。 */
  ran: boolean
  /** 跳过原因（未执行时）。 */
  skipped?: string
  /** 成功写入 / 命中的任务数。 */
  ok: number
  /** 失败任务数（抛错或返回非成功 payload）。 */
  failed: number
}

/** 最小 Storage 抽象：便于测试注入（生产用 window.localStorage）。 */
export interface WarmupStorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

const memoryStorage: WarmupStorageLike = (() => {
  const m = new Map<string, string>()
  return {
    getItem: (key) => (m.has(key) ? m.get(key)! : null),
    setItem: (key, value) => {
      m.set(key, String(value))
    }
  }
})()

const defaultStorage = (): WarmupStorageLike => {
  try {
    if (typeof localStorage !== 'undefined') return localStorage as unknown as WarmupStorageLike
  } catch {
    // ignore
  }
  return memoryStorage
}

// ── 各模块 fetcher（与视图页面**完全相同**的 HTTP 请求）────────────────────────

/** 学期列表：GET `${API_BASE}/v2/semesters`（ExamView:169 / RankingView:87 / CalendarView:315）。 */
const fetchSemesters = async (): Promise<ApiPayload> => {
  const res = await axios.get(`${API_BASE}/v2/semesters`)
  return res.data as ApiPayload
}

/**
 * 成绩：POST `${API_BASE}/v2/quick_fetch`（GradeCoordinator:29）。
 * 成绩主 key 为 `grades:${sid}`（**非**学期分片）：页面以教务完整列表为权威源，
 * `teacher_current_only` 默认 false（整表拉取，与 fetchGradesFromAPI 默认一致）。
 */
const fetchGrades =
  (studentId: string): (() => Promise<ApiPayload>) =>
  async () => {
    const res = await axios.post(`${API_BASE}/v2/quick_fetch`, {
      student_id: studentId,
      teacher_current_only: false
    })
    return res.data as ApiPayload
  }

/**
 * 绩点排名：POST `${API_BASE}/v2/ranking`（RankingView:125）。
 * key 与页面一致：`ranking:${sid}:${semester || 'all'}`（RankingView:107）。
 */
const fetchRanking =
  (studentId: string, semester: string): (() => Promise<ApiPayload>) =>
  async () => {
    const res = await axios.post(`${API_BASE}/v2/ranking`, {
      student_id: studentId,
      semester: semester || undefined
    })
    return res.data as ApiPayload
  }

/**
 * 个人信息：POST `${API_BASE}/v2/student_info`（StudentInfoView:189）。
 * 页面用 EXTRA_LONG_TTL，预热沿用同一 TTL。
 */
const fetchStudentInfo =
  (studentId: string): (() => Promise<ApiPayload>) =>
  async () => {
    const res = await axios.post(`${API_BASE}/v2/student_info`, {
      student_id: studentId
    })
    return res.data as ApiPayload
  }

/**
 * 考试安排：POST `${API_BASE}/v2/exams`（ExamView:210）。
 * key 与页面一致：`exams:${sid}:${semester || 'current'}`（ExamView:193）。
 */
const fetchExams =
  (studentId: string, semester: string): (() => Promise<ApiPayload>) =>
  async () => {
    const res = await axios.post(`${API_BASE}/v2/exams`, {
      student_id: studentId,
      semester: semester || undefined
    })
    return res.data as ApiPayload
  }

/**
 * 课表：POST `${API_BASE}/v2/schedule/query`（Dashboard:578）。
 * key 与页面一致（buildScheduleCacheKey, Dashboard:373）：有学期为 `schedule:${sid}:${semester}`，
 * 否则 `schedule:${sid}`；payload 的 semester 与页面一致（`preferredSemester || undefined`）。
 */
const fetchSchedule =
  (studentId: string, semester: string): (() => Promise<ApiPayload>) =>
  async () => {
    const res = await axios.post(`${API_BASE}/v2/schedule/query`, {
      student_id: studentId,
      semester: semester || undefined
    })
    return res.data as ApiPayload
  }

// ── 任务规划 ───────────────────────────────────────────────────────────────────

/**
 * 规划预热任务数组（纯函数，可单测）。
 *
 * @param studentId      学号（空则返回空数组）。
 * @param currentSemester 当前学期字符串（如 "2025-2026-2"）；为空时各学期维度 key 用页面同款
 *                        兜底（ranking→'all'、exams→'current'、schedule→无学期段），保证与页面一致。
 */
export const planWarmupTasks = (rawStudentId: string, rawCurrentSemester: string): WarmupTask[] => {
  const studentId = String(rawStudentId || '').trim()
  const semester = String(rawCurrentSemester || '').trim()
  if (!studentId) return []

  const background: FetchWithCacheOptions = { priority: 'background' }

  return [
    {
      id: 'semesters',
      key: 'semesters',
      fetcher: fetchSemesters,
      ttl: DEFAULT_TTL,
      options: background
    },
    {
      id: 'grades',
      key: `grades:${studentId}`,
      fetcher: fetchGrades(studentId),
      ttl: DEFAULT_TTL,
      options: background
    },
    {
      id: 'studentinfo',
      key: `studentinfo:${studentId}`,
      fetcher: fetchStudentInfo(studentId),
      ttl: EXTRA_LONG_TTL,
      options: background
    },
    {
      id: 'ranking',
      key: `ranking:${studentId}:${semester || 'all'}`,
      fetcher: fetchRanking(studentId, semester),
      ttl: DEFAULT_TTL,
      options: background
    },
    {
      id: 'exams',
      key: `exams:${studentId}:${semester || 'current'}`,
      fetcher: fetchExams(studentId, semester),
      ttl: DEFAULT_TTL,
      options: background
    },
    {
      id: 'schedule',
      key: semester ? `schedule:${studentId}:${semester}` : `schedule:${studentId}`,
      fetcher: fetchSchedule(studentId, semester),
      ttl: DEFAULT_TTL,
      options: background
    }
  ]
}

/**
 * 从学期列表 payload 解析「当前学期」（与视图一致：normalizeSemesterList + resolveCurrentSemester）。
 * 视图用法（ExamView:175）：`resolveCurrentSemester(normalizeSemesterList(data.semesters), data.current)`。
 */
export const resolveCurrentSemesterFromPayload = (payload: unknown): string => {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const semesters = normalizeSemesterList(Array.isArray(p.semesters) ? p.semesters : [])
  const hinted = String(p.current ?? '').trim()
  return resolveCurrentSemester(semesters, hinted)
}

/** 解析当前学期：优先读既有 `semesters` 缓存；无则拉一次（与页面同款 GET），成功则顺手写入缓存。 */
const resolveCurrentSemesterFromApi = async (studentId: string): Promise<string> => {
  void studentId
  try {
    const cached = getCachedData<ApiPayload>('semesters', DEFAULT_TTL)
    if (cached?.data && (cached.data as ApiPayload).success) {
      return resolveCurrentSemesterFromPayload(cached.data)
    }
    const res = await axios.get(`${API_BASE}/v2/semesters`)
    const payload = res.data as ApiPayload
    if (payload && payload.success) {
      // 顺手写入 semesters 缓存（等价于 semesters 预热任务；后续 runWarmup 会因新鲜命中而跳过）。
      setCachedData('semesters', payload)
      return resolveCurrentSemesterFromPayload(payload)
    }
    return ''
  } catch {
    return ''
  }
}

// ── 限频 ───────────────────────────────────────────────────────────────────────

const readLastWarmupRun = (storage: WarmupStorageLike): number => {
  try {
    const raw = storage.getItem(WARMUP_RATE_LIMIT_KEY)
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

const markWarmupRun = (storage: WarmupStorageLike, now: number): void => {
  try {
    storage.setItem(WARMUP_RATE_LIMIT_KEY, String(now))
  } catch {
    // ignore
  }
}

/** 设备在线判定（与 auth store `readInitialDeviceOnline` 一致：无 navigator/onLine 视为在线）。 */
export const isDeviceOnline = (): boolean => {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true
    return navigator.onLine
  } catch {
    return true
  }
}

// ── 执行 ───────────────────────────────────────────────────────────────────────

export interface RunWarmupOptions {
  /** 注入当前时间戳（测试用）；默认 Date.now()。 */
  now?: number
  /** 限频窗口（ms）；默认 DEFAULT_WARMUP_RATE_LIMIT_MS（30 分钟）。 */
  rateLimitMs?: number
  /** 并发上限；默认 3，最大不超过任务数。 */
  maxConcurrency?: number
  /** 限频记录存储；默认 window.localStorage。 */
  storage?: WarmupStorageLike
}

const isWarmingSuccess = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') return false
  const p = data as ApiPayload
  return p.success === true && p.offline !== true
}

/**
 * 执行预热任务（并发 ≤ maxConcurrency；单任务失败静默，不影响其他任务）。
 *
 * 限频：`storage[WARMUP_RATE_LIMIT_KEY]` 在窗口内时直接跳过（不触发任何 fetcher）；
 * 否则先记录时间戳再执行。「新鲜缓存命中则跳过」保证已暖的模块不重复请求。
 */
export const runWarmup = async (
  tasks: WarmupTask[],
  opts: RunWarmupOptions = {}
): Promise<WarmupResult> => {
  const now = opts.now ?? Date.now()
  const rateLimitMs = opts.rateLimitMs ?? DEFAULT_WARMUP_RATE_LIMIT_MS
  const storage = opts.storage ?? defaultStorage()
  const list = Array.isArray(tasks) ? tasks : []

  const lastRun = readLastWarmupRun(storage)
  // lastRun === 0 表示从未跑过 → 不受限频约束（避免 now 为小测试值时误判）。
  if (lastRun > 0 && now - lastRun < rateLimitMs) {
    return { ran: false, skipped: 'rate-limited', ok: 0, failed: 0 }
  }
  markWarmupRun(storage, now)

  const maxConcurrency = Math.max(1, Math.min(opts.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY, list.length || 1))
  let ok = 0
  let failed = 0
  let index = 0

  const runOne = async (task: WarmupTask): Promise<void> => {
    try {
      // 新鲜缓存命中 → 跳过（不重复请求）：与页面 SWR 读取命中同一 key。
      const fresh = getCachedData<ApiPayload>(task.key, task.ttl)
      if (fresh && isWarmingSuccess(fresh.data)) {
        ok += 1
        return
      }
      const data = await task.fetcher()
      if (isWarmingSuccess(data)) {
        setCachedData(task.key, data)
        ok += 1
      } else {
        failed += 1
      }
    } catch (error) {
      // 单任务失败静默：仅 console.debug，绝不影响其他任务。
      try {
        console.debug('[CacheWarmup] 预热任务失败:', task.id, error)
      } catch {
        // ignore
      }
      failed += 1
    }
  }

  const worker = async (): Promise<void> => {
    while (index < list.length) {
      const i = index
      index += 1
      await runOne(list[i])
    }
  }

  await Promise.all(Array.from({ length: maxConcurrency }, () => worker()))
  return { ran: true, ok, failed }
}

export interface MaybeRunInput {
  /** 学号；空 → 不跑。 */
  studentId?: string | null
  /** 在线判定；默认读 navigator.onLine。 */
  isOnline?: () => boolean
  /** 注入当前时间戳（测试用）。 */
  now?: number
  /** 限频窗口（ms）。 */
  rateLimitMs?: number
  /** 限频记录存储。 */
  storage?: WarmupStorageLike
  /** 当前学期解析器（测试可注入）；默认读 semesters 缓存 / 拉一次。 */
  resolveSemester?: (studentId: string) => Promise<string>
}

/**
 * 预热入口（挂钩调用，fire-and-forget，.catch 吞错）。
 * 门控：有学号 + 非测试账号 + 在线 + 非限频窗口 → 解析当前学期 → planWarmupTasks → runWarmup。
 */
export const maybeRunCacheWarmup = async (input: MaybeRunInput = {}): Promise<WarmupResult> => {
  const studentId = String(input.studentId ?? '').trim()
  if (!studentId) return { ran: false, skipped: 'no-student', ok: 0, failed: 0 }
  if (isTestAccountSession()) return { ran: false, skipped: 'test-account', ok: 0, failed: 0 }

  const online = (input.isOnline ?? isDeviceOnline)()
  if (!online) return { ran: false, skipped: 'offline', ok: 0, failed: 0 }

  const now = input.now ?? Date.now()
  const semester = await (input.resolveSemester ?? resolveCurrentSemesterFromApi)(studentId).catch(() => '')
  const tasks = planWarmupTasks(studentId, semester)
  return runWarmup(tasks, {
    now,
    rateLimitMs: input.rateLimitMs,
    storage: input.storage
  })
}
