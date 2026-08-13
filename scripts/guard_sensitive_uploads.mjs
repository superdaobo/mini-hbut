#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const repoRoot = process.cwd()
const blockedPaths = new Set([
  'scripts/analyze_turso_grades.py',
  'scripts/query_turso.py',
])

export const sensitivePatterns = [
  { name: 'Turso libsql 地址', regex: /libsql:\/\/[^\s"'`]+/g },
  { name: 'JWT/Turso 令牌', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'HuggingFace Token', regex: /\bhf_[A-Za-z0-9]{20,}\b/g },
  { name: 'Resend API Key', regex: /\bre_[A-Za-z0-9_]{20,}\b/g },
  { name: 'Bearer Token', regex: /Authorization\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._-]{20,}/gi },
  {
    name: '敏感环境变量',
    regex: /\b(?:TURSO_TOKEN|TURSO_DB_AUTH_TOKEN|CLOUDFLARE_API_TOKEN|STATUS_EMAIL_RESEND_API_KEY)\b\s*[:=]\s*["'][^"'\r\n]+["']/g,
  },
  // ---- Identity Platform 敏感值类别（#618 + #626 扩展）----
  // 密钥类环境变量赋值（要求带引号；.env.example 占位无引号，不会误报）
  {
    name: 'Identity 平台密钥类环境变量赋值',
    regex:
      /\b(?:IDENTITY_DATABASE_URL|IDENTITY_JWKS_JSON|IDENTITY_SIGNING_KEY|IDENTITY_PAIRWISE_SUBJECT_KEY|IDENTITY_CLIENT_SECRET_KEK|IDENTITY_HANDOFF_HMAC_KEY|IDENTITY_COOKIE_KEYS|IDENTITY_SERVICE_TOKEN|IDENTITY_STATIC_CLIENTS_JSON|WEB_SESSION_SECRET|DEVELOPER_OIDC_CLIENT_SECRET)\b\s*[:=]\s*["'][^"'\r\n]{6,}["']/g,
  },
  // #626：handoff / 服务令牌样例赋值（Web BFF 转发头；fixture/日志样例不得进仓库）
  // 头名允许被引号包裹（JSON 风格），如 "x-identity-handoff": "..."；
  // 值 ≥ 16 字符才命中，短占位/说明文字不误报。
  {
    name: 'Identity handoff/令牌样例赋值',
    regex: /\b(?:x-identity-handoff|x-identity-service-token)["']?\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/gi,
  },
  // Vercel API Token（vercel_ 前缀）
  { name: 'Vercel Token', regex: /\bvercel_[A-Za-z0-9]{20,}\b/g },
  // PostgreSQL/Neon 连接串（含 user:pass@ 凭据；排除 <> 占位符避免误报模板）
  {
    name: 'PostgreSQL 连接串（含密码）',
    regex: /\b(?:postgres|postgresql|neon):\/\/[^:\s<>"'`\r\n]+:[^@\s<>"'`\r\n]+@/g,
  },
  // PEM 私钥块
  { name: 'PEM 私钥块', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  // OIDC 私钥 JWK：kty 与 d（私钥参数）同现才命中，普通 JSON 不会误报
  {
    name: 'OIDC 私钥 JWK（kty+d 组合）',
    regex: /"kty"\s*:\s*"[A-Za-z0-9_]+"[\s\S]{0,300}?"d"\s*:\s*"[A-Za-z0-9_\-]{10,}"/g,
  },
]

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  })
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`git ${args.join(' ')} 失败: ${detail}`)
  }
  return result
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').trim()
}

