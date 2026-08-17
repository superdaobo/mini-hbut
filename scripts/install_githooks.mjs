#!/usr/bin/env node
/**
 * 安装 / 校验 Git hooks（#644）。
 *
 * 用法：
 *   node scripts/install_githooks.mjs            # 安装（设置 core.hooksPath）+ 校验
 *   node scripts/install_githooks.mjs check      # 仅校验（不改动配置）
 *
 * 行为：
 *   - 设置（或确认）仓库级 core.hooksPath=.githooks
 *   - 校验 .githooks/pre-commit、pre-push 存在且内容非空
 *   - POSIX 下额外校验可执行位；Windows 无 POSIX 可执行位概念，
 *     Git for Windows 由 git 直接调用 bash 执行 sh 脚本，不依赖该位
 *   - 校验失败以非零退出，避免门禁静默失效
 */
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hooksDir = '.githooks'
const hookFiles = ['pre-commit', 'pre-push']

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} 失败: ${(result.stderr || result.stdout).trim()}`)
  }
  return result
}

function main() {
  const mode = process.argv[2] ?? 'install'
  if (mode !== 'install' && mode !== 'check') {
    console.error('用法: node scripts/install_githooks.mjs [install|check]')
    process.exit(2)
  }

  const current = runGit(['config', 'core.hooksPath'], { allowFailure: true }).stdout.trim()
  if (mode === 'install' && current !== hooksDir) {
    runGit(['config', 'core.hooksPath', hooksDir])
    console.log(`[install-githooks] core.hooksPath 已设置为 ${hooksDir}`)
  } else {
    console.log(`[install-githooks] core.hooksPath=${current || '(未设置)'}`)
  }
  if (current && current !== hooksDir) {
    console.warn(`[install-githooks] 注意：core.hooksPath 原为 "${current}"，已覆盖为 ${hooksDir}`)
  }

  let failed = false
  for (const file of hookFiles) {
    const hookPath = path.join(repoRoot, hooksDir, file)
    if (!existsSync(hookPath)) {
      console.error(`[install-githooks] 缺失: ${hooksDir}/${file}`)
      failed = true
      continue
    }
    if (statSync(hookPath).size === 0) {
      console.error(`[install-githooks] 空文件: ${hooksDir}/${file}`)
      failed = true
      continue
    }
    if (process.platform !== 'win32') {
      try {
        accessSync(hookPath, constants.X_OK)
      } catch {
        console.error(`[install-githooks] 不可执行（POSIX 需要可执行位）: ${hooksDir}/${file}（chmod +x 后重新 add）`)
        failed = true
        continue
      }
    }
    console.log(`[install-githooks] 校验通过: ${hooksDir}/${file}`)
  }

  // Windows / POSIX 差异（#644 验证记录）：
  // - Git for Windows 支持 core.hooksPath；sh 脚本由 git 调用 bash 执行，
  //   NTFS 无 POSIX 可执行位，不依赖该位（core.fileMode 默认 false）
  // - 仓库内以 git update-index --chmod=+x 记录 100755，保证 POSIX 检出可执行
  if (process.platform === 'win32') {
    console.log('[install-githooks] Windows: hooks 由 Git for Windows 经 bash 执行，无需 POSIX 可执行位')
  }

  if (failed) process.exit(1)
  console.log('[install-githooks] Git hooks 就绪：本地 hooks = 快速反馈，CI secret-guard = 最终强制门禁')
}

main()
