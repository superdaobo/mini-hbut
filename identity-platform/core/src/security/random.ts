/**
 * 随机值生成（#619）。
 * 全部基于 node:crypto 的 CSPRNG，禁止 Math.random 参与任何密钥/secret 生成。
 */
import { randomBytes } from 'node:crypto'

/** 生成 base64url 随机串（默认 32 字节 = 256-bit） */
export function newRandomSecret(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url')
}

/** 生成带前缀的随机 ID（如 request_id / client_id） */
export function newPrefixedRandomId(prefix: string, byteLength = 16): string {
  return `${prefix}_${randomBytes(byteLength).toString('base64url')}`
}
