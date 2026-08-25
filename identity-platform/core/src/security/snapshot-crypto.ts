/**
 * 授权数据快照加解密（#700，父 #697）。
 *
 * 方案：application-layer AES-256-GCM 整体加密（与 client-secret.ts 同范式）
 * - 数据库只存密文（data_snapshots.payload_enc），明文成绩/课表绝不落库；
 * - KEK 复用 IDENTITY_CLIENT_SECRET_KEK：
 *   - production 缺失/不足 32 字节 → fail closed（抛错拒绝服务，绝不静默降级）；
 *   - development/test 缺失 → 固定开发常量回退 + 告警（照 api-key.ts getPepper 风格）；
 * - 密文格式：enc:v1:<base64url(iv)>:<base64url(tag)>:<base64url(ciphertext)>；
 * - AAD 固定为 'minihbut:data_snapshot:v1'，防止 client_secret 等其他用途的
 *   密文被跨用途重放到快照字段（反之亦然）。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const VERSION = 'v1'
const AAD = Buffer.from('minihbut:data_snapshot:v1', 'utf8')
const IV_LENGTH = 12
const TAG_LENGTH = 16

/**
 * 快照 KEK：复用 KEK 环境变量。
 * - production：缺失/不足 32 字节直接抛错（fail closed）；
 * - 非生产：回退开发常量并告警（便于本地/测试跑通）。
 */
function getSnapshotKek(): Buffer {
  const raw = process.env.IDENTITY_CLIENT_SECRET_KEK
  if (raw && Buffer.from(raw, 'utf8').length === 32) {
    return Buffer.from(raw, 'utf8')
  }
  if ((process.env.IDENTITY_ENVIRONMENT ?? 'development').trim().toLowerCase() === 'production') {
    throw new Error(
      '[security] IDENTITY_CLIENT_SECRET_KEK 必须是 32 字节，数据快照无法安全加密（fail closed）',
    )
  }
  // eslint-disable-next-line no-console
  console.error('[security] 开发/测试环境使用固定数据快照密钥——严禁用于生产')
  return Buffer.from('mini-hbut-dev-data-snapshot-kek!!', 'utf8').subarray(0, 32)
}

/** 加密快照 JSON 明文，返回 enc:v1:... 格式密文 */
export function encryptSnapshot(plaintextJson: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, getSnapshotKek(), iv)
  cipher.setAAD(AAD)
  const ciphertext = Buffer.concat([cipher.update(plaintextJson, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    'enc',
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

/** 解密快照；格式非法 / 篡改 / KEK 不符都会抛错（fail closed，调用方按内部错误处理） */
export function decryptSnapshot(encrypted: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== VERSION) {
    throw new Error('[security] 数据快照密文格式非法')
  }
  const [, , ivB64, tagB64, ctB64] = parts as [string, string, string, string, string]
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const ciphertext = Buffer.from(ctB64, 'base64url')
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('[security] 数据快照密文参数长度非法')
  }
  const decipher = createDecipheriv(ALGO, getSnapshotKek(), iv)
  decipher.setAAD(AAD)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
