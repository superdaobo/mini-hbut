/**
 * OIDC 层出口（#620）。
 *
 * 提供：
 * - createIdentityProvider：oidc-provider v9 Provider 组装（routes/claims/
 *   pairwise/interaction policy/refresh rotation/revocation/JWKS）；
 * - resumeAuthRequest：POST /api/v1/requests/:id/resume 核心业务（#630 合同）；
 * - 静态第一方 Client 预置（Preview/Test）；
 * - 签名密钥管理（RS256，IDENTITY_JWKS_JSON）。
 */
export { createIdentityProvider, OIDC_SCOPES, OIDC_CLAIMS, type IdentityProviderDeps } from './provider.js'
export {
  resumeAuthRequest,
  ResumeError,
  APPROVAL_AMR,
  type ResumeResult,
} from './interaction.js'
export {
  ensureStaticClients,
  parseStaticClientsJson,
  loadStaticClientsFromEnv,
  type StaticClientEntry,
} from './static-clients.js'
export {
  loadJwksFromJson,
  generateEphemeralKeySet,
  toProviderJwks,
  kidFromPublic,
  SIGNING_ALG,
} from './keys.js'
