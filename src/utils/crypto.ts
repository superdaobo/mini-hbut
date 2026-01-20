/**
 * CAS 登录密码加密工具
 * 使用 AES-CBC 模式加密，模拟学校 CAS 前端的 encrypt.js 逻辑
 */

// 生成随机字符串（与学校 CAS 前端相同的字符集）
function getRandomString(length: number = 64): string {
  const chars = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678"
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  return result
}

// 字符串转 Uint8Array
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

// Uint8Array 转 Base64
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}


/**
 * 使用 AES-CBC 加密密码
 * @param password 原始密码
 * @param salt 加密盐值（16字节，同时作为 key 和 IV）
 * @returns Base64 编码的加密密码
 */
export async function encryptPassword(password: string, salt: string): Promise<string> {
  if (!salt || salt.length !== 16) {
    console.error('Invalid salt length:', salt?.length)
    throw new Error('加密盐值无效')
  }

  // 生成随机前缀 + 密码
  const randomPrefix = getRandomString(64)
  const plainText = randomPrefix + password

  // 转换为字节数组
  const keyBytes = stringToBytes(salt)
  const ivBytes = stringToBytes(salt)  // CAS 使用 salt 同时作为 key 和 IV
  const dataBytes = stringToBytes(plainText) // Web Crypto API 会自动处理填充

  // 使用 Web Crypto API 进行 AES-CBC 加密
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as any,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  )

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: ivBytes as any },
    key,
    dataBytes as any
  )

  // 返回 Base64 编码
  return bytesToBase64(new Uint8Array(encrypted))
}
