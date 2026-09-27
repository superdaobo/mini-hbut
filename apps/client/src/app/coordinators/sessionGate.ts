/**
 * 全局登录单飞（Singleflight）协调点（GitHub #659 根因 6/7）
 *
 * manual login（LoginV3）、boot 自动重登（useAppRuntime restoreTask）、
 * 65s 轮询恢复（attemptOnlineRecovery → attemptAutoRelogin）、
 * keep-alive/refresh 触发的重登共用此门：
 *
 *  - 同一时刻只允许一个真实 login 请求在飞（invoke('login') /
 *    auto_relogin_from_stored / chaoxing_password_login /
 *    portal_qr_confirm_login / chaoxing_qr_confirm_login）；
 *  - 已有 in-flight 时，新的调用方直接复用同一个 promise（await 同一登录），
 *    而不是再触发一次 login —— 从根上消除「手动登录 vs 后台自动恢复」
 *    并发双 login 导致的“登录频率过高”与互踩。
 *
 * 模块级单例：与组件/API 层解耦，任何来源（UI / 轮询 / 恢复链）都能接入。
 *
 * #929：在飞状态必须具备失联判定。iOS 上 WebView 冻结/回收会让 invoke 的
 * 响应永久丢失，promise 永不 settle，门被永久占用 —— 此后所有登录（含用户
 * 手动点击）都被静默复用，界面无限转圈且不产生任何新日志。超过阈值即视为
 * 失联，由「下一个登录调用接管」与「App 回前台」两条路径自愈。
 */

/**
 * 单次登录在飞的失联阈值。
 *
 * 需覆盖真实最长链路：拉登录页 + 抓取/识别验证码 + 提交 + /admin/caslogin
 * 补偿（真机实测约 9s），以及 HttpClient 单请求 30s 上限的最坏叠加。
 */
export const LOGIN_IN_FLIGHT_TIMEOUT_MS = 90_000

let inFlightPromise: Promise<unknown> | null = null
let inFlightStartedAt = 0
let inFlightMethod = ''

/** 当前是否已有登录请求在飞（供 UI 展示 / 恢复链让路判断） */
export const isLoginInFlight = (): boolean => inFlightPromise !== null

/**
 * 当前在飞登录的方式标记（进入门时由发起方标注）。
 *
 * 「登录中切回页面」的复用路径据此还原落地语义：写回 `hbu_login_method`、
 * 判断是否需要登记登录冷却等（#932 / N2）。
 */
export const loginInFlightMethod = (): string => inFlightMethod

/**
 * 等待当前在飞登录结束（不发起新登录）；门空闲时立即返回 null。
 * 供「登录期间切换界面后重新挂载」的组件复用同一次登录结果（#932）。
 */
export const waitForInFlightLogin = <T = unknown>(): Promise<T | null> =>
  inFlightPromise ? (inFlightPromise as Promise<T>) : Promise.resolve(null)

/** 在飞请求是否已超过合理时长（IPC 响应丢失 / 命令卡死时用于自愈） */
export const isLoginInFlightStale = (now: number = Date.now()): boolean =>
  inFlightPromise !== null &&
  inFlightStartedAt > 0 &&
  now - inFlightStartedAt > LOGIN_IN_FLIGHT_TIMEOUT_MS

/**
 * 清理已失联的在飞状态，返回是否真的清理了。
 * 未失联时不动作，以保持「同一时刻只有一个登录」的单飞语义。
 */
export const resetLoginGateIfStale = (now: number = Date.now()): boolean => {
  if (!isLoginInFlightStale(now)) return false
  inFlightPromise = null
  inFlightStartedAt = 0
  inFlightMethod = ''
  return true
}

/**
 * 在单飞门内执行一次登录动作：
 *  - 无 in-flight：执行 fn 并持有其 promise，完成后释放（不论成败）；
 *  - 已有 in-flight 且未失联：不执行 fn，直接返回同一个 promise（复用对方结果）；
 *  - 已有 in-flight 但已失联：接管（清门后执行 fn），避免永久复用死 promise。
 *
 * `options.method` 标注本次登录方式，供复用路径还原落地语义（#932 / N2）。
 */
export const runExclusiveLogin = <T>(
  fn: () => Promise<T>,
  options: { method?: string } = {}
): Promise<T> => {
  if (inFlightPromise && !resetLoginGateIfStale()) {
    return inFlightPromise as Promise<T>
  }

  let task!: Promise<T>
  task = (async () => {
    try {
      return await fn()
    } finally {
      // 仅当自己仍是 in-flight 持有者时才释放，防止清掉更晚接管的调用
      if (inFlightPromise === task) {
        inFlightPromise = null
        inFlightStartedAt = 0
        inFlightMethod = ''
      }
    }
  })()
  inFlightPromise = task
  inFlightStartedAt = Date.now()
  inFlightMethod = String(options.method || '')
  return task
}

/** 测试辅助：清空门内状态（生产代码请用 resetLoginGateIfStale） */
export const resetLoginGate = (): void => {
  inFlightPromise = null
  inFlightStartedAt = 0
  inFlightMethod = ''
}

/** 测试辅助：读取在飞起始时间（生产代码无需感知） */
export const loginGateStartedAt = (): number => inFlightStartedAt
