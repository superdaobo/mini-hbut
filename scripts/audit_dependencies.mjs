import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 以脚本自身位置解析仓库根，保证从仓库根或 apps/client 调用结果一致（#642）
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('npm_execpath is required; run through npm run audit:dependencies')

const projects = [
  { name: 'client', directory: path.join(repoRoot, 'apps/client') },
  { name: 'website', directory: path.join(repoRoot, 'website') }
]
for (const entry of fs.readdirSync(path.join(repoRoot, 'website/modules-src'), { withFileTypes: true })) {
  const directory = path.join(repoRoot, 'website/modules-src', entry.name, 'project')
  if (entry.isDirectory() && fs.existsSync(path.join(directory, 'package-lock.json'))) {
    projects.push({ name: `module:${entry.name}`, directory })
  }
}

const transientNetworkPattern = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|audit endpoint returned an error|network timeout/i

// 显式豁免清单(scripts/audit_exemptions.json):仅用于「npm 无修复版本可升」的公告,
// 每条必须带 package + reason + added,上游发布修复后必须移除并重跑本脚本(#982)。
const exemptionsFile = path.join(repoRoot, 'scripts/audit_exemptions.json')
const exemptGhsa = new Set(
  JSON.parse(fs.readFileSync(exemptionsFile, 'utf8')).exemptions.map((item) => item.ghsa)
)

/**
 * 判定一条 npm audit --json 报告在应用豁免后是否通过。
 *
 * npm 的 via 数组有两种形态:直接公告(对象,含 source='GHSA-…')与链式引用(字符串,
 * 指向另一个受影响包名)。豁免按不动点传播:某个包的全部直接公告都被豁免后,它进入
 * 「已豁免包」集合,纯链式依赖它的条目也随之豁免——例如 braces(豁免)→ micromatch
 * (via: ['braces'])→ fast-glob(via: ['micromatch'])整条工具链不再阻塞。
 */
const evaluateAuditReport = (report) => {
  const entries = Object.entries(report?.vulnerabilities ?? {})
  const exemptedPackages = new Set()
  let changed = true
  while (changed) {
    changed = false
    for (const [name, entry] of entries) {
      if (exemptedPackages.has(name)) continue
      const directAdvisories = (entry.via ?? []).filter((via) => typeof via === 'object')
      const chainRefs = (entry.via ?? []).filter((via) => typeof via === 'string')
      // npm audit --json 的 via.source 是数字 id,GHSA 编号在 via.url 末段
      const ghsaOf = (via) => (typeof via.url === 'string' ? via.url.split('/').pop() : via.source)
      const directAllExempt =
        directAdvisories.length > 0 && directAdvisories.every((via) => exemptGhsa.has(ghsaOf(via)))
      const chainAllExempt = directAdvisories.length === 0 && chainRefs.length > 0 && chainRefs.every((ref) => exemptedPackages.has(ref))
      if (directAllExempt || chainAllExempt) {
        exemptedPackages.add(name)
        changed = true
      }
    }
  }
  return entries
    .filter(([name, entry]) => !exemptedPackages.has(name) && (entry.severity === 'high' || entry.severity === 'critical' || entry.via?.some((via) => typeof via === 'object' && (via.severity === 'high' || via.severity === 'critical'))))
    .map(([name, entry]) => `${name}(${entry.severity})`)
}

const failures = []
for (const project of projects) {
  console.log(`[dependency-audit] ${project.name}`)
  let passed = false
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync(process.execPath, [npmCli, 'audit', '--audit-level=high', '--json'], {
      cwd: project.directory,
      encoding: 'utf8',
      shell: false
    })
    if (result.status === 0) {
      passed = true
      break
    }
    const combined = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`
    if (transientNetworkPattern.test(combined) && attempt < 3) {
      console.warn(`[dependency-audit] transient registry failure, retry ${attempt}/3`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
      continue
    }
    if (combined.includes('ENOTFOUND') || combined.includes('ECONNREFUSED')) break
    let report
    try {
      report = JSON.parse(result.stdout || '{}')
    } catch {
      break
    }
    const remaining = evaluateAuditReport(report)
    if (remaining.length === 0) {
      console.log(`[dependency-audit] ${project.name}: remaining findings covered by exemptions (${exemptGhsa.size} ghsa)`)
      passed = true
    } else {
      console.error(`[dependency-audit] ${project.name} unexempted findings: ${remaining.join(', ')}`)
      failures.push(`${project.name} (unexempted: ${remaining.join(', ')})`)
    }
    break
  }
  if (!passed && failures.at(-1)?.startsWith(`${project.name} `) === false) {
    failures.push(`${project.name} (unknown failure)`)
  }
}
if (failures.length) {
  console.error(`[dependency-audit] failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log(`[dependency-audit] all ${projects.length} npm lockfiles passed`)
