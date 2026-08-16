/**
 * 审核页风险提示（纯函数，可单测；issue #625）。
 *
 * 这些是「风险提示」，不替代 Core 的 redirect_uri 校验：
 * - non_https_web：web_https 类型但非 https（localhost 除外）；
 * - localhost：本机回环（生产环境需人工确认）；
 * - custom_scheme：自定义 scheme（非 https 非 loopback）；
 * - domain_mismatch：redirect 域名与主页域名不一致（仅供参考，不硬性禁止）；
 * - changed：相对上一份审核快照新增/变更的项。
 */
import type { ScopeRisk } from './contract'

export type RedirectRiskFlag = 'non_https_web' | 'localhost' | 'custom_scheme' | 'domain_mismatch' | 'changed'

export interface RedirectRiskInput {
  uri: string
  kind: string
  /** 应用主页 URL（用于域名一致性比对） */
  homepage_url: string | null
  /** 上一份审核快照中的 redirect uri（变更高亮） */
  previousUris?: readonly string[]
}

export interface RedirectRiskResult {
  flags: RedirectRiskFlag[]
}

/** 解析 URL 的 hostname；非法 URL 返回 null */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** 是否为回环地址（localhost / 127.x / ::1） */
export function isLoopback(host: string | null): boolean {
  if (!host) {
    return false
  }
  if (host === 'localhost' || host === '::1' || host === '[::1]') {
    return true
  }
  return /^127\.\d+\.\d+\.\d+$/.test(host)
}

/** 分级：web_https 类型且 http:// 且非 loopback → 高风险（非加密传输） */
function isNonHttpsWeb(uri: string, kind: string): boolean {
  if (kind !== 'web_https') {
    return false
  }
  if (uri.startsWith('https://')) {
    return false
  }
  const host = hostnameOf(uri)
  return !isLoopback(host)
}

/** 分级：非 https 且非 loopback → custom scheme（native_custom 或畸形 web） */
function isCustomScheme(uri: string, kind: string): boolean {
  if (uri.startsWith('https://') || uri.startsWith('http://')) {
    return false
  }
  if (kind === 'native_loopback') {
    return false
  }
  return true
}

/** 分级：redirect 域名与主页域名不一致 */
function isDomainMismatch(uri: string, homepageUrl: string | null): boolean {
  if (!homepageUrl) {
    return false
  }
  const redirectHost = hostnameOf(uri)
  const homepageHost = hostnameOf(homepageUrl)
  if (!redirectHost || !homepageHost) {
    return false
  }
  return redirectHost !== homepageHost
}

/** 计算一条 redirect uri 的风险标记 */
export function classifyRedirectRisk(input: RedirectRiskInput): RedirectRiskResult {
  const flags: RedirectRiskFlag[] = []
  if (isNonHttpsWeb(input.uri, input.kind)) {
    flags.push('non_https_web')
  }
  const host = hostnameOf(input.uri)
  if (isLoopback(host)) {
    flags.push('localhost')
  }
  if (isCustomScheme(input.uri, input.kind)) {
    flags.push('custom_scheme')
  }
  if (isDomainMismatch(input.uri, input.homepage_url)) {
    flags.push('domain_mismatch')
  }
  if (input.previousUris && !input.previousUris.includes(input.uri)) {
    flags.push('changed')
  }
  return { flags }
}

/** 敏感 scope 集合（与 core 的 SENSITIVE_SCOPES 对齐） */
export const SENSITIVE_SCOPES: readonly string[] = ['student.identity', 'offline_access']

/** scope 风险分级 */
export function scopeRisk(scope: string): ScopeRisk {
  return SENSITIVE_SCOPES.includes(scope) ? 'sensitive' : 'basic'
}

/** scope 中文标签（UI 展示） */
export function scopeLabel(scope: string): string {
  switch (scope) {
    case 'openid':
      return '身份标识（openid）'
    case 'profile':
      return '基础资料（profile）'
    case 'student.identity':
      return '学校身份（student.identity）'
    case 'offline_access':
      return '离线访问（offline_access）'
    default:
      return scope
  }
}

/** 风险标记中文说明（审核页高亮用） */
export const REDIRECT_RISK_LABELS: Readonly<Record<RedirectRiskFlag, string>> = {
  non_https_web: '非 HTTPS 的 Web 回调（明文传输，高风险）',
  localhost: '回环地址（localhost，生产环境需确认）',
  custom_scheme: '自定义 scheme（注意劫持面）',
  domain_mismatch: '域名与主页不一致',
  changed: '相对上一份审核新增/变更',
}
