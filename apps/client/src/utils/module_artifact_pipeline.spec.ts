/**
 * #1169 T13：模块产物「打包 → 签名 → 校验」端到端测试。
 *
 * 这段跑的就是发布流水线的真实路径（Node 里构造包体 → 用测试种子签名 → 用
 * `scripts/verify_module_artifact.mjs` 校验），因此能替代一部分「必须开 GUI」的验收：
 * - 正常产物必须通过；
 * - 包体被改一个字必须被判为不可发布；
 * - 未知发布者密钥必须被判为不可发布。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPrivateKey, sign as cryptoSign } from 'node:crypto'

const SEED = Buffer.alloc(32, 7)
const PKCS8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED])
const privateKey = createPrivateKey({ key: PKCS8, format: 'der', type: 'pkcs8' })
const CWD = process.cwd()

/**
 * 就地复刻「规范化 + 签名」两步（与 scripts/sign_module_manifest.mjs 同一算法）。
 * 这里刻意不 import 那个脚本：它带 CLI 入口，走 Vite 转换会踩到无关的语法问题；
 * 规范化一致性已由 Rust 的 cross_language_tests 与样例模块夹具覆盖。
 */
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const signManifest = (sha256: string) => {
  const base = {
    module_id: 'e2e_demo',
    version: '1.0.0',
    release_seq: 7,
    channel: 'main',
    module_name: '端到端示例',
    entry_path: 'index.html',
    package_sha256: sha256,
    min_compatible_version: '',
    compat: { host_min: '', bridge_protocol: 1 },
    permissions: ['school.portal_client_ip'],
    publisher_key_id: 'dev-test-1',
    // 2026-11-06 起这几个字段纳入签名覆盖（此前是未签名扩展字段）：
    // 缺省值必须与 Rust `#[serde(default)]` / 校验器投影一致。
    package_url: '',
    package_size: 0,
    open_url: '',
    schema_version: 1
  }
  const canonical = canonicalJson(base)
  const signature = cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64url')
  return {
    ...base,
    signature: { alg: 'ed25519', key_id: 'dev-test-1', value: signature }
  }
}

const runVerifier = (dir: string) => {
  try {
    execFileSync(process.execPath, ['scripts/verify_module_artifact.mjs', '--dir', dir], {
      cwd: CWD,
      stdio: 'pipe',
      encoding: 'utf8'
    })
    return { ok: true, output: '' }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    return { ok: false, output: `${failure.stdout || ''}${failure.stderr || ''}` }
  }
}

const makeArtifact = (options: { tamperBundle?: boolean; unknownKey?: boolean } = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hbut-artifact-'))
  const bundle = Buffer.from('fake-zip-bytes-for-e2e')
  const sha = createHash('sha256').update(bundle).digest('hex')
  writeFileSync(path.join(dir, 'bundle.zip'), bundle)
  const manifest = signManifest(sha)
  if (options.unknownKey) {
    // 把 key_id 改成不存在的值（签名本身不变：校验器应先因未知密钥而拒绝）
    manifest.publisher_key_id = 'nobody-1'
    ;(manifest.signature as { key_id: string }).key_id = 'nobody-1'
  }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  if (options.tamperBundle) {
    writeFileSync(path.join(dir, 'bundle.zip'), Buffer.from('tampered-content'))
  }
  return dir
}

describe('#1169 T13 模块产物端到端', () => {
  it('正常产物通过校验（打包 → 签名 → 校验）', () => {
    const dir = makeArtifact()
    try {
      const result = runVerifier(dir)
      expect(result.ok, result.output).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('包体被篡改 → 判为不可发布', () => {
    const dir = makeArtifact({ tamperBundle: true })
    try {
      const result = runVerifier(dir)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('package_sha256')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('未知发布者密钥 → 判为不可发布', () => {
    const dir = makeArtifact({ unknownKey: true })
    try {
      const result = runVerifier(dir)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('未知发布者密钥')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
