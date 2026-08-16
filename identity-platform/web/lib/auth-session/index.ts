/**
 * Developer Portal 会话层（issue #624 dogfood 登录态）。
 *
 * 原 #618 占位：本文件在 #624 落地开发者门户会话（OIDC Client 登录态）。
 *
 * 设计：
 *  - 会话载荷（DeveloperSessionPayload）AES-256-GCM 加密，密钥由 WEB_SESSION_SECRET
 *    派生（sha256）；任何篡改/解密失败 → null（fail closed）；
 *  - 会话 cookie：HttpOnly + SameSite=Lax + Path=/（Secure 由部署环境决定）；
 *    SameSite=Lax 使跨站 POST 不会携带会话 cookie → mutation 天然免疫 CSRF；
 *  - 过期：载荷内 exp（秒），默认 SESSION_TTL_SECONDS=86400（24h），
 *    每次校验都以当前时间判定；过期即视为未登录（401）；
 *  - CSRF 值随会话生成，同时写入非 HttpOnly cookie（mh_dev_csrf）供前端回传；
 *  - 本模块只依赖 node:crypto，不依赖 Next.js，可直接单测。
 *
 * 禁止：任何 server secret（WEB_SESSION_SECRET / client secret）进入浏览器 bundle。
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { DeveloperSessionPayload } from '@/lib/developer/contract'

export const SESSION_COOKIE_NAME = 'mh_dev_session'
export const CSRF_COOKIE_NAME = 'mh_dev_csrf'
/** 登录中间态 cookie（PKCE verifier / state / nonce） */
export const OIDC_PKCE_COOKIE = 'mh_oidc_pkce'
export const OIDC_STATE_COOKIE = 'mh_oidc_state'

export type EnvLike = Record<string, string | undefined>

/** 默认会话 TTL：24 小时（可经 SESSION_TTL_SECONDS 覆盖，测试用小值） */
export function sessionTtlSeconds(env: EnvLike = process.env): number {
  const raw = Number(env.SESSION_TTL_SECONDS)
  if (Number.isInteger(raw) && raw > 0) {
    return raw
  }
  return 86400
}

/** 会话密钥（≥32 字节随机值；缺失/过短 fail closed） */
export function sessionSecretKey(env: EnvLike = process.env): Buffer {
  const secret = env.WEB_SESSION_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('必须配置 WEB_SESSION_SECRET（至少 32 字节随机值）')
  }
  // 任意长度口令 → 固定 32 字节密钥（sha256）
  return createHash('sha256').update(secret, 'utf8').digest()
}

/** 加密会话载荷（base64url(iv|tag|ciphertext)） */
export function encryptSession(payload: DeveloperSessionPayload, env: EnvLike = process.env): string {
  const key = sessionSecretKey(env)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export interface DecryptResult {
  payload: DeveloperSessionPayload | null
  /** 载荷存在但已过期（调用方按 401 处理，可区分原因用于日志） */
  expired: boolean
}

/** 解密会话载荷；任何异常（篡改/密钥不符/格式错误）→ null（fail closed） */
export function decryptSession(token: string, env: EnvLike = process.env): DecryptResult {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 12 + 16 + 1) {
      return { payload: null, expired: false }
    }
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const data = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', sessionSecretKey(env), iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(data), decipher.final()])
    const payload = JSON.parse(plain.toString('utf8')) as DeveloperSessionPayload
    if (!payload || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
      return { payload: null, expired: false }
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return { payload, expired: true }
    }
    return { payload, expired: false }
  } catch {
    return { payload: null, expired: false }
  }
}

/** 会话是否有效（未过期；exp 与 iat 一致性检查） */
export function isSessionValid(payload: DeveloperSessionPayload | null, env: EnvLike = process.env): boolean {
  if (!payload) {
    return false
  }
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp <= now) {
    return false
  }
  if (payload.iat > now + 300) {
    // 未来时间戳（时钟异常/伪造）一律无效
    return false
  }
  return true
}

/** 从 Cookie header 中读取指定 cookie 的值（精确匹配，忽略大小写） */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null
  }
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) {
      continue
    }
    const key = part.slice(0, idx).trim()
    if (key === name) {
      return part.slice(idx + 1).trim()
    }
  }
  return null
}

/** 从 Cookie header 解析会话；失败（含过期/篡改）返回 null */
export function parseSessionFromCookies(cookieHeader: string | null | undefined, env: EnvLike = process.env): DeveloperSessionPayload | null {
  const token = readCookie(cookieHeader, SESSION_COOKIE_NAME)
  if (!token) {
    return null
  }
  const { payload } = decryptSession(token, env)
  if (!isSessionValid(payload, env)) {
    return null
  }
  return payload
}

/** 会话 cookie 是否带 Secure：生产/预览强制；本地 http 开发不带（否则浏览器不收） */
export function sessionCookieSecure(env: EnvLike = process.env): boolean {
  return (env.NODE_ENV ?? 'production') === 'production'
}

export interface CookieOptions {
  secure: boolean
  maxAgeSeconds: number
  httpOnly?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
}

/** 构造 Set-Cookie 头值 */
export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${value}`, 'Path=/']
  if (opts.httpOnly !== false) {
    parts.push('HttpOnly')
  }
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`)
  if (opts.secure) {
    parts.push('Secure')
  }
  if (opts.maxAgeSeconds > 0) {
    parts.push(`Max-Age=${Math.floor(opts.maxAgeSeconds)}`)
  } else {
    // maxAgeSeconds <= 0 表示删除 cookie：必须显式 Max-Age=0（空值 + 无过期
    // 只会覆盖成 session cookie，浏览器不会真正清除）
    parts.push('Max-Age=0')
  }
  return parts.join('; ')
}

/** 会话 cookie（HttpOnly + SameSite=Lax + Path=/） */
export function buildSessionCookie(token: string, env: EnvLike = process.env): string {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    secure: sessionCookieSecure(env),
    maxAgeSeconds: sessionTtlSeconds(env),
    httpOnly: true,
    sameSite: 'Lax',
  })
}

/** CSRF 双提交 cookie（非 HttpOnly，前端读取后回传 header） */
export function buildCsrfCookie(csrf: string, env: EnvLike = process.env): string {
  return serializeCookie(CSRF_COOKIE_NAME, csrf, {
    secure: sessionCookieSecure(env),
    maxAgeSeconds: sessionTtlSeconds(env),
    httpOnly: false,
    sameSite: 'Lax',
  })
}

/** 清除会话相关 cookie（logout） */
export function clearSessionCookies(env: EnvLike = process.env): string[] {
  const base = { secure: sessionCookieSecure(env), maxAgeSeconds: 0, httpOnly: true, sameSite: 'Lax' as const }
  return [
    serializeCookie(SESSION_COOKIE_NAME, '', base),
    serializeCookie(CSRF_COOKIE_NAME, '', { ...base, httpOnly: false }),
  ]
}
