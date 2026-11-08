/**
 * src/utils/session_credentials.ts —— #1171 T13：双轨凭据隔离与登出/切号统一清理。
 *
 * 凭据域（严格隔离，不得互相冒充）：
 *   1. **Identity 域（新）**：Mini-HBUT Identity access token —— 仅驻留
 *      `identity_access_token.ts` 的内存缓存；唯一来源是 Identity Core 设备换票
 *      （设备密钥签名），并经过 issuer 校验（identityIssuers）与主体一致性护栏
 *      （identity_device_token）。Identity 层**从不读取** legacy bridge / 教务凭据。
 *   2. **Legacy 域（旧平台）**：Bridge 会话令牌（Bearer，主窗口专属，
 *      `bridge_auth.ts` 内存缓存）+ 教务会话 cookie（localStorage，
 *      AuthCoordinator 登出时按 SESSION_COOKIE_KEY 等键清理，本模块不重复）。
 *
 * 隔离规则：
 *   - Identity 层不读 bridge 令牌（`getIdentityAccessToken` 永远不返回 bridge 令牌）；
 *   - Bridge 层不读 Identity 令牌（`withBridgeAuthHeaders` 永远不携带 Identity AT）；
 *   - 两域缓存各自独立，清一个域不影响另一个域（分别提供独立清理函数）。
 *
 * 登出 / 切号统一收口（`clearAllSessionCredentials`）：
 *   - 两个域**都**必须清理 —— 由 `installIdentityDeviceTokenProvider` 挂到既有事件
 *     `hbu-session-logout` / `hbu-identity-login-resumed` 上（不新增耦合）。
 *   - 教务会话 cookie 的清理仍由 AuthCoordinator 负责（其职责范围），本模块只收口
 *     两个内存令牌域。
 */
import { clearIdentityAccessToken } from './identity_access_token'
import { resetBridgeSessionToken } from './bridge_auth'

/** 清理 Identity 域（新凭据）：内存 AT + 在途 get/refresh 任务，一并丢弃 */
export const clearIdentitySessionCredential = (): void => {
  clearIdentityAccessToken()
}

/** 清理 Legacy 域（旧平台凭据）：bridge 会话令牌缓存（下次使用时惰性重取） */
export const clearLegacySessionCredential = (): void => {
  resetBridgeSessionToken()
}

/** 登出 / 切号统一入口：两个凭据域一次清干净（幂等） */
export const clearAllSessionCredentials = (): void => {
  clearIdentitySessionCredential()
  clearLegacySessionCredential()
}
