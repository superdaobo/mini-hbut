/**
 * src/features/identity/oidc/oidcErrors.ts —— P2-4（#1208）身份 OIDC：稳定错误分类器。
 *
 * 规格：goal-10 `p2-4-client-pkce-spec.md` §4.1（**逐字冻结**的 kind → 中文文案）。
 *
 * 安全边界（必须保持）：
 *   - 面向用户的文案一律来自本表（固定简体中文），**不得**透传 Rust/服务端原文、
 *     完整学号 / `code` / `code_verifier` / 任何 token / 授权 URL / 回调查询串；
 *   - **未知 kind 一律 `unknown`**（绝不原样透传输入）；
 *   - 本表与 Rust 侧（`src-tauri/src/identity/oidc_*` 的 kind 常量 + 固定文案）
 *     逐字一致：改这里必须同步改 Rust 侧。
 */

/** §4.1 全部稳定 kind（17 个；与 Rust 侧 kind 常量逐字一致） */
export type OidcKind =
  | 'oidc_begin_ok'
  | 'oidc_login_ok'
  | 'oidc_disabled'
  | 'oidc_misconfigured'
  | 'oidc_no_pending'
  | 'oidc_state_mismatch'
  | 'oidc_nonce_mismatch'
  | 'oidc_callback_invalid'
  | 'oidc_token_exchange_failed'
  | 'oidc_id_token_invalid'
  | 'oidc_timeout'
  | 'oidc_network'
  | 'oidc_session_active'
  | 'oidc_session_absent'
  | 'oidc_logout_ok'
  | 'secure_storage_unavailable'
  | 'unknown'

/** 全部 kind（规格 §4.1 表序；用于遍历与测试断言） */
export const OIDC_KINDS: readonly OidcKind[] = [
  'oidc_begin_ok',
  'oidc_login_ok',
  'oidc_disabled',
  'oidc_misconfigured',
  'oidc_no_pending',
  'oidc_state_mismatch',
  'oidc_nonce_mismatch',
  'oidc_callback_invalid',
  'oidc_token_exchange_failed',
  'oidc_id_token_invalid',
  'oidc_timeout',
  'oidc_network',
  'oidc_session_active',
  'oidc_session_absent',
  'oidc_logout_ok',
  'secure_storage_unavailable',
  'unknown'
]

/**
 * §4.1 冻结表：kind → 中文文案（**逐字**；与 Rust 侧固定文案逐字一致）。
 * 注意：文案不含任何动态值（学号/code/verifier/token/URL/查询串原文一律不得出现）。
 */
export const OIDC_MESSAGES: Record<OidcKind, string> = {
  oidc_begin_ok: '已打开浏览器，请在浏览器中完成登录',
  oidc_login_ok: '登录成功',
  oidc_disabled: '该版本未启用统一登录',
  oidc_misconfigured: '登录配置不完整，请联系管理员',
  oidc_no_pending: '登录请求已失效，请重新发起',
  oidc_state_mismatch: '登录状态校验失败，请重新发起',
  oidc_nonce_mismatch: '登录凭证校验失败，请重新发起',
  oidc_callback_invalid: '回调地址无效，请重新发起',
  oidc_token_exchange_failed: '换取登录凭证失败，请重试',
  oidc_id_token_invalid: '登录凭证无效，请重试',
  oidc_timeout: '登录超时，请重试',
  oidc_network: '网络不可用，请检查网络后重试',
  oidc_session_active: '已登录',
  oidc_session_absent: '未登录',
  oidc_logout_ok: '已退出登录',
  secure_storage_unavailable: '无法安全保存登录状态（系统凭据存储不可用）',
  unknown: '操作失败，请稍后重试'
}

/** kind 是否为本表内的稳定 kind（对任意输入防御式判断） */
export const isOidcKind = (value: unknown): value is OidcKind =>
  typeof value === 'string' && (OIDC_KINDS as readonly string[]).includes(value)

/** 取 kind 的固定文案；未知 kind 一律回落到 `unknown` 的文案（绝不原样透传输入） */
export const messageForOidc = (kind: unknown): string =>
  isOidcKind(kind) ? OIDC_MESSAGES[kind] : OIDC_MESSAGES.unknown
