/**
 * Web 侧 issuer 常量与环境解析（与 core/src/config/issuer.ts 保持同一 canonical）。
 *
 * 规则（#617/#618）：
 * - 协议字段只用 canonical ASCII issuer（https://id.xn--vhq74jc2fzpchter27a.com）；
 * - 展示层允许中文（id.湖北工业大学.com），两者不得混用；
 * - Preview issuer 必须显式配置且与 Production 不相等。
 */

/** Production canonical issuer（Punycode ASCII，字符串断言目标） */
export const PRODUCTION_ISSUER = 'https://id.xn--vhq74jc2fzpchter27a.com'

/** 展示层中文形式（仅 UI/文档） */
export const PRODUCTION_ISSUER_DISPLAY = 'https://id.湖北工业大学.com'

/** 环境对象：兼容 NodeJS.ProcessEnv 与测试传参的部分环境（部分键） */
export type EnvLike = Record<string, string | undefined>

/** 是否为纯 ASCII */
export function isAscii(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text)
}

/**
 * 对外公开的 issuer：
 * - 未配置 IDENTITY_PUBLIC_ISSUER 时返回 Production canonical；
 * - Preview/Development 必须显式配置，禁止回落 Production issuer。
 */
export function getPublicIssuer(env: EnvLike = process.env): string {
  const environment = (env.IDENTITY_ENVIRONMENT ?? 'production').trim().toLowerCase()
  const explicit = env.IDENTITY_PUBLIC_ISSUER?.trim()
  if (environment === 'production' || environment === '') {
    return PRODUCTION_ISSUER
  }
  if (!explicit) {
    throw new Error(
      `${environment} 环境必须显式配置 IDENTITY_PUBLIC_ISSUER，禁止默认使用 Production issuer`,
    )
  }
  if (explicit === PRODUCTION_ISSUER) {
    throw new Error(`${environment} 环境禁止使用 Production issuer`)
  }
  return explicit
}

/**
 * Preview issuer（仅 Preview 环境有效）。
 * 用于断言 Preview 与 Production issuer 不相等；未配置时抛错（fail closed）。
 */
export function getPreviewIssuer(env: EnvLike = process.env): string {
  const explicit = env.IDENTITY_PREVIEW_ISSUER?.trim()
  if (!explicit) {
    throw new Error('Preview 环境必须显式配置 IDENTITY_PREVIEW_ISSUER，禁止使用 Production issuer')
  }
  if (explicit === PRODUCTION_ISSUER) {
    throw new Error('Preview 环境禁止使用 Production issuer')
  }
  return explicit
}
