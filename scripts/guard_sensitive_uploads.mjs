#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// 惰性获取仓库根（#644）：脚本可从任意 cwd 运行（CLI / deploy 临时仓库 / 单测 chdir），
// 每次执行 git 命令时取当前 cwd，避免模块加载时固化路径。
function getRepoRoot() {
  return process.cwd()
}

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
    cwd: getRepoRoot(),
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

function lineAt(text, index) {
  const start = text.lastIndexOf('\n', Math.max(0, index - 1)) + 1
  const next = text.indexOf('\n', index)
  const end = next === -1 ? text.length : next
  return text.slice(start, end)
}

function isIdentityEnvNameMirror(matchText) {
  const match = /^([A-Z0-9_]+)\s*[:=]\s*(["'])([^"']+)\2$/.exec(matchText.trim())
  return Boolean(match && match[1] === match[3])
}

function isExplicitIdentityTestFixture(normalizedPath, text, index) {
  const isIdentityTest =
    normalizedPath.startsWith('identity-platform/')
    && (
      normalizedPath.includes('/tests/')
      || normalizedPath.startsWith('identity-platform/e2e/')
    )
  if (!isIdentityTest) return false

  // 测试目录也不能整体跳过扫描：只有同一行显式标注的固定假凭据才允许。
  // 这样未来即使有人误把真实 token/连接串写进 tests/e2e，SecretGuard 仍会阻断提交。
  return /secretguard:\s*allow-test-fixture\b/i.test(lineAt(text, index))
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
      if (
        pattern.name === 'Identity 平台密钥类环境变量赋值'
        && isIdentityEnvNameMirror(match[0])
      ) {
        continue
      }
      if (isExplicitIdentityTestFixture(normalizedPath, text, match.index)) {
        continue
      }
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
  // --root: 对根提交（无父）与空树比较，否则 diff-tree 对 root commit 输出为空（#644）
  const result = runGit(
    ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '--diff-filter=ACMR', commit],
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
  return scanCommits(commits)
}

/**
 * 解析 commit range 为待扫描提交列表（#644）。
 * range 形如 "<before>..<after>"（CI push 用 before/after，PR 用 base/head）；
 * before 缺失或全零（首次 push / 含根提交的场景）时扫描 after 的全部祖先（含根提交）。
 * range 无法解析、after 缺失或 git 读取失败时抛错——调用方必须转为非零退出，绝不能静默放行。
 */
export function getCommitsForRange(range) {
  if (!range || !range.includes('..')) {
    throw new Error(`无效的 commit range: ${JSON.stringify(range)}（应为 before..after）`)
  }
  const [before, after] = range.split('..')
  const afterSha = (after || '').trim()
  if (!afterSha || /\s/.test(afterSha) || afterSha.includes('..')) {
    throw new Error(`无效的 commit range: ${JSON.stringify(range)}（after 缺失或不是合法引用）`)
  }
  const beforeSha = (before || '').trim()
  const isRootScenario = !beforeSha || /^0+$/.test(beforeSha)
  // runGit 在 rev-list 失败时抛错（无法读取 Git 范围 → 非静默放行）
  const args = isRootScenario
    ? ['rev-list', afterSha]
    : ['rev-list', `${beforeSha}..${afterSha}`]
  const result = runGit(args)
  return result.stdout
    .split(/\r?\n/)
    .map((commit) => commit.trim())
    .filter(Boolean)
}

/** 逐个提交扫描变更文件（新内容；删除 D 不引入敏感内容，重命名 R 扫新 blob） */
export function scanCommits(commits) {
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
  const absolutePath = path.resolve(getRepoRoot(), filePath)
  const text = readFileSync(absolutePath, 'utf8')
  return scanContent(filePath, text, 'scan-file')
}

/** 显式文件集合扫描（#644）：从工作区读取指定文件内容；文件缺失时抛错（非静默放行） */
function scanExplicitFiles(files) {
  const findings = []
  for (const filePath of files) {
    const absolutePath = path.resolve(getRepoRoot(), filePath)
    let text
    try {
      text = readFileSync(absolutePath, 'utf8')
    } catch (err) {
      // ENOENT：文件已被删除（如迁移中并行删除的旧壳），不会进入提交，跳过扫描；
      // 其他错误（权限等）属于扫描失败，必须抛错阻止放行。
      if (err.code === 'ENOENT') continue
      throw err
    }
    findings.push(...scanContent(filePath, text, 'scan-files'))
    if (findings.length >= 12) return findings
  }
  return findings
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
  if (mode === 'scan-range') {
    const range = process.argv[3]
    if (!range) {
      console.error('用法: node scripts/guard_sensitive_uploads.mjs scan-range <before>..<after>')
      process.exit(2)
    }
    try {
      // #644: commit range 模式（CI push 用 before/after，PR 用 base/head）。
      // 无法读取 Git 范围 / 扫描失败时必须非零退出，不能静默放行。
      printFindingsAndExit(scanCommits(getCommitsForRange(range)))
    } catch (err) {
      console.error(`[SecretGuard] commit range 扫描失败，已阻止放行: ${err.message}`)
      process.exit(1)
    }
    console.log(`[SecretGuard] 未发现敏感内容（range: ${range}）。`)
    return
  }
  if (mode === 'scan-files') {
    const args = process.argv.slice(3)
    // 无参数或 "-" 时从 stdin 读文件列表（每行一个路径），
    // 支持 check_all 全量已跟踪文件等大集合（避免命令行参数超长）。
    let files = args.length === 1 && args[0] === '-' ? [] : args
    if (args.length === 0 || (args.length === 1 && args[0] === '-')) {
      files = readFileSync(0, 'utf8')
        .split(/\r?\n/)
        .map(normalizePath)
        .filter(Boolean)
    }
    if (!files.length) {
      console.error('用法: node scripts/guard_sensitive_uploads.mjs scan-files <path> [<path> ...]')
      console.error('      或: git ls-files -z | node scripts/guard_sensitive_uploads.mjs scan-files -')
      process.exit(2)
    }
    try {
      // #644: 显式文件集合模式（check_all 全量已跟踪文件 / 自动提交脚本），
      // 不依赖暂存区；文件读取失败时抛错非零退出。
      printFindingsAndExit(scanExplicitFiles(files))
    } catch (err) {
      console.error(`[SecretGuard] 文件集合扫描失败，已阻止放行: ${err.message}`)
      process.exit(1)
    }
    console.log('[SecretGuard] 未发现敏感内容。')
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
  console.error('用法: node scripts/guard_sensitive_uploads.mjs <pre-commit|pre-push|scan-range|scan-files|scan-file|self-test>')
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
