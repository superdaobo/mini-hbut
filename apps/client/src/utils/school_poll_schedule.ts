// src/utils/school_poll_schedule.ts
//
// Epic #1243（G4-03 / mini-hbut#1261）：**学校查询调度**的纯决策层。
//
// 现状问题：`SessionCoordinator`（会话保活）、`GradeCoordinator`（成绩刷新/重试）、
// `notify_center_checks`（静默课表/成绩/考试查询）各自有定时路径，容易对同一接口
// 重复请求；也没有「手动刷新优先于定时轮询」的统一表达。
//
// 本模块只做**决策**（纯函数 + 注入时钟），不注册定时器、不发请求：
// - 每个数据域一个周期（契约 §8.1）：schedule 30min、grades/exams 2h、rank 12h、profile 24h；
// - **手动刷新**（用户点页面刷新）**无视周期**，立即查（但仍在途请求要复用，不重复拉）；
// - 同域**单飞**：已有在途 → 返回 `skip/inflight`（由调用方复用同一个 Promise）；
// - 学校会话失效/维护中 → `skip/session_invalid`（不制造无效重试）；
// - 恢复前台 → 用同一个 `decidePoll`（manual=false）判断「是否已到点」，天然支持补偿。
//
// 边界：本模块**不认识**「数据年龄/过期」概念——那是第三方展示层的事，且 Epic 已废止
// 任何按数据年龄的过期告警。这里的周期只决定「何时去问学校」，不决定「数据能不能看」。

export type PollDomain = 'schedule' | 'grades' | 'exams' | 'rank' | 'profile'

/** 首期基线周期（契约 §8.1；压测后可动态降频，故集中在常量里） */
export const POLL_INTERVALS_MS: Readonly<Record<PollDomain, number>> = Object.freeze({
  schedule: 30 * 60 * 1000, // 30 分钟
  grades: 2 * 60 * 60 * 1000, // 2 小时
  exams: 2 * 60 * 60 * 1000, // 2 小时
  rank: 12 * 60 * 60 * 1000, // 12 小时
  profile: 24 * 60 * 60 * 1000 // 24 小时
})

export interface PollState {
  /** 上次**成功**查询该域的时刻（unix ms；0 = 从未查过） */
  lastCheckedAt: number
  /** 是否有在途请求（同域单飞） */
  inflight: boolean
}

export type PollAction = 'poll' | 'skip'

export type PollReason =
  | 'manual'
  | 'due'
  | 'not_due'
  | 'inflight'
  | 'session_invalid'
  | 'domain_unknown'

export interface PollDecision {
  action: PollAction
  reason: PollReason
  /** 距下次到期还有多久（ms；manual/inflight 时为 0） */
  dueInMs: number
}

export interface DecidePollInput {
  domain: string
  state: PollState
  now: number
  /** 用户主动点击刷新（无视周期，但仍受在途/会话约束） */
  manual?: boolean
  /** 学校会话是否有效（失效/维护中 → 不查，避免无效重试） */
  sessionValid?: boolean
}

const safeText = (value: unknown): string => String(value ?? '').trim()

/** 该域是否已到查询时点（不含在途/会话判断）。 */
export const isDue = (domain: PollDomain, state: PollState, now: number): boolean => {
  const interval = POLL_INTERVALS_MS[domain]
  const last = Number(state.lastCheckedAt) || 0
  if (last <= 0) return true // 从未查过 → 到期
  return Number(now) - last >= interval
}

/**
 * 决策：现在该不该去问学校。
 *
 * 优先级（冻结）：
 * 1. 未知域 → `skip/domain_unknown`（默认拒绝，不猜周期）
 * 2. 会话无效 → `skip/session_invalid`
 * 3. 在途 → `skip/inflight`（调用方复用同一个请求）
 * 4. 手动 → `poll/manual`（无视周期）
 * 5. 到点 → `poll/due`；否则 `skip/not_due`（带 `dueInMs` 供调度器排下一次）
 */
export const decidePoll = (input: DecidePollInput): PollDecision => {
  const domain = safeText(input.domain) as PollDomain
  if (!(domain in POLL_INTERVALS_MS)) {
    return { action: 'skip', reason: 'domain_unknown', dueInMs: 0 }
  }
  const now = Number(input.now) || 0
  const state = input.state || { lastCheckedAt: 0, inflight: false }
  if (input.sessionValid === false) {
    return { action: 'skip', reason: 'session_invalid', dueInMs: 0 }
  }
  if (state.inflight) {
    return { action: 'skip', reason: 'inflight', dueInMs: 0 }
  }
  if (input.manual === true) {
    return { action: 'poll', reason: 'manual', dueInMs: 0 }
  }
  const last = Number(state.lastCheckedAt) || 0
  const interval = POLL_INTERVALS_MS[domain]
  const elapsed = last <= 0 ? interval : now - last
  if (elapsed >= interval) {
    return { action: 'poll', reason: 'due', dueInMs: 0 }
  }
  return { action: 'skip', reason: 'not_due', dueInMs: interval - elapsed }
}

/** 记录一次成功查询（调用方在拿到学校结果后调用）。`_state` 仅为调用方便保留形参。 */
export const markChecked = (_state: PollState, now: number): PollState => ({
  lastCheckedAt: Number(now) || 0,
  inflight: false
})

/** 标记在途（发起请求前调用；同域单飞的开关）。 */
export const markInflight = (state: PollState): PollState => ({ ...state, inflight: true })

/** 在途结束但**失败**：不改 `lastCheckedAt`（下次仍算到期，避免把失败当成功）。 */
export const markInflightDone = (state: PollState): PollState => ({ ...state, inflight: false })

/**
 * 批量决策（调度器 tick 用）：返回本轮**该查**的域，按周期从短到长排序
 * （课表最勤、排名最懒），便于调用方按顺序限流发起。
 */
export const decidePollBatch = (
  domains: readonly string[],
  states: Readonly<Record<string, PollState>>,
  now: number,
  options: { sessionValid?: boolean } = {}
): PollDomain[] => {
  const wanted: PollDomain[] = []
  for (const raw of Array.isArray(domains) ? domains : []) {
    const decision = decidePoll({
      domain: raw,
      state: states[safeText(raw)] || { lastCheckedAt: 0, inflight: false },
      now,
      sessionValid: options.sessionValid
    })
    if (decision.action === 'poll') wanted.push(safeText(raw) as PollDomain)
  }
  wanted.sort((a, b) => POLL_INTERVALS_MS[a] - POLL_INTERVALS_MS[b])
  return wanted
}
