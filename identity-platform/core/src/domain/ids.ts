/**
 * 领域 ID 生成（#619 核心原则 1-2）。
 *
 * - 用户主键使用 UUIDv7（RFC 9562）：时间排序 + 随机性，不可猜、不可复用；
 * - student_id 永远不作为任何主键 / OIDC sub；
 * - 所有生成基于 CSPRNG。
 */
import { randomBytes } from 'node:crypto'

/**
 * 生成 UUIDv7 字符串。
 * 布局：48-bit 毫秒时间戳 | version 7 | 74-bit 随机 | variant 10。
 */
export function newUuidV7(): string {
  const bytes = randomBytes(16)
  const ms = Date.now()
  // 48-bit 毫秒时间戳（Date.now() ~ 1.7e12 < 2^41，Math.floor 精度安全）
  bytes[0] = Math.floor(ms / 2 ** 40) % 256
  bytes[1] = Math.floor(ms / 2 ** 32) % 256
  bytes[2] = Math.floor(ms / 2 ** 24) % 256
  bytes[3] = Math.floor(ms / 2 ** 16) % 256
  bytes[4] = Math.floor(ms / 2 ** 8) % 256
  bytes[5] = ms % 256
  // version = 7
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  // variant = 10xx
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}
