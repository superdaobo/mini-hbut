/**
 * Developer 站点展示辅助（纯函数）。
 * - 环境标识（开发/预览/生产）；
 * - 文档页 issuer 取值：机器可读值必须 canonical ASCII（Punycode），
 *   禁止 Unicode issuer 混用（#617 规则）；构建/文档场景不得抛错。
 */

import { PRODUCTION_ISSUER } from '@/lib/issuer'

export type EnvLike = Record<string, string | undefined>

export type EnvironmentKind = 'development' | 'preview' | 'production'

export function environmentKind(env: EnvLike = process.env): EnvironmentKind {
  const raw = (env.IDENTITY_ENVIRONMENT ?? 'production').trim().toLowerCase()
  if (raw === 'development' || raw === 'preview') {
    return raw
  }
  return 'production'
}

export function environmentLabel(env: EnvLike = process.env): string {
  switch (environmentKind(env)) {
    case 'development':
      return '开发环境'
    case 'preview':
      return '预览环境'
    case 'production':
      return '生产环境'
  }
}

/**
 * 文档页使用的 issuer（机器可读值）：
 * 显式配置了 IDENTITY_PUBLIC_ISSUER 就用它（Preview/开发联调），
 * 否则回落到 Production canonical（纯 ASCII）。
 * 与 lib/issuer.ts 的 getPublicIssuer 不同：文档页为静态渲染，不能因配置缺失而抛错。
 */
export function docsIssuer(env: EnvLike = process.env): string {
  const explicit = env.IDENTITY_PUBLIC_ISSUER?.trim()
  if (explicit) {
    return explicit
  }
  return PRODUCTION_ISSUER
}

/** 文档页是否处于「示例/未配置」回落状态（渲染提示用） */
export function docsIssuerIsFallback(env: EnvLike = process.env): boolean {
  return !env.IDENTITY_PUBLIC_ISSUER?.trim()
}
