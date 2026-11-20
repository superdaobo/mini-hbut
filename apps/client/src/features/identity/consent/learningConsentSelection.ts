// src/features/identity/consent/learningConsentSelection.ts
//
// Epic #1243（G3-03 / mini-hbut#1256）：**逐类同意**的勾选模型（纯函数）。
//
// ## 为什么单独一个模块，而不是改 `learningDataConsent.ts`
//
// `learningDataConsent.ts` 的「全集批准」守卫是 #699 为**旧 Core approve API**
// 设计的：那个接口只接受整体授权，取消任意一项就绝不能提交（否则取消项会随全集
// 进入批准范围 = 静默扩大授权）。现有 `IdentityApprovalOverlay.vue` 仍然走
// `identity.approveActive()`（旧 Core 接口）。
//
// 如果只把那个守卫改成「部分可批准」，而提交路径没换，用户取消成绩后点「允许」
// 会把**完整 scope 集**提交给 Core —— 正是旧守卫要防的静默扩权。所以：
//
// - `learningDataConsent.ts` **保持原样**（旧流程零回归，守卫仍在）；
// - 本模块提供**新流程**（逐类同意）的勾选模型，由新的授权管理 UI 使用，
//   提交目标是 OCR 的 `/identity/app-consents/grant`（接受 domains 列表）。
//
// 两个流程的提交目标不同，绝不能混用 —— 这是本模块存在的唯一理由。

import type { LearningDataScopeId, LearningDataScopeItem } from '../learningDataConsent'

export interface ConsentSelectionState {
  /** 至少勾选一项即可提交（空选 = 全部拒绝，走「拒绝」而非「批准」） */
  canSubmit: boolean
  /** 全部未勾选 */
  allDenied: boolean
  /** 部分勾选 */
  partial: boolean
  /** 要提交给 `grant` 的域（按请求顺序） */
  granted: LearningDataScopeId[]
  /** 未勾选、因此**不提交**的域（服务端视为「未同意」，不是「已撤销」） */
  denied: LearningDataScopeId[]
}

/**
 * 计算逐类勾选状态。
 *
 * 与旧守卫的关键区别：**部分勾选是合法的**——因为提交目标（OCR 逐域 API）
 * 接受 domains 列表，未勾选项根本不进请求体，不存在「取消项被顺带授权」的问题。
 *
 * 健壮性：忽略不在请求中的多余 id；非 Set 输入按「未勾选」处理（fail closed）。
 */
export const resolveConsentSelection = (
  requested: readonly LearningDataScopeItem[],
  selected: ReadonlySet<string>
): ConsentSelectionState => {
  const list = Array.isArray(requested) ? requested : []
  const granted: LearningDataScopeId[] = []
  const denied: LearningDataScopeId[] = []
  for (const item of list) {
    if (selected instanceof Set && selected.has(item.id)) {
      granted.push(item.id)
    } else {
      denied.push(item.id)
    }
  }
  const grantedCount = granted.length
  return {
    canSubmit: grantedCount > 0,
    allDenied: list.length > 0 && grantedCount === 0,
    partial: grantedCount > 0 && grantedCount < list.length,
    granted,
    denied
  }
}

/**
 * 勾选提示文案：
 * - 全部取消：沿用 #699 冻结文案（逐字一致，避免同一场景两种说法）；
 * - 部分取消：**如实说明「只授予勾选项」**；
 * - 其余：无提示。
 */
export const consentSelectionNotice = (state: ConsentSelectionState): string => {
  if (state.allDenied) return '该应用要求的数据权限已被取消，无法继续'
  if (state.partial) return '已取消的项目不会获得授权：本次只会授予你勾选的数据类别。'
  return ''
}

/** 全部授予（默认勾选，与 `defaultLearningConsent` 语义一致但返回值类型更窄）。 */
export const selectAll = (requested: readonly LearningDataScopeItem[]): Set<string> =>
  new Set<string>((Array.isArray(requested) ? requested : []).map((item) => item.id))
