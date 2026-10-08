/**
 * #451 硬重载护栏（#991 加固）。
 *
 * ## 为什么需要跨页面持久的护栏
 *
 * `LifecycleCoordinator` 的白屏兜底会在 iOS 长后台恢复后调用 `window.location.reload()`。
 * 原本的护栏（`IOS_HARD_RELOAD_MAX_PER_SESSION = 1`、`IOS_RELOAD_MIN_INTERVAL_MS = 60s`）
 * 都放在 `state.mutable` 里 —— 那是**每个页面**一份的内存状态，而 `location.reload()`
 * 恰好会把它清零。也就是说：**护栏被它自己要防的那次重载清掉了**，上限形同不存在，
 * 重载可以反复发生（表现为应用反复白屏重来）。
 *
 * 本模块把计数与时间戳落到 localStorage，使其跨重载存活；同时写下「本次启动是重载」的
 * 标记 —— 新页面里重载与冷启动长得一模一样（都有新的 bootId），只有这个标记能区分。
 *
 * 计数按时间窗收敛（`COUNT_WINDOW_MS`），避免历史累计永久封锁兜底能力。
 */

/** 与 `index.html` 内联脚本读取的键名必须一致 */
export const HARD_RELOAD_STORAGE_KEY = 'hbu_hard_reload_state_v1'

/** 计数窗口：窗口内累计的重载次数超过上限即不再重载 */
export const HARD_RELOAD_COUNT_WINDOW_MS = 10 * 60 * 1000

export interface HardReloadState {
  /** 窗口内的重载次数 */
  count: number
  /** 窗口起点（epoch ms） */
  firstAt: number
  /** 最近一次重载时刻（epoch ms） */
  at: number
  /** 触发原因（诊断用） */
  reason: string
  /** 触发时所处视图（诊断用） */
  view: string
  /** 触发时的后台空闲时长（毫秒，诊断用） */
  idleMs: number
}

const readRaw = (): HardReloadState | null => {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(HARD_RELOAD_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HardReloadState>
    if (!parsed || typeof parsed.at !== 'number') return null
    return {
      count: Number(parsed.count) || 0,
      firstAt: Number(parsed.firstAt) || Number(parsed.at),
      at: Number(parsed.at),
      reason: String(parsed.reason ?? ''),
      view: String(parsed.view ?? ''),
      idleMs: Number(parsed.idleMs) || 0
    }
  } catch {
    return null
  }
}

/** 读取持久化的重载状态（无记录/损坏 → null） */
export const readHardReloadState = (): HardReloadState | null => readRaw()

/**
 * 时间窗内的重载次数（跨页面重载累计）。
 *
 * 调用方应取 `max(内存计数, 本值)` 作为护栏依据 —— 内存计数在重载后归零，本值不会。
 */
export const getHardReloadCountInWindow = (now = Date.now()): number => {
  const state = readRaw()
  if (!state) return 0
  if (now - state.firstAt > HARD_RELOAD_COUNT_WINDOW_MS) return 0
  return Math.max(0, state.count)
}

/**
 * 记录一次即将发生的硬重载（**必须在 `location.reload()` 之前调用**）。
 *
 * @returns 记录后的窗口内计数
 */
export const recordHardReload = (
  detail: { reason: string; view: string; idleMs: number },
  now = Date.now()
): number => {
  const previous = readRaw()
  const withinWindow = previous && now - previous.firstAt <= HARD_RELOAD_COUNT_WINDOW_MS
  const count = (withinWindow ? Math.max(0, previous?.count ?? 0) : 0) + 1
  const next: HardReloadState = {
    count,
    firstAt: withinWindow ? Number(previous?.firstAt) : now,
    at: now,
    reason: String(detail.reason ?? ''),
    view: String(detail.view ?? ''),
    idleMs: Number(detail.idleMs) || 0
  }
  try {
    localStorage.setItem(HARD_RELOAD_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 存储不可用时仅本次生效；护栏退回内存计数
  }
  return count
}
