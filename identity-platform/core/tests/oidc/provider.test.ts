/**
 * oidc-provider v9 真实集成测试（#619 硬性要求：不接受只有 mock 测试）。
 *
 * 验证两条关键链路：
 * A. Client secret 方案可行性（issue 要求"先基于 v9 Client auth 行为写集成测试"）：
 *    - client_secret 以 AES-256-GCM(KEK) 加密入库；
 *    - 我们的 Client Adapter 在 find 时解密出明文；
 *    - oidc-provider 用该明文在 token endpoint 完成 client_secret_basic 认证。
 * B. 完整 Authorization Code + PKCE(S256) 流程走真实 Provider：
 *    - AuthorizationCode 经我们的 Adapter upsert/find/consume；
 *    - 错误 secret → 401 invalid_client；
 *    - code 重复使用（replay）→ invalid_grant。
 * C. 官方 memory adapter 跑同一流程作为对照，证明契约对齐。
 */
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Provider from 'oidc-provider'
import { createMemoryAdapter } from 'oidc-provider/lib/adapters/memory_adapter.js'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createPostgresAdapterFactory } from '../../src/oidc/adapter/postgres-adapter.js'
import { createClientLoader } from '../../src/oidc/adapter/client-loader.js'
import { createClientFixture } from '../helpers/fixtures.js'
import { TEST_KEK } from '../helpers/keys.js'

const ISSUER = 'https://id.example.test'
const REDIRECT_URI = 'https://app.example.com/cb'

interface RunningProvider {
  baseUrl: string
  provider: Provider
  close(): Promise<void>
}

async function startProvider(provider: Provider): Promise<RunningProvider> {
  // v9 中 Provider 实例本身就是 Koa app
  const server = http.createServer(provider.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('无法获取测试端口')
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    provider,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}

function pkcePair() {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { codeVerifier, codeChallenge }
}

async function exchangeCode(opts: {
  baseUrl: string
  clientId: string
  clientSecret: string | null
  code: string
  codeVerifier: string
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: REDIRECT_URI,
    code_verifier: opts.codeVerifier,
  })
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  if (opts.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')}`
  } else {
    body.set('client_id', opts.clientId)
  }
  const res = await fetch(`${opts.baseUrl}/token`, { method: 'POST', headers, body })
  const json = (await res.json()) as Record<string, unknown>
  return { status: res.status, body: json }
}

