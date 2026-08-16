/**
 * Adapter 契约测试（#619 验收标准 8）：Client 模型动态读取。
 * - active client 可被 provider 加载（含解密后的 client_secret）；
 * - suspended/revoked/draft 一律不返回（provider 视为不存在）；
 * - Client upsert 契约 round trip（secret 加密存储、解密还原）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createClientLoader } from '../../src/oidc/adapter/client-loader.js'
import { createClientFixture } from '../helpers/fixtures.js'
import { insertDeveloper } from '../helpers/developers.js'
import { setClientStatus, getActiveClient, rotateClientSecret } from '../../src/domain/clients.js'
import { createUserWithHbutIdentity } from '../../src/domain/users.js'
import { newUuidV7 } from '../../src/domain/ids.js'
import { TEST_KEK } from '../helpers/keys.js'
import type { ClientLoader } from '../../src/oidc/adapter/client-loader.js'

describe('Adapter 契约：Client 动态读取', () => {
  let db: TestDatabase
  let loader: ClientLoader

  beforeEach(async () => {
    db = await createTestDatabase()
    loader = createClientLoader({ sql: db.sql, clientSecretKek: TEST_KEK })
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('8a. active confidential client 可加载，client_secret 解密为明文', async () => {
    const fixture = await createClientFixture(db.sql, {
      scopes: ['openid', 'profile'],
      status: 'active',
    })
    const metadata = await loader.find(fixture.clientId)

    expect(metadata).toBeDefined()
    expect(metadata?.client_id).toBe(fixture.clientId)
    expect(metadata?.client_name).toBe('测试应用')
    expect(metadata?.redirect_uris).toEqual(['https://app.example.com/cb'])
    expect(metadata?.token_endpoint_auth_method).toBe('client_secret_basic')
    expect(metadata?.subject_type).toBe('pairwise')
    // #620 V1：refresh_token 是授权码流合法延伸 grant（oidc-provider v9 要求
    // client.grantTypeAllowed('refresh_token') 才发放 refresh；实际发放仍受
    // offline_access 批准约束）。#619 冻结时为 ['authorization_code']。
    expect(metadata?.grant_types).toEqual(['authorization_code', 'refresh_token'])
    expect(metadata?.scope).toContain('openid')
    // 解密后的明文 secret 与创建时一致
    expect(metadata?.client_secret).toBe(fixture.clientSecret)

    // 数据库中存的是加密值（enc:v1:...），不是明文
    const row = await db.sql.query<{ client_secret_encrypted: string }>(
      'SELECT client_secret_encrypted FROM oauth_applications WHERE client_id = $1',
      [fixture.clientId],
    )
    expect(row.rows[0]?.client_secret_encrypted).toMatch(/^enc:v1:/)
    expect(row.rows[0]?.client_secret_encrypted).not.toContain(fixture.clientSecret as string)
  })

  it('8b. suspended / revoked / draft client 不被加载', async () => {
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    expect(await loader.find(fixture.clientId)).toBeDefined()

    await setClientStatus(db.sql, fixture.clientId, 'suspended')
    expect(await loader.find(fixture.clientId)).toBeUndefined()
    expect(await getActiveClient(db.sql, fixture.clientId)).toBeNull()

    await setClientStatus(db.sql, fixture.clientId, 'active')
    expect(await loader.find(fixture.clientId)).toBeDefined()

    await setClientStatus(db.sql, fixture.clientId, 'revoked')
    expect(await loader.find(fixture.clientId)).toBeUndefined()

    // draft 从未激活过 → 不可加载
    const draft = await createClientFixture(db.sql, { status: 'draft' })
    expect(await loader.find(draft.clientId)).toBeUndefined()
  })

  it('8c. Client upsert round trip（secret 加密 → 解密还原）', async () => {
    // 先建真实 developer（FK 约束）
    const { userId } = await createUserWithHbutIdentity(db.sql, { studentId: '2023000889' })
    const devId = newUuidV7()
    await insertDeveloper(db.sql, { id: devId, userId, displayName: 'upsert 开发者' })

    // 通过 loader.upsert 写入（模拟 provider 写入路径）
    await loader.upsert({
      client_id: 'cli_upsert_1',
      client_name: 'upsert 应用',
      redirect_uris: ['https://cb.example.com/oauth'],
      scope: 'openid profile',
      token_endpoint_auth_method: 'client_secret_basic',
      client_secret: 'plain-secret-value-0123456789',
      owner_developer_id: devId,
    }, { expiresIn: undefined })

    const metadata = await loader.find('cli_upsert_1')
    expect(metadata?.client_name).toBe('upsert 应用')
    expect(metadata?.redirect_uris).toEqual(['https://cb.example.com/oauth'])
    expect(metadata?.client_secret).toBe('plain-secret-value-0123456789')

    // destroy（软删除 → revoked）后不再可加载
    await loader.destroy('cli_upsert_1')
    expect(await loader.find('cli_upsert_1')).toBeUndefined()
  })

  it('8d. KEK 未配置时加载 confidential client fail closed', async () => {
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const noKekLoader = createClientLoader({ sql: db.sql, clientSecretKek: undefined })
    await expect(noKekLoader.find(fixture.clientId)).rejects.toThrow(/KEK/)
  })

  it('8e. rotate secret 后旧 secret 立即失效、新 secret 生效（行为明确固化）', async () => {
    const fixture = await createClientFixture(db.sql, { status: 'active' })
    const { clientSecret: newSecret } = await rotateClientSecret(
      db.sql, fixture.clientId, { clientSecretKek: TEST_KEK },
    )

    expect(newSecret).not.toBe(fixture.clientSecret)
    const metadata = await loader.find(fixture.clientId)
    expect(metadata?.client_secret).toBe(newSecret)
    expect(metadata?.client_secret).not.toBe(fixture.clientSecret)
  })
})
