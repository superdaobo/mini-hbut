/**
 * 「记住用户名」的单一读写入口（localStorage 键：hbu_username）。
 *
 * 安全说明：
 * - 该键只保存 10 位学号（登录 UX 记住账号、离线快照按学号隔离所需）；
 *   密码从不写入 localStorage —— 见 credential_storage.js（Tauri 密钥环 /
 *   AES-CBC 设备密钥加密备份）。
 * - CodeQL js/clear-text-storage-of-sensitive-data 会把
 *   loadPortalStoredPassword 的返回值 taint 到本模块的写入点，但实际落盘值
 *   仅为学号（PII 而非口令）。详见 docs/security/codeql-triage-js.md。
 * - 所有 setItem/removeItem('hbu_username') 必须经此模块，禁止散落调用。
 */

const REMEMBERED_USERNAME_KEY = 'hbu_username'
const STUDENT_ID_RE = /^\d{10}$/

const normalize = (value) => String(value ?? '').trim()

/** 10 位纯数字学号判定（与 src/utils/usage_tracker.js 保持一致） */
export const isLikelyStudentId = (value) => STUDENT_ID_RE.test(normalize(value))

export const getRememberedUsername = () => {
  try {
    return normalize(globalThis.localStorage?.getItem(REMEMBERED_USERNAME_KEY))
  } catch {
    return ''
  }
}

/** 保存学号；空值等价于清除。行为与原 localStorage.setItem 完全一致（不做截断/强校验，避免破坏登录）。 */
export const saveRememberedUsername = (value) => {
  const sid = normalize(value)
  try {
    if (!sid) {
      globalThis.localStorage?.removeItem(REMEMBERED_USERNAME_KEY)
      return ''
    }
    globalThis.localStorage?.setItem(REMEMBERED_USERNAME_KEY, sid)
  } catch {
    // 忽略存储失败（隐私模式/配额等）
  }
  return sid
}

export const clearRememberedUsername = () => {
  try {
    globalThis.localStorage?.removeItem(REMEMBERED_USERNAME_KEY)
  } catch {
    // ignore
  }
}
