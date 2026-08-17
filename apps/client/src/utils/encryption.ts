/**
 * Web 加密工具：设备本地随机密钥，兼容旧版共享密钥密文。
 */
const DEVICE_KEY_STORAGE = 'hbu_device_crypto_key_v2'
const LEGACY_SECRET_KEY = 'hbu_grade_secret_key_2026'

export type EncryptedPayload = Record<string, unknown>

async function digestKeyMaterial(material: string): Promise<CryptoKey> {
  const data = new TextEncoder().encode(material)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return crypto.subtle.importKey('raw', hashBuffer, { name: 'AES-CBC' }, false, [
    'encrypt',
    'decrypt'
  ])
}

function ensureDeviceSecretMaterial(): string {
  let key = localStorage.getItem(DEVICE_KEY_STORAGE)
  if (!key) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    key = btoa(String.fromCharCode(...bytes))
    localStorage.setItem(DEVICE_KEY_STORAGE, key)
  }
  return key
}

const getAesKey = (): Promise<CryptoKey> => digestKeyMaterial(ensureDeviceSecretMaterial())
const getLegacyAesKey = (): Promise<CryptoKey> => digestKeyMaterial(LEGACY_SECRET_KEY)

export async function encryptData(data: EncryptedPayload): Promise<string> {
  const key = await getAesKey()
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const jsonData = new TextEncoder().encode(JSON.stringify(data))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, jsonData)
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

async function decryptWithKey(
  encryptedStr: string,
  key: CryptoKey
): Promise<EncryptedPayload> {
  const combined = Uint8Array.from(atob(encryptedStr), (character) => character.charCodeAt(0))
  if (combined.length <= 16) throw new Error('encrypted payload is too short')
  const iv = combined.slice(0, 16)
  const ciphertext = combined.slice(16)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext)
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('decrypted payload must be an object')
  }
  return parsed as EncryptedPayload
}

export async function decryptData(encryptedStr: string): Promise<EncryptedPayload> {
  const key = await getAesKey()
  try {
    return await decryptWithKey(encryptedStr, key)
  } catch {
    return decryptWithKey(encryptedStr, await getLegacyAesKey())
  }
}

export async function getKeyHint(): Promise<string> {
  const data = new TextEncoder().encode(ensureDeviceSecretMaterial())
  const hashBuffer = await crypto.subtle.digest('MD5', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8)
}
