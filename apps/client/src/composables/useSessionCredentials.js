import {
  buildChaoxingAccountKey,
  buildHbutAccountKey,
  loadChaoxingRememberedPassword,
  loadPortalRememberedPassword
} from '../utils/credential_storage.js'
import { invokeNative, isTauriRuntime } from '../platform/native'

const CHAOXING_REMEMBER_KEY = 'hbu_cx_remember'
const CHAOXING_ACCOUNT_KEY = 'hbu_cx_account'
const CHAOXING_PASSWORD_KEY = 'hbu_cx_password'

/**
 * 从安全存储加载门户账号密码（Tauri 密钥环 / Web 设备密钥加密）。
 *
 * 注意：即使前端未勾选「记住密码」（hbu_remember === 'false'），
 * 后端 login 命令仍无条件把密码写入 SQLite user_sessions（密钥环可用时写
 * __keyring__ 标记）。因此前端判定为「未保存」时还需查询后端
 * has_restorable_credentials，避免误报红灯（#520）。
 */
export async function loadPortalStoredPassword() {
  const username = String(localStorage.getItem('hbu_username') || '').trim()
  if (!username) return null
  const remember = localStorage.getItem('hbu_remember')
  // 勾选过「记住密码」：优先走密钥环 / 本地加密备份
  if (remember !== 'false') {
    const password = await loadPortalRememberedPassword(username)
    if (password) return { username, password, backendRestorable: false }
  }
  // 未勾选或密钥环缺失：后端 DB 仍无条件保存密码，可静默重登
  if (isTauriRuntime()) {
    try {
      const restorable = await invokeNative('has_restorable_credentials', {
        studentId: username
      })
      if (restorable) {
        return { username, password: '', backendRestorable: true }
      }
    } catch {
      // 旧版二进制可能未注册该命令，忽略并走原有判定
    }
  }
  return null
}

/**
 * 从安全存储加载学习通账号密码。
 */
export async function loadChaoxingStoredPassword() {
  const remember = localStorage.getItem(CHAOXING_REMEMBER_KEY)
  const account = String(localStorage.getItem(CHAOXING_ACCOUNT_KEY) || '').trim()
  if (remember === 'false' || !account) {
    return null
  }
  const password = await loadChaoxingRememberedPassword(account)
  if (!password) return null
  return { account, password }
}
