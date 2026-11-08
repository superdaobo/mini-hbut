/**
 * T12 provisioner 写入器（mini-hbut#1170）：编排与回执层。
 *
 * 本模块只负责**编排与回执**：
 *   从仓库层读记录 → 取现状（注入的快照读取器）→ planProvisioning（领域）
 *   → applyPlan（领域）→ 回执写回仓库层。
 * 本模块**不负责**：
 * - **判定**：产物顺序、安全阀（退出码 2）、skip/幂等判定全部由
 *   domain/app-registry/provisioning.ts 决定，本层不重写状态机、不改顺序
 *   （顺序 = ARTIFACT_ORDER ①Casdoor → ②业务策略 → ③目录条目 → ④模块产物）；
 * - **网络细节**：四个写入目标（Casdoor / T11 策略表 / 目录 / 模块发布记录）
 *   以可注入适配器表达，本层不发 HTTP、不读环境配置、不连任何真实服务；
 *   真实实现由部署侧提供（照 service-token.ts 的风格：接口 + 依赖注入）。
 *
 * 语义（与领域层 provisioning.ts 一致）：
 * - 安全阀（plan.stop / exitCode === 2）→ **零次适配器调用**，回执不动，
 *   返回可读原因 + 退出码语义；
 * - 部分失败**不回滚**已成功产物：回执按产物分别记录（ok / failed+原因），
 *   结论为"未全部成功"（allSucceeded=false），suggestedStatus 不升级；
 * - 适配器抛异常 → 包成该产物的失败回执，**不冒泡**（不打断后续产物的尝试）；
 * - 状态：全部成功时**建议** `provisioned`（suggestedStatus）。本模块
 *   **不**自己调用 updateStatus——状态迁移是状态机落库，需要审核人身份与
 *   审计事件，由调用方（路由层）决定并执行；回执是"本次执行的审计记录"，
 *   才由本模块写回（幂等覆盖）。
 */
import { applyPlan, planProvisioning } from '../../domain/app-registry/provisioning.js'
import type { ActualState, ProvisionStep } from '../../domain/app-registry/provisioning.js'
import type {
  ArtifactKind,
  ArtifactReceipts,
  CasdoorTarget,
  CatalogEntry,
  CatalogPresentation,
  ModuleArtifact,
  ReviewRecord,
  ReviewStatus,
} from '../../domain/app-registry/types.js'

/** 适配器统一写入结果：成功，或带可读原因的失败（适配器契约：不得抛未捕获异常）。 */
export type WriteOutcome = { ok: true } | { ok: false; error: string }

/** 业务策略规则（T11 数据域 × 操作，幂等键 (app_id, domain, operation)）。 */
export interface PolicyRule {
  domain: string
  operation: string
}

/** ① Casdoor 应用配置写入器（T09 配方：tokenFields 进学号、TTL 必须显式）。 */
export interface CasdoorAppWriter {
  writeAppConfig(desired: CasdoorTarget): Promise<WriteOutcome>
}

/** ② 业务策略写入器（T11 数据域 × 操作）。 */
export interface PolicyWriter {
  writePolicies(appId: string, desired: readonly PolicyRule[]): Promise<WriteOutcome>
}

/** ③ 目录条目发布器（契约 module-and-auth-contracts.md §7）。 */
export interface CatalogEntryPublisher {
  publishEntry(entry: CatalogEntry): Promise<WriteOutcome>
}

/** ④ 模块产物登记器（仅 remote；release_seq 单调递增防回放）。 */
export interface ModuleArtifactRegistrar {
  registerArtifact(appId: string, desired: ModuleArtifact): Promise<WriteOutcome>
}

/** 四个写入适配器（按 ARTIFACT_ORDER 的键名一一对应）。 */
export interface ProvisionAdapters {
  casdoor: CasdoorAppWriter
  policy: PolicyWriter
  catalog: CatalogEntryPublisher
  module: ModuleArtifactRegistrar
}

