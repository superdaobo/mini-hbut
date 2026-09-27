/**
 * 测试辅助：把 Koa app 拉起为本地 http server，用内置 fetch 打真实请求。
 */
import http from 'node:http'
import type Koa from 'koa'

/**
 * WHATWG fetch（Node undici）的 bad-port 黑名单：listen(0) 抽到这些端口时，
 * fetch 直接抛 "bad port"（TypeError: fetch failed），让绿测随机变红——
 * 既有测试基建缺陷，与业务逻辑无关（#902a 期间实测命中 2 次）。
 * 列表与 undici v8 `lib/web/fetch/constants.js` 的 badPorts 一致。
 */
const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
])

/** 绑定随机端口并跳过 fetch 黑名单端口；返回 baseUrl */
export async function listenOnFetchAllowedPort(server: http.Server): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address && typeof address !== 'string' && !FETCH_BLOCKED_PORTS.has(address.port)) {
      return `http://127.0.0.1:${address.port}`
    }
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  }
  throw new Error('无法获取未被 fetch 屏蔽的测试端口（bad port 黑名单持续命中）')
}

export async function withServer(
  app: Koa,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(app.callback())
  const baseUrl = await listenOnFetchAllowedPort(server)
  try {
    await fn(baseUrl)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  }
}

export async function getJson(baseUrl: string, path: string): Promise<{
  status: number
  body: unknown
  requestId?: string
}> {
  const res = await fetch(`${baseUrl}${path}`)
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, body, requestId: res.headers.get('x-request-id') ?? undefined }
}
