/**
 * 领域层（用户/设备/Client/AuthRequest 状态机等）。
 * #619 已落地：ids（UUIDv7）、subjects（pairwise sub）、errors、
 * users（学校身份绑定）、devices（Enrollment/指纹/吊销）、
 * clients（注册/审核状态机/secret 轮换）、auth-requests（状态机 service）。
 * 后续 #620 OIDC 交互编排在此基础上扩展。
 */
export { newUuidV7 } from './ids.js'
export { derivePairwiseSubject } from './subjects.js'
export {
  createUserWithHbutIdentity,
  type CreateUserWithHbutIdentityResult,
  type HbutIdentitySnapshot,
} from './users.js'
export {
  createEnrollmentChallenge,
  registerDevice,
  activateDevice,
  revokeDevice,
  assertEd25519PublicJwk,
  deviceFingerprint,
} from './devices.js'
export {
  createClient,
  rotateClientSecret,
  setClientStatus,
  getActiveClient,
  SCOPE_WHITELIST,
  CLIENT_ALLOWED_TRANSITIONS,
  type CreateClientInput,
  type CreateClientResult,
} from './clients.js'
export {
  createAuthRequest,
  approveAuthRequest,
  denyAuthRequest,
  openAuthRequest,
  cancelAuthRequest,
  expireAuthRequest,
  advanceAuthRequestProtocol,
  verifyHandoffSecret,
  AUTH_REQUEST_TTL_SECONDS,
} from './auth-requests/service.js'
export {
  AUTH_REQUEST_STATUSES,
  ALLOWED_TRANSITIONS,
  isAllowedTransition,
  isTerminalStatus,
  type AuthRequestStatus,
} from './auth-requests/state-machine.js'
export * from './errors.js'
