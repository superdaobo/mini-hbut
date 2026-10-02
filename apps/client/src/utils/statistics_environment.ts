export type StatisticsEnvironment = 'production' | 'test'

// 生产主域/兜底域的唯一权威（契约 docs/architecture/backend-endpoints-contract.md §9）
import { FALLBACK_BACKEND_ORIGIN, PRIMARY_BACKEND_ORIGIN } from './backend_endpoints'

const buildProfile = String(import.meta.env.VITE_BUILD_PROFILE || 'standard').trim().toLowerCase()

export const resolveStatisticsEnvironment = (profile: unknown): StatisticsEnvironment =>
  String(profile || '').trim().toLowerCase() === 'release' ? 'production' : 'test'

export const STATISTICS_ENVIRONMENT: StatisticsEnvironment = resolveStatisticsEnvironment(buildProfile)

/** 生产 = mini.hbut.site（主域）；测试 = testocr1（环境隔离，不进生产配置） */
export const STATISTICS_SERVICE_BASE_URL = STATISTICS_ENVIRONMENT === 'production'
  ? PRIMARY_BACKEND_ORIGIN
  : 'https://mini-hbut-testocr1.hf.space'

export const STATISTICS_HEALTH_ENDPOINT = `${STATISTICS_SERVICE_BASE_URL}/health`
export const STATISTICS_CLOUD_SYNC_ENDPOINT = `${STATISTICS_SERVICE_BASE_URL}/api/cloud-sync`
export const STATISTICS_OCR_ENDPOINT = `${STATISTICS_SERVICE_BASE_URL}/api/ocr/recognize`

export const isProductionStatisticsEnvironment = () => STATISTICS_ENVIRONMENT === 'production'

/**
 * 各环境的已知服务域（**按 hostname 精确匹配**，不得做子串匹配 —— 见下方说明）。
 *
 * 生产域集合收敛为两域（契约 §9）：`mini.hbut.site`（主）+ 兜底域。
 * 历史第三方 OCR 域已下架：不再视为生产域（存量配置在两端环境均放行，不做硬拒绝，
 * 避免历史用户配置失效）。
 */
const hostOf = (origin: string): string => {
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const PRODUCTION_HOSTS = [hostOf(PRIMARY_BACKEND_ORIGIN), hostOf(FALLBACK_BACKEND_ORIGIN)].filter(
  Boolean
)
const TEST_HOSTS = ['mini-hbut-testocr1.hf.space'] as const

const hostMatches = (hostname: string, host: string): boolean =>
  hostname === host || hostname.endsWith(`.${host}`)

/**
 * 取 URL 的 hostname（含 IDNA / 百分号 / Unicode 点规范化）。不可解析返回 `''`。
 *
 * 无 scheme 的写法（`host/path`）按 https 再试一次，兼容历史配置形态。
 */
const resolveHostname = (value: unknown): string => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  for (const candidate of [text, `https://${text}`]) {
    try {
      return new URL(candidate).hostname.toLowerCase()
    } catch {
      // 换下一种形态
    }
  }
  return ''
}

/**
 * 判定服务地址是否与当前构建环境兼容（生产构建拒测试域、测试构建拒生产域）。
 *
 * ⚠️ 必须按 **hostname** 比较，不能对原始字符串做子串匹配：
 * `https://mini-hbut-testocr1%2ehf.space/...`（百分号编码点）与
 * `https://mini-hbut-testocr1。hf.space/...`（U+3002 全角句点）经 WHATWG URL 规范化后
 * **就是测试域**，但它们不含字面子串 `mini-hbut-testocr1.hf.space` —— 子串匹配会把它们
 * 当成"自定义域"放行，跨环境护栏（`pickEnvironmentCompatibleBase`）与落盘值清理都会被绕过。
 *
 * 自定义域与 loopback 在两端环境都放行（只拒"另一端环境"的已知域）；
 * 无法解析为 URL 的值一律判**不兼容**（fail closed）。
 */
export const isStatisticsServiceUrlCompatibleForEnvironment = (
  value: unknown,
  environment: StatisticsEnvironment
): boolean => {
  const hostname = resolveHostname(value)
  if (!hostname) return false
  const isProductionHost = PRODUCTION_HOSTS.some((host) => hostMatches(hostname, host))
  const isTestHost = TEST_HOSTS.some((host) => hostMatches(hostname, host))
  if (environment === 'production') return !isTestHost
  return !isProductionHost
}

export const isStatisticsServiceUrlCompatible = (value: unknown): boolean =>
  isStatisticsServiceUrlCompatibleForEnvironment(value, STATISTICS_ENVIRONMENT)
