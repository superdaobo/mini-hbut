import { invokeNative, isTauriRuntime } from '../platform/native'
import { decryptData, encryptData } from './encryption'
import { isAppStoreBuild } from '../config/app_store_policy'

export const HBUT_CREDENTIAL_PREFIX = 'hbut:'
export const CHAOXING_CREDENTIAL_PREFIX = 'cx:'
export const CAMPUS_CREDENTIAL_PREFIX = 'campus:'

interface LegacyCredentialMigrationInput {
  legacyPasswordKey?: string
  legacyPlaintext?: string
  accountKey: string
}

interface PortalRememberCredentialInput {
  username?: string | null
  studentId?: string | null
  password?: string | null
  remember?: boolean
}

const webStorageKey = (accountKey: string): string => `cred:${accountKey}`
const portalPasswordMemory = new Map<string, string>()

export const buildHbutAccountKey = (username: unknown): string =>
  `${HBUT_CREDENTIAL_PREFIX}${String(username ?? '').trim()}`

export const buildChaoxingAccountKey = (account: unknown): string =>
  `${CHAOXING_CREDENTIAL_PREFIX}${String(account ?? '').trim()}`

export const buildCampusAccountKey = (username: unknown): string =>
  `${CAMPUS_CREDENTIAL_PREFIX}${String(username ?? '').trim()}`

export function rememberPortalPasswordInMemory(studentId: unknown, password: unknown): void {
  const sid = String(studentId ?? '').trim()
  const value = String(password ?? '').trim()
  if (sid && value) portalPasswordMemory.set(sid, value)
}

export function peekPortalPasswordInMemory(studentId: unknown): string {
  return String(portalPasswordMemory.get(String(studentId ?? '').trim()) ?? '').trim()
}

async function loadEncryptedWebBackup(accountKey: string): Promise<string> {
  const raw = localStorage.getItem(webStorageKey(accountKey))
  if (!raw) return ''
  try {
    const data = await decryptData(raw)
    return String(data.password ?? '').trim()
  } catch {
    return ''
  }
}

async function saveEncryptedWebBackup(accountKey: string, password: unknown): Promise<void> {
  const value = String(password ?? '').trim()
  if (!value) {
    localStorage.removeItem(webStorageKey(accountKey))
    return
  }
  localStorage.setItem(webStorageKey(accountKey), await encryptData({ password: value }))
}

export async function saveRememberedCredential(
  accountKey: unknown,
  password: unknown
): Promise<void> {
  const key = String(accountKey ?? '').trim()
  const value = String(password ?? '')
  if (!key) return

  if (!value) {
    if (isTauriRuntime()) {
      try {
        await invokeNative('delete_remembered_credential', { accountKey: key })
      } catch {
        // 旧版原生端可能尚未提供该命令。
      }
    }
    localStorage.removeItem(webStorageKey(key))
    if (key.startsWith(HBUT_CREDENTIAL_PREFIX)) {
      portalPasswordMemory.delete(key.slice(HBUT_CREDENTIAL_PREFIX.length))
    }
    return
  }

  if (isAppStoreBuild()) {
    if (isTauriRuntime()) {
      try {
        await invokeNative('save_remembered_credential', { accountKey: key, password: value })
      } catch {
        // App Store 构建不回退 localStorage。
      }
    }
    localStorage.removeItem(webStorageKey(key))
    if (key.startsWith(HBUT_CREDENTIAL_PREFIX)) {
      rememberPortalPasswordInMemory(key.slice(HBUT_CREDENTIAL_PREFIX.length), value)
    }
    return
  }

  if (isTauriRuntime()) {
    try {
      await invokeNative('save_remembered_credential', { accountKey: key, password: value })
    } catch (error: unknown) {
      console.warn('[Credential] 密钥环保存失败，已写入本地加密备份:', error)
    }
  }

  await saveEncryptedWebBackup(key, value)
  if (key.startsWith(HBUT_CREDENTIAL_PREFIX)) {
    rememberPortalPasswordInMemory(key.slice(HBUT_CREDENTIAL_PREFIX.length), value)
  }
}

export async function loadRememberedCredential(accountKey: unknown): Promise<string> {
  const key = String(accountKey ?? '').trim()
  if (!key) return ''

  if (isTauriRuntime()) {
    try {
      const loaded: unknown = await invokeNative('load_remembered_credential', { accountKey: key })
      const normalized = String(loaded ?? '').trim()
      if (normalized) return normalized
    } catch (error: unknown) {
      console.warn('[Credential] 密钥环读取失败，尝试本地加密备份:', error)
    }
  }
  return loadEncryptedWebBackup(key)
}