function summarizeMatch(text, index) {
  const start = Math.max(0, index - 24)
  const end = Math.min(text.length, index + 64)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

export function scanContent(filePath, text, source) {
  const findings = []
  const normalizedPath = normalizePath(filePath)
  if (blockedPaths.has(normalizedPath)) {
    findings.push({
      file: normalizedPath,
      source,
      rule: '禁止提交的敏感脚本',
      excerpt: normalizedPath,
    })
  }
  // 自身豁免：guard 脚本与其测试文件内含构造的假敏感样例（fixture 自检），
  // 扫描会误报为真实泄漏；这两个文件本身是检测逻辑，不携带真实密钥。
  if (
    normalizedPath === 'scripts/guard_sensitive_uploads.mjs' ||
    normalizedPath === 'scripts/guard_sensitive_uploads.test.mjs'
  ) {
    return findings
  }
  if (!text || /\0/.test(text)) return findings
  for (const pattern of sensitivePatterns) {
    pattern.regex.lastIndex = 0
    let match
    while ((match = pattern.regex.exec(text)) !== null) {
      findings.push({
        file: normalizedPath,
        source,
        rule: pattern.name,
        excerpt: summarizeMatch(text, match.index),
      })
      if (findings.length >= 8) return findings
    }
  }
  return findings
}

function getStagedFiles() {
  const result = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
  return result.stdout
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean)
}

function readStagedBlob(filePath) {
  const result = runGit(['show', `:${filePath}`], { allowFailure: true })
  if (result.status !== 0) return ''
  return result.stdout
}

function getPushCommitsFromStdin(stdinText) {
  const commits = new Set()
  const zero = /^0+$/
  for (const rawLine of stdinText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/)
    if (!localSha || zero.test(localSha)) continue
    const args = zero.test(remoteSha || '')
      ? ['rev-list', localSha, '--not', '--remotes', '--tags']
      : ['rev-list', `${remoteSha}..${localSha}`]
    const result = runGit(args, { allowFailure: true })
    if (result.status !== 0) continue
    for (const commit of result.stdout.split(/\r?\n/).filter(Boolean)) {
      commits.add(commit.trim())
    }
  }
  return [...commits]
}

function getChangedFilesForCommit(commit) {
  const result = runGit(
    ['diff-tree', '--no-commit-id', '--name-only', '-r', '--diff-filter=ACMR', commit],
    { allowFailure: true },
  )
  if (result.status !== 0) return []
  return result.stdout
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean)
}

function readCommitBlob(commit, filePath) {
  const result = runGit(['show', `${commit}:${filePath}`], { allowFailure: true })
  if (result.status !== 0) return ''
  return result.stdout
}

function printFindingsAndExit(findings) {
  if (!findings.length) return
  console.error('\n[SecretGuard] 检测到敏感内容，已阻止本次提交/推送：')
  for (const finding of findings.slice(0, 12)) {
    console.error(`- ${finding.file} (${finding.source}) -> ${finding.rule}`)
    console.error(`  ${finding.excerpt}`)
  }
  console.error('\n请先移除密钥/令牌，或改为读取本地环境变量、未跟踪文件。')
  process.exit(1)
}

function scanFilesWithReader(files, reader, sourceLabel) {
  const findings = []
  for (const filePath of files) {
    const text = reader(filePath)
    findings.push(...scanContent(filePath, text, sourceLabel))
    if (findings.length >= 12) break
  }
  return findings
}

function scanPush(stdinText) {
  const commits = getPushCommitsFromStdin(stdinText)
  const findings = []
  const seen = new Set()
  for (const commit of commits) {
    const files = getChangedFilesForCommit(commit)
    for (const filePath of files) {
      const key = `${commit}:${filePath}`
      if (seen.has(key)) continue
      seen.add(key)
      const text = readCommitBlob(commit, filePath)
      findings.push(...scanContent(filePath, text, `commit ${commit.slice(0, 8)}`))
      if (findings.length >= 12) return findings
    }
  }
  return findings
}

function scanSingleFile(filePath) {
  const absolutePath = path.resolve(repoRoot, filePath)
  const text = readFileSync(absolutePath, 'utf8')
  return scanContent(filePath, text, 'scan-file')
}

function main() {
  const mode = process.argv[2]
  if (mode === 'self-test') {
    runSelfTest()
    return
  }
  if (mode === 'pre-commit') {
    printFindingsAndExit(scanFilesWithReader(getStagedFiles(), readStagedBlob, 'staged'))
    return
  }
  if (mode === 'pre-push') {
    const stdinText = readFileSync(0, 'utf8')
    printFindingsAndExit(scanPush(stdinText))
    return
  }
  if (mode === 'scan-file') {
    const target = process.argv[3]
    if (!target) {
      console.error('用法: node scripts/guard_sensitive_uploads.mjs scan-file <path>')
      process.exit(2)
    }
    printFindingsAndExit(scanSingleFile(target))
    console.log('[SecretGuard] 未发现敏感内容。')
    return
  }
  console.error('用法: node scripts/guard_sensitive_uploads.mjs <pre-commit|pre-push|scan-file|self-test>')
  process.exit(2)
}

