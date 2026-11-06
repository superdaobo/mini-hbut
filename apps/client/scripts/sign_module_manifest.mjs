#!/usr/bin/env node
/**
 * 模块清单签名工具（#1166 T05）。
 *
 * 作用：给定一个已构建好的模块包（zip）与模块元数据，产出**与 Rust 侧逐字节一致**的
 * `manifest.json`（含 Ed25519 签名）。Rust 的 `module_manifest::canonical_manifest_bytes`
 * 与本文件的 `canonicalJson` 必须保持一致（有跨语言回归测试锁着）。
 *
 * 用法：
 *   node scripts/sign_module_manifest.mjs \
 *     --bundle dist-modules/demo/1.0.0/bundle.zip \
 *     --out dist-modules/demo/1.0.0/manifest.json \
 *     --module-id demo --version 1.0.0 --release-seq 1 --channel main \
 *     --name "示例模块" --entry index.html \
 *     --permissions school.schedule \
 *     --key-file <私钥文件，PEM/PKCS8 或 32 字节 seed hex> \
 *     [--key-id <key_id>] [--bridge-protocol 1]
 *
 * 测试/本地用途：`--test-seed` 使用固定 seed（**只用于测试与本地开发**，release 不加载该密钥）。
 *
 * 退出码：0 成功；1 参数错误；2 签名失败。
 */
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const DEFAULTS = {
  channel: 'main',
  entry: 'index.html',
  bridgeProtocol: 1,
  keyId: 'dev-test-1'
}

/** 测试用固定 seed（32 字节 0x07）：与 Rust 单测、本地签名脚本保持同一把测试密钥。 */
const TEST_SEED_HEX = '07'.repeat(32)

/** 与 Rust `serde_json` 一致的规范化 JSON：键字典序、无空白、剔除 signature。 */
export const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** 32 字节 seed → Ed25519 PKCS8 private key。 */
const privateKeyFromSeed = (seedHex) => {
  const seed = Buffer.from(seedHex.trim(), 'hex')
  if (seed.length !== 32) throw new Error('seed 必须是 32 字节 hex')
  const pkcs8 = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed
  ])
  return createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
}

const privateKeyFromFile = (filePath) => {
  const raw = readFileSync(filePath, 'utf8').trim()
  if (raw.startsWith('-----BEGIN')) return createPrivateKey({ key: raw, format: 'pem' })
  return privateKeyFromSeed(raw)
}

const publicKeyB64Url = (privateKey) => {
  const spki = createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
  return spki.subarray(spki.length - 32).toString('base64url')
}

const parseArgs = (argv) => {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    if (key === 'test-seed' || key === 'print-canonical') {
      args[key === 'test-seed' ? 'testSeed' : 'printCanonical'] = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`参数 ${token} 缺少取值`)
    }
    args[key] = value
    i += 1
  }
  return args
}

export const buildManifest = ({ args, bundleSha256, privateKey, publicKeyB64 }) => {
  const moduleId = String(args['module-id'] || '').trim()
  const version = String(args.version || '').trim()
  if (!moduleId) throw new Error('缺少 --module-id')
  if (!version) throw new Error('缺少 --version')
  const releaseSeq = Number(args['release-seq'] || 0)
  if (!Number.isInteger(releaseSeq) || releaseSeq <= 0) {
    throw new Error('--release-seq 必须是正整数（防回放依赖它单调递增）')
  }
  const permissions = String(args.permissions || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .sort()

  const manifest = {
    module_id: moduleId,
    version,
    release_seq: releaseSeq,
    channel: String(args.channel || DEFAULTS.channel),
    module_name: String(args.name || moduleId),
    entry_path: String(args.entry || DEFAULTS.entry),
    package_sha256: bundleSha256,
    min_compatible_version: String(args['min-host'] || ''),
    compat: {
      host_min: String(args['min-host'] || ''),
      bridge_protocol: Number(args['bridge-protocol'] || DEFAULTS.bridgeProtocol)
    },
    permissions,
    publisher_key_id: String(args['key-id'] || DEFAULTS.keyId)
  }

  const canonical = canonicalJson(manifest)
  const signature = cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey)
  if (!publicKeyB64) throw new Error('公钥推导失败')
  // ⚠️ 契约现状：签名只覆盖 Rust 侧声明的字段（见 MODULE_MANIFEST_FIELDS）。
  // 前端还会消费 `package_url` / `open_url` 等**未被签名覆盖**的扩展字段，因此这里允许附加它们，
  // 但调用方必须知道：这些字段不具备签名保护（已记录为待修问题）。
  const extra = {}
  if (args['package-url']) extra.package_url = String(args['package-url'])
  if (args['open-url']) extra.open_url = String(args['open-url'])
  if (args['package-size']) extra.package_size = Number(args['package-size'])
  return {
    manifest: {
      ...manifest,
      ...extra,
      signature: {
        alg: 'ed25519',
        key_id: manifest.publisher_key_id,
        value: signature.toString('base64url')
      }
    },
    canonical
  }
}

const main = (argv) => {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(`[sign-manifest] ${error.message}`)
    return 1
  }
  const bundlePath = args.bundle
  const outPath = args.out
  if (!bundlePath || !outPath) {
    console.error('[sign-manifest] 必须提供 --bundle 与 --out')
    return 1
  }

  try {
    const bundle = readFileSync(bundlePath)
    const bundleSha256 = createHash('sha256').update(bundle).digest('hex')
    const privateKey = args.testSeed
      ? privateKeyFromSeed(TEST_SEED_HEX)
      : privateKeyFromFile(String(args['key-file'] || ''))
    const publicKeyB64 = publicKeyB64Url(privateKey)
    const { manifest, canonical } = buildManifest({
      args,
      bundleSha256,
      privateKey,
      publicKeyB64
    })
    mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    if (args.printCanonical) {
      process.stdout.write(`${canonical}\n`)
    }
    console.log(
      `[sign-manifest] 已签名 ${manifest.module_id}@${manifest.version} (release_seq=${manifest.release_seq}) → ${outPath}`
    )
    console.log(`[sign-manifest] publisher=${manifest.publisher_key_id} sha256=${bundleSha256.slice(0, 16)}…`)
    return 0
  } catch (error) {
    console.error(`[sign-manifest] 失败：${error.message}`)
    return 2
  }
}

if (process.argv[1] && process.argv[1].endsWith('sign_module_manifest.mjs')) {
  process.exit(main(process.argv.slice(2)))
}
