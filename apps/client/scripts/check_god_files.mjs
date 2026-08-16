#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { evaluateGodFileGuard } from './lib/god_file_guard.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
// 客户端包根（迁移后 #641：src/ 与 src-tauri/src 的扫描范围）
const repoRoot = path.resolve(scriptDir, '..')
// 仓库根（#646：god-file 债务登记文件仍在仓库根 docs/architecture/god-file-removal/）
const repoTop = path.resolve(repoRoot, '..', '..')
const strict = process.argv.includes('--strict')
const debtPath = path.join(repoTop, 'docs', 'architecture', 'god-file-removal', 'god_file_debt.json')

try {
  const result = evaluateGodFileGuard({ repoRoot, debtPath, strict })
  const mode = strict ? 'strict' : 'migration'
  console.log(`[god-files] mode=${mode} violations=${result.violations.length} debt=${result.registeredDebt.length}`)
  for (const violation of result.violations) {
    const debt = result.registeredDebt.find((entry) => entry.key === violation.key)
    console.log(`  ${debt ? 'DEBT' : 'FAIL'} ${violation.message}${debt ? ` (${debt.issue}, ${debt.owner}, ${debt.deadline})` : ''}`)
  }
  if (!result.ok) {
    for (const error of result.errors) console.error(`[god-files] ${error}`)
    process.exitCode = 1
  } else {
    console.log('[god-files] 架构规模与 runtime 守卫通过')
  }
} catch (error) {
  console.error(`[god-files] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
