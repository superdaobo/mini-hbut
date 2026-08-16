/**
 * oidc-provider Adapter 契约测试（#619 验收标准 1-7，通用模型）。
 * 与 oidc-provider 官方 memory adapter 逐操作对比，保证契约对齐。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/pg.js'
import { createPostgresAdapterFactory } from '../../src/oidc/adapter/postgres-adapter.js'
import { createClientLoader } from '../../src/oidc/adapter/client-loader.js'
import { TEST_KEK } from '../helpers/keys.js'
import { destroyOidcRecord } from '../../src/db/repos/oidc-records.repo.js'

// oidc-provider 官方 memory adapter（对照实现）
import { createMemoryAdapter } from 'oidc-provider/lib/adapters/memory_adapter.js'

type AdapterLike = {
  upsert(id: string, payload: Record<string, unknown>, expiresIn?: number): Promise<void>
  find(id: string): Promise<Record<string, unknown> | undefined>
  findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined>
  findByUid(uid: string): Promise<Record<string, unknown> | undefined>
  consume(id: string): Promise<void>
  destroy(id: string): Promise<void>
  revokeByGrantId(grantId: string): Promise<void>
}

describe('Adapter 契约：通用模型（oidc_provider_records）', () => {
  let db: TestDatabase
  let adapter: (model: string) => AdapterLike
  let memory: (model: string) => AdapterLike

  beforeEach(async () => {
    db = await createTestDatabase()
    const factory = createPostgresAdapterFactory({
      sql: db.sql,
      clientLoader: createClientLoader({ sql: db.sql, clientSecretKek: TEST_KEK }),
    })
    adapter = (model) => factory(model) as unknown as AdapterLike
    // 注意：memory adapter 工厂必须只创建一次（每次调用都会新建独立 storage）
    const memoryFactory = createMemoryAdapter(0)
    memory = (model) => memoryFactory(model) as unknown as AdapterLike
  })
  afterEach(async () => {
    await db.cleanup()
  })

  it('1. upsert/find round trip（与 memory adapter 结果一致）', async () => {
    const payload = {
      jti: 'tok_abc123',
      kind: 'AccessToken',
      clientId: 'cli_x',
      accountId: 'user-1',
      scope: 'openid profile',
      grantId: 'grant_1',
      iat: Math.floor(Date.now() / 1000),
    }
    await adapter('AccessToken').upsert('tok_abc123', payload, 3600)
    // memory 对照：先写入相同数据再比较
    await memory('AccessToken').upsert('tok_abc123', payload, 3600)

    const found = await adapter('AccessToken').find('tok_abc123')
    expect(found).toEqual(payload)

    const memFound = await memory('AccessToken').find('tok_abc123')
    expect(memFound).toEqual(found)

    // 再次 upsert（覆盖）后 find 为新值
    await adapter('AccessToken').upsert('tok_abc123', { ...payload, scope: 'openid' }, 3600)
    const refound = await adapter('AccessToken').find('tok_abc123')
    expect(refound?.scope).toBe('openid')
  })

  it('2. TTL 到期不返回 artifact（expiresIn=0 立即过期；回拨过期时间不返回）', async () => {
    // expiresIn=0：立即过期
    await adapter('AccessToken').upsert('tok_immediate', { jti: 'tok_immediate' }, 0)
    expect(await adapter('AccessToken').find('tok_immediate')).toBeUndefined()

    // expiresIn=60：正常返回；回拨过期时间后不返回
    await adapter('AuthorizationCode').upsert(
      'code_ttl', { jti: 'code_ttl', grantId: 'grant_t' }, 60,
    )
    expect(await adapter('AuthorizationCode').find('code_ttl')).toBeDefined()
    await db.sql.query(
      `UPDATE oidc_provider_records SET expires_at = NOW() - INTERVAL '1 second'
        WHERE record_id = 'code_ttl'`,
    )
    expect(await adapter('AuthorizationCode').find('code_ttl')).toBeUndefined()

    // expiresIn=undefined：永不过期
    await adapter('Session').upsert('sid_1', { uid: 'uid_1' })
    expect(await adapter('Session').find('sid_1')).toBeDefined()
  })

  it('3. consume 原子（payload.consumed 写入 epoch；重复 consume 幂等）', async () => {
    const before = Math.floor(Date.now() / 1000)
    await adapter('AuthorizationCode').upsert(
      'code_1', { jti: 'code_1', clientId: 'cli_x' }, 300,
    )
    await adapter('AuthorizationCode').consume('code_1')

    const found = await adapter('AuthorizationCode').find('code_1')
    const consumed = found?.consumed as number
    expect(consumed).toBeGreaterThanOrEqual(before)

    // 第二次 consume 不改变已消费状态（原子条件更新）
    await adapter('AuthorizationCode').consume('code_1')
    const foundAgain = await adapter('AuthorizationCode').find('code_1')
    expect(foundAgain?.consumed).toBe(consumed)

    // consumed_at 列被标记
    const row = await db.sql.query<{ consumed_at: unknown }>(
      `SELECT consumed_at FROM oidc_provider_records WHERE record_id = 'code_1'`,
    )
    expect(row.rows[0]?.consumed_at).not.toBeNull()
  })

  it('4. destroy 后 find 返回 undefined（与 memory 一致）', async () => {
    await adapter('RefreshToken').upsert('rt_1', { jti: 'rt_1', grantId: 'grant_d' }, 86400)
    await adapter('RefreshToken').destroy('rt_1')
    expect(await adapter('RefreshToken').find('rt_1')).toBeUndefined()
    // memory 对照
    await memory('RefreshToken').upsert('rt_1', { jti: 'rt_1' }, 86400)
    await memory('RefreshToken').destroy('rt_1')
    expect(await memory('RefreshToken').find('rt_1')).toBeUndefined()
  })

  it('5. revokeByGrantId 撤销同 grant 的全部 token（不同 grant 保留）', async () => {
    await adapter('AccessToken').upsert('at_a', { jti: 'at_a', grantId: 'grant_x' }, 3600)
    await adapter('RefreshToken').upsert('rt_a', { jti: 'rt_a', grantId: 'grant_x' }, 86400)
    await adapter('AuthorizationCode').upsert('code_a', { jti: 'code_a', grantId: 'grant_x' }, 300)
    await adapter('AccessToken').upsert('at_b', { jti: 'at_b', grantId: 'grant_y' }, 3600)

    await adapter('AccessToken').revokeByGrantId('grant_x')

    expect(await adapter('AccessToken').find('at_a')).toBeUndefined()
    expect(await adapter('RefreshToken').find('rt_a')).toBeUndefined()
    expect(await adapter('AuthorizationCode').find('code_a')).toBeUndefined()
    // 其他 grant 的 token 不受影响
    expect(await adapter('AccessToken').find('at_b')).toBeDefined()
  })

  it('6. findByUserCode（DeviceCode 模型）', async () => {
    await adapter('DeviceCode').upsert(
      'dc_1',
      { jti: 'dc_1', userCode: 'ABCD-EFGH', clientId: 'cli_x', scope: 'openid' },
      600,
    )
    const found = await adapter('DeviceCode').findByUserCode('ABCD-EFGH')
    expect(found?.jti).toBe('dc_1')

    // memory 对照
    await memory('DeviceCode').upsert(
      'dc_1',
      { jti: 'dc_1', userCode: 'ABCD-EFGH', clientId: 'cli_x', scope: 'openid' },
      600,
    )
    const memFound = await memory('DeviceCode').findByUserCode('ABCD-EFGH')
    expect(memFound?.jti).toBe('dc_1')
  })

  it('7. findByUid（Session 模型）', async () => {
    await adapter('Session').upsert('sid_s', { uid: 'sess_uid_1', cookie: 'x' }, 3600)
    const found = await adapter('Session').findByUid('sess_uid_1')
    expect(found?.uid).toBe('sess_uid_1')

    // memory 对照
    await memory('Session').upsert('sid_s', { uid: 'sess_uid_1', cookie: 'x' }, 3600)
    const memFound = await memory('Session').findByUid('sess_uid_1')
    expect(memFound?.uid).toBe('sess_uid_1')
  })

  it('7b. Client 模型之外的模型不泄漏（Grant 模型持久化）', async () => {
    await adapter('Grant').upsert('grant_1', { jti: 'grant_1', clientId: 'cli_x' }, 86400)
    expect(await adapter('Grant').find('grant_1')).toBeDefined()
    // 清理（避免影响其他用例计数）
    await destroyOidcRecord(db.sql, 'Grant', 'grant_1')
  })
})
