/**
 * #622 跨语言 golden fixture 测试（Node 侧）。
 *
 * 与 Rust 侧测试（apps/client/src-tauri/src/identity/canonical.rs 的 golden_* 用例）共享同一
 * fixture 文件（apps/client/src-tauri/src/identity/fixtures/approval_canonical_v1.golden.json），
 * 双向验证 canonical 规范逐字节一致：
 * - Node 重建 canonical == fixture 文本；
 * - Node 用 fixture seed 签出的签名 == fixture 签名（Ed25519 确定性）；
 * - fixture 签名可被 Node 验签通过；
 * - 篡改任一字段 → 验签失败；
 * - scope 规范化 / fingerprint 与 fixture 一致。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTH_VERSION,
  ENROLL_VERSION,
  DEVICE_API_VERSION,
  normalizeScopes,
  scopeHash,
  buildAuthCanonical,
  buildEnrollCanonical,
  buildDeviceApiCanonical,
  jwkFingerprint,
} from '../../src/api/app/canonical.js'
import { verifyEd25519, signEd25519 } from '../../src/api/app/verify.js'

interface GoldenFixture {
  signing_key: {
    seed_hex: string
    public_x_b64url: string
    public_key_jwk: { kty: string; crv: string; x: string }
    public_key_fingerprint: string
  }
  auth: {
    request_id: string
    challenge: string
    client_id: string
    scopes: string[]
    normalized_scopes: string[]
    scope_hash: string
    device_id: string
    decision: string
    issued_at: number
    nonce: string
    canonical_text: string
    signature: string
  }
  enroll: {
    challenge: string
    student_id: string
    student_name: string
    issued_at: number
    nonce: string
    canonical_text: string
    signature: string
  }
}

/** 读取共享 golden fixture（与 Rust include_str! 同一文件） */
function loadFixture(): GoldenFixture {
  const fixturePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../apps/client/src-tauri/src/identity/fixtures/approval_canonical_v1.golden.json',
  )
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as GoldenFixture
}

/** fixture 公钥（收窄为字面量类型，匹配 verifyEd25519 参数） */
function fixtureJwk(fx: GoldenFixture): { kty: 'OKP'; crv: 'Ed25519'; x: string } {
  return { kty: 'OKP', crv: 'Ed25519', x: fx.signing_key.public_key_jwk.x }
}

