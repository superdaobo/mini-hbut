/**
 * Canonical issuer 定义与规范化。
 *
 * 规则（来自 #617 信任边界，不可违反）：
 * - 协议字段（Discovery issuer / ID Token iss / Access Token issuer /
 *   resource server 校验配置）必须只用 canonical ASCII（Punycode）issuer；
 * - 禁止 Unicode issuer 与 Punycode issuer 混用；
 * - 展示层可以显示中文（id.湖北工业大学.com），协议层一律用下面的常量。
 */
import { domainToASCII } from 'node:url'

/** Production canonical issuer（Punycode ASCII，字符串断言目标） */
export const PRODUCTION_CANONICAL_ISSUER = 'https://id.xn--vhq74jc2fzpchter27a.com'

/** 展示层使用的中文形式（仅供 UI/文档，禁止进入协议字段） */
export const PRODUCTION_DISPLAY_ISSUER = 'https://id.湖北工业大学.com'

export const PRODUCTION_CANONICAL_HOST = 'id.xn--vhq74jc2fzpchter27a.com'

/**
 * 规范化 issuer：强制 https + ASCII（hostname 转 Punycode）。
 * 输入是 Unicode（id.湖北工业大学.com）时也会被转成 canonical ASCII。
 * 无法解析或非 https 时抛错（fail closed，不静默放行）。
 */
export function normalizeIssuer(input: string): string {
  const trimmed = input.trim()
  const url = new URL(trimmed)
  if (url.protocol !== 'https:') {
    throw new Error(`issuer 必须是 https：${trimmed}`)
  }
  // URL.hostname 已是 ASCII；这里显式再跑一遍 Punycode 转换以兜底输入残留
  const asciiHost = domainToASCII(url.hostname)
  if (!asciiHost) {
    throw new Error(`issuer hostname 无法转换为 ASCII：${trimmed}`)
  }
  const port = url.port ? `:${url.port}` : ''
  return `https://${asciiHost}${port}${url.pathname.replace(/\/+$/, '')}`
}

/** 是否为纯 ASCII 字符串（用于断言 canonical 形式） */
export function isAscii(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text)
}

/** 环境对象：兼容 NodeJS.ProcessEnv 与测试传参的部分环境（部分键） */
export type EnvLike = Record<string, string | undefined>

/**
 * 解析当前环境的 issuer：
 * - Production/未显式配置时固定返回 canonical issuer；
 * - Preview/Development 必须显式配置 IDENTITY_ISSUER，禁止回落到 Production issuer。
 * 环境名由 IDENTITY_ENVIRONMENT 决定。
 */
export function resolveIssuer(env: EnvLike = process.env): string {
  const environment = (env.IDENTITY_ENVIRONMENT ?? 'production').trim().toLowerCase()
  const explicit = env.IDENTITY_ISSUER?.trim()
  if (environment === 'production' || environment === '') {
    // 生产环境即使误配 IDENTITY_ISSUER 也强制用 canonical，避免环境混用
    return PRODUCTION_CANONICAL_ISSUER
  }
  if (!explicit) {
    throw new Error(
      `${environment} 环境必须显式配置 IDENTITY_ISSUER，禁止默认使用 Production canonical issuer`,
    )
  }
  const normalized = normalizeIssuer(explicit)
  // Preview/Development 禁止把生产域名当作自己的 issuer（fail closed，防环境混用）
  if (normalized === PRODUCTION_CANONICAL_ISSUER) {
    throw new Error(`${environment} 环境禁止使用 Production canonical issuer`)
  }
  return normalized
}