/** 仓库层注入（对应 app_registry.repo.ts 的三个函数）。 */
export interface ReviewStore {
  /** findReviewById：按主键读审核记录。 */
  find(reviewId: string): Promise<ReviewRecord | null>
  /** updateArtifactReceipts：回执写回；返回是否命中行。 */
  saveReceipts(reviewId: string, receipts: ArtifactReceipts): Promise<boolean>
  /** updateStatus：状态迁移落库。本模块不调用，留给调用方（路由层）使用。 */
  updateStatus(reviewId: string, from: ReviewStatus, to: ReviewStatus): Promise<boolean>
}

/** 现状快照读取器：从四个目标读取 actual（注入；本层不自己连任何目标）。 */
export interface ActualStateReader {
  read(review: ReviewRecord): Promise<ActualState>
}

/** runProvisioning 依赖（依赖注入，测试用假实现）。 */
export interface RunProvisioningDeps {
  store: ReviewStore
  snapshot: ActualStateReader
  adapters: ProvisionAdapters
  /** 目录展示元数据（name/icon/summary/kind，领域 plan 入参）。 */
  presentation: CatalogPresentation
  /** T11 数据域全集；为空 → 领域安全阀整轮停止（退出码 2）。 */
  allowedDomains: readonly string[]
  /** 时钟注入（回执时间戳；缺省 now → ISO 字符串）。 */
  now?: () => string
}

/** 一轮 provision 的结果（编排层结论，不含网络细节）。 */
export interface ProvisioningRunResult {
  reviewId: string
  appId: string
  /** true = 安全阀（plan.stop）触发：零次适配器调用，回执未写回。 */
  stopped: boolean
  /** 0 = 正常；2 = 安全阀整轮停止（沿用 account-sync 的退出码语义）。 */
  exitCode: 0 | 2
  /** 安全阀原因（人类可读；仅 stopped 时有值）。 */
  stopReason?: string
  /** 四产物全部 ok 且回执写回成功。 */
  allSucceeded: boolean
  /**
   * 建议状态（领域 applyPlan 的 keepStatus 语义）：仅当全部成功才 `provisioned`。
   * 落库与否由调用方决定（路由层调 store.updateStatus + 审计）。
   */
  suggestedStatus: 'approved' | 'provisioned'
  /** 回执是否成功写回仓库层（写回失败降级为 false，不抛异常）。 */
  receiptsSaved: boolean
  /** 本轮累计后的完整回执（按产物分别记录）。 */
  receipts: ArtifactReceipts
  /** 失败产物清单（回执里对应 result=failed + 可读原因）。 */
  failures: { artifact: ArtifactKind; error: string }[]
  /** 领域 plan 的步（供调用方记录/审计；顺序即 ARTIFACT_ORDER）。 */
  steps: ProvisionStep[]
}

/** 编排层错误（仅两类前置失败；适配器/仓库异常不从这里冒泡）。 */
export class ProvisionerError extends Error {
  readonly code: 'REVIEW_NOT_FOUND' | 'SNAPSHOT_FAILED'

  constructor(code: ProvisionerError['code'], message: string) {
    super(message)
    this.name = 'ProvisionerError'
    this.code = code
  }
}

function defaultNow(): string {
  return new Date().toISOString()
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  try {
    return String(err)
  } catch {
    return '未知错误（不可序列化）'
  }
}

/**
 * 把一个 plan 步分发到对应适配器。
 * 适配器按契约返回 { ok } | { ok, error }；若适配器违反契约抛异常，
 * 这里统一包成失败回执（不冒泡，不打断后续产物）。
 */
