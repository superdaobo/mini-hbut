// 可选本地 hook：让 Vercel CLI 的 undici fetch 走显式配置的 HTTP 代理。
// 使用前设置 IDENTITY_VERCEL_HTTP_PROXY，例如 http://127.0.0.1:7890；仓库不固定个人代理软件/端口。
const { ProxyAgent, setGlobalDispatcher } = require('undici')
const proxyUrl = String(process.env.IDENTITY_VERCEL_HTTP_PROXY || '').trim()
if (!proxyUrl) {
  throw new Error('缺少 IDENTITY_VERCEL_HTTP_PROXY，拒绝静默使用本机固定代理。')
}
setGlobalDispatcher(new ProxyAgent(proxyUrl))
