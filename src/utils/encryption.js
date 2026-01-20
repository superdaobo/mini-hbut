/**
 * 加密工具模块
 * 使用 AES-256-CBC 加密前后端通信数据
 */

// 共享密钥（需要与后端保持一致）
const SECRET_KEY = 'hbu_grade_secret_key_2026';

/**
 * 生成 AES 密钥（使用 SHA-256）
 */
async function getAesKey() {
  const encoder = new TextEncoder();
  const data = encoder.encode(SECRET_KEY);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-CBC' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 加密数据
 * @param {Object} data - 要加密的数据对象
 * @returns {Promise<string>} - Base64 编码的加密字符串
 */
export async function encryptData(data) {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const jsonData = encoder.encode(JSON.stringify(data));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    jsonData
  );
  
  // 合并 IV 和密文
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Base64 编码
  return btoa(String.fromCharCode(...combined));
}

/**
 * 解密数据
 * @param {string} encryptedStr - Base64 编码的加密字符串
 * @returns {Promise<Object>} - 解密后的数据对象
 */
export async function decryptData(encryptedStr) {
  const key = await getAesKey();
  
  // Base64 解码
  const combined = Uint8Array.from(atob(encryptedStr), c => c.charCodeAt(0));
  
  // 提取 IV 和密文
  const iv = combined.slice(0, 16);
  const ciphertext = combined.slice(16);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    key,
    ciphertext
  );
  
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}

/**
 * 获取密钥提示（用于验证前后端密钥是否匹配）
 */
export async function getKeyHint() {
  const encoder = new TextEncoder();
  const data = encoder.encode(SECRET_KEY);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}
