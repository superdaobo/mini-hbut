/**
 * 测试辅助：把 Koa app 拉起为本地 http server，用内置 fetch 打真实请求。
 */
import http from 'node:http'
import type Koa from 'koa'

export async function withServer(
  app: Koa,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(app.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('无法获取测试端口')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`
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
