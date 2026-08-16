/**
 * 环境变量名称集中定义（只定义名称，不填真实值）。
 * 本 Issue 只建立骨架：所有密钥相关变量在此登记，供后续 OIDC（#620）、
 * 数据模型（#619）等子 Issue 按名引用，保证命名全局唯一。
 */

/** Core 项目环境变量（Vercel Project A） */
export const CORE_ENV = {
  /** 当前分层：development | preview | production */
  IDENTITY_ENVIRONMENT: 'IDENTITY_ENVIRONMENT',
  /** OIDC canonical issuer（Production 固定为 Punycode ASCII） */
  IDENTITY_ISSUER: 'IDENTITY_ISSUER',
  /** PostgreSQL 连接串（仅 Core 有生产 DB 写权限） */
  IDENTITY_DATABASE_URL: 'IDENTITY_DATABASE_URL',
  /** JWKS 私钥 JSON（后续 #620 使用） */
  IDENTITY_JWKS_JSON: 'IDENTITY_JWKS_JSON',
  /** pairwise subject 派生密钥 */
  IDENTITY_PAIRWISE_SUBJECT_KEY: 'IDENTITY_PAIRWISE_SUBJECT_KEY',
  /** client_secret 加密 KEK */
  IDENTITY_CLIENT_SECRET_KEK: 'IDENTITY_CLIENT_SECRET_KEK',
  /** Web 接力 handoff secret 的 HMAC 密钥 */
  IDENTITY_HANDOFF_HMAC_KEY: 'IDENTITY_HANDOFF_HMAC_KEY',
  /** 允许的 Web 站点来源（逗号分隔） */
  IDENTITY_WEB_ORIGINS: 'IDENTITY_WEB_ORIGINS',
  /** Cookie 签名密钥（逗号分隔，至少一个；#620 oidc-provider cookies.keys） */
  IDENTITY_COOKIE_KEYS: 'IDENTITY_COOKIE_KEYS',
  /** auth.* 站点 origin（#620 custom interaction 重定向目标） */
  IDENTITY_AUTH_ORIGIN: 'IDENTITY_AUTH_ORIGIN',
  /** 第一方静态 Client（JWK Set 类似数组；仅 Preview/Test，#620） */
  IDENTITY_STATIC_CLIENTS_JSON: 'IDENTITY_STATIC_CLIENTS_JSON',
} as const

/** Web 项目环境变量（Vercel Project B） */
export const WEB_ENV = {
  IDENTITY_ENVIRONMENT: 'IDENTITY_ENVIRONMENT',
  /** Core API 基地址（Web 只能通过 Core API 改状态，禁止直写 DB） */
  IDENTITY_CORE_BASE_URL: 'IDENTITY_CORE_BASE_URL',
  /** 对外展示的 issuer（默认取 canonical Production issuer） */
  IDENTITY_PUBLIC_ISSUER: 'IDENTITY_PUBLIC_ISSUER',
  /** auth.* 站点公开 origin（如 https://auth.xn--vhq74jc2fzpchter27a.com） */
  AUTH_PUBLIC_ORIGIN: 'AUTH_PUBLIC_ORIGIN',
  /** developer.* 站点公开 origin */
  DEVELOPER_PUBLIC_ORIGIN: 'DEVELOPER_PUBLIC_ORIGIN',
  /** developer portal 的 OIDC Client 凭据（Vercel 侧管理） */
  DEVELOPER_OIDC_CLIENT_ID: 'DEVELOPER_OIDC_CLIENT_ID',
  DEVELOPER_OIDC_CLIENT_SECRET: 'DEVELOPER_OIDC_CLIENT_SECRET',
  /** Web 会话加密密钥 */
  WEB_SESSION_SECRET: 'WEB_SESSION_SECRET',
} as const

/** 全部 16 个环境变量名称（用于文档/校验一致） */
export const ALL_ENV_NAMES: readonly string[] = [
  ...new Set([...Object.values(CORE_ENV), ...Object.values(WEB_ENV)]),
] as const
