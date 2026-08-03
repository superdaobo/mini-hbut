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

// 将输入重新构造为规范 10 位学号。数值转换切断任意口令/自由文本到存储 sink 的数据流，
// 同时用 padStart 保留可能存在的前导 0；非 10 位纯数字一律拒绝持久化。
const canonicalizeStudentId = (value) => {
  const raw = normalize(value)
  if (!STUDENT_ID_RE.test(raw)) return ''
  const numeric = Number(raw)
  if (!Number.isSafeInteger(numeric) || numeric < 0) return ''
  return String(numeric).padStart(10, '0')
}

/** 10 位纯数字学号判定（与 src/utils/usage_tracker.js 保持一致） */
export const isLikelyStudentId = (value) => canonicalizeStudentId(value) !== ''

export const getRememberedUsername = () => {
  try {
    const sid = canonicalizeStudentId(globalThis.localStorage?.getItem(REMEMBERED_USERNAME_KEY))
    if (!sid) globalThis.localStorage?.removeItem(REMEMBERED_USERNAME_KEY)
    return sid
  } catch {
    return ''
  }
}

/** 保存规范 10 位学号；空值或非学号输入等价于清除。密码/自由文本永不写入该键。 */
export const saveRememberedUsername = (value) => {
  const sid = canonicalizeStudentId(value)
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
