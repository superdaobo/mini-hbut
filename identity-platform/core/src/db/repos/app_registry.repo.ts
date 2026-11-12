/**
 * T12（mini-hbut#1170）应用注册审核记录仓储（app_registry_reviews 表）。
 *
 * 边界：
 * - 只做参数化 SQL（禁止字符串拼接）+ JSONB 解析；
 * - 状态机判定/幂等判定全部在 domain/app-registry（本文件不重写状态机）；
 * - 「单 pending 不变量」沿用 0002 决策：不用 partial unique index（pg-mem
 *   规划器缺陷，migrations/0002_admin_roles.sql:59-64），由调用方在事务内
 *   SELECT ... FOR UPDATE 锁既有行 + 条件 UPDATE（见 submit 事务）保证。
 * - 'superseded' 是幂等作废标记（§3.2 #1/#4），不是 §3.1 状态机节点，
 *   与旧表 application_reviews.status 的 superseded 约定一致。
 *
 * 权威源声明（P4-4，mini-hbut#1219）：
 * - 本表（app_registry_reviews）**不再是权威源**；权威源 = 仓库
 *   `manifest/apps.json`（mini-hbut-ocr-service 仓 manifest/ 目录）+ PR 审核；
 * - 本表仅保留**历史只读快照**：读方法（find* / list* / maxReleaseSeqForApp）保留；
 *   写方法（insertReview / updateStatus / setReviewDecision /
 *   updateArtifactReceipts）一律抛 RegistryRetiredError（fail closed）。
 */
import type { SqlExecutor, QueryResultRow } from '../types.js'
import { parseJsonb } from '../types.js'
import { RegistryRetiredError } from '../../domain/app-registry/retired.js'
import type {
  ArtifactReceipts,
  CasdoorTarget,
  CompatSpec,
  DataDomainRequest,
  ModuleArtifact,
  RedirectUri,
  ReviewStatus,
} from '../../domain/app-registry/types.js'

/** 存储态状态：§3.1 状态机 8 态 + superseded（作废标记，见文件头）。 */
export type AppRegistryStoredStatus = ReviewStatus | 'superseded'

/** app_registry_reviews 行（与 0010 迁移的列一一对应） */
export interface AppRegistryReviewRow extends QueryResultRow {
  id: string
  app_id: string
  version: number
  revision: string
  form: 'embedded' | 'external'
  entry: string | null
  redirect_uris: RedirectUri[]
  allowed_groups: string[]
  data_domains: DataDomainRequest[]
  compat: CompatSpec
  module: ModuleArtifact | null
  casdoor: CasdoorTarget
  owner: string
  submitted_by: string
  submitted_at: Date
  reviewer: string | null
  reviewed_at: Date | null
  decision: 'approved' | 'rejected' | null
  decision_reason: string | null
  status: AppRegistryStoredStatus
  artifact_receipts: ArtifactReceipts
  created_at: Date
  updated_at: Date
}

/** 提交落库输入（status 固定 'submitted'，id 由调用方生成 UUIDv7） */
export interface InsertReviewInput {
  id: string
  appId: string
  version: number
  revision: string
  form: 'embedded' | 'external'
  entry: string | null
  redirectUris: RedirectUri[]
  allowedGroups: string[]
  dataDomains: DataDomainRequest[]
  compat: CompatSpec
  module: ModuleArtifact | null
  casdoor: CasdoorTarget
  owner: string
  submittedBy: string
}

function parseRow(row: AppRegistryReviewRow): AppRegistryReviewRow {
  // pg-mem 返回对象、真 PG 返回 JSON 字符串（#619 parseJsonb 统一）
  row.redirect_uris = parseJsonb<RedirectUri[]>(row.redirect_uris)
  row.allowed_groups = parseJsonb<string[]>(row.allowed_groups)
  row.data_domains = parseJsonb<DataDomainRequest[]>(row.data_domains)
  row.compat = parseJsonb<CompatSpec>(row.compat)
  row.module = row.module ? parseJsonb<ModuleArtifact>(row.module) : null
  row.casdoor = parseJsonb<CasdoorTarget>(row.casdoor)
  row.artifact_receipts = parseJsonb<ArtifactReceipts>(row.artifact_receipts)
  return row
}

/** 插入一条审核记录（status 固定 submitted；RETURNING * 回读） */
export async function insertReview(
  sql: SqlExecutor,
  input: InsertReviewInput,
): Promise<AppRegistryReviewRow> {
  void sql
  void input
  // P4-4（mini-hbut#1219）退役：写方法移除 —— 权威源 = 仓库
  // manifest/apps.json + PR 审核（本表仅历史只读快照）；兜底抛错，fail closed。
  throw new RegistryRetiredError()
}

