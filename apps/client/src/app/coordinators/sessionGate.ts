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
 */
let inFlightPromise: Promise<unknown> | null = null

/** 当前是否已有登录请求在飞（供 UI 展示 / 恢复链让路判断） */
export const isLoginInFlight = (): boolean => inFlightPromise !== null

/**
 * 在单飞门内执行一次登录动作：
 *  - 无 in-flight：执行 fn 并持有其 promise，完成后释放（不论成败）；
 *  - 已有 in-flight：不执行 fn，直接返回同一个 promise（复用对方结果）。
 */
export const runExclusiveLogin = <T>(fn: () => Promise<T>): Promise<T> => {
  const existing = inFlightPromise
  if (existing) return existing as Promise<T>

  let task!: Promise<T>
  task = (async () => {
    try {
      return await fn()
    } finally {
      // 仅当自己仍是 in-flight 持有者时才释放，防止清掉更晚接管的调用
      if (inFlightPromise === task) inFlightPromise = null
    }
  })()
  inFlightPromise = task
  return task
}

/** 测试辅助：清空门内状态（生产代码不要调用） */
export const resetLoginGate = (): void => {
  inFlightPromise = null
}