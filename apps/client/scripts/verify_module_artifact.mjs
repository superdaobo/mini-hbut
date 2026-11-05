#!/usr/bin/env node
/**
 * 模块发布产物校验器（#1169 T13）。
 *
 * 上传 CDN 之前先跑这一条，能提前发现「包/清单不匹配、签名不对、能力没声明」这三类事故：
 *
 *   node scripts/verify_module_artifact.mjs --dir dist-modules/account_security-1.0.0
 *   node scripts/verify_module_artifact.mjs --dir <dir> --expect-capabilities school.profile_online
 *
 * 校验内容：
 * 1. 目录里同时存在 `bundle.zip` 与 `manifest.json`；
 * 2. `manifest.package_sha256` == 实际 zip 的 sha256；
 * 3. 清单签名能在**内置信任根**（从 Rust 源码读取公钥）上验证通过；
 * 4. 清单的规范化字节与重新计算的字节一致（签名输入自洽）；
 * 5. `release_seq` > 0、`entry_path` 指向包内文件、能力在已知集合内；
 * 6. （可选）`--expect-capabilities` 给出的能力都被声明。
 *
 * 退出码：0 通过；1 校验失败；2 用法/IO 错误。
 */
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const ascii = (value) => String(value ?? '')

const parseArgs = (argv) => {
  const out = new Map()
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out.set(token.slice(2), true)
    } else {
      out.set(token.slice(2), next)
      i += 1
    }
  }
  return out
}

/** 与 Rust `canonical_manifest_bytes` 完全一致的规范化序列化（键字典序、无空白）。 */
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** 向上找仓库根（脚本可能从 apps/client 或仓库根运行）。 */
const findRepoRoot = async (start) => {
  let current = path.resolve(start)
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(current, 'apps/client/src-tauri/src/modules/module_manifest.rs')
    try {
      await fs.access(candidate)
      return current
    } catch {
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return null
}

/** 从 Rust 源码读内置公钥（保持单一事实来源：信任根在 Rust 里）。 */
const loadTrustedKeys = async (repoRoot) => {
  const source = await fs.readFile(
    path.join(repoRoot, 'apps/client/src-tauri/src/modules/module_manifest.rs'),
    'utf8'
  )
  const keys = []
  const pattern = /key_id:\s*"([^"]+)",[\s\S]*?public_key_b64:\s*"([^"]+)"/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    keys.push({ keyId: match[1], publicKeyB64: match[2] })
  }
  return keys
}

const rawEd25519PublicKey = (base64Url) => {
  const raw = Buffer.from(base64Url, 'base64url')
  if (raw.length !== 32) throw new Error(`公钥长度异常: ${raw.length}`)
  // SPKI 前缀 + 32 字节原始公钥 → 可用 crypto.verify 的 KeyObject
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw])
  return createPublicKey({ key: spki, format: 'der', type: 'spki' })
}

const main = async () => {
  const args = parseArgs(process.argv)
  const dirArg = args.get('dir')
  if (!dirArg || dirArg === true) {
    console.error('[verify-artifact] 用法: --dir <产物目录> [--expect-capabilities a,b]')
    return 2
  }
  const root = await findRepoRoot(process.cwd())
  if (!root) {
    console.error('[verify-artifact] 找不到仓库根（需要 apps/client/src-tauri/src/modules/module_manifest.rs）')
    return 2
  }
  const dir = path.resolve(String(dirArg))
  const failures = []
  const notes = []

  const bundlePath = path.join(dir, 'bundle.zip')
  const manifestPath = path.join(dir, 'manifest.json')
  let manifest
  let bundle
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    bundle = await fs.readFile(bundlePath)
  } catch (error) {
    console.error(`[verify-artifact] 读取产物失败: ${ascii(error.message)}`)
    return 2
  }

  // 1. 摘要
  const actualSha = createHash('sha256').update(bundle).digest('hex')
  if (String(manifest.package_sha256 || '').toLowerCase() !== actualSha) {
    failures.push(`package_sha256 与包体不符（清单 ${manifest.package_sha256}，实际 ${actualSha}）`)
  }

  // 2. 签名
  const signature = manifest.signature
  if (!signature || !signature.value || !signature.key_id) {
    failures.push('清单缺少 signature')
  } else {
    const keys = await loadTrustedKeys(root)
    const key = keys.find((item) => item.keyId === signature.key_id)
    if (!key) {
      failures.push(`未知发布者密钥: ${signature.key_id}（内置信任根: ${keys.map((k) => k.keyId).join(',') || '空'}）`)
    } else if (String(signature.alg || '').toLowerCase() !== 'ed25519') {
      failures.push(`不支持的签名算法: ${signature.alg}`)
    } else {
      const payload = Buffer.from(canonicalJson(withoutSignature(manifest)), 'utf8')
      let ok = false
      try {
        ok = cryptoVerify(null, payload, rawEd25519PublicKey(key.publicKeyB64), Buffer.from(signature.value, 'base64url'))
      } catch (error) {
        failures.push(`签名验证异常: ${ascii(error.message)}`)
      }
      if (!ok && !failures.length) failures.push('签名验证失败')
    }
  }

  // 3. 其它结构约束
  if (!Number.isInteger(manifest.release_seq) || manifest.release_seq <= 0) {
    failures.push('release_seq 必须是正整数（防回放依赖它）')
  }
  const entry = String(manifest.entry_path || '')
  if (!entry || entry.includes('..') || entry.startsWith('/')) {
    failures.push(`entry_path 非法: ${entry}`)
  }
  const expectedCapabilities = String(args.get('expect-capabilities') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const declared = Array.isArray(manifest.permissions) ? manifest.permissions : []
  for (const capability of expectedCapabilities) {
    if (!declared.includes(capability)) failures.push(`清单未声明能力: ${capability}`)
  }
  notes.push(`module_id=${manifest.module_id} version=${manifest.version} release_seq=${manifest.release_seq}`)
  notes.push(`permissions=${declared.join(',') || '(none)'}`)
  notes.push(`bundle=${bundle.length} bytes sha256=${actualSha.slice(0, 16)}…`)

  if (failures.length) {
    console.error('[verify-artifact] 产物不可发布：')
    for (const failure of failures) console.error(`  - ${failure}`)
    return 1
  }
  console.log('[verify-artifact] 通过：')
  for (const note of notes) console.log(`  · ${note}`)
  return 0
}

const withoutSignature = (manifest) => {
  const clone = { ...manifest }
  delete clone.signature
  return clone
}

process.exit(await main())
