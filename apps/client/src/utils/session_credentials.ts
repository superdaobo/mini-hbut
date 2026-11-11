/**
 * src/utils/session_credentials.ts —— #1171 T13：双轨凭据隔离与登出/切号统一清理。
 *
 * 凭据域（严格隔离，不得互相冒充）：
 *   1. **Identity 域（新）**：Mini-HBUT Identity access token —— 仅驻留
 *      `identity_access_token.ts` 的内存缓存；唯一来源是 Identity Core 设备换票
 *      （设备密钥签名，经 issuer 校验与主体一致性护栏）或 P2-5 默认路径
 *      Casdoor OIDC 会话（refresh token 刷新，identity_oidc_token.ts）。
 *      Identity 层**从不读取** legacy bridge / 教务凭据。
 *   2. **Legacy 域（旧平台）**：Bridge 会话令牌（Bearer，主窗口专属，
 *      `bridge_auth.ts` 内存缓存）+ 教务会话 cookie（localStorage，
 *      AuthCoordinator 登出时按 SESSION_COOKIE_KEY 等键清理，本模块不重复）。
 *   3. **OIDC 域（P2-5 #1209，默认路径会话）**：Casdoor OIDC 会话
 *      （AT/RT/ID 在 Rust keyring，含 refresh_token）—— 由
 *      `clearOidcSessionCredential` 调 `identity_oidc_logout` 清理
 *      （**只清 OIDC 会话，不清设备密钥**）。
 *
 * 隔离规则：
 *   - Identity 层不读 bridge 令牌（`getIdentityAccessToken` 永远不返回 bridge 令牌）；
 *   - Bridge 层不读 Identity 令牌（`withBridgeAuthHeaders` 永远不携带 Identity AT）；
 *   - 各域缓存各自独立，清一个域不影响另一个域（分别提供独立清理函数）。
 *
 * 登出 / 切号统一收口（`clearAllSessionCredentials`）：
 *   - 三个域**都**必须清理（① Identity AT ② bridge 令牌 ③ OIDC 会话）—— 由
 *     provider 安装器挂到既有事件 `hbu-session-logout` / `hbu-identity-login-resumed`
 *     上（不新增事件）；幂等。
 *   - 教务会话 cookie 的清理仍由 AuthCoordinator 负责（其职责范围），本模块只收口
 *     三个令牌/会话域。
 */
import { clearIdentityAccessToken } from './identity_access_token'
import { resetBridgeSessionToken } from './bridge_auth'
// P2-5（#1209）：OIDC 会话域统一清理（复用 oidcFlow 的 invoke 封装与 kind 折叠）
import { oidcLogout } from '../features/identity/oidc/oidcFlow'
import { isTauriRuntime } from '../platform/native'

/** 清理 Identity 域（新凭据）：内存 AT + 在途 get/refresh 任务，一并丢弃 */
export const clearIdentitySessionCredential = (): void => {
  clearIdentityAccessToken()
}

/** 清理 Legacy 域（旧平台凭据）：bridge 会话令牌缓存（下次使用时惰性重取） */
export const clearLegacySessionCredential = (): void => {
  resetBridgeSessionToken()
}

/**
 * 清理 OIDC 域（P2-5 #1209 第三凭据域）：调 Rust `identity_oidc_logout` 清 Casdoor
 * 会话（keyring 中的 AT/RT/ID；**只清 OIDC 会话，不清设备密钥**）。
 *
 * best-effort 语义（登出主流程绝不被此步骤阻断）：
 * - 非 Tauri（Web/Capacitor 无 keyring 会话）→ 直接返回，不发起 invoke；
 * - invoke 失败 / 内部故障 → 吞掉（`oidcLogout` 本身已把错误折叠为稳定 kind，
 *   此处再兜一层 try/catch，**绝不抛**）；
 * - 零泄露：不输出任何 token / 错误原文。
 */
export const clearOidcSessionCredential = async (): Promise<void> => {
  if (!isTauriRuntime()) return
  try {
    // oidcLogout 内部已折叠所有错误为稳定 kind（不抛）；此处 await 仅作时序收口
    await oidcLogout()
  } catch {
    // best-effort：清理失败不得影响既有两域清理（登出后不得复用，内存域已同步清空）
  }
}

/**
 * 登出 / 切号统一入口：三个凭据域一次清干净（幂等）。
 * ① Identity AT（内存，同步）② bridge 令牌（内存，同步）③ OIDC 会话（keyring，异步 best-effort）。
 */
export const clearAllSessionCredentials = (): void => {
  clearIdentitySessionCredential()
  clearLegacySessionCredential()
  // ③ OIDC 会话：异步 best-effort 清理（绝不抛；失败也不影响已同步清完的 ①②）
  void clearOidcSessionCredential()
}
