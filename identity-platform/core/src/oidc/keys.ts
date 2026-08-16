/**
 * 签名密钥管理（#620 / #617 信任边界 JWKS 章节）。
 *
 * V1 签名算法决策：RS256
 * - oidc-provider v9 的默认 id_token_signed_response_alg 就是 RS256，
 *   第三方标准 OIDC client（openid-client 等）对 RS256 兼容性最好；
 * - 不需要额外引入算法库，node:crypto 原生生成 RSA-2048 即可；
 * - Discovery 的 id_token_signing_alg_values_supported 只暴露 RS256。
 *
 * 密钥来源：
 * - IDENTITY_JWKS_JSON（Production/Preview secret）：JWK Set 格式 { keys: [...] }，
 *   必须包含可签名的私钥参数（RS256 要求 d）；
 * - 未配置时：development/test 环境生成临时密钥（每次启动变化，仅本地调试）；
 *   Production 未配置 → fail closed（抛错，禁止用临时密钥顶替生产签名）。
 *
 * 安全约束：
 * - /oauth/jwks 只发布公钥（oidc-provider 的 keystore 行为，见 lib/actions/jwks.js）；
 * - 任何日志/响应不得包含私钥参数（d/p/q/dp/dq/qi）；
 * - 每个 key 必须有稳定 kid；rotation 时新 key 签名 + 旧公钥保留（JWKS 同时发布）。
 */
import { createHash, generateKeyPairSync } from 'node:crypto'

/** V1 签名算法：RS256（非对称，JWKS 可验证） */
export const SIGNING_ALG = 'RS256'

/** 默认 kid 前缀（与 issuer 无关的稳定命名空间） */
const KID_PREFIX = 'mini-hbut-rs256'

export interface SigningKeySet {
  /** 完整 JWK（含私钥），供 provider 配置 jwks.keys 使用 */
  keys: Array<Record<string, unknown>>
  /** 公钥摘要（用于日志/指纹，不包含私钥参数） */
  publicThumbprints: string[]
}

/** 生成新的 RSA-2048 签名密钥对（含私钥 JWK） */
export function generateSigningKey(kid: string): Record<string, unknown> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  })
  const privateJwk = privateKey.export({ format: 'jwk' }) as Record<string, unknown>
  const publicJwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>
  return {
    ...privateJwk,
    // 只保留 public 参数 + kid/alg/use；私钥参数（d/p/q/dp/dq/qi）仍由 export 提供
    kid,
    alg: SIGNING_ALG,
    use: 'sig',
    // 供 JWKS 发布的公钥副本（无私钥参数）
    _public: publicJwk,
  }
}

/** 由公钥派生稳定 kid（fingerprint 前 16 位 base64url） */
export function kidFromPublic(jwk: Record<string, unknown>): string {
  const canonical = JSON.stringify({
    kty: jwk.kty,
    n: jwk.n,
    e: jwk.e,
  })
  return `${KID_PREFIX}-${createHash('sha256').update(canonical).digest('base64url').slice(0, 16)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 校验单把 JWK 可用于 RS256 签名（kty=RSA + 存在 d 私钥参数 + 稳定 kid） */
function assertSigningJwk(key: Record<string, unknown>): void {
  if (key.kty !== 'RSA') {
    throw new Error(`[oidc.keys] 只支持 RSA 签名密钥，实际 kty=${String(key.kty)}`)
  }
  if (typeof key.n !== 'string' || typeof key.e !== 'string') {
    throw new Error('[oidc.keys] RSA 公钥参数 n/e 缺失')
  }
  if (typeof key.d !== 'string') {
    throw new Error('[oidc.keys] 私钥参数 d 缺失，无法用于 RS256 签名（fail closed）')
  }
  if (typeof key.kid !== 'string' || key.kid.length === 0) {
    throw new Error('[oidc.keys] 每个 key 必须带稳定 kid')
  }
}

/**
 * 从 IDENTITY_JWKS_JSON 加载签名密钥集。
 * 支持 JWK Set 格式（{ keys: [...] }）；缺 kid 时自动派生（保证稳定）。
 * 任何一条 key 非法 → 整体抛错（fail closed，不静默跳过）。
 */
export function loadJwksFromJson(json: string | undefined): SigningKeySet {
  if (!json || json.trim() === '') {
    throw new Error('[oidc.keys] IDENTITY_JWKS_JSON 未配置（fail closed）')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error(`[oidc.keys] IDENTITY_JWKS_JSON 不是合法 JSON：${(err as Error).message}`)
  }
  const rawKeys = isRecord(parsed) && Array.isArray(parsed.keys) ? parsed.keys : null
  if (!rawKeys || rawKeys.length === 0) {
    throw new Error('[oidc.keys] IDENTITY_JWKS_JSON 必须是 JWK Set 格式 { keys: [...] } 且非空')
  }
  const keys: Array<Record<string, unknown>> = []
  for (const raw of rawKeys) {
    if (!isRecord(raw)) {
      throw new Error('[oidc.keys] JWKS 中出现了非对象 key')
    }
    const key = { ...raw }
    if (!key.kid) {
      key.kid = kidFromPublic(key)
    }
    assertSigningJwk(key)
    keys.push(key)
  }
  return { keys, publicThumbprints: keys.map((k) => kidFromPublic(k)) }
}

/** 生成临时密钥（development/test；Production 禁止调用） */
export function generateEphemeralKeySet(): SigningKeySet {
  const key = generateSigningKey(kidFromPublic(generateKeyPairSync('rsa', {
    modulusLength: 2048,
  }).publicKey.export({ format: 'jwk' }) as Record<string, unknown>))
  return { keys: [key], publicThumbprints: [kidFromPublic(key)] }
}

/** 把签名密钥集转换为 provider 配置用的 jwks（只保留 key 本体） */
export function toProviderJwks(set: SigningKeySet): { keys: Array<Record<string, unknown>> } {
  // 去掉内部 _public 辅助字段，避免无关字段进入 provider keystore
  return { keys: set.keys.map(({ _public: _ignored, ...key }) => key) }
}