/**
 * 内置 fixture 自检（node scripts/guard_sensitive_uploads.mjs self-test）：
 * 正例必须全部命中，反例必须全部不命中；防止新增敏感类别误伤普通内容。
 */
function runSelfTest() {
  const positive = [
    ['Vercel Token', 'const t = "vercel_abc123ABC456def789GHI012jkl345";'],
    ['PG 连接串', 'DATABASE_URL=postgresql://admin:s3cr3t-pass!word@db.neon.tech/mini_hbut'],
    ['PG 连接串 neon', 'const u = "neon://dbuser:pa55w0rd@ep-foo-1.us-east-2.aws.neon.tech/db";'],
    ['PEM 私钥', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFA\n-----END PRIVATE KEY-----'],
    ['OIDC 私钥 JWK', '{"kty":"EC","crv":"P-256","d":"abcdefghijklmnopqrstuvwxyz123456","x":"AA","y":"BB"}'],
    ['Identity 环境变量', 'const env = { IDENTITY_CLIENT_SECRET_KEK: "0123456789abcdef0123456789abcdef" };'],
    ['Identity DB env', 'process.env.IDENTITY_DATABASE_URL = "postgresql://u:pw@host/db";'],
    ['已有 HF Token 回归', 'const k = "hf_abcdefghijklmnopqrstuvwxyz";'],
    ['#626 服务令牌 env', 'process.env.IDENTITY_SERVICE_TOKEN = "svc-token-0123456789abcdef0123456789abcdef";'],
    ['#626 Cookie 密钥 env', 'const keys = { IDENTITY_COOKIE_KEYS: "cookie-sign-key-0123456789abcdef0123456789abcdef" };'],
    ['#626 handoff 头样例', 'fetch(url, { headers: { "x-identity-handoff": "ho_7hF2kPq9wXyZ4vB6nM1cJ8dL3sA5tR0uE0123" } });'],
    ['#626 服务令牌头样例', 'const h = { "x-identity-service-token": "svc-token-0123456789abcdef0123456789abcdef" };'],
  ]
  const negative = [
    ['普通 JSON', '{"name":"张三","scores":[98,87,76],"remark":"d: ok","note":"kty not really"}'],
    ['短 d 值 JSON', '{"kty":"RSA","d":"123"}'],
    ['.env.example 占位（无引号+尖括号）', 'IDENTITY_DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>'],
    ['issuer 环境变量（非敏感）', 'IDENTITY_ISSUER=https://id.xn--vhq74jc2fzpchter27a.com'],
    ['无凭据 pg URL', 'const db = "postgres://localhost:5432/myapp";'],
    ['普通 vercel 字样', '访问 vercel.com 部署，token 请勿提交'],
    ['短 client_secret 值', '{"client_secret":"none"}'],
    ['普通文本', '今天天气不错，成绩查询应用工作正常。'],
    ['#626 短 handoff 值（低于阈值不误报）', 'headers: { "x-identity-handoff": "short" }'],
    ['#626 无引号 env 占位', 'IDENTITY_SERVICE_TOKEN=<your-service-token>'],
    ['#626 普通 header 说明文字', '文档提到 x-identity-handoff header 用于转发凭据，不携带具体值'],
  ]
  const failures = []
  for (const [label, text] of positive) {
    const findings = scanContent('fixtures/positive.txt', text, 'self-test')
    if (findings.length === 0) failures.push(`[正例未命中] ${label}`)
  }
  for (const [label, text] of negative) {
    const findings = scanContent('fixtures/negative.txt', text, 'self-test')
    if (findings.length > 0) {
      failures.push(`[反例误报] ${label} -> ${findings.map((f) => f.rule).join(', ')}`)
    }
  }
  if (failures.length) {
    console.error(`\n[SecretGuard self-test] ${failures.length} 项失败：`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(`[SecretGuard self-test] 通过（正例 ${positive.length} 项 / 反例 ${negative.length} 项）。`)
}

// 被单测 import 时不执行 CLI 主流程
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main()
}