describe('#622 golden fixture（Node ↔ Rust 共享）', () => {
  const fx = loadFixture()

  it('canonical 版本头与协议定义一致', () => {
    expect(AUTH_VERSION).toBe('MINI-HBUT-AUTH-V1')
    expect(ENROLL_VERSION).toBe('MINI-HBUT-ENROLL-V1')
    expect(DEVICE_API_VERSION).toBe('MINI-HBUT-DEVICE-API-V1')
  })

  it('scope 规范化与 scope_hash 与 fixture 一致（去重 + 字典序 + 单空格 join）', () => {
    const normalized = normalizeScopes(fx.auth.scopes)
    expect(normalized).toEqual(fx.auth.normalized_scopes)
    expect(scopeHash(normalized)).toBe(fx.auth.scope_hash)
    // 乱序/重复输入仍得到相同 hash
    expect(scopeHash(normalizeScopes([...fx.auth.scopes].reverse()))).toBe(fx.auth.scope_hash)
  })

  it('fingerprint 与 fixture 一致（sha256(canonical JWK JSON) base64url）', () => {
    expect(jwkFingerprint(fixtureJwk(fx))).toBe(
      fx.signing_key.public_key_fingerprint,
    )
  })

  it('Node 重建 auth canonical == fixture canonical_text（逐字节一致）', () => {
    const canonical = buildAuthCanonical({
      requestId: fx.auth.request_id,
      challenge: fx.auth.challenge,
      clientId: fx.auth.client_id,
      scopeHash: fx.auth.scope_hash,
      deviceId: fx.auth.device_id,
      decision: fx.auth.decision,
      issuedAt: fx.auth.issued_at,
      nonce: fx.auth.nonce,
    })
    expect(canonical).toBe(fx.auth.canonical_text)
    // 规范：canonical 以单个 LF 结尾
    expect(canonical.endsWith('\n')).toBe(true)
    expect(canonical.endsWith('\n\n')).toBe(false)
  })

  it('Node 重建 enroll canonical == fixture canonical_text', () => {
    const canonical = buildEnrollCanonical({
      challenge: fx.enroll.challenge,
      publicKeyFingerprint: fx.signing_key.public_key_fingerprint,
      studentId: fx.enroll.student_id,
      studentName: fx.enroll.student_name,
      issuedAt: fx.enroll.issued_at,
      nonce: fx.enroll.nonce,
    })
    expect(canonical).toBe(fx.enroll.canonical_text)
  })

  it('Node 用 fixture seed 签出的签名与 fixture 一致（Ed25519 确定性签名）', () => {
    const seed = Buffer.from(fx.signing_key.seed_hex, 'hex').toString('base64url')
    // 与 Rust 侧 golden_rust_signature_matches_fixture 完全对称
    expect(signEd25519(seed, fx.auth.canonical_text)).toBe(fx.auth.signature)
    expect(signEd25519(seed, fx.enroll.canonical_text)).toBe(fx.enroll.signature)
  })

  it('fixture 签名可被 Node 验签通过（= Rust 可验 Node 签名，Node 可验 Rust 签名）', () => {
    expect(
      verifyEd25519(fixtureJwk(fx), fx.auth.canonical_text, fx.auth.signature),
    ).toBe(true)
    expect(
      verifyEd25519(fixtureJwk(fx), fx.enroll.canonical_text, fx.enroll.signature),
    ).toBe(true)
  })

  it('篡改任一字段后原签名验证失败', () => {
    const cases: Array<[string, string]> = [
      ['request_id', 'ar_changed'],
      ['challenge', 'changed'],
      ['client_id', 'client_changed'],
      ['scope_hash', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
      ['device_id', '0198changed'],
      ['decision', 'deny'],
      ['issued_at', '1755000001'],
      ['nonce', 'changed'],
    ]
    for (const [field, value] of cases) {
      const lines = fx.auth.canonical_text.split('\n')
      const idx = lines.findIndex((line) => line.startsWith(`${field}=`))
      expect(idx).toBeGreaterThan(-1)
      lines[idx] = `${field}=${value}`
      const tampered = lines.join('\n')
      expect(
        verifyEd25519(fixtureJwk(fx), tampered, fx.auth.signature),
      ).toBe(false)
    }
  })

  it('scope tamper：对非授权 scope 集合的签名无法通过原请求验签', () => {
    const seed = Buffer.from(fx.signing_key.seed_hex, 'hex').toString('base64url')
    // 攻击者想多拿 student.identity：用篡改后的 scope 集合作 hash 并签名
    const evilHash = scopeHash([...fx.auth.normalized_scopes, 'student.identity'])
    const evilCanonical = buildAuthCanonical({
      requestId: fx.auth.request_id,
      challenge: fx.auth.challenge,
      clientId: fx.auth.client_id,
      scopeHash: evilHash,
      deviceId: fx.auth.device_id,
      decision: fx.auth.decision,
      issuedAt: fx.auth.issued_at,
      nonce: fx.auth.nonce,
    })
    const evilSignature = signEd25519(seed, evilCanonical)
    // 服务端用【存储快照】重算 hash 重建 canonical → 与篡改版不同 → 攻击者签名验证失败
    const serverCanonical = buildAuthCanonical({
      requestId: fx.auth.request_id,
      challenge: fx.auth.challenge,
      clientId: fx.auth.client_id,
      scopeHash: fx.auth.scope_hash,
      deviceId: fx.auth.device_id,
      decision: fx.auth.decision,
      issuedAt: fx.auth.issued_at,
      nonce: fx.auth.nonce,
    })
    expect(evilCanonical).not.toBe(serverCanonical)
    expect(
      verifyEd25519(fixtureJwk(fx), serverCanonical, evilSignature),
    ).toBe(false)
  })

  it('device-api canonical 格式与 Rust 测试用例一致', () => {
    const canonical = buildDeviceApiCanonical({
      method: 'post',
      path: '/api/v1/app/devices/me',
      deviceId: 'dev_abc123',
      issuedAt: 1755000000,
      nonce: 'nonce_abc',
    })
    expect(canonical).toBe(
      'MINI-HBUT-DEVICE-API-V1\nmethod=POST\npath=/api/v1/app/devices/me\ndevice_id=dev_abc123\nissued_at=1755000000\nnonce=nonce_abc\n',
    )
  })

  it('非法字段值被拒绝（换行注入/超长/非法 decision）', () => {
    expect(() =>
      buildAuthCanonical({
        requestId: 'ar_\nEVIL',
        challenge: 'c',
        clientId: 'cl',
        scopeHash: 'h',
        deviceId: 'd',
        decision: 'approve',
        issuedAt: 1755000000,
        nonce: 'n',
      }),
    ).toThrow()
    expect(() =>
      buildAuthCanonical({
        requestId: 'ar_ok',
        challenge: 'c',
        clientId: 'cl',
        scopeHash: 'h',
        deviceId: 'd',
        decision: 'deny',
        issuedAt: 1755000000,
        nonce: 'n',
      }),
    ).toThrow()
    // student_name 含控制字符拒绝
    expect(() =>
      buildEnrollCanonical({
        challenge: 'c',
        publicKeyFingerprint: 'f',
        studentId: '2023010101',
        studentName: '张\u0007三',
        issuedAt: 1755000000,
        nonce: 'n',
      }),
    ).toThrow()
    // issued_at 越界拒绝
    expect(() =>
      buildAuthCanonical({
        requestId: 'ar_ok',
        challenge: 'c',
        clientId: 'cl',
        scopeHash: 'h',
        deviceId: 'd',
        decision: 'approve',
        issuedAt: -1,
        nonce: 'n',
      }),
    ).toThrow()
  })
})
