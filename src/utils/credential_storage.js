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
  if (existing) return

  const legacy = String(legacyPlaintext || localStorage.getItem(legacyPasswordKey) || '').trim()
  if (!legacy) return

  await saveRememberedCredential(key, legacy)
  if (legacyPasswordKey) {
    localStorage.removeItem(legacyPasswordKey)
  }
}
