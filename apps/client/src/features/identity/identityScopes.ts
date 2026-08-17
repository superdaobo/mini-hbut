// src/features/identity/identityScopes.ts
//
// #623：scope 展示元数据与风险分组（纯函数，可单测）。
//
// 安全边界：
//   - 展示 label 以服务端下发为准（Core sanitized DTO 已带 label/risk）；
//   - 本表只作为“服务端未下发展示元数据时的本地兜底 + 风险分组逻辑”，
//     绝不作为授权依据（授权 scope 快照由 Core 存储并验签）。

import type { IdentityScopeInfo, IdentityScopeRisk } from './types'

/** 敏感 scope：学校身份（必须在线刷新本地学校 session 后才允许） */
export const SENSITIVE_SCOPE_ID = 'student.identity'

/** 本地兜底 scope 元数据（与 Core SCOPE_META 文案对齐；label 以服务端为准） */
export const IDENTITY_SCOPE_META: Record<string, { label: string; risk: IdentityScopeRisk }> = {
  openid: { label: '确认你的 Mini-HBUT 身份', risk: 'basic' },
  profile: { label: '查看你的基础资料', risk: 'basic' },
  [SENSITIVE_SCOPE_ID]: {
    label: '获取你的学校身份（如学号、姓名）',
    risk: 'sensitive'
  },
  offline_access: { label: '长期保持登录状态', risk: 'basic' }
}

/** scope 分组展示顺序（基础在前，敏感在后） */
export const IDENTITY_SCOPE_GROUP_ORDER: IdentityScopeRisk[] = ['basic', 'sensitive']

/**
 * 补全 scope 展示信息：
 * - 服务端已下发 label/risk 时原样保留（App 不重写服务端判定）；
 * - 缺失时用本地兜底元数据；仍未知的 scope 使用其 id 作为 label、risk 归为 basic
 *   （未知 scope 不代表低风险，仅作为展示兜底；授权快照由服务端验签把关）。
 */
export const enrichScopes = (scopes: IdentityScopeInfo[]): IdentityScopeInfo[] => {
  if (!Array.isArray(scopes)) return []
  return scopes.map((scope) => {
    const meta = IDENTITY_SCOPE_META[scope.id]
    return {
      id: scope.id,
      label: scope.label && scope.label.trim() ? scope.label : meta?.label || scope.id,
      risk: scope.risk === 'sensitive' ? 'sensitive' : 'basic'
    }
  })
}

/** 按风险分组（保持输入顺序；缺失组返回空数组） */
export const groupScopesByRisk = (
  scopes: IdentityScopeInfo[]
): Record<IdentityScopeRisk, IdentityScopeInfo[]> => {
  const grouped: Record<IdentityScopeRisk, IdentityScopeInfo[]> = { basic: [], sensitive: [] }
  for (const scope of enrichScopes(scopes)) {
    grouped[scope.risk].push(scope)
  }
  return grouped
}

/** 请求是否包含敏感 scope（student.identity） */
export const hasSensitiveScope = (scopes: IdentityScopeInfo[]): boolean =>
  Array.isArray(scopes) && scopes.some((scope) => scope.id === SENSITIVE_SCOPE_ID)

/** 敏感 scope 的可读风险提示（不使用恐吓式文案，但必须显式告知） */
export const SENSITIVE_SCOPE_NOTICE =
  '该应用将获取你的学校身份信息（学号、姓名）。允许前 App 会先在线验证你的学校登录状态。'

/** 非官方声明（#617 信任边界：mini_hbut_app 验证 ≠ 湖北工业大学官方认证） */
export const NON_OFFICIAL_NOTICE =
  '学校身份由 Mini-HBUT 本地验证提供，不代表湖北工业大学官方认证。'
