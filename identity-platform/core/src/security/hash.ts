/**
 * 哈希 / HMAC 原语（#619）。
 *
 * 用途约定：
 * - sha256Hex / sha256Base64url：对【高熵随机值】做不可逆摘要
 *   （handoff secret、enrollment challenge、scope_hash、设备指纹）；
 * - hmacSha256：带密钥的派生（handoff HMAC、pairwise sub）。
 *
 * 安全要求：
 * - 所有密钥材料只来自环境变量，禁止硬编码；
 * - 密钥缺失/占位时 fail closed（抛错），绝不静默降级。
 */
import { createHash, createHmac } from 'node:crypto'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function sha256Base64url(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url')
}

/** HMAC-SHA256，base64url 输出（key 缺失/占位/过短时 fail closed） */
export function hmacSha256Base64url(key: string | undefined, value: string): string {
  assertKeyMaterial(key, 'HMAC key')
  return createHmac('sha256', key).update(value, 'utf8').digest('base64url')
}

/** 校验密钥材料：非空、不含占位符、长度足够，否则抛错（fail closed） */
export function assertKeyMaterial(
  key: string | undefined,
  label: string,
): asserts key is string {
  if (!key || typeof key !== 'string') {
    throw new Error(`[security] ${label} 未配置（fail closed）`)
  }
  if (key.includes('<') || key.includes('>')) {
    throw new Error(`[security] ${label} 仍是占位值，禁止使用（fail closed）`)
  }
  // 密钥最低 32 字节/字符（HMAC 建议 >= 32）
  if (key.length < 32) {
    throw new Error(`[security] ${label} 长度不足 32，拒绝使用（fail closed）`)
  }
}
