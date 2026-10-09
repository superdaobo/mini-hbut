/**
 * 「记住用户名」的单一读写入口（localStorage 键：hbu_username）。
 *
 * 安全说明：
 * - 本地身份保留学生学号或教师工号，另存已认证角色以隔离两类账号；
 *   密码从不写入 localStorage —— 见 credential_storage.js（Tauri 密钥环 /
 *   AES-CBC 设备密钥加密备份）。
 * - CodeQL js/clear-text-storage-of-sensitive-data 会把
 *   loadPortalStoredPassword 的返回值 taint 到本模块的写入点，但实际落盘值
 *   仅为学号（PII 而非口令）。详见 docs/security/codeql-triage-js.md。
 * - 所有 setItem/removeItem('hbu_username') 必须经此模块，禁止散落调用。
 */

import { isLikelyStudentId } from './student_id.js'
import { normalizeLoginRole } from './login_role.js'
import { normalizePortalAccountId } from './portal_account.js'

const REMEMBERED_USERNAME_KEY = 'hbu_username'
const REMEMBERED_ROLE_KEY = 'hbu_username_role'
export { isLikelyStudentId }

/** 本地缓存是“上一次账号”，不是当前已完成认证的在线身份。 */
export const getRememberedUsername = () => {
  try {
    const storage = globalThis.localStorage
    const role = normalizeLoginRole(storage?.getItem(REMEMBERED_ROLE_KEY))
    const id = normalizePortalAccountId(storage?.getItem(REMEMBERED_USERNAME_KEY), role)
    if (!id) {
      storage?.removeItem(REMEMBERED_USERNAME_KEY)
      storage?.removeItem(REMEMBERED_ROLE_KEY)
    }
    return id
  } catch {
    return ''
  }
}

/** 仅用后端确认的身份角色保存账号；默认学生以兼容旧调用方。 */
export const saveRememberedUsername = (value, role = 'student') => {
  const confirmedRole = normalizeLoginRole(role)
  const id = normalizePortalAccountId(value, confirmedRole)
  try {
    const storage = globalThis.localStorage
    if (!id) {
      storage?.removeItem(REMEMBERED_USERNAME_KEY)
      storage?.removeItem(REMEMBERED_ROLE_KEY)
      return ''
    }
    // 先存角色，再写账号。账号本身仍是纯数字身份标识，不含凭据。
    storage?.setItem(REMEMBERED_ROLE_KEY, confirmedRole)
    storage?.setItem(REMEMBERED_USERNAME_KEY, id)
  } catch {
    // 安全存储不可用时，仅影响冷启动恢复；当前会话由 Pinia 内存管理。
  }
  return id
}

export const clearRememberedUsername = () => {
  try {
    globalThis.localStorage?.removeItem(REMEMBERED_USERNAME_KEY)
    globalThis.localStorage?.removeItem(REMEMBERED_ROLE_KEY)
  } catch {
    // ignore
  }
}