async function dispatchWrite(
  review: ReviewRecord,
  step: ProvisionStep,
  adapters: ProvisionAdapters,
): Promise<WriteOutcome> {
  try {
    switch (step.artifact) {
      case 'casdoor':
        return await adapters.casdoor.writeAppConfig(step.desired as CasdoorTarget)
      case 'policy':
        return await adapters.policy.writePolicies(review.app_id, step.desired as readonly PolicyRule[])
      case 'catalog':
        return await adapters.catalog.publishEntry(step.desired as CatalogEntry)
      case 'module':
        return await adapters.module.registerArtifact(review.app_id, step.desired as ModuleArtifact)
      default:
        return { ok: false, error: `未知产物类型：${String(step.artifact)}` }
    }
  } catch (err) {
    return { ok: false, error: `${step.artifact} 适配器异常：${describeError(err)}` }
  }
}

/**
 * 执行一轮 provision（snapshot → plan → apply → 回执写回）。
 *
 * 注意：领域 applyPlan 的 write 回调是同步签名，而适配器是异步 I/O，
 * 因此这里**先按 plan 顺序**（即 ARTIFACT_ORDER 序）逐个解析写步骤的
 * 适配器结果（含异常包装），再交给 applyPlan 统一累计回执——
 * 适配器被调用的顺序、次数与逐步调用完全一致，回执语义不变。
 */
export async function runProvisioning(
  reviewId: string,
  deps: RunProvisioningDeps,
): Promise<ProvisioningRunResult> {
  const now = (deps.now ?? defaultNow)()

  // 1) 仓库层读记录
  const review = await deps.store.find(reviewId)
  if (!review) {
    throw new ProvisionerError('REVIEW_NOT_FOUND', `审核记录不存在：${reviewId}`)
  }

  // 2) 现状快照（注入的读取器；失败 → 整轮失败，不写任何东西）
  let actual: ActualState
  try {
    actual = await deps.snapshot.read(review)
  } catch (err) {
    throw new ProvisionerError('SNAPSHOT_FAILED', `现状快照读取失败：${describeError(err)}`)
  }

  // 3) 领域 plan（顺序 / 安全阀 / 幂等判定全部在领域层）
  const plan = planProvisioning(review, actual, {
    presentation: deps.presentation,
    allowedDomains: deps.allowedDomains,
  })

  // 4) 安全阀：整轮停止 → 零次适配器调用，回执不动
  if (plan.stop) {
    return {
      reviewId,
      appId: review.app_id,
      stopped: true,
      exitCode: plan.exitCode,
      stopReason: plan.stopReason,
      allSucceeded: false,
      suggestedStatus: 'approved',
      receiptsSaved: false,
      receipts: { ...review.artifact_receipts },
      failures: [],
      steps: plan.steps,
    }
  }

  // 5) apply：按 plan 顺序解析各写步骤的适配器结果，交领域 applyPlan 累计回执
  const resolved = new Map<ArtifactKind, WriteOutcome>()
  for (const step of plan.steps) {
    if (step.action === 'skip') continue
    if (step.action === 'create' || step.action === 'update') {
      resolved.set(step.artifact, await dispatchWrite(review, step, deps.adapters))
    } else {
      // 'blocked'（防御分支：当前领域 plan 不产出该动作）：不调适配器，记失败
      resolved.set(step.artifact, { ok: false, error: step.reason })
    }
  }

  const applied = applyPlan(
    review,
    plan,
    (step) => resolved.get(step.artifact) ?? { ok: false, error: '缺少适配器结果（不应发生）' },
    now,
  )

  // 6) 回执写回仓库层（本次执行的审计记录；写回失败降级，不抛异常）
  let receiptsSaved = false
  try {
    receiptsSaved = await deps.store.saveReceipts(reviewId, applied.receipts)
  } catch {
    receiptsSaved = false
  }

  return {
    reviewId,
    appId: review.app_id,
    stopped: false,
    exitCode: 0,
    allSucceeded: applied.failures.length === 0 && receiptsSaved,
    suggestedStatus: applied.keepStatus,
    receiptsSaved,
    receipts: applied.receipts,
    failures: applied.failures,
    steps: plan.steps,
  }
}
