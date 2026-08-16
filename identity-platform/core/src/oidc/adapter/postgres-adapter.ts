/**
 * oidc-provider v9 Postgres Adapter（#619）。
 *
 * 契约（对照 v9.11.3 lib/adapters/memory_adapter.js 逐方法核实）：
 *   upsert(id, payload, expiresIn)
 *   find(id)
 *   findByUserCode(userCode)
 *   findByUid(uid)
 *   consume(id)
 *   destroy(id)
 *   revokeByGrantId(grantId)
 *
 * 持久化：
 * - Client 模型：动态读取 oauth_applications（只返回 active，解密 client_secret），
 *   见 client-loader.ts；
 * - 其他模型（AccessToken/AuthorizationCode/RefreshToken/DeviceCode/
 *   BackchannelAuthenticationRequest/PreAuthorizedCode/Interaction/Session/
 *   Grant/ClientCredentials/PushedAuthorizationRequest/RegistrationAccessToken）：
 *   统一存 oidc_provider_records 表。
 *
 * expiresIn 语义：number = TTL 秒；undefined = 永不过期；0 = 立即过期。
 */
import type { SqlExecutor } from '../../db/types.js'
import {
  upsertOidcRecord,
  findOidcRecord,
  findOidcRecordByUserCode,
  findOidcRecordByUid,
  consumeOidcRecord,
  destroyOidcRecord,
  revokeByGrantId,
} from '../../db/repos/oidc-records.repo.js'
import type { ClientLoader } from './client-loader.js'

/** oidc-provider Adapter 契约接口（v9，无 ctx 参数） */
export interface OidcProviderAdapter {
  upsert(id: string, payload: Record<string, unknown>, expiresIn?: number): Promise<void>
  find(id: string): Promise<Record<string, unknown> | undefined>
  findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined>
  findByUid(uid: string): Promise<Record<string, unknown> | undefined>
  consume(id: string): Promise<void>
  destroy(id: string): Promise<void>
  revokeByGrantId(grantId: string): Promise<void>
}

export interface PostgresAdapterDeps {
  sql: SqlExecutor
  /** Client 模型专用加载器（动态读取 oauth_applications） */
  clientLoader: ClientLoader
}

export class PostgresAdapter implements OidcProviderAdapter {
  private readonly modelName: string
  private readonly sql: SqlExecutor
  private readonly clientLoader: ClientLoader

  constructor(modelName: string, deps: PostgresAdapterDeps) {
    this.modelName = modelName
    this.sql = deps.sql
    this.clientLoader = deps.clientLoader
  }

  async upsert(id: string, payload: Record<string, unknown>, expiresIn?: number): Promise<void> {
    if (this.modelName === 'Client') {
      await this.clientLoader.upsert(payload, { expiresIn })
      return
    }
    await upsertOidcRecord(this.sql, {
      modelName: this.modelName,
      recordId: id,
      payload,
      expiresIn,
      grantId: typeof payload.grantId === 'string' ? payload.grantId : null,
      userCode: typeof payload.userCode === 'string' ? payload.userCode : null,
      uid: typeof payload.uid === 'string' ? payload.uid : null,
    })
  }

  async find(id: string): Promise<Record<string, unknown> | undefined> {
    if (this.modelName === 'Client') {
      const metadata = await this.clientLoader.find(id)
      return metadata ?? undefined
    }
    const row = await findOidcRecord(this.sql, this.modelName, id)
    if (!row) {
      return undefined
    }
    return row.payload_jsonb as Record<string, unknown>
  }

  async findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined> {
    const row = await findOidcRecordByUserCode(this.sql, this.modelName, userCode)
    if (!row) {
      return undefined
    }
    return row.payload_jsonb as Record<string, unknown>
  }

  async findByUid(uid: string): Promise<Record<string, unknown> | undefined> {
    const row = await findOidcRecordByUid(this.sql, this.modelName, uid)
    if (!row) {
      return undefined
    }
    return row.payload_jsonb as Record<string, unknown>
  }

  async consume(id: string): Promise<void> {
    if (this.modelName === 'Client') {
      return
    }
    // epoch 秒，与 memory adapter 的 payload.consumed 语义一致
    const epochSeconds = Math.floor(Date.now() / 1000)
    await consumeOidcRecord(this.sql, this.modelName, id, epochSeconds)
  }

  async destroy(id: string): Promise<void> {
    if (this.modelName === 'Client') {
      await this.clientLoader.destroy(id)
      return
    }
    await destroyOidcRecord(this.sql, this.modelName, id)
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await revokeByGrantId(this.sql, grantId)
  }
}

/** 工厂：oidc-provider 配置 `adapter: createPostgresAdapterFactory(deps)` */
export function createPostgresAdapterFactory(deps: PostgresAdapterDeps) {
  return (modelName: string) => new PostgresAdapter(modelName, deps)
}