/** 按主键读取 */
export async function findReviewById(sql: SqlExecutor, reviewId: string): Promise<AppRegistryReviewRow | null> {
  const result = await sql.query<AppRegistryReviewRow>(
    'SELECT * FROM app_registry_reviews WHERE id = $1',
    [reviewId],
  )
  const row = result.rows[0]
  return row ? parseRow(row) : null
}

/** 幂等键 (app_id, revision) 查询（§4.1）：返回该应用下该 revision 的最新记录 */
export async function findByAppAndRevision(
  sql: SqlExecutor,
  appId: string,
  revision: string,
): Promise<AppRegistryReviewRow | null> {
  const result = await sql.query<AppRegistryReviewRow>(
    `SELECT * FROM app_registry_reviews
      WHERE app_id = $1 AND revision = $2
      ORDER BY version DESC
      LIMIT 1`,
    [appId, revision],
  )
  const row = result.rows[0]
  return row ? parseRow(row) : null
}

/**
 * 单 pending 查询：该应用当前 status='submitted' 的审核记录。
 * 单 pending 不变量下至多一条（取 version 最大兜底）。
 */
export async function findPendingByApp(
  sql: SqlExecutor,
  appId: string,
): Promise<AppRegistryReviewRow | null> {
  const result = await sql.query<AppRegistryReviewRow>(
    `SELECT * FROM app_registry_reviews
      WHERE app_id = $1 AND status = 'submitted'
      ORDER BY version DESC
      LIMIT 1`,
    [appId],
  )
  const row = result.rows[0]
  return row ? parseRow(row) : null
}

/** 下一个版本序号（同一 app_id 单调递增；无记录时从 1 开始） */
export async function nextVersionForApp(sql: SqlExecutor, appId: string): Promise<number> {
  const result = await sql.query<{ n: number | string }>(
    'SELECT COALESCE(MAX(version), 0) AS n FROM app_registry_reviews WHERE app_id = $1',
    [appId],
  )
  const n = result.rows[0]?.n
  const max = typeof n === 'number' ? n : Number(n ?? 0)
  return max + 1
}

/**
 * 条件状态迁移（应用层状态机的落库半边）：
 * 仅当当前 status = from 时迁移到 to；返回是否实际发生迁移（并发安全）。
 * 纯状态字段；审核人/结论由 setReviewDecision 单独写入。
 */
export async function updateStatus(
  sql: SqlExecutor,
  input: { reviewId: string; from: AppRegistryStoredStatus; to: AppRegistryStoredStatus },
): Promise<boolean> {
  void sql
  void input
  // P4-4（mini-hbut#1219）退役：写方法移除 —— 权威源 = 仓库
  // manifest/apps.json + PR 审核（本表仅历史只读快照）；兜底抛错，fail closed。
  throw new RegistryRetiredError()
}

/** 写入审核决定（approve/reject 时；reviewer 与 reviewed_at 一并落地） */
export async function setReviewDecision(
  sql: SqlExecutor,
  input: {
    reviewId: string
    reviewer: string
    decision: 'approved' | 'rejected'
    decisionReason: string | null
  },
): Promise<void> {
  void sql
  void input
  // P4-4（mini-hbut#1219）退役：写方法移除 —— 权威源 = 仓库
  // manifest/apps.json + PR 审核（本表仅历史只读快照）；兜底抛错，fail closed。
  throw new RegistryRetiredError()
}

/** 产物回执写入（provisioner/对账调用；返回是否命中行） */
export async function updateArtifactReceipts(
  sql: SqlExecutor,
  reviewId: string,
  receipts: ArtifactReceipts,
): Promise<boolean> {
  void sql
  void reviewId
  void receipts
  // P4-4（mini-hbut#1219）退役：写方法移除 —— 权威源 = 仓库
  // manifest/apps.json + PR 审核（本表仅历史只读快照）；兜底抛错，fail closed。
  throw new RegistryRetiredError()
}

/** 按应用列出全部审核记录（管理员视角，全部状态；version 降序） */
export async function listReviewsByApp(sql: SqlExecutor, appId: string): Promise<AppRegistryReviewRow[]> {
  const result = await sql.query<AppRegistryReviewRow>(
    `SELECT * FROM app_registry_reviews
      WHERE app_id = $1
      ORDER BY version DESC`,
    [appId],
  )
  return result.rows.map(parseRow)
}

/** 该应用历史最大 module.release_seq（提交前置：release_seq 单调，§3.2 #1） */
export async function maxReleaseSeqForApp(sql: SqlExecutor, appId: string): Promise<number> {
  const rows = await listReviewsByApp(sql, appId)
  let max = 0
  for (const row of rows) {
    if (row.module && Number.isInteger(row.module.release_seq) && row.module.release_seq > max) {
      max = row.module.release_seq
    }
  }
  return max
}
