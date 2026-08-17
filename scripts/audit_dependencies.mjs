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
const failures = []
for (const project of projects) {
  console.log(`[dependency-audit] ${project.name}`)
  let passed = false
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync(process.execPath, [npmCli, 'audit', '--audit-level=high'], {
      cwd: project.directory,
      encoding: 'utf8',
      shell: false
    })
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.status === 0) {
      passed = true
      break
    }
    const combined = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`
    if (!transientNetworkPattern.test(combined) || attempt === 3) {
      failures.push(`${project.name} (exit ${result.status ?? 'signal'})`)
      break
    }
    console.warn(`[dependency-audit] transient registry failure, retry ${attempt}/3`)
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
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
