/**
 * 签名验证原语（#622，Node 侧）。
 *
 * - Ed25519 验签：node:crypto 原生 JWK 导入（OKP/Ed25519），无第三方依赖；
 * - 验签失败只返回 boolean，不泄露任何细节（调用方决定错误响应）；
 * - constant-time compare：handoff hash 比对用 timingSafeEqual（防时序侧信道）。
 */
import {
  createPublicKey,
  createPrivateKey,
  timingSafeEqual,
  verify as nodeVerify,
  sign as nodeSign,
  type KeyObject,
} from 'node:crypto'

/** Ed25519 公钥 JWK（只接受 OKP/Ed25519/x，禁止 d） */
export interface Ed25519PublicJwk {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
}

function importPublicKey(jwk: Ed25519PublicJwk): KeyObject {
  return createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, format: 'jwk' })
}

/**
 * 验证 Ed25519 签名（base64url 编码的 64 字节签名）对 canonical UTF-8 字节的合法性。
 * 公钥非法 / 签名编码非法一律视为验证失败（不抛错，fail closed 到 false）。
 */
export function verifyEd25519(
  jwk: Ed25519PublicJwk,
  canonicalUtf8: string,
  signatureB64url: string,
): boolean {
  try {
    const publicKey = importPublicKey(jwk)
    const signature = Buffer.from(signatureB64url, 'base64url')
    if (signature.length !== 64) {
      return false
    }
    return nodeVerify(null, Buffer.from(canonicalUtf8, 'utf8'), publicKey, signature)
  } catch {
    return false
  }
}

/**
 * 测试/工具用：用私钥 seed（32 字节，base64url 的 JWK d）对 canonical 字节签名，
 * 返回 base64url 编码的 64 字节签名。仅用于 golden fixture 测试，绝不在生产路径使用。
 */
export function signEd25519(seedB64url: string, canonicalUtf8: string): string {
  const privateKey = createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: publicKeyFromSeed(seedB64url),
      d: seedB64url,
    },
    format: 'jwk',
  })
  return nodeSign(null, Buffer.from(canonicalUtf8, 'utf8'), privateKey).toString('base64url')
}

/** 由 32 字节 seed 派生公钥 x（base64url）——OKP Ed25519 公钥 = 种子点压缩 */
function publicKeyFromSeed(seedB64url: string): string {
  const seed = Buffer.from(seedB64url, 'base64url')
  if (seed.length !== 32) {
    throw new Error('seed 必须为 32 字节')
  }
  const privateKey = createPrivateKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: 'x'.repeat(43), d: seedB64url },
    format: 'jwk',
  })
  const jwk = privateKey.export({ format: 'jwk' }) as { x?: string }
  if (!jwk.x) {
    throw new Error('无法导出公钥')
  }
  return jwk.x
}

/** constant-time 字符串比较（长度不等直接 false；hash 长度固定，无实际时序风险） */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) {
    return false
  }
  return timingSafeEqual(ba, bb)
}
