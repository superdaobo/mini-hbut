/**
 * Mini-HBUT OIDC Demo Client（#628：协议消费者，openid-client 官方库）。
 *
 * 为什么存在：Negative matrix 的 bad state / bad nonce 属于【客户端侧校验】，
 * Provider 只负责原样透传（core/tests/oidc/native-negative-matrix.test.ts 已断言透传）。
 * 本 demo client 用标准 OIDC 库（openid-client）作为消费者，让真实 Provider
 * （Preview / Production）跑完整协议链时，state/nonce/iss/aud/alg 校验由
 * 库内置完成 —— 避免“测试与 Provider 共用同一自定义逻辑导致自洽假阳性”（#620）。
 *
 * 用途：
 *  - L6 Preview E2E / L7 Production smoke 的受控测试 Client；
 *  - 人工验证时在本地起回调端口跑完整 flow；
 *  - --tamper-state 演示：回调 state 被篡改时 openid-client 必须拒绝（退出码 1）。
 *
 * 用法（在 identity-platform/e2e/ 下）：
 *   node demo-client/index.mjs \
 *     --issuer https://<preview|prod issuer> \
 *     --client-id <client_id> --client-secret <secret> \
 *     --redirect-uri http://127.0.0.1:4567/cb \
 *     --scope "openid profile" --port 4567
 *
 * 安全：
 *  - 只打印 URL/流程摘要，不打印 code/token/handoff；
 *  - client-secret 仅来自命令行环境（不写入仓库/日志）；
 *  - Production 使用前必须经 runbook 上线 12 步中的第 9-10 步授权。
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { Issuer, generators, custom } from 'openid-client'

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : null)).filter(Boolean),
)

function need(name) {
  if (!args[name] || args[name] === true) {
    console.error(`缺少必填参数 --${name}`)
    process.exit(2)
  }
  return String(args[name])
}

const issuerUrl = need('issuer')
const clientId = need('client-id')
const redirectUri = need('redirect-uri')
const port = Number(args.port ?? 4567)
const scope = String(args.scope ?? 'openid')
const clientSecret = args['client-secret'] ? String(args['client-secret']) : undefined
const tamperState = args['tamper-state'] === '1' || args['tamper-state'] === true

/** 本地回调服务器：接收授权回调并把完整 URL 交给 openid-client 处理 */
function startCallbackServer() {
  let resolveUrl
  let rejectUrl
  const pending = new Promise((resolve, reject) => {
    resolveUrl = resolve
    rejectUrl = reject
  })
  const server = createServer((req, res) => {
    const url = `http://127.0.0.1:${port}${req.url ?? '/'}`
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('回调已收到，可关闭本窗口。')
    resolveUrl(url)
  })
  server.on('error', rejectUrl)
  return { server, pending }
}

async function main() {
  console.log(`[demo-client] discovery: ${issuerUrl}`)
  const issuer = await Issuer.discover(issuerUrl)

  const client = new issuer.Client({
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    redirect_uris: [redirectUri],
    response_types: ['code'],
    token_endpoint_auth_method: clientSecret ? 'client_secret_basic' : 'none',
  })

  // 打开系统浏览器前先启动回调服务
  const { server, pending } = startCallbackServer()
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))

  const state = generators.state()
  const nonce = generators.nonce()
  const codeVerifier = generators.codeVerifier()
  const codeChallenge = generators.codeChallenge(codeVerifier)

  const authUrl = client.authorizationUrl({
    scope,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  console.log(`[demo-client] 授权 URL（只打印一次，包含 state/nonce/PKCE）：\n${authUrl}\n`)
  console.log('[demo-client] 等待 Mini-HBUT 完成 App Approval 后浏览器回调…')

  // 本地无头/CI 场景：人工把 authUrl 贴到浏览器，完成授权后浏览器跳回本端口
  if (process.env.DEMO_CLIENT_HEADLESS !== '1') {
    console.log('[demo-client] 按任意键打开系统浏览器（或手动复制上面 URL）…')
    await new Promise((r) => process.stdin.once('data', r))
    const { exec } = await import('node:child_process')
    exec(`start "" "${authUrl}"`)
  }

  const rawCallback = await Promise.race([
    pending,
    new Promise((_, rej) => setTimeout(() => rej(new Error('等待回调超时（60s）')), 60_000)),
  ])

  // --tamper-state：篡改回调 state，模拟 bad state（#628 Negative matrix N3 消费者侧）
  let callbackUrl = rawCallback
  if (tamperState) {
    callbackUrl = rawCallback.replace(/state=[^&]+/, 'state=attacker_changed_state')
    console.warn('[demo-client] --tamper-state：回调 state 已被篡改，openid-client 必须拒绝')
  }

  // openid-client 自动校验：state 一致性、id_token nonce/iss/aud/alg/签名
  const params = client.callbackParams(callbackUrl)
  let tokenSet
  try {
    tokenSet = await client.callback(redirectUri, params, {
      state,
      nonce,
      code_verifier: codeVerifier,
    })
  } catch (err) {
    console.error(`[demo-client] 回调校验失败（${tamperState ? 'bad state 已正确拒绝' : '协议异常'}）：${err.message}`)
    server.close()
    process.exit(tamperState ? 1 : 3)
  }

  console.log(`[demo-client] 校验通过：sub=${tokenSet.claims()?.sub}`)
  const userinfo = await client.userinfo(tokenSet.access_token)
  console.log(`[demo-client] userinfo sub=${userinfo.sub}（其余字段按 scope 批准返回）`)
  await client.revoke(tokenSet.access_token).catch(() => console.warn('[demo-client] revoke 失败（非致命）'))
  console.log('[demo-client] 完成：access_token 已 revoke。')
  server.close()
  process.exit(0)
}

main().catch((err) => {
  console.error(`[demo-client] 失败：${err.message}`)
  process.exit(1)
})
