#!/usr/bin/env node
/**
 * 默认 dev 启动器：保持 Vite 默认行为，仅限制 esbuild(Go) 内存与并发。
 * 解决 monorepo 下 esbuild 无界涨到数 GB～20GB+ 的问题。
 */
import { spawn } from 'node:child_process'
import process from 'node:process'

process.env.GOMAXPROCS = process.env.GOMAXPROCS || '1'
process.env.GOMEMLIMIT = process.env.GOMEMLIMIT || '1024MiB'
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2'

const child = spawn(
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
  process.argv.slice(2),
  {
    stdio: 'inherit',
    env: process.env,
    shell: true,
    windowsHide: true
  }
)

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
