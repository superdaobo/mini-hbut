/**
 * Redirect URI 校验规则（纯函数，服务端权威判定；前端复用同一函数做实时提示）。
 *
 * 规则（issue #624 Server validation，对齐 core/src/domain/clients.ts）：
 *  - Web Production：必须 https（本地开发允许 http://localhost / http://127.0.0.1）；
 *  - 禁止 fragment（#）；
 *  - 禁止 userinfo（@）；
 *  - 禁止 wildcard（*）；
 *  - 禁止 substring/regex 扩展——注册值即精确匹配值，本模块不做任何前缀/后缀
 *    宽松化，并拒绝形如 `https://host` 缺路径等会产生歧义匹配的写法（严格单值校验）；
 *  - Native custom URI / loopback 按 RFC 8252：
 *      custom scheme：合法 scheme 字符、非 http/https、必须包含冒号；
 *      loopback：http://127.0.0.1 或 http://[::1]（允许动态端口），仅 Native 使用；
 *  - URI 长度 ≤ 2048、禁止控制字符；每应用数量上限见 MAX_REDIRECT_URIS。
 *
 * 本模块为纯函数：不依赖 Node/浏览器 API，可被服务端 BFF 与浏览器端共享。
 */

import type { DeveloperClientType, RedirectUriKind } from './contract'

export const MAX_REDIRECT_URI_LENGTH = 2048
export const MAX_REDIRECT_URIS = 20

export interface RedirectUriValidation {
  ok: boolean
  /** 校验失败原因（简体中文，可直接展示） */
  error?: string
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** 各类型允许的 scheme */
const ALLOWED_KIND_BY_CLIENT_TYPE: Readonly<
  Record<DeveloperClientType, readonly RedirectUriKind[]>
> = {
  web_confidential: ['web_https'],
  native_public: ['native_custom', 'native_loopback'],
}

/** 校验 kind 是否属于该 client_type（创建/新增时先行检查） */
export function kindAllowedFor(kind: RedirectUriKind, clientType: DeveloperClientType): boolean {
  return ALLOWED_KIND_BY_CLIENT_TYPE[clientType].includes(kind)
}

/** 校验合法 scheme 名（RFC 3986 scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )） */
function validSchemeName(scheme: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(scheme)
}

function isLocalhostHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

/**
 * 单条 redirect URI 校验（服务端权威）。
 *
 * @param opts.allowLocalhostDev 仅本地开发（IDENTITY_ENVIRONMENT=development）放行
 *        http://localhost / http://127.0.0.1 的 web_https；生产永远拒绝。
 */
export function validateRedirectUri(
  uri: string,
  kind: RedirectUriKind,
  opts: { allowLocalhostDev?: boolean } = {},
): RedirectUriValidation {
  const allowLocalhostDev = opts.allowLocalhostDev ?? false

  if (!uri || typeof uri !== 'string') {
    return { ok: false, error: '不能为空' }
  }
  if (uri.length > MAX_REDIRECT_URI_LENGTH) {
    return { ok: false, error: `长度不能超过 ${MAX_REDIRECT_URI_LENGTH} 字符` }
  }
  if (CONTROL_CHARS.test(uri)) {
    return { ok: false, error: '包含非法控制字符' }
  }
  // 全局禁止：wildcard / fragment / userinfo（对全部类型生效）
  if (uri.includes('*')) {
    return { ok: false, error: '禁止通配符' }
  }
  if (uri.includes('#')) {
    return { ok: false, error: '禁止携带 fragment（#）' }
  }
  if (uri.includes('@')) {
    return { ok: false, error: '禁止携带 userinfo（@）' }
  }
  // 禁止模糊的 substring/regex 扩展写法：不接受形如 https://（裸协议）或只有 scheme 的值
  if (uri === 'https://' || uri === 'http://' || !uri.includes(':')) {
    return { ok: false, error: '必须包含完整 scheme 与主机（如 https://example.com/callback）' }
  }

  switch (kind) {
    case 'web_https': {
      let parsed: URL
      try {
        parsed = new URL(uri)
      } catch {
        return { ok: false, error: '不是合法的 URL' }
      }
      if (parsed.protocol !== 'https:') {
        if (
          parsed.protocol === 'http:' &&
          allowLocalhostDev &&
          isLocalhostHost(parsed.hostname)
        ) {
          break // 本地开发放行 http://localhost / http://127.0.0.1
        }
        return { ok: false, error: 'Web 应用必须使用 https://' }
      }
      if (!parsed.hostname) {
        return { ok: false, error: '缺少主机名' }
      }
      break
    }
    case 'native_loopback': {
      // RFC 8252 §7.3：仅 http://127.0.0.1 / http://[::1]，允许动态端口
      const m = /^http:\/\/(127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/.*)?$/.exec(uri)
      if (!m) {
        return { ok: false, error: 'loopback 只允许 http://127.0.0.1 或 http://[::1]（可带动态端口）' }
      }
      if (m[2] !== undefined) {
        const port = Number(m[2].slice(1))
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return { ok: false, error: '端口必须在 1–65535 之间' }
        }
      }
      break
    }
    case 'native_custom': {
      // RFC 8252 §7.1：自定义 scheme，非 http/https，必须含冒号与 opaque 部分
      const colon = uri.indexOf(':')
      if (colon <= 0) {
        return { ok: false, error: '必须包含合法 scheme（如 my-app:/oauth/callback）' }
      }
      const scheme = uri.slice(0, colon)
      if (!validSchemeName(scheme)) {
        return { ok: false, error: 'scheme 只能包含字母、数字、+、-、.' }
      }
      if (scheme.toLowerCase() === 'http' || scheme.toLowerCase() === 'https') {
        return { ok: false, error: '自定义 scheme 不能是 http/https' }
      }
      if (uri.length === colon + 1) {
        return { ok: false, error: '缺少自定义 URI 的路径部分' }
      }
      break
    }
  }
  return { ok: true }
}

/** 校验整个 URI 集合（创建/新增时使用）：数量上限 + 逐条校验 + 精确去重 */
export function validateRedirectUriSet(
  uris: ReadonlyArray<{ uri: string; kind: RedirectUriKind }>,
  clientType: DeveloperClientType,
  opts: { allowLocalhostDev?: boolean } = {},
): RedirectUriValidation {
  if (uris.length === 0) {
    return { ok: false, error: '至少需要一个 redirect URI' }
  }
  if (uris.length > MAX_REDIRECT_URIS) {
    return { ok: false, error: `最多允许 ${MAX_REDIRECT_URIS} 个 redirect URI` }
  }
  const seen = new Set<string>()
  for (const item of uris) {
    if (!kindAllowedFor(item.kind, clientType)) {
      return {
        ok: false,
        error: `${item.uri} 的类型（${item.kind}）与该应用类型不匹配`,
      }
    }
    const v = validateRedirectUri(item.uri, item.kind, opts)
    if (!v.ok) {
      return { ok: false, error: `${item.uri}：${v.error}` }
    }
    // 精确字符串匹配语义：注册值完全一致才算同一条；任何前缀/后缀扩展都不算
    if (seen.has(item.uri)) {
      return { ok: false, error: `重复的 redirect URI：${item.uri}` }
    }
    seen.add(item.uri)
  }
  return { ok: true }
}
