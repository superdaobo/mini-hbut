/**
 * 「记住用户名」的单一读写入口（localStorage 键：hbu_username）。
 *
 * 安全说明：
 * - 该键只保存合法学号（当前兼容 9 位研究生 / 10 位本科生）；
 *   密码从不写入 localStorage —— 见 credential_storage.js（Tauri 密钥环 /
 *   AES-CBC 设备密钥加密备份）。
 * - CodeQL js/clear-text-storage-of-sensitive-data 会把
 *   loadPortalStoredPassword 的返回值 taint 到本模块的写入点，但实际落盘值
 *   仅为学号（PII 而非口令）。详见 docs/security/codeql-triage-js.md。
 * - 所有 setItem/removeItem('hbu_username') 必须经此模块，禁止散落调用。
 */

import {
  normalizeStudentId as canonicalizeStudentId,
  isLikelyStudentId
} from './student_id.js'

const REMEMBERED_USERNAME_KEY = 'hbu_username'
export { isLikelyStudentId }

export const getRememberedUsername = () => {
  try {
    const sid = canonicalizeStudentId(globalThis.localStorage?.getItem(REMEMBERED_USERNAME_KEY))
    if (!sid) globalThis.localStorage?.removeItem(REMEMBERED_USERNAME_KEY)
    return sid
  } catch {
    return ''
  }
}

/** 保存规范学号；空值或非法学号输入等价于清除。密码/自由文本永不写入该键。 */
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
