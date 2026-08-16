#!/usr/bin/env node
/**
 * Mini-HBUT Identity Platform —— Vercel CLI 部署脚本（无 Git 部署）。
 *
 * 用法（在 identity-platform/ 根目录执行）：
 *   pnpm deploy:preview    # 为 core/web 创建 Preview deployment
 *   pnpm deploy:prod       # 生产部署（必须终端交互输入确认词，非 TTY 直接拒绝）
 *
 * 安全约束：
 *   - 生产部署属于真实写操作，必须人工确认（readline 输入 deploy-prod）；
 *   - 脚本只调用本地 vercel CLI，不读取/打印任何环境变量值；
 *   - vercel env pull 拉取的 .env 由各工程 .gitignore 忽略。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'

const projects = [
  { name: 'core', dir: 'core', projectId: 'mini-hbut-identity-core' },
  { name: 'web', dir: 'web', projectId: 'mini-hbut-identity-web' },
]

function run(cli, args, cwd) {
  const result = spawnSync(cli.command, [...cli.prefixArgs, ...args], {
    cwd,
    stdio: 'inherit',
    encoding: 'utf8',
    env: process.env,
  })
  return result.status ?? 1
}

function hasVercelCli() {
  // 优先使用 workspace 已安装的 vercel；用结构化 command/args，不能把 "npx vercel" 当成单个 executable。
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const vercelCommand = process.platform === 'win32' ? 'vercel.cmd' : 'vercel'
  const probe = spawnSync(npxCommand, ['--no-install', 'vercel', '--version'], {
    stdio: 'ignore',
    encoding: 'utf8',
  })
  if (probe.status === 0) return { label: 'npx --no-install vercel', command: npxCommand, prefixArgs: ['--no-install', 'vercel'] }
  const globalProbe = spawnSync(vercelCommand, ['--version'], { stdio: 'ignore' })
  return globalProbe.status === 0 ? { label: 'vercel', command: vercelCommand, prefixArgs: [] } : null
}

function ensureLinked(dir) {
  const meta = path.join(dir, '.vercel', 'project.json')
  if (fs.existsSync(meta)) return
  console.error(`\n[deploy] ${dir}/ 尚未 link：先执行  cd ${dir} && vercel link  完成一次项目关联。`)
  process.exit(2)
}

/** 生产部署前的人工确认（非 TTY 一律拒绝） */
async function confirmProduction() {
  if (!process.stdin.isTTY) {
    console.error('[deploy] 非交互环境禁止生产部署。请在终端手动执行 pnpm deploy:prod。')
    process.exit(3)
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => {
    rl.question(
      '\n⚠️ 危险操作：将创建 Production deployment（真实域名 + 生产环境变量）。\n' +
        '确认请输入 deploy-prod（Ctrl+C 取消）：',
      resolve,
    )
  })
  rl.close()
  if (answer.trim() !== 'deploy-prod') {
    console.error('[deploy] 确认词不匹配，已取消。')
    process.exit(3)
  }
}

async function main() {
  const mode = process.argv[2]
  if (mode !== 'preview' && mode !== 'prod') {
    console.error('用法: node scripts/deploy.mjs <preview|prod>')
    process.exit(2)
  }

  const cli = hasVercelCli()
  if (!cli) {
    console.error('[deploy] 未找到 vercel CLI。请先安装：pnpm add -D vercel  或全局 npm i -g vercel')
    process.exit(2)
  }
  console.log(`[deploy] 使用 vercel CLI：${cli.label}`)

  if (mode === 'prod') {
    await confirmProduction()
  }

  for (const project of projects) {
    ensureLinked(project.dir)
    console.log(`\n[deploy] ${mode} -> ${project.name} (${project.projectId})`)
    const args = ['--cwd', project.dir]
    if (mode === 'prod') args.push('--prod')
    const status = run(cli, args, process.cwd())
    if (status !== 0) {
      console.error(`[deploy] ${project.name} ${mode} 失败（退出码 ${status}）`)
      process.exit(status)
    }
  }
  console.log(`\n[deploy] 完成：${mode} 已为 core/web 创建 deployment。`)
}

main()
