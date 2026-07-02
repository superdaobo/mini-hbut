/**
 * 加密工具模块
 * Web 路径使用设备本地随机密钥；不再使用硬编码共享密钥。
 */

const DEVICE_KEY_STORAGE = 'hbu_device_crypto_key_v2'
const LEGACY_SECRET_KEY = 'hbu_grade_secret_key_2026'

async function digestKeyMaterial(material) {
  const encoder = new TextEncoder()
  const data = encoder.encode(material)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-CBC' },
    false,
    ['encrypt', 'decrypt']
  )
}

function ensureDeviceSecretMaterial() {
  let key = localStorage.getItem(DEVICE_KEY_STORAGE)
  if (!key) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    key = btoa(String.fromCharCode(...bytes))
    localStorage.setItem(DEVICE_KEY_STORAGE, key)
  }
  return key
}

async function getAesKey() {
  return digestKeyMaterial(ensureDeviceSecretMaterial())
}

async function getLegacyAesKey() {
  return digestKeyMaterial(LEGACY_SECRET_KEY)
}

/**
 * 加密数据
 * @param {Object} data - 要加密的数据对象
 * @returns {Promise<string>} - Base64 编码的加密字符串
 */
export async function encryptData(data) {
  const key = await getAesKey()
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const encoder = new TextEncoder()
  const jsonData = encoder.encode(JSON.stringify(data))

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    jsonData
  )

  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return btoa(String.fromCharCode(...combined))
}

async function decryptWithKey(encryptedStr, key) {
  const combined = Uint8Array.from(atob(encryptedStr), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 16)
  const ciphertext = combined.slice(16)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    key,
    ciphertext
  )

  const decoder = new TextDecoder()
  return JSON.parse(decoder.decode(decrypted))
}

/**
 * 解密数据（兼容旧版硬编码密钥密文）
 * @param {string} encryptedStr - Base64 编码的加密字符串
 * @returns {Promise<Object>} - 解密后的数据对象
 */
export async function decryptData(encryptedStr) {
  const key = await getAesKey()
  try {
    return await decryptWithKey(encryptedStr, key)
  } catch {
    const legacyKey = await getLegacyAesKey()
    return decryptWithKey(encryptedStr, legacyKey)
  }
}

/**
 * 获取密钥提示（用于验证前后端密钥是否匹配）
 */
export async function getKeyHint() {
  const encoder = new TextEncoder()
  const data = encoder.encode(ensureDeviceSecretMaterial())
  const hashBuffer = await crypto.subtle.digest('MD5', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 8)
}
