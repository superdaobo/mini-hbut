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
 * 判定一条 npm audit --json 报告在应用豁免后是否通过(必须传入含 vulnerabilities
 * 对象的有效报告;npm 自身故障的空输出由调用方按失败处理,不走本函数)。
 *
 * npm 的 via 数组有两种形态:直接公告(对象,含 source 数字 id 与 url)与链式引用
 * (字符串,指向另一个受影响包名)。豁免按不动点传播:某个包的**全部**直接公告都被
 * 豁免、且其链式引用(若有)也都已豁免,才进入「已豁免包」集合——例如 braces(豁免)
 * → micromatch(via: ['braces'])→ fast-glob(via: ['micromatch'])整条工具链不再阻塞;
 * 而混合形态(直接公告已豁免 + 链式引用指向未豁免脆弱包)不会被整体豁免,避免掩盖
 * 链式风险。
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
      const directAllExempt =
        directAdvisories.length > 0 &&
        directAdvisories.every((via) => {
          const id = typeof via.url === 'string' ? via.url.split('/').pop() : via.source
          return exemptGhsa.has(id)
        })
      const chainAllExempt = chainRefs.every((ref) => exemptedPackages.has(ref))
      const exemptNow = directAdvisories.length > 0
        ? directAllExempt && chainAllExempt
        : chainRefs.length > 0 && chainAllExempt
      if (exemptNow) {
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
    // fail-closed:只有「可解析出漏洞报告且剩余项全被豁免」才放行。
    // npm 自身故障(DNS/连接拒绝、lockfile 损坏、npm 崩溃导致空输出或错误 JSON,
    // 即不含 vulnerabilities 对象)一律按失败处理,绝不静默放行(#982 审查 P1)。
    let report = null
    try {
      const parsed = JSON.parse(result.stdout || '{}')
      if (parsed && typeof parsed.vulnerabilities === 'object' && parsed.vulnerabilities !== null) {
        report = parsed
      }
    } catch {
      // fallthrough: report 保持 null
    }
    if (report) {
      const remaining = evaluateAuditReport(report)
      if (remaining.length === 0) {
        console.log(`[dependency-audit] ${project.name}: remaining findings covered by exemptions (${exemptGhsa.size} ghsa)`)
        passed = true
      } else {
        console.error(`[dependency-audit] ${project.name} unexempted findings: ${remaining.join(', ')}`)
        failures.push(`${project.name} (unexempted: ${remaining.join(', ')})`)
      }
    } else {
      console.error(`[dependency-audit] ${project.name}: audit failed without a parseable vulnerability report (exit ${result.status ?? 'signal'}); treating as failure`)
      failures.push(`${project.name} (no vulnerability report, exit ${result.status ?? 'signal'})`)
    }
    break
  }
  if (!passed && !failures.some((f) => f.startsWith(`${project.name} `))) {
    failures.push(`${project.name} (unknown failure)`)
  }
}
if (failures.length) {
  console.error(`[dependency-audit] failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log(`[dependency-audit] all ${projects.length} npm lockfiles passed`)
