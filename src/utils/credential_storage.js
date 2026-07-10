import { invokeNative, isTauriRuntime } from '../platform/native'
import { encryptData, decryptData } from './encryption.js'

export const HBUT_CREDENTIAL_PREFIX = 'hbut:'
export const CHAOXING_CREDENTIAL_PREFIX = 'cx:'
export const CAMPUS_CREDENTIAL_PREFIX = 'campus:'

const webStorageKey = (accountKey) => `cred:${accountKey}`

/** 当前运行时会话内的门户密码缓存（退出登录后立即回填表单） */
const portalPasswordMemory = new Map()

export function buildHbutAccountKey(username) {
  return `${HBUT_CREDENTIAL_PREFIX}${String(username || '').trim()}`
}

export function buildChaoxingAccountKey(account) {
  return `${CHAOXING_CREDENTIAL_PREFIX}${String(account || '').trim()}`
}

export function buildCampusAccountKey(username) {
  return `${CAMPUS_CREDENTIAL_PREFIX}${String(username || '').trim()}`
}

export function rememberPortalPasswordInMemory(studentId, password) {
  const sid = String(studentId || '').trim()
  const value = String(password || '').trim()
  if (!sid || !value) return
  portalPasswordMemory.set(sid, value)
}

export function peekPortalPasswordInMemory(studentId) {
  return String(portalPasswordMemory.get(String(studentId || '').trim()) || '').trim()
}

async function loadEncryptedWebBackup(accountKey) {
  const raw = localStorage.getItem(webStorageKey(accountKey))
  if (!raw) return ''
  try {
    const data = await decryptData(raw)
    return String(data?.password || '').trim()
  } catch {
    return ''
  }
}

async function saveEncryptedWebBackup(accountKey, password) {
  const value = String(password || '').trim()
  if (!value) {
    localStorage.removeItem(webStorageKey(accountKey))
    return
  }
  const encrypted = await encryptData({ password: value })
  localStorage.setItem(webStorageKey(accountKey), encrypted)
}

export async function saveRememberedCredential(accountKey, password) {
  const key = String(accountKey || '').trim()
  const value = String(password || '')
  if (!key) return

  if (!value) {
    if (isTauriRuntime()) {
      try {
        await invokeNative('delete_remembered_credential', { accountKey: key })
      } catch {
        // ignore
      }
    }
    localStorage.removeItem(webStorageKey(key))
    if (key.startsWith(HBUT_CREDENTIAL_PREFIX)) {
      portalPasswordMemory.delete(key.slice(HBUT_CREDENTIAL_PREFIX.length))
    }
    return
  }

  if (isTauriRuntime()) {
    try {
      await invokeNative('save_remembered_credential', { accountKey: key, password: value })
    } catch (e) {
      console.warn('[Credential] 密钥环保存失败，已写入本地加密备份:', e)
    }
  }

  await saveEncryptedWebBackup(key, value)

  if (key.startsWith(HBUT_CREDENTIAL_PREFIX)) {
    rememberPortalPasswordInMemory(key.slice(HBUT_CREDENTIAL_PREFIX.length), value)
  }
}

export async function loadRememberedCredential(accountKey) {
  const key = String(accountKey || '').trim()
  if (!key) return ''

  if (isTauriRuntime()) {
    try {
      const loaded = await invokeNative('load_remembered_credential', { accountKey: key })
      const normalized = String(loaded || '').trim()
      if (normalized) return normalized
    } catch (e) {
      console.warn('[Credential] 密钥环读取失败，尝试本地加密备份:', e)
    }
  }

  return loadEncryptedWebBackup(key)
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
 * 加载门户「记住密码」凭据（内存缓存 + 密钥环 + 本地加密备份 + 会话学号键）。
 */
export async function loadPortalRememberedPassword(username) {
  const sid = String(username || '').trim()
  if (!sid) return ''

  const cached = peekPortalPasswordInMemory(sid)
  if (cached) return cached

  await migrateLegacyCredential({
    legacyPasswordKey: 'hbu_credentials',
    accountKey: buildHbutAccountKey(sid)
  })

  const password = await loadRememberedCredential(buildHbutAccountKey(sid))
  if (password) {
    rememberPortalPasswordInMemory(sid, password)
    return password
  }

  if (isTauriRuntime()) {
    try {
      const sessionPassword = await invokeNative('load_session_password', { studentId: sid })
      const normalized = String(sessionPassword || '').trim()
      if (normalized) {
        await saveRememberedCredential(buildHbutAccountKey(sid), normalized)
        return normalized
      }
    } catch {
      // 旧版二进制可能尚未注册 load_session_password
    }
  }

  return ''
}

/**
 * 退出登录前，把密码写入「记住密码」存储，确保登录表单可回填。
 */
export async function preservePortalRememberedPasswordOnLogout() {
  const username = String(localStorage.getItem('hbu_username') || '').trim()
  if (!username) return
  if (localStorage.getItem('hbu_remember') === 'false') return

  localStorage.setItem('hbu_remember', 'true')

  let password = peekPortalPasswordInMemory(username)
  if (!password) {
    password = await loadPortalRememberedPassword(username)
  }
  if (!password) return

  await syncPortalRememberCredential({
    username,
    studentId: username,
    password,
    remember: true
  })
}

/**
 * 加载学习通「记住密码」凭据。
 */
export async function loadChaoxingRememberedPassword(account) {
  const normalized = String(account || '').trim()
  if (!normalized) return ''

  await migrateLegacyCredential({
    legacyPasswordKey: 'hbu_cx_password',
    accountKey: buildChaoxingAccountKey(normalized)
  })

  return loadRememberedCredential(buildChaoxingAccountKey(normalized))
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
  if (sid) rememberPortalPasswordInMemory(sid, value)
  if (loginName) rememberPortalPasswordInMemory(loginName, value)
  localStorage.removeItem('hbu_credentials')
}

/**
 * 已登录状态下，把密钥环/会话中的密码同步到本地备份，供退出后表单回填。
 */
export async function ensureRememberedPasswordCached(username) {
  const sid = String(username || '').trim()
  if (!sid) return
  if (localStorage.getItem('hbu_remember') === 'false') return

  const existing = await loadPortalRememberedPassword(sid)
  if (existing) {
    await syncPortalRememberCredential({
      username: sid,
      studentId: sid,
      password: existing,
      remember: true
    })
    return
  }

  if (!isTauriRuntime()) return

  try {
    const sessionPassword = String(
      (await invokeNative('load_session_password', { studentId: sid })) || ''
    ).trim()
    if (!sessionPassword) return
    await syncPortalRememberCredential({
      username: sid,
      studentId: sid,
      password: sessionPassword,
      remember: true
    })
  } catch {
    // 忽略：旧版二进制或密钥环不可用时，依赖用户下次手动登录写入备份
  }
}
