/**
 * oidc-provider Postgres Adapter 出口（#619）。
 *
 * 用法（#620 接入时）：
 *   import Provider from 'oidc-provider'
 *   import { createPostgresAdapterFactory } from './adapter/index.js'
 *
 *   const adapter = createPostgresAdapterFactory({
 *     sql,                                  // SqlExecutor（生产 = pg pool）
 *     clientLoader: createClientLoader({ sql, clientSecretKek: process.env.IDENTITY_CLIENT_SECRET_KEK }),
 *   })
 *   const provider = new Provider(issuer, { adapter, ... })
 *
 * 注意：配置里不要静态注册 clients 数组；Client 全部由
 * oauth_applications 动态读取（active 才会被加载）。
 */
export {
  PostgresAdapter,
  createPostgresAdapterFactory,
  type OidcProviderAdapter,
  type PostgresAdapterDeps,
} from './postgres-adapter.js'
export {
  createClientLoader,
  type ClientLoader,
  type ClientLoaderDeps,
} from './client-loader.js'
