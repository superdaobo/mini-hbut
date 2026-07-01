import {
  buildChaoxingAccountKey,
  buildHbutAccountKey,
  loadRememberedCredential,
  migrateLegacyCredential
} from '../utils/credential_storage.js'

const CHAOXING_REMEMBER_KEY = 'hbu_cx_remember'
const CHAOXING_ACCOUNT_KEY = 'hbu_cx_account'
const CHAOXING_PASSWORD_KEY = 'hbu_cx_password'

/**
 * 从安全存储加载门户账号密码（Tauri 密钥环 / Web 设备密钥加密）。
 */
export async function loadPortalStoredPassword() {
  const remember = localStorage.getItem('hbu_remember')
  const username = localStorage.getItem('hbu_username')
  if (remember === 'false' || !username) {
    return null
  }
  await migrateLegacyCredential({
    legacyPasswordKey: 'hbu_credentials',
    accountKey: buildHbutAccountKey(username)
  })
  const password = await loadRememberedCredential(buildHbutAccountKey(username))
  if (!password) return null
  return { username, password }
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
  await migrateLegacyCredential({
    legacyPasswordKey: CHAOXING_PASSWORD_KEY,
    accountKey: buildChaoxingAccountKey(account)
  })
  const password = await loadRememberedCredential(buildChaoxingAccountKey(account))
  if (!password) return null
  return { account, password }
}
