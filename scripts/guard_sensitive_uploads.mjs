#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const blockedPaths = new Set([
  'scripts/analyze_turso_grades.py',
  'scripts/query_turso.py',
])

const sensitivePatterns = [
  { name: 'Turso libsql 地址', regex: /libsql:\/\/[^\s"'`]+/g },
  { name: 'JWT/Turso 令牌', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'HuggingFace Token', regex: /\bhf_[A-Za-z0-9]{20,}\b/g },
  { name: 'Resend API Key', regex: /\bre_[A-Za-z0-9_]{20,}\b/g },
  { name: 'Bearer Token', regex: /Authorization\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._-]{20,}/gi },
  {
    name: '敏感环境变量',
    regex: /\b(?:TURSO_TOKEN|TURSO_DB_AUTH_TOKEN|CLOUDFLARE_API_TOKEN|STATUS_EMAIL_RESEND_API_KEY)\b\s*[:=]\s*["'][^"'\r\n]+["']/g,
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

function scanContent(filePath, text, source) {
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
  console.error('用法: node scripts/guard_sensitive_uploads.mjs <pre-commit|pre-push|scan-file>')
  process.exit(2)
}

main()
