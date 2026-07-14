#!/usr/bin/env node
/**
 * 低内存 Vite dev：限制 esbuild(Go) 与 Node 并发，降低 Windows errno=1455 OOM。
 * 由 tauri beforeDevCommand 或 npm run dev:lowmem 调用。
 *
 * 实测：未限制时 esbuild 会因 monorepo 巨目录（website/android/target）爬取飙到 20GB+。
 * 对策：GOMEMLIMIT + GOMAXPROCS=1 + vite noDiscovery + 严格 ignore。
 */
import { spawn } from 'node:child_process'
import process from 'node:process'

// esbuild 是 Go：并发越高峰值内存越高。Windows 上建议 1，宁可慢一点也不 OOM。
process.env.GOMAXPROCS = process.env.GOMAXPROCS || '1'
// Go 1.19+ 软内存上限，防止 esbuild 无界膨胀（曾观测 22GB）
process.env.GOMEMLIMIT = process.env.GOMEMLIMIT || '1536MiB'
// 限制 libuv 线程池，避免 IO/编译风暴
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2'
// 给 vite.config 的低内存分支
process.env.MINI_HBUT_LOWMEM = process.env.MINI_HBUT_LOWMEM || '1'

// Node 堆：够用即可，过大反而掩盖泄漏
const maxOld = process.env.NODE_MAX_OLD_SPACE_SIZE || '2048'
const existing = String(process.env.NODE_OPTIONS || '')
if (!existing.includes('max-old-space-size')) {
  process.env.NODE_OPTIONS = `${existing} --max-old-space-size=${maxOld}`.trim()
}

// 开发态默认走更省的 profile 开关（vite.config 已识别）
if (!process.env.MINI_HBUT_BUILD_PROFILE) {
  process.env.MINI_HBUT_BUILD_PROFILE = 'dev-fast'
}

console.log(
  `[vite-lowmem] GOMAXPROCS=${process.env.GOMAXPROCS} GOMEMLIMIT=${process.env.GOMEMLIMIT} UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE}`
)
console.log(`[vite-lowmem] NODE_OPTIONS=${process.env.NODE_OPTIONS} PROFILE=${process.env.MINI_HBUT_BUILD_PROFILE}`)

const viteBin = process.platform === 'win32' ? 'vite.cmd' : 'vite'
const child = spawn(viteBin, process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
  shell: true,
  windowsHide: true
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
