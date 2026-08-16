/**
 * 进程入口（本地 dev / Vercel serverless 共用）。
 *
 * - Vercel：@vercel/node 会取本文件 default export（Koa callback），
 *   构建/运行环境带 VERCEL=1，因此不会走本地 listen 分支；
 * - 本地：tsx 直接运行本文件，走 listen 分支。
 *
 * 注意：Vercel 环境变量在构建期注入，VERCEL=1 由平台自动提供。
 */
import { createApp } from './app.js'

const app = createApp()

// Vercel serverless handler：导出 Koa callback
export default app.callback()

// 本地开发入口
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 3001)
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[identity-core] listening on http://localhost:${port}`)
  })
}
