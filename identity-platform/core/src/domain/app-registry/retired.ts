/**
 * P4-4（mini-hbut#1219）自建注册表退役 —— 权威源声明与统一错误。
 *
 * 权威源变更（2026-11-12）：
 * - 自建注册表/审核/provisioner（app_registry_reviews 表 + 管理员审核 +
 *   开发者门户写入口）**不再是权威源**；
 * - 权威源 = 仓库 `manifest/apps.json`（mini-hbut-ocr-service 仓 manifest/ 目录）
 *   + PR 审核（1 位 ops 批准且非作者）；
 * - 应用接入、权限（数据域）与状态变更一律改走 manifest 清单 PR；
 * - 自建表仅作**历史只读快照**：列表/详情只读端点保留，写入口全部退役
 *   （HTTP 410 Gone；领域/仓储写方法抛 RegistryRetiredError，fail closed）。
 *
 * 统一语义（API / 领域 / 仓储三层一致）：
 * - HTTP：410 Gone + REGISTRY_RETIRED_BODY（固定响应体，措辞不得随意更改）；
 * - 领域/仓储：抛 RegistryRetiredError（code=REGISTRY_RETIRED）。
 */

/** 注册表退役错误：任何试图经自建注册表写路径的操作一律以本错误失败（fail closed） */
export class RegistryRetiredError extends Error {
  readonly code = 'REGISTRY_RETIRED'

  constructor() {
    super('自建注册表已退役：应用接入改由清单仓库 + PR 审核（见 manifest/README.md）')
    this.name = 'RegistryRetiredError'
  }
}

/** 410 Gone 固定响应体（P4-4 冻结契约：{"error":"registry_retired","message":"…"}） */
export const REGISTRY_RETIRED_BODY = Object.freeze({
  error: 'registry_retired',
  message: '应用接入改由清单仓库 + PR 审核（见 manifest/README.md）',
} as const)
