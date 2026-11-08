/**
 * T12（mini-hbut#1170）应用注册审核生命周期 —— 领域类型。
 *
 * 单一事实源：审核记录（review）。四份派生产物（Casdoor 配置 / 业务策略 / 目录条目 / 模块产物）
 * 都只能从记录派生，且各自带 `review_version` 绑定；产物与记录不一致即偏差（对账负责发现）。
 *
 * 设计依据：`docs/architecture/t12-app-registry-lifecycle.md` §2.2（字段表）、
 * `docs/architecture/contracts/module-and-auth-contracts.md` §7（目录条目字段）。
 */

/** 生命周期状态（§3.1）。`rejected` 可回炉（§3.2 #4 修复了旧模型把它当终态的矛盾）。 */
export type ReviewStatus =
  | 'draft'
  | 'submitted'
  | 'rejected'
  | 'approved'
  | 'provisioned'
  | 'active'
  | 'suspended'
  | 'revoked'

/** 形态：内嵌（复用模块宿主）或网页（独立站点）。契约里还有 `native`，本期审核范围仅前两者。 */
export type AppForm = 'embedded' | 'external'

export type RedirectUriKind = 'web_https' | 'native_custom' | 'native_loopback'

export interface RedirectUri {
  uri: string
  kind: RedirectUriKind
}

export interface DataDomainRequest {
  domain: string
  operations: string[]
  /** 审核人可读的用途说明（验收 2「权限/数据用途」）。 */
  purpose: string
}

export interface CompatSpec {
  /** 宿主最低版本。 */
  min_host: string
  platforms: string[]
  store_policy: 'allowed' | 'disabled'
}

export interface ModuleArtifact {
  manifest_url: string
  artifact_url: string
  publisher_key_id: string
  /** 发布序号：单调递增，防回放（§3.2 #1）。 */
  release_seq: number
}

export interface CasdoorTarget {
  application_name: string
  client_id: string
  expire_in_hours: number
  refresh_expire_in_hours: number
  token_format: string
  token_fields: string[]
}

/** 四份派生产物。 */
export type ArtifactKind = 'casdoor' | 'policy' | 'catalog' | 'module'

export type ArtifactResult = 'ok' | 'failed'

export interface ArtifactReceipt {
  at: string
  result: ArtifactResult
  detail?: string
}

export interface ArtifactReceipts {
  casdoor?: ArtifactReceipt
  policy?: ArtifactReceipt
  catalog?: ArtifactReceipt
  module?: ArtifactReceipt
}

/** 审核记录（§2.2 字段表；与旧 `application_reviews` 兼容，不另建第二套账号认证）。 */
export interface ReviewRecord {
  review_id: string
  app_id: string
  /** 同一 app_id 单调递增。 */
  version: number
  /** 内容寻址 sha256（hex64，见 `revision.ts`）。 */
  revision: string
  form: AppForm
  /** `embedded` 必填；`external` 为空。 */
  entry: string
  redirect_uris: RedirectUri[]
  allowed_groups: string[]
  data_domains: DataDomainRequest[]
  compat: CompatSpec
  /** `remote` 条目必填。 */
  module: ModuleArtifact | null
  casdoor: CasdoorTarget
  owner: string
  submitted_by: string
  submitted_at: string
  reviewer: string | null
  reviewed_at: string | null
  decision: 'approved' | 'rejected' | null
  decision_reason: string | null
  status: ReviewStatus
  artifact_receipts: ArtifactReceipts
}

/** 目录条目（契约 §7）——客户端 T07 消费；只有 `status=active` 才进用户可见目录。 */
export type CatalogStatus = 'active' | 'pending' | 'disabled'

export interface CatalogModuleRef {
  manifest_url: string
  artifact_url: string
  publisher_key_id: string
  release_seq: number
}

export interface CatalogEntry {
  app_id: string
  name: string
  icon: string
  summary: string
  kind: 'internal' | 'remote'
  form: AppForm | 'native'
  entry?: string
  order?: number
  compat: CompatSpec
  data_domains: DataDomainRequest[]
  module?: CatalogModuleRef
  status: CatalogStatus
  /** 与 T12 审核记录绑定；同一条目只能对应一个已审核版本。 */
  review_version: string
}

/** 展示元数据：契约 §7 要求 name/icon/summary，但它们在审核记录之外单独维护。 */
export interface CatalogPresentation {
  name: string
  icon: string
  summary: string
  kind: 'internal' | 'remote'
  order?: number
}
