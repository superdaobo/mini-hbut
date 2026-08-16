/**
 * 请求体读取（#622）。
 *
 * Core 未引入 koa-bodyparser（避免多余依赖面）；app API 需要的 JSON body
 * 在此手动流式读取：
 * - 严格限制大小（16 KiB，challenge/signature 等字段足够），防大体积攻击；
 * - 只接受合法 JSON（失败 → INVALID_REQUEST）；
 * - 空 body 返回 undefined（由各端点按字段校验兜底）。
 */
import type { RouterContext } from '@koa/router'
import { InvalidRequestError } from './errors.js'

/** 请求体上限（approve/enroll 的字段规模远小于此值） */
const MAX_BODY_BYTES = 16 * 1024

export function readJsonBody(ctx: RouterContext): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const fail = (err: unknown): void => {
      if (!settled) {
        settled = true
        reject(err)
      }
    }
    const succeed = (value: unknown): void => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    ctx.req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        fail(new InvalidRequestError('请求体过大'))
        ctx.req.destroy()
        return
      }
      chunks.push(chunk)
    })
    ctx.req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim() === '') {
        succeed(undefined)
        return
      }
      try {
        succeed(JSON.parse(raw) as unknown)
      } catch {
        fail(new InvalidRequestError('请求体不是合法 JSON'))
      }
    })
    ctx.req.on('error', (err) => fail(err))
  })
}
