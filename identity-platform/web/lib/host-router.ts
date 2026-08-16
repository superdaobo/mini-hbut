/**
 * Host 路由纯函数（可单测，无 Next.js 依赖）。
 *
 * 站点边界规则（fail closed）：
 * - auth.*      ：仅允许 auth-site 路由（授权等待页面）；
 * - developer.* ：仅允许 Developer/Admin UI；
 * - Preview host：必须通过 IDENTITY_PREVIEW_HOSTS 显式列出，不自动放行；
 * - 其余 host   ：一律 404，绝不默认落到管理后台。
 *
 * 所有 host 在比较前统一规范化（URL 解析 + Punycode），
 * 因此中文域名（auth.湖北工业大学.com）与 ASCII 域名等价匹配，
 * 且 `evil.auth.<domain>` 这类子域无法绕过精确匹配。
 */

export type SiteKind = 'auth' | 'developer' | 'preview'

export type HostDecision =
  | { kind: SiteKind }
  | { kind: 'blocked'; status: 404 }

export interface HostConfig {
  /** auth.* 站点公开 origin（如 https://auth.xn--vhq74jc2fzpchter27a.com） */
  authOrigin?: string
  /** developer.* 站点公开 origin */
  developerOrigin?: string
  /** Preview 部署 host 列表（显式识别，逗号分隔后传入） */
  previewHosts?: readonly string[]
  /** 本地开发便利开关：IDENTITY_ENVIRONMENT=development 时放行 localhost */
  allowLocalhostDev?: boolean
}

/** 把 host/origin 规范化为纯 ASCII hostname（Punycode + 去掉端口） */
export function normalizeHost(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    return ''
  }
  try {
    // 兼容传 origin（带协议）与传 host（带端口）两种写法
    const url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`)
    return url.hostname
  } catch {
    // 畸形 Host（如原始字节非法/编码损坏）一律视为不可识别 -> 404 fail closed
    return ''
  }
}

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/** 按 Host 分类请求归属站点；未识别一律 blocked（fail closed） */
export function classifyHost(host: string, config: HostConfig = {}): HostDecision {
  const normalized = normalizeHost(host)
  if (!normalized) {
    return { kind: 'blocked', status: 404 }
  }

  const authHost = config.authOrigin ? normalizeHost(config.authOrigin) : ''
  const developerHost = config.developerOrigin ? normalizeHost(config.developerOrigin) : ''

  // 精确匹配站点 host；绝不使用后缀匹配，防止 evil.auth.<domain> 子域绕过
  if (authHost && normalized === authHost) {
    return { kind: 'auth' }
  }
  if (developerHost && normalized === developerHost) {
    return { kind: 'developer' }
  }

  // Preview host 必须显式列入白名单
  for (const previewHost of config.previewHosts ?? []) {
    if (previewHost.trim() && normalized === normalizeHost(previewHost)) {
      return { kind: 'preview' }
    }
  }

  // 仅本地开发环境放行 localhost；生产/预览环境绝不匹配
  if (config.allowLocalhostDev && LOCALHOST_HOSTS.has(normalized)) {
    return { kind: 'auth' }
  }

  return { kind: 'blocked', status: 404 }
}