describe('oidc-provider v9 集成：Postgres Adapter + Client Secret 方案', () => {
  let db: TestDatabase
  let running: RunningProvider | null = null
  let providerPromise: Promise<RunningProvider> | null = null

  beforeEach(async () => {
    db = await createTestDatabase()
  })
  afterEach(async () => {
    if (running) {
      await running.close()
      running = null
    }
    providerPromise = null
    await db.cleanup()
  })

  /** 每个测试只启动一个 provider（lazy 单例） */
  function provider(): Promise<RunningProvider> {
    providerPromise ??= (async () => {
      const p = new Provider(ISSUER, {
        adapter: createPostgresAdapterFactory({
          sql: db.sql,
          clientLoader: createClientLoader({ sql: db.sql, clientSecretKek: TEST_KEK }),
        }),
        // V1 scope 白名单子集（#617：openid/profile/student.identity/offline_access）
        scopes: ['openid', 'profile', 'student.identity', 'offline_access'],
        // pairwise subject 需要显式声明（v9 默认只有 public）
        subjectTypes: ['public', 'pairwise'],
        // 测试账号解析：v9 要求返回带 claims() 的 account 对象（#620 接入真实用户服务）
        findAccount: async (_ctx: unknown, sub: string) => ({
          accountId: sub,
          claims: async () => ({ sub }),
        }),
        // 测试 pairwise 派生：确定性实现（#620 接入 src/domain/subjects.ts）
        pairwiseIdentifier: async (_ctx: unknown, accountId: string) =>
          `sub_${accountId}`,
        pkce: { enabled: true },
        // 测试环境固定 cookie 签名密钥（仅测试值）
        cookies: { keys: ['test-cookie-signing-key-0123456789abcdef'] },
      })
      running = await startProvider(p)
      return running
    })()
    return providerPromise
  }

  /** 签发一个 authorization code（走我们的 Adapter upsert；含真实 Grant 绑定） */
  async function issueCode(rp: RunningProvider, clientId: string) {
    const { codeVerifier, codeChallenge } = pkcePair()
    // v9 要求授权码绑定 Grant（validateGrant 依赖），撤销/刷新基于 grant
    const grant = new rp.provider.Grant({ accountId: 'user-1', clientId })
    await grant.save()
    const code = new rp.provider.AuthorizationCode({
      clientId,
      redirectUri: REDIRECT_URI,
      accountId: 'user-1',
      scope: 'openid profile',
      codeChallenge,
      codeChallengeMethod: 'S256',
      grantId: grant.jti,
      iat: Math.floor(Date.now() / 1000),
    })
    await code.save()
    return { code: code.jti, codeVerifier }
  }

  it('A. client_secret 加密存储 + Adapter 解密 + client_secret_basic 认证成功（完整授权码流程）', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const rp = await provider()

    // 1) provider 通过我们的 Adapter 动态加载 Client（含解密后的 secret）
    const client = await rp.provider.Client.find(fixture.clientId)
    expect(client).toBeDefined()
    expect(client?.clientId).toBe(fixture.clientId)

    // 2) 服务端签发 authorization code（走 adapter upsert）
    const { code, codeVerifier } = await issueCode(rp, fixture.clientId)

    // 3) token endpoint：client_secret_basic + PKCE → 成功签发 access token
    const result = await exchangeCode({
      baseUrl: rp.baseUrl,
      clientId: fixture.clientId,
      clientSecret: fixture.clientSecret,
      code,
      codeVerifier,
    })
    expect(result.status).toBe(200)
    expect(result.body.access_token).toBeTruthy()
    expect(result.body.token_type).toBe('Bearer')
    // openid scope 生效：返回 id_token（响应 scope 字段与请求一致时可省略）
    expect(result.body.id_token).toBeTruthy()

    // 4) DB 中 client_secret 是密文（再次确认非明文落库）
    const row = await db.sql.query<{ client_secret_encrypted: string }>(
      'SELECT client_secret_encrypted FROM oauth_applications WHERE client_id = $1',
      [fixture.clientId],
    )
    expect(row.rows[0]?.client_secret_encrypted).toMatch(/^enc:v1:/)
    expect(row.rows[0]?.client_secret_encrypted).not.toContain(fixture.clientSecret as string)
  })

  it('A2. 错误 client_secret → 401 invalid_client（compareClientSecret 用解密明文）', async () => {
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const rp = await provider()
    const { code, codeVerifier } = await issueCode(rp, fixture.clientId)

    const result = await exchangeCode({
      baseUrl: rp.baseUrl,
      clientId: fixture.clientId,
      clientSecret: 'wrong-secret-value',
      code,
      codeVerifier,
    })
    expect(result.status).toBe(401)
    expect(result.body.error).toBe('invalid_client')
  })

  it('A3. suspended client 无法认证（动态读取不返回）', async () => {
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const rp = await provider()

    const { setClientStatus } = await import('../../src/domain/clients.js')
    await setClientStatus(db.sql, fixture.clientId, 'suspended')

    expect(await rp.provider.Client.find(fixture.clientId)).toBeUndefined()
  })

  it('B. code 一次性：重复使用 → invalid_grant（replay 检测，consume 生效）', async () => {
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const rp = await provider()
    const { code, codeVerifier } = await issueCode(rp, fixture.clientId)

    const first = await exchangeCode({
      baseUrl: rp.baseUrl, clientId: fixture.clientId, clientSecret: fixture.clientSecret,
      code, codeVerifier,
    })
    expect(first.status).toBe(200)

    const second = await exchangeCode({
      baseUrl: rp.baseUrl, clientId: fixture.clientId, clientSecret: fixture.clientSecret,
      code, codeVerifier,
    })
    expect(second.status).toBe(400)
    expect(second.body.error).toBe('invalid_grant')
  })

  it('C. 官方 memory adapter 对照：同一流程跑通（契约对齐）', async () => {
    const memoryProvider = new Provider(ISSUER, {
      adapter: createMemoryAdapter(0),
      scopes: ['openid', 'profile'],
      subjectTypes: ['public', 'pairwise'],
      findAccount: async (_ctx: unknown, sub: string) => ({
        accountId: sub,
        claims: async () => ({ sub }),
      }),
      pairwiseIdentifier: async (_ctx: unknown, accountId: string) =>
        `sub_${accountId}`,
      pkce: { enabled: true },
      clients: [{
        client_id: 'mem_client_1',
        client_secret: 'memory-secret-value-0123456789',
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic',
        scope: 'openid profile',
      }],
      cookies: { keys: ['test-cookie-signing-key-0123456789abcdef'] },
    })
    const mem = await startProvider(memoryProvider)
    try {
      const { code, codeVerifier } = await (async () => {
        const { codeVerifier, codeChallenge } = pkcePair()
        const grant = new memoryProvider.Grant({ accountId: 'user-mem', clientId: 'mem_client_1' })
        await grant.save()
        const c = new memoryProvider.AuthorizationCode({
          clientId: 'mem_client_1',
          redirectUri: REDIRECT_URI,
          accountId: 'user-mem',
          scope: 'openid profile',
          codeChallenge,
          codeChallengeMethod: 'S256',
          grantId: grant.jti,
          iat: Math.floor(Date.now() / 1000),
        })
        await c.save()
        return { code: c.jti, codeVerifier }
      })()

      const result = await exchangeCode({
        baseUrl: mem.baseUrl,
        clientId: 'mem_client_1',
        clientSecret: 'memory-secret-value-0123456789',
        code,
        codeVerifier,
      })
      expect(result.status).toBe(200)
      expect(result.body.access_token).toBeTruthy()
    } finally {
      await mem.close()
    }
  })
})
