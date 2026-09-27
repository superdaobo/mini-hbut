/**
 * SDK 打包冒烟脚本（无需网络、无需游戏 node_modules）。
 *
 * 步骤：
 * 1) `node --check` 校验 SDK 全部源码（ESM 语法）；
 * 2) 用仓库内 apps/client 的 vite 对 `tests/fixture/entry.js` 做一次 lib 构建
 *    （入口通过相对路径 import SDK 源码，模拟游戏侧的引用方式）；
 * 3) 断言产物中不出现 `_sdk/src/` 运行时引用（说明 SDK 已被内联进 bundle）。
 *
 * 运行：node website/modules-src/_sdk/tests/build-smoke.mjs
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sdkRoot = path.resolve(here, '..')
const repoRoot = path.resolve(sdkRoot, '..', '..', '..')
const viteBin = path.join(repoRoot, 'apps', 'client', 'node_modules', 'vite', 'bin', 'vite.js')

const listJsFiles = (dir) => {
  const out = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) out.push(...listJsFiles(full))
    else if (item.isFile() && item.name.endsWith('.js')) out.push(full)
  }
  return out
}

const fail = (message) => {
  console.error(`[sdk-smoke] FAIL ${message}`)
  process.exitCode = 1
}

// 1) 语法校验
const sources = listJsFiles(path.join(sdkRoot, 'src'))
for (const file of sources) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (error) {
    fail(`syntax: ${path.relative(repoRoot, file)}\n${error.stderr?.toString() || error.message}`)
  }
}
console.log(`[sdk-smoke] syntax ok: ${sources.length} files`)

// 2) bundler 冒烟（fixture 内的 vite.config.mjs 为纯对象导出，不需要解析 bare import）
if (!fs.existsSync(viteBin)) {
  console.log('[sdk-smoke] vite 不可用，跳过打包冒烟（CI 由 apps/client 依赖提供）')
} else {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-hbut-sdk-smoke-'))
  try {
    execFileSync(process.execPath, [viteBin, 'build', '--logLevel', 'warn'], {
      cwd: path.join(here, 'fixture'),
      env: { ...process.env, SDK_SMOKE_OUT_DIR: outDir },
      stdio: 'inherit'
    })
    const bundle = path.join(outDir, 'mini-hbut-game-sdk-smoke.js')
    if (!fs.existsSync(bundle)) {
      fail(`bundle 未生成: ${bundle}`)
    } else {
      const code = fs.readFileSync(bundle, 'utf8')
      if (/_sdk\/src\//.test(code) || /_sdk\\src\\/.test(code)) {
        fail('产物仍引用 _sdk/src（未被内联）')
      } else {
        console.log(`[sdk-smoke] bundle ok: ${(code.length / 1024).toFixed(1)} KiB，SDK 已内联`)
      }
      execFileSync(process.execPath, ['--check', bundle], { stdio: 'pipe' })
      console.log('[sdk-smoke] bundle syntax ok')
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
}

if (!process.exitCode) console.log('[sdk-smoke] PASS')
