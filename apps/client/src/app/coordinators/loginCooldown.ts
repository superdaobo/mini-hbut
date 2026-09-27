/**
 * 登录冷却登记（GitHub #931）
 *
 * Rust 侧 `login` 入口带 60 秒冷却门（使用点 `http_client/auth.rs:1020`，
 * 常量定义 `http_client/mod.rs:85` 的 `LOGIN_COOLDOWN`）：登录成功后 60 秒内
 * 再次调用必然返回「登录频率过高，请 N 秒后再试」。
 *
 * 而客户端在登录成功后 2.5 秒会主动做一次会话探测，失败即触发后台自动重登
 * （AuthCoordinator 的 refreshSessionSilently → attemptAutoRelogin）。两者叠加
 * 会让每次成功登录后都出现一条「注定失败」的 ERROR 日志与维护横幅，掩盖真实问题。
 *
 * 本模块只做一件事：登记冷却窗口，供**自动恢复链**在窗口内让路（不发起注定失败的
 * 请求）。手动登录路径不读取该状态 —— 冷却本身仍由 Rust 强制，保护语义不变。
 */

/** 与 Rust `LOGIN_COOLDOWN` 保持一致（`http_client/mod.rs`） */
export const LOGIN_COOLDOWN_MS = 60 * 1000

/** 匹配 Rust 透传的冷却错误文案：「登录频率过高，请43秒后再试」 */
const COOLDOWN_PATTERN = /登录频率过高[，,]?\s*请\s*(\d+)\s*秒/

let cooldownUntil = 0

/** 门户密码登录成功：Rust 侧冷却开始计时，前端同步登记同一窗口 */
export const noteLoginSuccess = (now: number = Date.now()): void => {
  cooldownUntil = now + LOGIN_COOLDOWN_MS
}

/**
 * 从错误对象/文案中识别冷却剩余时长并登记（服务端给出的剩余更权威）。
 * 返回识别到的剩余秒数；未识别到返回 0。
 */
export const noteLoginCooldownFromError = (error: unknown): number => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String((error as { message?: unknown } | null)?.message ?? '')
  const matched = COOLDOWN_PATTERN.exec(raw)
  if (!matched) return 0
  const seconds = Number(matched[1])
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  cooldownUntil = Date.now() + seconds * 1000
  return seconds
}

/** 冷却窗口是否仍然有效（自动恢复链据此让路） */
export const isLoginCooldownActive = (now: number = Date.now()): boolean => now < cooldownUntil

/** 冷却剩余毫秒数（0 表示无冷却） */
export const loginCooldownRemainingMs = (now: number = Date.now()): number =>
  Math.max(0, cooldownUntil - now)

/** 测试辅助：清空登记（生产代码无需调用） */
export const resetLoginCooldown = (): void => {
  cooldownUntil = 0
}
