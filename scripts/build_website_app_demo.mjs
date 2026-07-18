/**
 * 构建官网 Hero 可交互离线演示（Vue + test_account fixtures）
 * 输出：website/public/app-demo/
 *
 * 用法：node scripts/build_website_app_demo.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(rootDir, 'website', 'public', 'app-demo')

const resolveBinary = (binary) => {
  if (process.platform === 'win32' && binary === 'npm') return 'npm.cmd'
  if (process.platform === 'win32' && binary === 'npx') return 'npx.cmd'
  return binary
}

const run = (binary, args) => {
  const resolved = resolveBinary(binary)
  const isWinBatch = process.platform === 'win32' && /\.cmd$/i.test(resolved)
  console.log(`[app-demo] $ ${resolved} ${args.join(' ')}`)
  if (isWinBatch) {
    execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', resolved, ...args], {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_WEBSITE_DEMO: '1',
        MINI_HBUT_BUILD_PROFILE: process.env.MINI_HBUT_BUILD_PROFILE || 'standard',
      },
    })
  } else {
    execFileSync(resolved, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_WEBSITE_DEMO: '1',
        MINI_HBUT_BUILD_PROFILE: process.env.MINI_HBUT_BUILD_PROFILE || 'standard',
      },
    })
  }
}

console.log('[app-demo] building offline Vue demo for website Hero…')
run('npx', ['vite', 'build', '--config', 'vite.website-demo.config.ts'])

// Vite multi-page 会输出 app-demo.html，统一为 index.html 便于 iframe 引用 /app-demo/
const builtHtml = path.join(outDir, 'app-demo.html')
const indexHtml = path.join(outDir, 'index.html')
if (fs.existsSync(builtHtml)) {
  fs.renameSync(builtHtml, indexHtml)
  console.log('[app-demo] renamed app-demo.html → index.html')
}

if (!fs.existsSync(indexHtml)) {
  console.error('[app-demo] ERROR: index.html missing after build')
  process.exit(1)
}

// 轻量 marker，便于验收与 CI 校验
const marker = {
  name: 'mini-hbut-website-app-demo',
  builtAt: new Date().toISOString(),
  demo: true,
  offline: true,
  data: 'test_account_fixtures',
}
fs.writeFileSync(path.join(outDir, 'demo-manifest.json'), `${JSON.stringify(marker, null, 2)}\n`, 'utf8')

const sizeHint = (() => {
  try {
    let total = 0
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name)
        const st = fs.statSync(p)
        if (st.isDirectory()) walk(p)
        else total += st.size
      }
    }
    walk(outDir)
    return `${(total / 1024 / 1024).toFixed(2)} MB`
  } catch {
    return 'unknown'
  }
})()

console.log(`[app-demo] done → ${path.relative(rootDir, outDir)} (${sizeHint})`)
