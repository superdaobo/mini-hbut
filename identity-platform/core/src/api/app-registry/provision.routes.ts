/**
 * T12（mini-hbut#1170）应用注册审核 —— provision 端点
 * （POST /api/v1/apps/:appId/reviews/:reviewId/provision）。
 *
 * P4-4（mini-hbut#1219）退役：自建注册表不再是权威源（权威源 = 仓库
 * manifest/apps.json + PR 审核）。本端点与 submit/approve/reject 一并退役：
 * 一律 **410 Gone** + 固定响应体（domain/app-registry/retired.ts
 * REGISTRY_RETIRED_BODY），不再调用编排层、不再落库、不再写审计。
 *
 * 保留说明：
 * - ProvisioningDeps 接口与 registerAppRegistryProvisionRoutes 签名保留，
 *   供 src/api/index.ts / 部署侧既有装配继续通过类型检查（依赖不再被消费）；
 * - 编排层 provisioner.ts（runProvisioning）为冻结的纯逻辑模块，文件保留
 *   供历史审查与领域单测（tests/api/app-registry/provisioner.test.ts）。
 *
 * 行为（fail closed）：
 * - 410 Gone + {"error":"registry_retired","message":"应用接入改由清单仓库 + PR 审核（见 manifest/README.md）"}；
 * - 响应前不做身份解析 / DB 读写 / 适配器调用（资源已退役，固定响应即终态）；
 * - 服务令牌中间件仍在 router 之前拦截无令牌请求（与 index.ts 同一装配顺序）；
 * - 如需恢复写入能力，必须经由清单仓库 manifest/apps.json + PR 审核，
 *   并在 P4-4 验收后重新评审本模块（不得静默恢复写路径）。
 */
import type Router from '@koa/router'
import type { RouterContext } from '@koa/router'
import type { SqlExecutor } from '../../db/types.js'
import { API_PREFIX } from '../requests.js'
import type { CatalogPresentation } from '../../domain/app-registry/types.js'
import { REGISTRY_RETIRED_BODY } from '../../domain/app-registry/retired.js'
import type {
  ActualStateReader,
  ProvisionAdapters,
} from './provisioner.js'

/**
 * provision 编排层依赖（部署侧注入，接口 + 依赖注入，同 service-token.ts 风格）。
 * P4-4 后仅保留类型形状（部署侧装配兼容）；端点一律 410，不再消费本依赖。
 */
export interface ProvisioningDeps {
  /** 四个写入适配器（①Casdoor → ②T11 策略 → ③目录条目 → ④模块产物；真实实现由部署侧提供）。 */
  adapters: ProvisionAdapters
  /** 现状快照读取器（从四个目标读取 actual；读取失败由 provisioner 包成 SNAPSHOT_FAILED）。 */
  snapshot: ActualStateReader
  /** 目录展示元数据（name/icon/summary/kind；领域 plan 入参）。 */
  presentation: CatalogPresentation
  /** T11 数据域全集；为空 → 领域安全阀整轮停止（退出码 2）。 */
  allowedDomains: readonly string[]
}

export interface ProvisionRoutesDeps {
  sql: SqlExecutor
  /** 环境变量（测试可注入；缺省 process.env） */
  env?: Record<string, string | undefined>
  /** 编排层依赖；P4-4 后不再被消费（保留参数形状供装配方传入）。 */
  provisioning?: ProvisioningDeps
}

/** P4-4：退役端点统一 410 Gone（固定响应体，见 retired.ts） */
function respondRegistryRetired(ctx: RouterContext): void {
  ctx.status = 410
  ctx.body = REGISTRY_RETIRED_BODY
}

/**
 * 注册 provision 端点（P4-4 退役：410 Gone + 固定响应体）。
 * 路由路径保持不变：调用方/网关/测试的旧路径不会 404，
 * 而是收到明确的退役说明（410 Gone，registry_retired）。
 */
export function registerAppRegistryProvisionRoutes(router: Router, _deps: ProvisionRoutesDeps): void {
  void _deps
  // POST /api/v1/apps/:appId/reviews/:reviewId/provision —— 上架（P4-4 退役：410 Gone）
  router.post(`${API_PREFIX}/apps/:appId/reviews/:reviewId/provision`, (ctx) => {
    respondRegistryRetired(ctx)
  })
}