export async function deleteRememberedCredential(accountKey: unknown): Promise<void> {
  await saveRememberedCredential(accountKey, '')
}

async function readLegacyStoredPassword(
  legacyPasswordKey?: string,
  legacyPlaintext = ''
): Promise<string> {
  const raw = String(
    legacyPlaintext || (legacyPasswordKey ? localStorage.getItem(legacyPasswordKey) : '') || ''
  ).trim()
  if (!raw) return ''

  try {
    const decrypted = await decryptData(raw)
    const password = String(decrypted.password ?? '').trim()
    if (password) return password
  } catch {
    // 非 AES 密文。
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const password = String((parsed as Record<string, unknown>).password ?? '').trim()
      if (password) return password
    }
  } catch {
    // 非 JSON。
  }
  return raw
}

export async function migrateLegacyCredential({
  legacyPasswordKey,
  legacyPlaintext = '',
  accountKey
}: LegacyCredentialMigrationInput): Promise<void> {
  const key = String(accountKey ?? '').trim()
  if (!key) return

  const existing = await loadRememberedCredential(key)
  const legacyRaw = legacyPasswordKey
    ? String(localStorage.getItem(legacyPasswordKey) ?? '').trim()
    : String(legacyPlaintext ?? '').trim()
  if (existing && !legacyRaw) return

  const legacy = await readLegacyStoredPassword(legacyPasswordKey, legacyPlaintext)
  if (!legacy) return
  await saveRememberedCredential(key, legacy)

  const verified = String((await loadRememberedCredential(key)) ?? '').trim()
  if (verified !== legacy) {
    console.warn('[Credential] 旧凭据迁移后校验失败，保留 legacy 键以便下次重试:', key)
    return
  }
  if (legacyPasswordKey) localStorage.removeItem(legacyPasswordKey)
}

export async function loadPortalRememberedPassword(username: unknown): Promise<string> {
  const sid = String(username ?? '').trim()
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
      const sessionPassword: unknown = await invokeNative('load_session_password', { studentId: sid })
      const normalized = String(sessionPassword ?? '').trim()
      if (normalized) {
        await saveRememberedCredential(buildHbutAccountKey(sid), normalized)
        return normalized
      }
    } catch {
      // 旧版二进制可能尚未注册命令。
    }
  }
  return ''
}

export async function preservePortalRememberedPasswordOnLogout(): Promise<void> {
  const username = String(localStorage.getItem('hbu_username') ?? '').trim()
  if (!username || localStorage.getItem('hbu_remember') === 'false') return
  localStorage.setItem('hbu_remember', 'true')
  const password = peekPortalPasswordInMemory(username) || (await loadPortalRememberedPassword(username))
  if (!password) return
  await syncPortalRememberCredential({ username, studentId: username, password, remember: true })
}

export async function loadChaoxingRememberedPassword(account: unknown): Promise<string> {
  const normalized = String(account ?? '').trim()
  if (!normalized) return ''
  await migrateLegacyCredential({
    legacyPasswordKey: 'hbu_cx_password',
    accountKey: buildChaoxingAccountKey(normalized)
  })
  return loadRememberedCredential(buildChaoxingAccountKey(normalized))
}

export async function syncPortalRememberCredential({
  username,
  studentId,
  password,
  remember = true
}: PortalRememberCredentialInput): Promise<void> {
  if (!remember) return
  const value = String(password ?? '').trim()
  if (!value) return

  const keys = new Set<string>()
  const loginName = String(username ?? '').trim()
  const sid = String(studentId ?? '').trim()
  if (loginName) keys.add(buildHbutAccountKey(loginName))
  if (sid) keys.add(buildHbutAccountKey(sid))
  for (const accountKey of keys) await saveRememberedCredential(accountKey, value)
  if (sid) rememberPortalPasswordInMemory(sid, value)
  if (loginName) rememberPortalPasswordInMemory(loginName, value)
  localStorage.removeItem('hbu_credentials')
}

export async function ensureRememberedPasswordCached(username: unknown): Promise<void> {
  const sid = String(username ?? '').trim()
  if (!sid || localStorage.getItem('hbu_remember') === 'false') return
  const existing = await loadPortalRememberedPassword(sid)
  if (existing) {
    await syncPortalRememberCredential({ username: sid, studentId: sid, password: existing })
    return
  }
  if (!isTauriRuntime()) return
  try {
    const loaded: unknown = await invokeNative('load_session_password', { studentId: sid })
    const sessionPassword = String(loaded ?? '').trim()
    if (sessionPassword) {
      await syncPortalRememberCredential({ username: sid, studentId: sid, password: sessionPassword })
    }
  } catch {
    // 密钥环不可用时等待下次手动登录。
  }
}
