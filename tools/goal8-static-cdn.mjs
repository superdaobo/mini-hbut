#!/usr/bin/env node
/**
 * goal-8 真机验证用的「静态 CDN」（模块分发目录原样服务）。
 *
 * 为什么不用 `goal8-local-cdn.mjs`：那个脚本按 `dist-modules/<dir>/{manifest.json,bundle.zip}`
 * 的扁平布局**自己生成** catalog；而 `scripts/build_website_modules.mjs` 产出的是正式 CDN 布局
 * `{channel}/{moduleId}/{version}/{manifest.json,bundle.zip}` + `{channel}/catalog.json`
 * （manifest_url 指向 `{channel}/{moduleId}/manifest.json`）。本脚本按后者**原样**服务，
 * 从而能用真实的面板 + 真实游戏包跑游戏中心回归。
 *
 * 用法：
 *   node tools/goal8-static-cdn.mjs --root D:/wt-goal8/cdn-out [--port 8899]
 *
 * 特性：CORS `*`、`no-store`、目录穿越拒绝、逐请求 stdout 日志（便于取证）。
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i]
  if (!token.startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else {
    args.set(token.slice(2), next)
    i += 1
  }
}

const PORT = Number(args.get('port') || 8899)
const ROOT = path.resolve(String(args.get('root') || 'D:/wt-goal8/cdn-out'))

const TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.zip': 'application/zip',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  const target = path.resolve(ROOT, rel)
  const inRoot = target === ROOT || target.startsWith(ROOT + path.sep)
  if (!inRoot) {
    console.log(`[static-cdn] 拒绝越界路径 ${url.pathname}`)
    res.writeHead(403).end('forbidden')
    return
  }
  try {
    const info = await stat(target)
    const file = info.isDirectory() ? path.join(target, 'index.html') : target
    const body = await readFile(file)
    console.log(`[static-cdn] GET ${url.pathname} -> 200 (${body.length}B)`)
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    })
    res.end(body)
  } catch (error) {
    console.log(`[static-cdn] GET ${url.pathname} -> 404`)
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }).end('not found')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[static-cdn] 监听 http://127.0.0.1:${PORT} root=${ROOT}`)
})
