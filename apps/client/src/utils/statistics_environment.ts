/**
 * 后端服务地址与环境判定（**唯一权威**）。
 *
 * ## 2026-10-06 决策：所有构建档位统一使用生产后端
 *
 * 原设计：只有 `release` 档位用生产域，dev / beta / 本地一律被「环境隔离」指向测试 Space
 * `mini-hbut-testocr1.hf.space`，并主动拒绝生产域（避免测试数据写进生产库）。
 *
 * 触发变更的事实：该测试 Space 被 HuggingFace 置为 `stage=PAUSED`
 * （`errorMessage: "Flagged as abusive"`），而隔离规则又连带拒掉了生产兜底域 —— 于是
 * dev / beta 包**没有任何可用后端**（云同步 / OCR / 排行榜 / 游戏平台全线失败），
 * 且失败是静默的。产品负责人拍板：**统一使用 `mini.hbut.site`（主）
 * + `mini-hbut-ocr-service.hf.space`（唯一兜底），哪怕是测试版也这样**。
 *
 * ⚠️ 取舍（必须知晓）：dev / beta 的写入会落到**生产库** —— 原本由环境隔离阻断。
 * 需要隔离数据时，请在设置里把「自定义后端」指向自建实例，不要依赖构建档位。
 *
 * ⚠️ 已下线的测试域：`mini-hbut-testocr1.hf.space` 不再被任何档位接受，存量落盘配置会被
 * 清理 —— 否则历史值会把请求带回一个已经不存在的后端（正是本次故障的形态）。
 *
 * ⚠️ **本文件是唯一权威**：`cloud_sync_config.ts` 与 `game_center/base.ts` 必须消费
 * `isProductionStatisticsEnvironment()`，不得各自再读 `VITE_BUILD_PROFILE`。
 * 历史上三处各自判定（本文件 + 云同步 + 游戏候选），改一处漏两处 —— 这次统一切换
 * 就是因为「云同步与游戏榜走组模型、而环境域判定各写一遍」而反复踩坑。
 */
export type StatisticsEnvironment = 'production' | 'test'

// 生产主域/兜底域的唯一权威（契约 docs/architecture/backend-endpoints-contract.md §9）
import { PRIMARY_BACKEND_ORIGIN } from './backend_endpoints'

/**
 * 解析后端环境。
 *
 * 自 2026-10-06 起**恒为 `production`**（见文件头决策说明）。参数保留仅为兼容既有调用点；
 * 不要再据此恢复「按构建档位选后端」的行为 —— 构建来源请读 `VITE_BUILD_PROFILE`。
 */
export const resolveStatisticsEnvironment = (_profile?: unknown): StatisticsEnvironment => 'production'

/** 后端环境（恒为 production）。构建来源另见 `VITE_BUILD_PROFILE`（启动诊断报告会展示）。 */
export const STATISTICS_ENVIRONMENT: StatisticsEnvironment = resolveStatisticsEnvironment(
  String(import.meta.env.VITE_BUILD_PROFILE || 'standard').trim().toLowerCase()
)

/** 后端主域：恒为 `mini.hbut.site`（兜底域由 `backend_endpoints.ts` 的组模型承担） */
export const STATISTICS_SERVICE_BASE_URL = PRIMARY_BACKEND_ORIGIN

export const STATISTICS_HEALTH_ENDPOINT = `${STATISTICS_SERVICE_BASE_URL}/health`
export const STATISTICS_CLOUD_SYNC_ENDPOINT = `${STATISTICS_SERVICE_BASE_URL}/api/cloud-sync`
export const STATISTICS_OCR_ENDPOINT = `${STATISTICS_SERVICE_BASE_URL}/api/ocr/recognize`

/**
 * 是否走生产后端（**恒 true**）。
 *
 * 其它模块必须消费本函数来「是否启用组模型与故障转移」，不得各自读构建档位 —— 见文件头。
 */
export const isProductionStatisticsEnvironment = () => STATISTICS_ENVIRONMENT === 'production'

/**
 * 已下线的测试域（历史环境隔离目标，Space 已 PAUSED）。
 *
 * 任何档位都拒绝它：存量落盘配置若仍指向这里，会把请求带回一个不存在的后端，
 * 而失败形态是「返回 HTML 而非 JSON」这类**静默**错误（云同步只会报「无效响应」）。
 */
const RETIRED_TEST_HOSTS = ['mini-hbut-testocr1.hf.space'] as const

const hostMatches = (hostname: string, host: string): boolean =>
  hostname === host || hostname.endsWith(`.${host}`)

/**
 * 取 URL 的 hostname（含 IDNA / 百分号 / Unicode 点规范化）。不可解析返回 `''`。
 *
 * 解析规则（#968b 收口，两处非直觉行为的明确结论）：
 * 1. **相对路径**（以 `/` 开头，如 `/api/game-rank`）不是服务地址，直接判不可解析：
 *    若交给 `https://` 前缀兜底，`/api/...` 会被拼成假主机名 `api` 而**误判兼容**
 *    （清理器会保留一个不可提交的死值）。结论：不兼容 → 落盘清理（fail closed）。
 * 2. **无 scheme 的 `host:port`**（如 `localhost:3000/api/...`）：WHATWG URL 会把
 *    `localhost:` 整体当作 opaque scheme、"成功"解析出空 hostname —— 空 hostname
 *    不采纳，回落按 `https://` 前缀再解析一次得到真实 hostname（`localhost`）。
 *    结论：识别为本地地址（loopback 语义）→ 放行，**不误清**（本地联调可用）。
 * 3. 其余形态先按原字符串、再按 `https://` 前缀尝试（兼容历史「无 scheme 域名」配置）。
 */
const resolveHostname = (value: unknown): string => {
  const text = String(value ?? '').trim()
  if (!text || text.startsWith('/')) return ''
  for (const candidate of [text, `https://${text}`]) {
    try {
      const url = new URL(candidate)
      // hostname 为空 = opaque scheme 误读（`localhost:3000/...` → scheme `localhost:`），
      // 不是可路由的服务地址形态，继续试下一候选
      if (url.hostname) return url.hostname.toLowerCase()
    } catch {
      // 换下一种形态
    }
  }
  return ''
}

/**
 * 判定服务地址是否可用（只拒**已下线的测试域**；自定义域与 loopback 一律放行）。
 *
 * ⚠️ 必须按 **hostname** 比较，不能对原始字符串做子串匹配：
 * `https://mini-hbut-testocr1%2ehf.space/...`（百分号编码点）与
 * `https://mini-hbut-testocr1。hf.space/...`（U+3002 全角句点）经 WHATWG URL 规范化后
 * **就是同一个域**，但它们不含字面子串 —— 子串匹配会把它们当成"自定义域"放行，
 * 落盘值清理会被绕过。
 *
 * 无法解析为 URL 的值一律判**不可用**（fail closed）。
 */
export const isStatisticsServiceUrlCompatible = (value: unknown): boolean => {
  const hostname = resolveHostname(value)
  if (!hostname) return false
  return !RETIRED_TEST_HOSTS.some((host) => hostMatches(hostname, host))
}
