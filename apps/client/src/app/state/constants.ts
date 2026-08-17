/**
 * App 壳专用常量（Phase 5：#574）
 *
 * 从 App.vue 迁出的 localStorage key 与定时器间隔常量。
 * 保持原 key 字符串不变（行为兼容约束）。
 */

// ── 会话 / Cookie ─────────────────────────────────────────────────────────
export const SESSION_COOKIE_KEY = 'hbu_session_cookies'
export const SESSION_COOKIE_TIME_KEY = 'hbu_session_cookie_time'
export const COOKIE_SNAPSHOT_KEY = 'hbu_cookie_snapshot'
export const LOGIN_SESSION_TOKEN_KEY = 'hbu_login_session_token'
export const LOGIN_METHOD_KEY = 'hbu_login_method'
export const LOGIN_METHOD_VIEW_KEY = 'hbu_login_entry_mode'
export const LOGIN_TEMP_FLAG_KEY = 'hbu_login_temporary'
export const LOGOUT_REASON_KEY = 'hbu_logout_reason'
export const TEMP_SESSION_EXPIRED_REASON = 'temp_session_expired'

// ── 学习通账号 ────────────────────────────────────────────────────────────
export const CHAOXING_ACCOUNT_KEY = 'hbu_cx_account'
export const CHAOXING_PASSWORD_KEY = 'hbu_cx_password'
export const CHAOXING_REMEMBER_KEY = 'hbu_cx_remember'

// ── JWXT 维护状态 ─────────────────────────────────────────────────────────
export const JWXT_MAINTENANCE_KEY = 'hbu_jwxt_maintenance'
export const JWXT_MAINTENANCE_TIME_KEY = 'hbu_jwxt_maintenance_time'
export const JWXT_MAINTENANCE_HINT_KEY = 'hbu_jwxt_maintenance_hint'
export const JWXT_MAINTENANCE_DETAIL_KEY = 'hbu_jwxt_maintenance_detail'
export const JWXT_MAINTENANCE_PHASE_KEY = 'hbu_jwxt_maintenance_phase'
export const JWXT_MAINTENANCE_EVENT = 'hbu-jwxt-maintenance'

// ── 远程配置 / 公告 ───────────────────────────────────────────────────────
export const REMOTE_CONFIG_MODE_EVENT = 'hbu-remote-config-mode-changed'
export const REMOTE_CONFIG_UPDATED_EVENT = 'hbu-remote-config-updated'
export const ANNOUNCEMENT_CONFIRM_KEY = 'hbu_announcement_confirmed'
export const ANNOUNCEMENT_SNAPSHOT_KEY = 'hbu_announcement_snapshot'

// ── 网络端点 ──────────────────────────────────────────────────────────────
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'

// ── 模块宿主 / 布局调试 ───────────────────────────────────────────────────
export const MODULE_HOST_SESSION_KEY = 'hbu_more_module_host_session'
export const HOME_LAYOUT_DEBUG_HIDDEN_KEY = 'hbu_home_layout_debug_hidden'
export const HOME_LAYOUT_DEBUG_FORCE_KEY = 'hbu_home_layout_debug_enabled'
export const HOME_SCROLL_STORAGE_KEY = 'hbu_home_scroll_top'

// ── 定时器间隔 ────────────────────────────────────────────────────────────
export const SESSION_REFRESH_INTERVAL = 20 * 60 * 1000
export const ELECTRICITY_REFRESH_INTERVAL = 10 * 60 * 1000
export const JWXT_RECOVERY_INTERVAL = 65 * 1000
export const REMOTE_CONFIG_REFRESH_INTERVAL = 60 * 1000
export const GRADE_CACHE_REFRESH_RETRY_MS = 8000

// ── iOS resume 策略（#451） ───────────────────────────────────────────────
export const IOS_RESUME_SOFT_REMOUNT_MS = 10 * 60 * 1000
export const IOS_RESUME_HARD_RELOAD_MS = 15 * 60 * 1000
export const IOS_RELOAD_MIN_INTERVAL_MS = 60 * 1000
export const IOS_HARD_RELOAD_MAX_PER_SESSION = 1
export const SOFT_REMOUNT_MIN_INTERVAL_MS = 30 * 1000
