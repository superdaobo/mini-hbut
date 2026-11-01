/**
 * 媒体子资源能力串（#1163 T02 契约 R4）。
 *
 * 问题：`<video src>` / `<img src>` 无法携带 `Authorization` 头，而主令牌**不得**放进 URL。
 * 方案：由已持有令牌的主窗口用 `HMAC-SHA256(token, "media|target|exp")` 自行派生一个
 * 短时能力串，随 URL 传递；Rust 用同一令牌复算校验（`media_capability_valid`）。
 * 模块 iframe 拿不到令牌 ⇒ 无法派生 ⇒ 无法代理学校媒体内容。
 *
 * 约束：能力串只绑定「目标地址 + 过期时间」，TTL 取 `MEDIA_CAPABILITY_TTL_SECONDS`；
 * 不记录日志、不进 storage。
 */

import { getBridgeSessionToken } from './bridge_auth'

/** 与 Rust 侧前缀保持一致（`MEDIA_CAP_PREFIX`）。 */
const MEDIA_CAP_PREFIX = 'media'

/**
 * TTL：视频播放会持续发起 Range 请求，太短会让「拖动进度」失败；
 * 取 30 分钟，足以覆盖一节课，同时限制泄露窗口。
 */
export const MEDIA_CAPABILITY_TTL_SECONDS = 30 * 60

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const hmacSha256 = async (key: string, message: string): Promise<Uint8Array> => {
  const cryptoObj = globalThis.crypto
  if (!cryptoObj?.subtle) throw new Error('当前环境不支持 crypto.subtle')
  const encoder = new TextEncoder()
  const cryptoKey = await cryptoObj.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await cryptoObj.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return new Uint8Array(signature)
}

/** 计算能力串（与 Rust `media_capability` 逐字节等价）。 */
export const computeMediaCapability = async (
  token: string,
  target: string,
  exp: number
): Promise<string> => toBase64Url(await hmacSha256(token, `${MEDIA_CAP_PREFIX}|${target}|${exp}`))

/**
 * 把学校视频/媒体直链包装为本地代理地址（带能力串）。
 * 无令牌（浏览器预览、测试）时退回直链，尽力播放。
 */
export const buildMediaCapabilityUrl = async (
  target: string,
  options: { origin?: string; now?: number; ttlSeconds?: number } = {}
): Promise<string> => {
  const token = await getBridgeSessionToken()
  if (!token) return target

  const origin = (options.origin || 'http://127.0.0.1:4399').replace(/\/$/, '')
  const ttl = options.ttlSeconds ?? MEDIA_CAPABILITY_TTL_SECONDS
  const now = options.now ?? Math.floor(Date.now() / 1000)
  const exp = now + ttl
  try {
    const cap = await computeMediaCapability(token, target, exp)
    return `${origin}/proxy/video?url=${encodeURIComponent(target)}&exp=${exp}&cap=${cap}`
  } catch {
    return target
  }
}
