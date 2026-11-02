#!/usr/bin/env node
/**
 * 发布签名材料守卫（#1166 T05）。
 *
 * 目的：确保**真实发布私钥永远不会进仓库**，同时允许「测试专用密钥」存在于明确位置。
 *
 * 规则：
 * 1. 仓库里任何 PEM 私钥块（`-----BEGIN * PRIVATE KEY-----`）都不允许出现在
 *    `**\/testdata\/**` 与 `**\/fixtures\/**` 之外；
 * 2. 32 字节 seed 只能出现在白名单文件里（签名脚本常量 + Rust 单测夹具）；
 * 3. 若存在 `apps/client/scripts/module_signing_key*` 之类的真实密钥文件，直接失败。
 *
 * 用法：`node scripts/check_module_signing_material.mjs [--root <repo apps/client 目录>]`
 * 退出码：0 通过；1 发现违规。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-release',
  'target',
  '.git',
  'gen',
  '.tauri-tmp',
  'coverage'
])
const TEXT_EXT = /\.(?:mjs|js|cjs|ts|tsx|vue|json|rs|toml|yml|yaml|md|pem|key|txt|sh|ps1)$/i
const ALLOW_PRIVATE_KEY_IN = [/[/\\](?:testdata|fixtures)[/\\]/i]
/** 允许出现测试 seed 的文件（签名脚本自身的常量 + Rust 单测）。 */
const ALLOW_TEST_SEED_IN = [
  /sign_module_manifest\.mjs$/,
  /module_manifest\.rs$/,
  /module_bundle\.rs$/
]
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----/
// 只匹配**真正的密钥材料**：重复拼接的 07 seed 字面量，或 64 个字符的 07 十六进制串。
// 不匹配 Rust 通用的 `[7u8; 32]`（那是设备密钥测试的既有写法，不是模块签名材料）。
const TEST_SEED_LITERAL = /(?:['"]07['"]\.repeat\(32\))|(?:\b(?:07){32}\b)/

const walk = (dir, files = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(path.join(dir, entry.name), files)
      continue
    }
    if (!TEXT_EXT.test(entry.name)) continue
    files.push(path.join(dir, entry.name))
  }
  return files
}

const main = () => {
  const rootArg = process.argv.indexOf('--root')
  const root = path.resolve(rootArg > 0 ? process.argv[rootArg + 1] : '.')
  const violations = []

  for (const file of walk(root)) {
    let text
    try {
      if (statSync(file).size > 2 * 1024 * 1024) continue
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const relative = path.relative(root, file).replace(/\\/g, '/')
    // 本脚本自身含检测正则，按构造忽略
    if (relative.endsWith('check_module_signing_material.mjs')) continue

    if (PRIVATE_KEY_BLOCK.test(text) && !ALLOW_PRIVATE_KEY_IN.some((rule) => rule.test(file))) {
      violations.push({ file: relative, rule: '私钥块出现在不允许的路径' })
    }
    if (
      TEST_SEED_LITERAL.test(text) &&
      !ALLOW_TEST_SEED_IN.some((rule) => rule.test(file))
    ) {
      violations.push({ file: relative, rule: '测试 seed 出现在白名单之外' })
    }
    if (/module_signing_key(?!.*test)/i.test(relative) && !/testdata|fixtures/i.test(relative)) {
      violations.push({ file: relative, rule: '疑似真实签名密钥文件' })
    }
  }

  if (violations.length > 0) {
    console.error('[signing-material] 发现可疑发布签名材料：')
    for (const item of violations) console.error(`  - ${item.file}: ${item.rule}`)
    console.error(
      '[signing-material] 真实发布私钥必须放在仓库外（受控签名环境），测试密钥只能在 testdata/fixtures。'
    )
    return 1
  }
  console.log('[signing-material] 未发现发布私钥或越界的测试 seed。')
  return 0
}

process.exit(main())
