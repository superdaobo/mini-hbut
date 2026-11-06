#!/usr/bin/env node
/**
 * 本机「模块 CDN」静态服务器（goal-8 真机验证用）。
 *
 * 应用会按以下规则请求：
 *   GET /{channel}/catalog.json                  → 模块目录（main/dev/latest 同内容）
 *   GET /modules/<dir>/manifest.json             → 模块清单（磁盘文件）
 *   GET /modules/<dir>/bundle.zip                → 模块包（磁盘文件）
 *
 * 用法：node tools/goal8-local-cdn.mjs [--port 8899] [--root <dist-modules 目录>]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith('--')) continue
  args.set(process.argv[i].slice(2), process.argv[i + 1])
}

const PORT = Number(args.get('port') || 8899)
const ROOT = path.resolve(
  args.get('root') || 'D:/Documents/C_learn/成绩查询/tauri-app/apps/client/dist-modules'
)
const CHANNELS = ['main', 'dev', 'latest']

const log = (message) => console.log(`[local-cdn] ${message}`)

/** 扫描磁盘上的模块目录，生成目录 JSON。 */
const buildCatalog = () => {
  const modules = []
  if (fs.existsSync(ROOT)) {
    for (const name of fs.readdirSync(ROOT).sort()) {
      const dir = path.join(ROOT, name)
      if (!fs.statSync(dir).isDirectory()) continue
      const manifestPath = path.join(dir, 'manifest.json')
      if (!fs.existsSync(manifestPath)) continue
      let moduleId = name
      let moduleName = name
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        moduleId = String(manifest.module_id || name)
        moduleName = String(manifest.module_name || moduleId)
      } catch (error) {
        log(`跳过 ${name}：清单解析失败 ${error.message}`)
        continue
      }
      modules.push({
        id: moduleId,
        name: moduleName,
        order: modules.length + 1,
        manifest_url: `http://127.0.0.1:${PORT}/modules/${name}/manifest.json`
      })
    }
  }
  return { modules }
}

/** 路径安全：拒绝可疑片段并限制在 ROOT 之内。 */
const resolveSafe = (urlPath) => {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('\0')) return null
  const target = path.resolve(ROOT, `.${decoded}`)
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null
  return target
}

const contentType = (filePath) => {
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.zip')) return 'application/zip'
  return 'application/octet-stream'
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Cache-Control': 'no-store',
    ...headers
  })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const url = req.url || '/'

  if (req.method === 'OPTIONS') {
    log(`OPTIONS ${url} -> 204`)
    return send(res, 204, '')
  }

  // 1) 目录
  const catalogMatch = CHANNELS.map((channel) => `/${channel}/catalog.json`).find((suffix) =>
    url.split('?')[0].endsWith(suffix)
  )
  if (catalogMatch) {
    const catalog = buildCatalog()
    log(`GET ${url} -> 200 (catalog: ${catalog.modules.map((m) => m.id).join(',') || '空'})`)
    return send(res, 200, JSON.stringify(catalog), { 'Content-Type': contentType('x.json') })
  }

  // 2) 模块文件
  if (url.startsWith('/modules/')) {
    const target = resolveSafe(url.replace('/modules/', '/'))
    if (!target) {
      log(`GET ${url} -> 400 (路径非法)`)
      return send(res, 400, 'bad path')
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      log(`GET ${url} -> 404 (文件不存在: ${target})`)
      return send(res, 404, 'not found')
    }
    const body = fs.readFileSync(target)
    log(`GET ${url} -> 200 (${body.length} bytes)`)
    return send(res, 200, body, { 'Content-Type': contentType(target) })
  }

  log(`GET ${url} -> 404`)
  send(res, 404, 'not found')
})

server.listen(PORT, '127.0.0.1', () => {
  log(`监听 http://127.0.0.1:${PORT}`)
  log(`root = ${ROOT}`)
  const catalog = buildCatalog()
  log(`扫描到模块: ${catalog.modules.map((m) => `${m.id}@${m.manifest_url}`).join(' | ') || '（无）'}`)
})
