/**
 * Client Secret 存储方案（#619 / #617 信任边界第 4 条）。
 *
 * 方案：application-layer 加密 + KEK
 * - 数据库只存 AES-256-GCM 密文（client_secret_encrypted 列）；
 * - KEK 只存在环境变量 IDENTITY_CLIENT_SECRET_KEK（Vercel Core Production secret）；
 * - oidc-provider Client Adapter 在服务端内存中解密后参与 client 认证；
 * - 前端/审计/日志永远拿不到明文。
 *
 * 密文格式：enc:v1:<base64url(iv)>:<base64url(tag)>:<base64url(ciphertext)>
 * AAD 固定为 'minihbut:client_secret:v1'，防止密文被跨用途重放。
 *
 * 实现前已按 issue 要求基于 oidc-provider v9 Client auth 行为写了集成测试
 * （tests/oidc/），验证：解密后的明文 client_secret 能被 provider 用于
 * client_secret_basic 认证（compareClientSecret）。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { assertKeyMaterial } from './hash.js'

const ALGO = 'aes-256-gcm'
const VERSION = 'v1'
const AAD = Buffer.from('minihbut:client_secret:v1', 'utf8')
const IV_LENGTH = 12
const TAG_LENGTH = 16

/** 校验 KEK：AES-256 要求 32 字节密钥（UTF-8 长度不足直接拒绝） */
function normalizeKek(kek: string | undefined): Buffer {
  assertKeyMaterial(kek, 'IDENTITY_CLIENT_SECRET_KEK')
  const buf = Buffer.from(kek as string, 'utf8')
  if (buf.length !== 32) {
    throw new Error(
      `[security] IDENTITY_CLIENT_SECRET_KEK 必须是 32 字节（当前 ${buf.length}），fail closed`,
    )
  }
  return buf
}

/** 加密 client_secret，返回 enc:v1:... 格式密文 */
export function encryptClientSecret(kek: string | undefined, plaintext: string): string {
  const key = normalizeKek(kek)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv)
  cipher.setAAD(AAD)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    'enc',
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

/** 解密 client_secret；格式非法 / 篡改 / KEK 不符都会抛错（fail closed） */
export function decryptClientSecret(kek: string | undefined, encrypted: string): string {
  const key = normalizeKek(kek)
  const parts = encrypted.split(':')
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== VERSION) {
    throw new Error('[security] client_secret 密文格式非法')
  }
  const [, , ivB64, tagB64, ctB64] = parts as [string, string, string, string, string]
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const ciphertext = Buffer.from(ctB64, 'base64url')
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('[security] client_secret 密文参数长度非法')
  }
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAAD(AAD)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}

/** 判断当前 KEK 是否已配置（供调用方提前 fail closed / 引导报错） */
export function isKekConfigured(kek: string | undefined): boolean {
  try {
    normalizeKek(kek)
    return true
  } catch {
    return false
  }
}
