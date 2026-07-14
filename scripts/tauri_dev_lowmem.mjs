#!/usr/bin/env node
/**
 * 安全启动 tauri dev（不会再批量杀 node，避免拖垮 IDE / 桌面）
 *
 * 只清理：
 * - hbut-helper.exe（本应用）
 * - esbuild.exe（Vite 编译器残留）
 *
 * 环境限制：
 * - GOMAXPROCS=1 降低 esbuild 峰值内存
 */
import { spawn, execSync } from 'node:child_process'
import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function tryKillImage(imageName) {
  if (process.platform !== 'win32') return
  try {
    // 只杀指定映像，绝不 taskkill node.exe
    execSync(`taskkill /F /IM ${imageName} /T`, {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 8000
    })
  } catch {
    // 进程不存在时忽略
  }
}

console.log('[tauri-dev-lowmem] 仅清理 hbut-helper / esbuild（不碰 node/IDE）…')
tryKillImage('hbut-helper.exe')
tryKillImage('esbuild.exe')

process.env.GOMAXPROCS = process.env.GOMAXPROCS || '1'
// 限制 esbuild(Go) 软内存，避免 20GB+ 爬 monorepo
process.env.GOMEMLIMIT = process.env.GOMEMLIMIT || '1536MiB'
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '2'
process.env.MINI_HBUT_BUILD_PROFILE = process.env.MINI_HBUT_BUILD_PROFILE || 'dev-fast'
process.env.MINI_HBUT_LOWMEM = process.env.MINI_HBUT_LOWMEM || '1'
const maxOld = process.env.NODE_MAX_OLD_SPACE_SIZE || '2048'
const existing = String(process.env.NODE_OPTIONS || '')
if (!existing.includes('max-old-space-size')) {
  process.env.NODE_OPTIONS = `${existing} --max-old-space-size=${maxOld}`.trim()
}

console.log(
  `[tauri-dev-lowmem] GOMAXPROCS=${process.env.GOMAXPROCS} GOMEMLIMIT=${process.env.GOMEMLIMIT} UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE}`
)
console.log(`[tauri-dev-lowmem] NODE_OPTIONS=${process.env.NODE_OPTIONS} LOWMEM=${process.env.MINI_HBUT_LOWMEM}`)
console.log('[tauri-dev-lowmem] 启动 tauri dev（Vite 热更新 HMR）…')
console.log('[tauri-dev-lowmem] beforeDevCommand → vite_dev_lowmem → http://127.0.0.1:5173')
console.log('[tauri-dev-lowmem] 改 src/** 会自动刷新窗口；若再次黑屏/卡死：只结束 hbut-helper / esbuild，不要杀全部 node')
console.log('[tauri-dev-lowmem] 无热更新应急：npm run tauri:dev:static')

// Windows Node 24 对 .cmd + shell:false 会 spawn EINVAL，统一 shell:true
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const child = spawn(npmCmd, ['run', 'tauri', '--', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: true,
  windowsHide: false
})

child.on('error', (err) => {
  console.error('[tauri-dev-lowmem] 启动失败:', err.message)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1)
    return
  }
  process.exit(code ?? 1)
})
