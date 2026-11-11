/**
 * src/utils/identity_token_provider.ts —— P2-5（#1209）：token provider 选择器（默认 OIDC + 过渡开关）。
 *
 * 选择规则（goal-10 `p2-5-refresh-token-spec.md` §2.3 **冻结**）：
 *   1. 非 Tauri 运行时（Web/Capacitor）→ `'disabled'`（无 keyring/设备私钥，两个 provider 都无法工作，不安装）；
 *   2. 过渡开关 `VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED === '1'`（**仅显式 '1'**）→ `'device'`
 *      （纯过渡：设备换票优先，行为与 P2-4 之前一致，复用 identity_device_token.ts 全部逻辑）；
 *   3. 否则 → `'oidc'`（**默认**：Casdoor refresh token 路径，identity_oidc_token.ts）。
 *
 * **不得**在 `'oidc'` 模式下静默回退到设备换票：回退必须显式开过渡开关——
 * 这是 issue「默认 refresh token」的核心（OIDC 无会话/刷新失败时返回 null，
 * 调用方走既有 legacy 双轨，而不是悄悄换到设备换票）。
 *
 * 安装（`installIdentityTokenProvider`，幂等）：
 *   - `'device'`   → 委托 `installIdentityDeviceTokenProvider`（其自带登出/切号事件挂点）；
 *   - `'oidc'`     → `installIdentityOidcTokenProvider` + 复用既有事件挂点
 *     （`hbu-session-logout` / `hbu-identity-login-resumed`，不新增事件），
 *     事件触发时调 `clearAllSessionCredentials` 统一三清（Identity AT + bridge 令牌 + OIDC 会话）；
 *   - `'disabled'` → 不安装任何 provider。
 *   - 重复调用先卸载上一次安装（provider + 事件监听），不叠加监听。
 */
import { isTauriRuntime } from '../platform/native'
import { setIdentityAccessTokenProvider } from './identity_access_token'
import {
  IDENTITY_DEVICE_TOKEN_LOGIN_EVENT,
  IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT,
  installIdentityDeviceTokenProvider
} from './identity_device_token'
import { installIdentityOidcTokenProvider } from './identity_oidc_token'
import { clearAllSessionCredentials } from './session_credentials'

/** provider 模式：'oidc'（默认）/ 'device'（过渡开关）/ 'disabled'（非 Tauri） */
export type IdentityTokenMode = 'oidc' | 'device' | 'disabled'

/** 过渡开关的"开"值：仅显式 `'1'` 生效（`'true'`/`'0'`/未设置 一律走默认 oidc） */
const DEVICE_TOKEN_FLAG_ON = '1'

/**
 * 解析当前应生效的 token provider 模式（只读判定，无副作用）。
 * 优先级（冻结）：非 Tauri → disabled；过渡开关 → device；否则 → oidc（默认）。
 */
export const resolveIdentityTokenMode = (): IdentityTokenMode => {
  // 非 Tauri（Web/Capacitor）：无 keyring / 设备私钥，两个 provider 都不可用
  if (!isTauriRuntime()) return 'disabled'
  // 过渡开关（仅显式 '1'）：设备换票优先，行为与 P2-4 之前一致
  if (import.meta.env.VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED === DEVICE_TOKEN_FLAG_ON) return 'device'
  // 默认：OIDC refresh token 路径（绝不静默回退设备换票）
  return 'oidc'
}

/** 当前生效的安装（模块级单一实例，保证重复安装不叠加监听） */
let activeUninstall: (() => void) | null = null

/**
 * 按选择规则安装 token provider（生产注入点）。
 * - 幂等：重复调用先卸载上一次安装（provider + 事件监听）；
 * - 非浏览器环境（node 测试）不挂监听，只注册/卸载 provider。
 */
export interface InstallIdentityTokenProviderResult {
  /** 解绑 provider 与事件监听（幂等）；用于 App 卸载/热重载 */
  uninstall: () => void
}

export const installIdentityTokenProvider = (): InstallIdentityTokenProviderResult => {
  // 重复安装（HMR / 组合式函数被调用两次）：先解绑上一次，避免监听泄漏
  activeUninstall?.()
  const mode = resolveIdentityTokenMode()
  if (mode === 'disabled') {
    // 非 Tauri：不安装任何 provider（调用方统一走 legacy 双轨）
    setIdentityAccessTokenProvider(null)
    return { uninstall: () => {} }
  }
  if (mode === 'device') {
    // 过渡开关：设备换票（自带登出/切号监听与卸载语义，见 identity_device_token.ts）
    const installed = installIdentityDeviceTokenProvider()
    activeUninstall = installed.uninstall
    return { uninstall: installed.uninstall }
  }
  // 'oidc'（默认）：OIDC 会话 provider（不回退设备换票）
  installIdentityOidcTokenProvider()
  // 复用既有事件挂点做三清（不新增事件）：登出/切号 →
  // ① Identity AT ② bridge 令牌 ③ OIDC 会话（clearAllSessionCredentials 收口）
  const onLogout = (): void => {
    clearAllSessionCredentials()
  }
  const onLoginResumed = (): void => {
    clearAllSessionCredentials()
  }
  const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
  if (hasWindow) {
    window.addEventListener(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT, onLogout)
    window.addEventListener(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT, onLoginResumed)
  }
  let uninstalled = false
  const uninstall = (): void => {
    if (uninstalled) return
    uninstalled = true
    if (hasWindow) {
      window.removeEventListener(IDENTITY_DEVICE_TOKEN_LOGOUT_EVENT, onLogout)
      window.removeEventListener(IDENTITY_DEVICE_TOKEN_LOGIN_EVENT, onLoginResumed)
    }
    // 只清理「仍是本次安装」的 provider：避免旧实例的卸载动作把新安装打掉
    if (activeUninstall === uninstall) {
      activeUninstall = null
      setIdentityAccessTokenProvider(null)
    }
  }
  activeUninstall = uninstall
  return { uninstall }
}
