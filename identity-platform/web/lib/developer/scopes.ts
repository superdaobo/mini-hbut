/**
 * Scope 管理与敏感 scope 审核字段（纯函数）。
 *
 * 白名单（#617/#620 初版；#697 扩展学习数据域，敏感项均需理由+人工批准）：
 *   openid                  必选、基础登录、自动选择不可移除；
 *   profile                 基础资料，普通 scope；
 *   student.identity        敏感：学校身份声明；必须使用理由+隐私政策+人工批准；
 *   offline_access          敏感：长期访问（Refresh Token）；人工批准；
 *   student.grades.read     敏感：读取全部成绩单快照（授权时由 App 加密上传，≤7 天）；
 *   student.timetable.read  敏感：读取完整课表快照（同上）。
 */

import type { DeveloperClientType } from './contract'

export const SCOPE_WHITELIST = [
  'openid',
  'profile',
  'student.identity',
  'offline_access',
  'student.grades.read',
  'student.timetable.read',
] as const

export type ScopeId = (typeof SCOPE_WHITELIST)[number]

export type ScopeRisk = 'basic' | 'sensitive'

export interface ScopeMeta {
  id: ScopeId
  label: string
  description: string
  risk: ScopeRisk
  /** openid：自动选择、不可移除 */
  mandatory: boolean
  /** 敏感 scope：必须填写使用理由/用途 */
  requiresJustification: boolean
}

export const SCOPE_META: Readonly<Record<ScopeId, ScopeMeta>> = {
  openid: {
    id: 'openid',
    label: 'openid（基础登录）',
    description: '确认你的 Mini-HBUT 身份，并获取唯一标识（sub）。必选。',
    risk: 'basic',
    mandatory: true,
    requiresJustification: false,
  },
  profile: {
    id: 'profile',
    label: 'profile（基础资料）',
    description: '昵称等基础显示信息。',
    risk: 'basic',
    mandatory: false,
    requiresJustification: false,
  },
  'student.identity': {
    id: 'student.identity',
    label: 'student.identity（学校身份声明）',
    description:
      '学校身份声明（学号关联信息）。敏感 scope：保证级别为 verification_method=mini_hbut_app，' +
      '即 Mini-HBUT App 本地验证，不是学校官方 OIDC 背书；必须填写使用理由与隐私政策，管理员人工批准。',
    risk: 'sensitive',
    mandatory: false,
    requiresJustification: true,
  },
  'student.grades.read': {
    id: 'student.grades.read',
    label: 'student.grades.read（成绩单读取）',
    description:
      '读取你的全部成绩单（含各学期成绩与绩点）。数据在你授权时由 Mini-HBUT App 加密上传为快照，' +
      '有效期最长 7 天，过期需重新授权。敏感：必须填写使用理由与隐私政策，管理员人工批准。',
    risk: 'sensitive',
    mandatory: false,
    requiresJustification: true,
  },
  'student.timetable.read': {
    id: 'student.timetable.read',
    label: 'student.timetable.read（课表读取）',
    description:
      '读取你的完整课表。数据在你授权时由 Mini-HBUT App 加密上传为快照，有效期最长 7 天，' +
      '过期需重新授权。敏感：必须填写使用理由与隐私政策，管理员人工批准。',
    risk: 'sensitive',
    mandatory: false,
    requiresJustification: true,
  },
  offline_access: {
    id: 'offline_access',
    label: 'offline_access（长期访问）',
    description:
      '颁发 Refresh Token，可长期访问。风险：令牌长期有效，泄露面大；必须填写用途，管理员批准，' +
      '且用户在每次首次授权时都会看到该请求。',
    risk: 'sensitive',
    mandatory: false,
    requiresJustification: true,
  },
}

export function isWhitelistedScope(scope: string): scope is ScopeId {
  return (SCOPE_WHITELIST as readonly string[]).includes(scope)
}

export function isSensitiveScope(scope: string): boolean {
  return isWhitelistedScope(scope) && SCOPE_META[scope].risk === 'sensitive'
}

/** 请求的 scope 集合中是否包含敏感 scope */
export function hasSensitiveScope(scopes: readonly string[]): boolean {
  return scopes.some((s) => isSensitiveScope(s))
}

/**
 * 校验 scope 请求：
 *  - 全部必须在白名单内；
 *  - 必须包含 openid；
 *  - 敏感 scope 必须有使用理由；
 *  - 隐私政策 URL / 联系方式在存在敏感 scope 时必填（创建表单要求）。
 */
export function validateScopeRequest(input: {
  scopes: readonly string[]
  justifications: Readonly<Record<string, string | null | undefined>>
  privacyPolicyUrl: string | null
  contact: string | null
}): { ok: boolean; error?: string } {
  const { scopes, justifications, privacyPolicyUrl, contact } = input
  if (scopes.length === 0) {
    return { ok: false, error: '至少选择 openid' }
  }
  for (const s of scopes) {
    if (!isWhitelistedScope(s)) {
      return { ok: false, error: `不在 V1 scope 白名单内：${s}` }
    }
  }
  if (!scopes.includes('openid')) {
    return { ok: false, error: '必须包含 openid（基础登录必选）' }
  }
  const sensitive = scopes.filter((s) => isSensitiveScope(s))
  for (const s of sensitive) {
    const meta = SCOPE_META[s as ScopeId]
    const justification = (justifications[s] ?? '').trim()
    if (meta.requiresJustification && justification.length < 10) {
      return { ok: false, error: `${meta.label} 必须填写使用理由（至少 10 字）` }
    }
  }
  if (sensitive.length > 0) {
    if (!privacyPolicyUrl) {
      return { ok: false, error: '申请敏感 scope 必须提供隐私政策 URL' }
    }
    if (!contact) {
      return { ok: false, error: '申请敏感 scope 必须提供开发者联系方式' }
    }
  }
  return { ok: true }
}

/** scope 名称标签（UI 使用） */
export function scopeLabel(scope: string): string {
  return isWhitelistedScope(scope) ? SCOPE_META[scope].label : scope
}

/** 隐私政策 URL 对应用类型的要求（web_confidential 必须提供主页；敏感 scope 必须提供隐私政策） */
export function homepageRequiredFor(clientType: DeveloperClientType): boolean {
  return clientType === 'web_confidential'
}
