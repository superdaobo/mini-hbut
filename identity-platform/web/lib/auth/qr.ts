/**
 * auth.* 接力页 QR 生成与生命周期（纯函数，可单测）。
 *
 * #627：跨设备登录二维码。
 *  - payload 与 App 侧 src/features/identity/qr/parseIdentityQr.ts 完全一致
 *    （minihbut://identity?request_id=&handoff=&source=qr），
 *    与「打开 App」按钮共用同一个 AuthRequest（同 request_id / 同 handoff），
 *    手机扫码后与同设备 Deep Link 进入 App 的同一个 Identity 流程；
 *  - QR 由浏览器 client-side 渲染（identity-qr.tsx 使用本地 qrcode 库），
 *    不调用任何外部 QR 服务/图片 API，payload 不经过服务器；
 *  - https fallback 链接（系统相机对 custom scheme 兼容差时）：
 *    handoff secret 只放 location.hash（#h=<secret>），绝不放 query。
 */
import type { HandoffPhase } from './state'

/** QR payload 的 source 标记（与 App 侧 IDENTITY_QR_SOURCE 对齐） */
export const IDENTITY_QR_SOURCE = 'qr'

/** https fallback 链接中 handoff 的 fragment 键（与 HANDOFF_HASH_KEY 对齐） */
export const IDENTITY_QR_HASH_KEY = 'h'

/** 构造 QR payload：只含 request_id / handoff / source，不含任何 PII 与 OAuth 材料 */
export function buildIdentityQrPayload(requestId: string, handoff: string): string {
  const params = new URLSearchParams({ request_id: requestId, handoff, source: IDENTITY_QR_SOURCE })
  return `minihbut://identity?${params.toString()}`
}

/**
 * 构造 https fallback 链接（human/browser 用，如系统相机无法唤起 custom scheme）：
 *   https://<origin>/r/<request_id>#h=<secret>
 * 接力页本身支持从 location.hash 恢复 handoff（#630），扫码后浏览器打开该页即可继续。
 * 安全：secret 只出现在 fragment（不进入服务器日志/HTTP 请求），绝不放 query。
 */
export function buildQrFallbackUrl(origin: string, requestId: string, handoff: string): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}/r/${encodeURIComponent(requestId)}#${IDENTITY_QR_HASH_KEY}=${encodeURIComponent(handoff)}`
}

/** 判断 QR 是否应显示（有详情、仍在等待、未进入任何终态） */
export function shouldRenderIdentityQr(
  phase: HandoffPhase,
  hasDetail: boolean,
): boolean {
  if (!hasDetail) return false
  // 终态（APPROVED/DENIED/EXPIRED/INVALID/CLIENT_UNAVAILABLE/REDIRECTING）立即隐藏
  return phase === 'WAITING_APP' || phase === 'APP_OPENED' || phase === 'NETWORK_ERROR'
}

/** 判断 QR 是否已过期（本地倒计时 <= 0 或未知；真正过期判定始终以 Core 为准） */
export function isIdentityQrExpired(countdownMs: number): boolean {
  return !Number.isFinite(countdownMs) || countdownMs <= 0
}
