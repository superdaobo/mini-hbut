#!/usr/bin/env node
/**
 * goal-8 真机验证用的「游戏平台 API」本地模拟（用于票据链路）。
 *
 * 为什么需要：`Device Key → Identity AT → Launch Ticket` 的最后一跳是
 * `POST {api_base}/tickets`（`utils/game_center/api.ts` 的 fetchGameLaunchTicket）。
 * 生产 `api_base` 是 `https://mini.hbut.site/api/game-platform/v1`，而**本机设备未在
 * Identity Core 注册**（换票 404），所以要在本地把这一跳接上、验证我们这一侧的链路。
 *
 * 用法：
 *   node tools/goal8-mock-game-platform.mjs [--port 8900]
 *
 * 行为：
 *   - `POST /api/game-platform/v1/tickets` → 200 `{ticket:"gpt_<base64url>", expires_at}`
 *     （ticket 形状必须匹配 SDK 的 `MODERN_TICKET_RE = /^gpt_[A-Za-z0-9_-]{16,}$/`，
 *     否则 SDK 会判定形状非法并丢弃）
 *   - 其它路径 → 200 `{ok:true, note:"mock", path}`（便于观察游戏拿到票据后的后续调用）
 *   - 日志只记录方法、路径、是否带 Authorization、token 长度与请求体键，
 *     绝不打印 token 或票据原文。
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

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
const PORT = Number(args.get('port') || 8900)

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 64 * 1024) req.destroy()
    })
    req.on('end', () => resolve(raw))
    req.on('error', () => resolve(''))
  })

let issued = 0

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const raw = await readBody(req)
  const auth = String(req.headers.authorization || '')
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  let bodyShape = ''
  try {
    const parsed = JSON.parse(raw || '{}')
    bodyShape = Object.keys(parsed).sort().join(',')
  } catch {
    bodyShape = '<non-json>'
  }
  console.log(
    `[mock-platform] ${req.method} ${url.pathname} auth=${auth ? 'Bearer' : 'none'} tokenLen=${bearer.length} bodyKeys=${bodyShape}`
  )

  const reply = (status, payload) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      // ⚠️ 必须完整声明 CORS：宿主（页面 origin=localhost:5173）跨源 POST 到本服务，
      // 预检（OPTIONS）若缺 `Access-Control-Allow-Headers`，浏览器会直接拒绝后续 POST
      // ——实测表现为「只见 OPTIONS，看不到 POST」，取票失败但看不出原因。
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'authorization, content-type, accept, idempotency-key, x-request-id, x-game-platform-protocol, x-requested-with',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store'
    })
    res.end(status === 204 ? undefined : JSON.stringify(payload))
  }

  if (req.method === 'OPTIONS') {
    reply(204, {})
    return
  }

  if (url.pathname.endsWith('/tickets')) {
    if (req.method !== 'POST') {
      reply(405, { error: 'method_not_allowed' })
      return
    }
    if (!bearer) {
      // 生产语义：无 AT 不签发；这里同样拒绝，保证「打印桩 AT 才能过」这件事可验证
      console.log('[mock-platform] 拒绝签发：缺少 Authorization Bearer')
      reply(401, { error: 'auth_missing' })
      return
    }
    issued += 1
    const ticket = `gpt_${randomBytes(24).toString('base64url')}`
    console.log(`[mock-platform] 签发第 ${issued} 张票据（长度 ${ticket.length}，形状 gpt_<base64url>）`)
    reply(200, {
      ticket,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    })
    return
  }

  reply(200, { ok: true, note: 'mock', path: url.pathname })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-platform] 监听 http://127.0.0.1:${PORT}/api/game-platform/v1`)
})
