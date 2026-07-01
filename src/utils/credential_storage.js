import { invokeNative, isTauriRuntime } from '../platform/native'
import { encryptData, decryptData } from './encryption.js'

export const HBUT_CREDENTIAL_PREFIX = 'hbut:'
export const CHAOXING_CREDENTIAL_PREFIX = 'cx:'

const webStorageKey = (accountKey) => `cred:${accountKey}`

export function buildHbutAccountKey(username) {
  return `${HBUT_CREDENTIAL_PREFIX}${String(username || '').trim()}`
}

export function buildChaoxingAccountKey(account) {
  return `${CHAOXING_CREDENTIAL_PREFIX}${String(account || '').trim()}`
}

export async function saveRememberedCredential(accountKey, password) {
  const key = String(accountKey || '').trim()
  const value = String(password || '')
  if (!key) return

  if (isTauriRuntime()) {
    if (!value) {
      await invokeNative('delete_remembered_credential', { accountKey: key })
      return
    }
    await invokeNative('save_remembered_credential', { accountKey: key, password: value })
    return
  }

  if (!value) {
    localStorage.removeItem(webStorageKey(key))
    return
  }
  const encrypted = await encryptData({ password: value })
  localStorage.setItem(webStorageKey(key), encrypted)
}

export async function loadRememberedCredential(accountKey) {
  const key = String(accountKey || '').trim()
  if (!key) return ''

  if (isTauriRuntime()) {
    const loaded = await invokeNative('load_remembered_credential', { accountKey: key })
    return String(loaded || '')
  }

  const raw = localStorage.getItem(webStorageKey(key))
  if (!raw) return ''
  try {
    const data = await decryptData(raw)
    return String(data?.password || '')
  } catch {
    return ''
  }
}

export async function deleteRememberedCredential(accountKey) {
  await saveRememberedCredential(accountKey, '')
}

/**
 * 读取旧版 localStorage 凭据（支持 AES 密文、JSON、明文）。
 */
async function readLegacyStoredPassword(legacyPasswordKey, legacyPlaintext = '') {
  const raw = String(legacyPlaintext || localStorage.getItem(legacyPasswordKey) || '').trim()
  if (!raw) return ''

  try {
    const decrypted = await decryptData(raw)
    const password = String(decrypted?.password || '').trim()
    if (password) return password
  } catch {
    // 非 AES 密文，继续尝试其它格式
  }

  try {
    const parsed = JSON.parse(raw)
    const password = String(parsed?.password || '').trim()
    if (password) return password
  } catch {
    // 非 JSON
  }

  return raw
}

/**
 * 迁移旧版 localStorage 明文/旧键名凭据到安全存储。
 */
export async function migrateLegacyCredential({
  legacyPasswordKey,
  legacyPlaintext,
  accountKey
}) {
  const key = String(accountKey || '').trim()
  if (!key) return

  const existing = await loadRememberedCredential(key)
  const legacyRaw = legacyPasswordKey
    ? String(localStorage.getItem(legacyPasswordKey) || '').trim()
    : String(legacyPlaintext || '').trim()
  if (existing && !legacyRaw) return

  const legacy = await readLegacyStoredPassword(legacyPasswordKey, legacyPlaintext)
  if (!legacy) return

  await saveRememberedCredential(key, legacy)
  if (legacyPasswordKey) {
    localStorage.removeItem(legacyPasswordKey)
  }
}

/**
 * 登录成功后，将记住密码同步到学号/账号多个键，避免 username 与 student_id 不一致。
 */
export async function syncPortalRememberCredential({
  username,
  studentId,
  password,
  remember = true
}) {
  if (!remember) return
  const value = String(password || '').trim()
  if (!value) return

  const keys = new Set()
  const loginName = String(username || '').trim()
  const sid = String(studentId || '').trim()
  if (loginName) keys.add(buildHbutAccountKey(loginName))
  if (sid) keys.add(buildHbutAccountKey(sid))

  for (const accountKey of keys) {
    await saveRememberedCredential(accountKey, value)
  }
  localStorage.removeItem('hbu_credentials')
}
