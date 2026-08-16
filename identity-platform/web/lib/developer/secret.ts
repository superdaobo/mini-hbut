/**
 * Client Secret 生命周期工具（纯函数）。
 *
 * 规则（issue #624 Credentials）：
 *  - secret 只在 create/rotate 的响应中返回一次；
 *  - 之后任何 GET 只显示 fingerprint / 末 4 位 / 创建与上次轮换时间；
 *  - rotate 生成新 secret（旧值立即失效），audit 只记「secret.rotated」，永不记录 secret 值；
 *  - native_public 不生成 secret（PKCE S256）。
 */

import { createHash, randomBytes } from 'node:crypto'

/** 生成 32 字节 URL-safe secret（与 core security/random.ts 的 newRandomSecret 语义一致） */
export function generateClientSecret(): string {
  return randomBytes(32).toString('base64url')
}

/** secret 指纹：sha256:<hex 前 16 位>，用于人工核对，不泄露 secret */
export function secretFingerprint(secret: string): string {
  const digest = createHash('sha256').update(secret, 'utf8').digest('hex')
  return `sha256:${digest.slice(0, 16)}`
}

/** secret 末 4 位（对账用） */
export function secretLast4(secret: string): string {
  return secret.slice(-4)
}

/** 把 secret 加工为「只读元数据」：任何 GET 只能看到这些，看不到明文 */
export function secretMetadataFromSecret(secret: string, createdAt: string, rotatedAt: string | null) {
  return {
    created_at: createdAt,
    last_rotated_at: rotatedAt,
    fingerprint: secretFingerprint(secret),
    last4: secretLast4(secret),
  }
}
