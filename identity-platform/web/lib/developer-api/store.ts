/**
 * Developer Store 接口 —— Web 与 Core Developer API 的对接合同（issue #624）。
 *
 * 本接口由 Core（#620 并行实现中，写边界外）在 /api/v1/developer/* 上落地，
 * 语义如下（Web 桩与真实 Core 必须一致，见 tests/developer-store.test.ts）：
 *
 *  1. owner 一律由调用方传入的 sub 推导：任何方法在「应用不存在」或
 *     「owner 非该 sub」时返回 null → BFF 统一映射 404 not_found，
 *     不区分两者（防枚举，IDOR 负向测试覆盖）；
 *  2. 生命周期：create 落 draft；submit 仅 draft/rejected → pending_review；
 *     approved/active/suspended/revoked 由管理员（#625）或 Core 驱动；
 *     delete 仅 draft；revoke 非终态均可（终态 revoked 后一切变更拒绝）；
 *  3. 修改 redirect URI / scopes：应用处于 pending_review 及之后状态时，
 *     变更自动使应用重新进入 pending_review（重新审核，submitted_at 刷新），
 *     绝不允许在 Active 下无审核即时增加 callback；
 *  4. secret：web_confidential 创建/rotate 时明文只返回一次；GET 只返回元数据
 *     （fingerprint/last4/时间）；native_public 恒无 secret（PKCE S256）；
 *     rotate 仅 web_confidential 且应用非终态；audit 只记 secret.rotated，
 *     不记 secret 值；
 *  5. 敏感 scope（student.identity/offline_access）必须有使用理由，
 *     且应用提供隐私政策 URL 与开发者联系方式（创建/更新时校验）；
 *  6. 被暂停（suspended）的开发者：一切 mutation 拒绝（403），只读允许。
 *
 * 传输层（真实 Core 实现时）：BFF 以服务端持有的 OIDC 会话 sub 作为
 * x-developer-subject header 调用 Core；Web 永不从浏览器输入读取 sub。
 * Core 侧以 developers.user_id=sub 解析开发者（首次调用自动建档）。
 */

import type {
  AuditEntryDTO,
  CreateAppInput,
  CreateAppResult,
  DeveloperAppDetailDTO,
  DeveloperAppSummaryDTO,
  DeveloperDTO,
  RedirectUriInput,
  ScopeDTO,
  UpdateAppInput,
} from '@/lib/developer/contract'

export interface DeveloperStore {
  /** 开发者资料（不存在返回 null；Portal 登录后由 ensureDeveloper 建档） */
  getDeveloper(sub: string): Promise<DeveloperDTO | null>
  /** 首次登录建档（幂等） */
  ensureDeveloper(sub: string, displayName: string): Promise<DeveloperDTO>

  listApps(sub: string): Promise<DeveloperAppSummaryDTO[]>
  createApp(sub: string, input: CreateAppInput): Promise<CreateAppResult>
  /** 不存在或非本人所有 → null（404，不泄露存在性） */
  getApp(sub: string, appId: string): Promise<DeveloperAppDetailDTO | null>
  /** 仅 draft/rejected 可改；否则 DeveloperApiError(409) */
  updateApp(sub: string, appId: string, input: UpdateAppInput): Promise<DeveloperAppDetailDTO | null>
  /** 仅 draft 可删（其余走 revoke 策略） */
  deleteApp(sub: string, appId: string): Promise<{ deleted: true } | null>

  addRedirectUri(sub: string, appId: string, input: RedirectUriInput): Promise<DeveloperAppDetailDTO | null>
  removeRedirectUri(sub: string, appId: string, redirectUriId: string): Promise<DeveloperAppDetailDTO | null>
  /** 替换全部 scope 请求（含 justification）；pending 及之后重新进入审核 */
  putScopes(sub: string, appId: string, scopes: Array<{ scope: string; justification: string | null }>): Promise<DeveloperAppDetailDTO | null>
  getScopes(sub: string, appId: string): Promise<ScopeDTO[] | null>

  submitForReview(sub: string, appId: string): Promise<DeveloperAppDetailDTO | null>
  /** 仅 web_confidential；返回的明文 secret 只出现这一次 */
  rotateSecret(sub: string, appId: string): Promise<{ app: DeveloperAppDetailDTO; client_secret: string } | null>
  revokeApp(sub: string, appId: string): Promise<DeveloperAppDetailDTO | null>

  /** 审计查询（stub 调试/管理用；生产由 Core audit 表承担） */
  listAudit(sub: string, appId: string): Promise<AuditEntryDTO[] | null>
}
