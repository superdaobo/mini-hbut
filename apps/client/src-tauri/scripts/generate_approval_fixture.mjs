#!/usr/bin/env node
/**
 * 生成 #622 canonical 签名 golden fixture（独立于被测实现，防止测试自证）。
 *
 * 输出：src-tauri/src/identity/fixtures/approval_canonical_v1.golden.json
 * 消费方：
 *  - Rust：src-tauri/src/identity/canonical.rs 测试（include_str!）
 *  - Node：identity-platform/core/tests/app/canonical.golden.test.ts（相对路径读取）
 *
 * 固定输入（fixture 一旦生成不允许修改；如需变更请改本脚本重新生成并同步两个消费方）：
 *  - 固定 Ed25519 seed（32 字节 hex），保证跨语言签名可复现（Ed25519 确定性签名）；
 *  - 固定 canonical 字段值。
 *
 * 运行：node src-tauri/scripts/generate_approval_fixture.mjs
 */
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/identity/fixtures/approval_canonical_v1.golden.json',
)

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const sha256B64url = (utf8) => b64url(createHash('sha256').update(utf8, 'utf8').digest())

/** scope 规范化：空白分割 → trim → 去空 → 去重 → 字典序 → 单空格 join */
function normalizeScopes(scopes) {
  const parts = []
  for (const raw of scopes) {
    for (const p of String(raw).split(/\s+/)) {
      const t = p.trim()
      if (t !== '' && !parts.includes(t)) parts.push(t)
    }
  }
  parts.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return parts.join(' ')
}

// ── 固定输入 ────────────────────────────────────────────────────────────────
const SEED_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
const AUTH = {
  request_id: 'ar_qhjINIITtkzwIg5pU3K9ew',
  challenge: '0kQm4vN6pR9sU1wY3aB5cD7eF9gH1iJ3kL5mN7qX7x2L8j',
  client_id: 'client_3f9a2b1c4d5e6f7a8b9c0d1e2f3a4b5c',
  // 故意乱序 + 重复：验证 scope 规范化（去重、字典序）
  scopes: ['student.identity', 'openid', 'profile', 'openid'],
  device_id: '0198a1b2c3d4e5f6a7b8c9d0',
  decision: 'approve',
  issued_at: 1755000000,
  nonce: 'n4v6pR9sU1wY3aB5cD7eF9gH1iJ3kL5mN7qX7x2L8j0kQm',
}
const ENROLL = {
  challenge: 'cH2pQ9sU1wY3aB5cD7eF9gH1iJ3kL5mN7qX7x2L8j0kQm4vN6pR',
  student_id: '2023010101',
  student_name: '张三',
  issued_at: 1755000000,
  nonce: 'eR7sU1wY3aB5cD7eF9gH1iJ3kL5mN7qX7x2L8j0kQm4vN6pR9',
}

// ── 派生：公钥 / 指纹 ───────────────────────────────────────────────────────
const seed = Buffer.from(SEED_HEX, 'hex')
const priv = createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', d: b64url(seed), x: 'x' }, format: 'jwk' })
// 用私钥对象导出的公钥（避免手工计算 x 出错）
const pubJwk = priv.export({ format: 'jwk' })
const pubX = pubJwk.x
const publicKeyJwk = { kty: 'OKP', crv: 'Ed25519', x: pubX }
// 设备指纹 = sha256(紧凑 JWK JSON) base64url（与 core/src/domain/devices.ts 一致）
const publicKeyFingerprint = sha256B64url(JSON.stringify(publicKeyJwk))

// ── canonical 文本（固定：UTF-8、LF、最后一行后有换行） ──────────────────────
const authScopeHash = sha256B64url(normalizeScopes(AUTH.scopes))
const authCanonicalText = [
  'MINI-HBUT-AUTH-V1',
  `request_id=${AUTH.request_id}`,
  `challenge=${AUTH.challenge}`,
  `client_id=${AUTH.client_id}`,
  `scope_hash=${authScopeHash}`,
  `device_id=${AUTH.device_id}`,
  `decision=${AUTH.decision}`,
  `issued_at=${AUTH.issued_at}`,
  `nonce=${AUTH.nonce}`,
  '',
].join('\n')

const enrollCanonicalText = [
  'MINI-HBUT-ENROLL-V1',
  `challenge=${ENROLL.challenge}`,
  `public_key_fingerprint=${publicKeyFingerprint}`,
  `student_id=${ENROLL.student_id}`,
  `student_name=${ENROLL.student_name}`,
  `issued_at=${ENROLL.issued_at}`,
  `nonce=${ENROLL.nonce}`,
  '',
].join('\n')

const authSignature = b64url(sign(null, Buffer.from(authCanonicalText, 'utf8'), priv))
const enrollSignature = b64url(sign(null, Buffer.from(enrollCanonicalText, 'utf8'), priv))

// 自检：公钥对象可解析
createPublicKey({ key: publicKeyJwk, format: 'jwk' })

const fixture = {
  label: 'Mini-HBUT Identity #622 canonical 签名 golden fixture（Rust/Node 共享）',
  version: 'MINI-HBUT-AUTH-V1 / MINI-HBUT-ENROLL-V1',
  note: 'canonical 规范：UTF-8、LF 换行、字段固定顺序、最后一行后有一个 LF；scope 规范化 = 去重+字典序+单空格 join 后 SHA-256(base64url)；Ed25519 直接签 canonical 字节。',
  signing_key: {
    seed_hex: SEED_HEX,
    public_x_b64url: pubX,
    public_key_jwk: publicKeyJwk,
    public_key_fingerprint: publicKeyFingerprint,
  },
  auth: {
    request_id: AUTH.request_id,
    challenge: AUTH.challenge,
    client_id: AUTH.client_id,
    scopes: [...AUTH.scopes],
    normalized_scopes: normalizeScopes(AUTH.scopes).split(' '),
    scope_hash: authScopeHash,
    device_id: AUTH.device_id,
    decision: AUTH.decision,
    issued_at: AUTH.issued_at,
    nonce: AUTH.nonce,
    canonical_text: authCanonicalText,
    signature: authSignature,
  },
  enroll: {
    challenge: ENROLL.challenge,
    student_id: ENROLL.student_id,
    student_name: ENROLL.student_name,
    issued_at: ENROLL.issued_at,
    nonce: ENROLL.nonce,
    canonical_text: enrollCanonicalText,
    signature: enrollSignature,
  },
}

mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`)
// eslint-disable-next-line no-console
console.log(`fixture written: ${OUT}`)
// eslint-disable-next-line no-console
console.log(`public_x=${pubX}\nfingerprint=${publicKeyFingerprint}\nauth_sig=${authSignature}\nenroll_sig=${enrollSignature}`)
