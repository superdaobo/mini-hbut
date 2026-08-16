/**
 * 高风险管理员操作 step-up（#625）。
 *
 * 语义：高风险动作要求管理员会话有「近期认证」。认证时间由 BFF 从加密会话
 * 载荷的 iat（= OIDC 登录完成时刻，即 Mini-HBUT App Approval 时刻）经
 * x-admin-auth-time header 传入；Core 校验 now - auth_time <= 窗口。
 * 过期 → 403 STEP_UP_REQUIRED，BFF 引导用户重新登录（重新走 App Approval），
 * 而非前端 confirm 弹窗。
 *
 * 窗口配置化：IDENTITY_ADMIN_STEP_UP_SECONDS（默认 600 = 10 分钟）。
 */
import { StepUpRequiredError } from './errors.js'

export const ADMIN_STEP_UP_HEADER = 'x-admin-auth-time'
const DEFAULT_STEP_UP_SECONDS = 600

/** 读取 step-up 窗口（秒）；非法/缺失用默认值 600 */
export function stepUpWindowSeconds(env: Record<string, string | undefined> = process.env): number {
  const raw = env.IDENTITY_ADMIN_STEP_UP_SECONDS
  if (!raw) {
    return DEFAULT_STEP_UP_SECONDS
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    return DEFAULT_STEP_UP_SECONDS
  }
  return value
}

/**
 * 校验近期认证。authTimeEpochSec 缺失（BFF 未传）→ 视为过期（fail closed）。
 * 通过返回 void；不通过抛 StepUpRequiredError。
 */
export function assertRecentAuth(
  authTimeEpochSec: number | undefined,
  windowSeconds: number,
  nowEpochSec: number = Math.floor(Date.now() / 1000),
): void {
  if (typeof authTimeEpochSec !== 'number' || !Number.isFinite(authTimeEpochSec)) {
    throw new StepUpRequiredError(windowSeconds)
  }
  // 未来时间戳（时钟异常/伪造）一律视为未认证
  if (authTimeEpochSec > nowEpochSec + 300) {
    throw new StepUpRequiredError(windowSeconds)
  }
  if (nowEpochSec - authTimeEpochSec > windowSeconds) {
    throw new StepUpRequiredError(windowSeconds)
  }
}
