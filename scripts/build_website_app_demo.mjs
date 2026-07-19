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

// 修复 fonts CSS：绝对 /fonts/... → 同目录相对路径（/app-demo 子路径下绝对路径 404）
const fontCss = path.join(outDir, 'fonts', 'material-symbols-outlined.css')
const fontWoff = path.join(outDir, 'fonts', 'material-symbols-outlined.subset.woff2')
if (!fs.existsSync(fontWoff)) {
  console.error('[app-demo] ERROR: material-symbols woff2 missing under app-demo/fonts')
  process.exit(1)
}
if (fs.existsSync(fontCss)) {
  const css = fs.readFileSync(fontCss, 'utf8')
  const fixed = css
    .replace(/url\(\s*['"]?\/fonts\/material-symbols-outlined\.subset\.woff2['"]?\s*\)/g, 'url(./material-symbols-outlined.subset.woff2)')
    .replace(/url\(\s*['"]?\.\/fonts\/material-symbols-outlined\.subset\.woff2['"]?\s*\)/g, 'url(./material-symbols-outlined.subset.woff2)')
  if (fixed !== css) {
    fs.writeFileSync(fontCss, fixed, 'utf8')
    console.log('[app-demo] fixed material-symbols CSS font-face url → relative')
  }
  const check = fs.readFileSync(fontCss, 'utf8')
  if (/url\(\s*['"]?\/fonts\//.test(check)) {
    console.error('[app-demo] ERROR: material-symbols CSS still has absolute /fonts url')
    process.exit(1)
  }
}

// 轻量 marker，便于验收与 CI 校验
const marker = {
  name: 'mini-hbut-website-app-demo',
  builtAt: new Date().toISOString(),
  demo: true,
  offline: true,
  data: 'test_account_fixtures',
  designViewport: { width: 390, height: 844 },
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
