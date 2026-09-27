/**
 * #902 跨语言 golden fixture 测试（Core 侧）。
 *
 * 与 Rust 客户端测试（apps/client/src-tauri/src/identity/canonical.rs 的
 * `golden_device_token_*` 用例）共享同一份 fixture（双副本，内容必须逐字节一致）：
 *   identity-platform/core/tests/fixtures/device_token_canonical_v1.golden.json（本侧）
 *   apps/client/src-tauri/src/identity/fixtures/device_token_canonical_v1.golden.json（Rust 侧）
 * 两份都存在时（#902a + #902b 合并后）本测试会断言它们逐字节一致，防止只改一侧导致漂移。
 *
 * 为什么必须双向锁死：设备换票的签名对象是 canonical 文本，Core 验签、Rust 签名，
 * 任何一侧改了字段顺序/分隔符/末尾换行都会让生产链路 100% 验签失败（401），
 * 且失败原因难以定位。因此两侧各自重建 canonical + 各自签同一 canonical，
 * 断言与 fixture 逐字节一致。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEVICE_TOKEN_VERSION, buildDeviceTokenCanonical } from '../../src/api/app/canonical.js'
import { verifyEd25519, signEd25519 } from '../../src/api/app/verify.js'

interface DeviceTokenFixture {
  version: string
  signing_key: {
    seed_hex: string
    public_key_jwk: { kty: 'OKP'; crv: 'Ed25519'; x: string }
  }
  device_token: {
    challenge: string
    device_id: string
    issued_at: number
    nonce: string
    canonical_text: string
    signature: string
  }
}

/** 读取共享 golden fixture（与 Rust include_str! 同一内容） */
function fixturePath(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../fixtures/device_token_canonical_v1.golden.json',
  )
}

/** Rust 侧副本（#902b 分支合并后存在；只读，用于双副本一致性断言） */
function clientFixturePath(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../apps/client/src-tauri/src/identity/fixtures/device_token_canonical_v1.golden.json',
  )
}

function loadFixture(): DeviceTokenFixture {
  return JSON.parse(fs.readFileSync(fixturePath(), 'utf8')) as DeviceTokenFixture
}

/** hex seed → base64url（Node createPrivateKey 需要 base64url 形式的 d） */
function seedB64url(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64url')
}

describe('#902 设备换票 canonical golden fixture（Core ↔ Rust 共享）', () => {
  const fx = loadFixture()
  const dt = fx.device_token

  it('版本头与 fixture 一致', () => {
    expect(DEVICE_TOKEN_VERSION).toBe('MINI-HBUT-DEVICE-TOKEN-V1')
    expect(fx.version).toBe(DEVICE_TOKEN_VERSION)
  })

  it('Core 重建 canonical 与 fixture 逐字节一致（含末尾 LF）', () => {
    const canonical = buildDeviceTokenCanonical({
      challenge: dt.challenge,
      deviceId: dt.device_id,
      issuedAt: dt.issued_at,
      nonce: dt.nonce,
    })
    expect(canonical).toBe(dt.canonical_text)
    expect(canonical.endsWith('\n')).toBe(true)
    expect(canonical.split('\n')[0]).toBe(DEVICE_TOKEN_VERSION)
  })

  it('fixture 签名可被 fixture 公钥验签通过（Ed25519 确定性签名）', () => {
    expect(verifyEd25519(fx.signing_key.public_key_jwk, dt.canonical_text, dt.signature)).toBe(true)
    // Node 用同一 seed 重签 → 与 fixture 签名完全相同（Rust 侧同样断言）
    expect(signEd25519(seedB64url(fx.signing_key.seed_hex), dt.canonical_text)).toBe(dt.signature)
  })

  it('篡改任一字段 → 验签失败（canonical 绑定全部字段）', () => {
    const tampered = [
      ['challenge', dt.challenge, 'A7pQ2sV5wY8aB1cD4eF7gH0iJ3kL6mN9qR2sU5wX8yA1b'],
      ['device_id', dt.device_id, '0198a1b2c3d4e5f6a7b8c9d0'],
      ['issued_at', String(dt.issued_at), '1755000001'],
      ['nonce', dt.nonce, 'x4v6pR9sU1wY3aB5cD7eF9gH1iJ3kL5mN7qX7x2L8j0kQm'],
    ] as const
    for (const [field, from, to] of tampered) {
      if (from === to) continue
      const mutated = dt.canonical_text.replace(`${field}=${from}`, `${field}=${to}`)
      expect(mutated).not.toBe(dt.canonical_text)
      expect(
        verifyEd25519(fx.signing_key.public_key_jwk, mutated, dt.signature),
        `${field} 被篡改后必须验签失败`,
      ).toBe(false)
    }
    // 末尾 LF 被删除也必须失败（canonical 以 LF 结尾是硬规范）
    expect(verifyEd25519(fx.signing_key.public_key_jwk, dt.canonical_text.trimEnd(), dt.signature)).toBe(false)
  })

  it('字段顺序固定：调换 challenge / device_id 顺序 → 验签失败（协议外文本）', () => {
    const reordered = dt.canonical_text
      .replace(`${dt.challenge}`, '__CH__')
      .replace(`${dt.device_id}`, dt.challenge)
      .replace('__CH__', dt.device_id)
    expect(
      verifyEd25519(fx.signing_key.public_key_jwk, reordered, dt.signature),
    ).toBe(false)
  })

  it('非法字段值被 canonical 构建器拒绝（协议外字符 / 超长 / issued_at 越界）', () => {
    const base = { challenge: dt.challenge, deviceId: dt.device_id, issuedAt: dt.issued_at, nonce: dt.nonce }
    expect(() => buildDeviceTokenCanonical({ ...base, challenge: 'has space' })).toThrow()
    expect(() => buildDeviceTokenCanonical({ ...base, challenge: '' })).toThrow()
    expect(() => buildDeviceTokenCanonical({ ...base, deviceId: 'a/b' })).toThrow()
    expect(() => buildDeviceTokenCanonical({ ...base, nonce: 'x'.repeat(129) })).toThrow()
    expect(() => buildDeviceTokenCanonical({ ...base, issuedAt: 0 })).toThrow()
    expect(() => buildDeviceTokenCanonical({ ...base, issuedAt: 4102444801 })).toThrow()
  })

  it('双副本一致性：Rust 侧 fixture（存在时）与本侧逐字节相同', () => {
    const clientCopy = clientFixturePath()
    if (!fs.existsSync(clientCopy)) {
      // #902b 分支尚未合并时不存在；合并后本断言生效（防止只改一侧导致契约漂移）
      return
    }
    expect(fs.readFileSync(clientCopy, 'utf8')).toBe(fs.readFileSync(fixturePath(), 'utf8'))
  })
})
