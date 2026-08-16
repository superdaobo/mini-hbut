/**
 * 应用表单校验（纯函数，服务端权威；前端做实时提示可复用）。
 * 字段语义对齐 issue #624 创建表单。
 */

import type {
  CreateAppInput,
  DeveloperClientType,
  RedirectUriInput,
  ScopeRequestInput,
  UpdateAppInput,
} from './contract'
import { validateRedirectUriSet } from './redirect-uri'
import { homepageRequiredFor, validateScopeRequest } from './scopes'

export const MAX_NAME_LENGTH = 80
export const MAX_DESCRIPTION_LENGTH = 500
export const MAX_JUSTIFICATION_LENGTH = 1000
export const MAX_URL_LENGTH = 2048

function isNonEmpty(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0
}

/** 校验 URL 基本形态（https 或 http://localhost，长度限制） */
export function validateUrlField(url: string | null, fieldName: string): { ok: boolean; error?: string } {
  if (url === null || url === undefined || url === '') {
    return { ok: true }
  }
  if (url.length > MAX_URL_LENGTH) {
    return { ok: false, error: `${fieldName} 过长` }
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: `${fieldName} 不是合法的 URL` }
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost')) {
    return { ok: false, error: `${fieldName} 必须使用 https://` }
  }
  return { ok: true }
}

/** 创建应用的整体校验（返回首条错误） */
export function validateCreateAppInput(
  input: CreateAppInput,
  opts: { allowLocalhostDev?: boolean } = {},
): { ok: boolean; error?: string } {
  const name = input.name?.trim() ?? ''
  if (!name) {
    return { ok: false, error: '应用名称必填' }
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `应用名称不能超过 ${MAX_NAME_LENGTH} 字` }
  }
  const description = input.description?.trim() ?? ''
  if (!description) {
    return { ok: false, error: '应用描述必填' }
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: `应用描述不能超过 ${MAX_DESCRIPTION_LENGTH} 字` }
  }
  if (input.client_type !== 'web_confidential' && input.client_type !== 'native_public') {
    return { ok: false, error: '应用类型非法' }
  }
  // 主页 URL：production 应用（web_confidential）必填
  if (homepageRequiredFor(input.client_type) && !isNonEmpty(input.homepage_url)) {
    return { ok: false, error: 'Web 应用必须提供主页 URL' }
  }
  const homepage = validateUrlField(input.homepage_url, '主页 URL')
  if (!homepage.ok) {
    return homepage
  }
  const privacy = validateUrlField(input.privacy_policy_url, '隐私政策 URL')
  if (!privacy.ok) {
    return privacy
  }
  const uriSet = validateRedirectUriSet(input.redirect_uris ?? [], input.client_type, opts)
  if (!uriSet.ok) {
    return uriSet
  }
  const scopes = (input.scopes ?? []).map((s) => s.scope)
  const justifications: Record<string, string | null> = {}
  for (const s of input.scopes ?? []) {
    justifications[s.scope] = s.justification ?? null
  }
  const scopeCheck = validateScopeRequest({
    scopes,
    justifications,
    privacyPolicyUrl: isNonEmpty(input.privacy_policy_url) ? input.privacy_policy_url : null,
    contact: isNonEmpty(input.contact) ? input.contact : null,
  })
  if (!scopeCheck.ok) {
    return scopeCheck
  }
  return { ok: true }
}

/** 更新应用字段校验（不允许改 client_type；其余与创建一致的可编辑部分） */
export function validateUpdateAppInput(input: UpdateAppInput): { ok: boolean; error?: string } {
  if (input.name !== undefined) {
    const name = (input.name ?? '').trim()
    if (!name) {
      return { ok: false, error: '应用名称必填' }
    }
    if (name.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `应用名称不能超过 ${MAX_NAME_LENGTH} 字` }
    }
  }
  if (input.description !== undefined) {
    const description = (input.description ?? '').trim()
    if (!description) {
      return { ok: false, error: '应用描述必填' }
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return { ok: false, error: `应用描述不能超过 ${MAX_DESCRIPTION_LENGTH} 字` }
    }
  }
  const homepage = validateUrlField(input.homepage_url ?? '', '主页 URL')
  if (!homepage.ok) {
    return homepage
  }
  const privacy = validateUrlField(input.privacy_policy_url ?? '', '隐私政策 URL')
  if (!privacy.ok) {
    return privacy
  }
  return { ok: true }
}

/** 解析并清洗 scope 请求输入（服务端拒绝非法 shape） */
export function sanitizeScopeRequests(
  raw: unknown,
): { ok: true; value: ScopeRequestInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'scopes 必须是数组且至少包含 openid' }
  }
  const value: ScopeRequestInput[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: 'scope 条目格式非法' }
    }
    const rec = item as Record<string, unknown>
    if (typeof rec.scope !== 'string') {
      return { ok: false, error: 'scope 名称必须为字符串' }
    }
    const justification =
      rec.justification === null || rec.justification === undefined
        ? null
        : typeof rec.justification === 'string'
          ? rec.justification.trim()
          : null
    if (justification !== null && justification.length > MAX_JUSTIFICATION_LENGTH) {
      return { ok: false, error: '使用理由过长' }
    }
    value.push({ scope: rec.scope, justification })
  }
  return { ok: true, value }
}

/** 解析并清洗 redirect URI 输入（服务端拒绝非法 shape） */
export function sanitizeRedirectUris(
  raw: unknown,
): { ok: true; value: RedirectUriInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'redirect_uris 必须是数组' }
  }
  const value: RedirectUriInput[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: 'redirect URI 条目格式非法' }
    }
    const rec = item as Record<string, unknown>
    if (typeof rec.uri !== 'string' || typeof rec.kind !== 'string') {
      return { ok: false, error: 'redirect URI 条目格式非法' }
    }
    if (rec.kind !== 'web_https' && rec.kind !== 'native_custom' && rec.kind !== 'native_loopback') {
      return { ok: false, error: `redirect URI 类型非法：${String(rec.kind)}` }
    }
    value.push({ uri: rec.uri, kind: rec.kind })
  }
  return { ok: true, value }
}

/** 创建请求的输入清洗（BFF 路由使用）：拒绝未知字段/错误类型，输出纯数据 */
export function sanitizeCreateAppInput(raw: unknown): { ok: true; value: CreateAppInput } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: '请求体必须是 JSON 对象' }
  }
  const rec = raw as Record<string, unknown>
  const strOrNull = (v: unknown): string | null =>
    typeof v === 'string' ? v.trim() : v === null || v === undefined ? null : null
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  const clientType = rec.client_type
  if (clientType !== 'web_confidential' && clientType !== 'native_public') {
    return { ok: false, error: 'client_type 必须为 web_confidential 或 native_public' }
  }
  const uris = sanitizeRedirectUris(rec.redirect_uris)
  if (!uris.ok) {
    return uris
  }
  const scopes = sanitizeScopeRequests(rec.scopes)
  if (!scopes.ok) {
    return scopes
  }
  return {
    ok: true,
    value: {
      name: str(rec.name),
      description: str(rec.description),
      homepage_url: strOrNull(rec.homepage_url),
      client_type: clientType as DeveloperClientType,
      privacy_policy_url: strOrNull(rec.privacy_policy_url),
      contact: strOrNull(rec.contact),
      redirect_uris: uris.value,
      scopes: scopes.value,
    },
  }
}
