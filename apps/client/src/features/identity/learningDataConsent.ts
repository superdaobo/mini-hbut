// src/features/identity/learningDataConsent.ts
//
// #699：授权弹窗「学习数据 scope 逐项勾选」纯函数（无 Vue 依赖，可单测）。
//
// 服务端能力约束（#699 调查结论，决定本模块守卫语义）：
//   - Core approve API body 为 strict 白名单（device_id/issued_at/nonce/signature/
//     canonical_version），不接受任何 scopes/rejected 字段；
//   - canonical 的 scope_hash 由服务端从请求快照 requested_scopes 重算（不信任客户端），
//     resume 阶段 Grant 也按快照全量下发 —— 即当前 Core 只支持「全集批准」。
// 因此：只要存在被取消的学习数据项，就绝不能提交批准（否则取消项会随全集
// 进入批准范围 = 静默扩大授权）。本模块把该约束实现为可单测的纯函数守卫。

import type { IdentityScopeInfo } from './types'

/** 学习数据 scope id（#699 冻结集合，顺序即展示顺序） */
export const LEARNING_DATA_SCOPE_IDS = ['student.grades.read', 'student.timetable.read'] as const

export type LearningDataScopeId = (typeof LEARNING_DATA_SCOPE_IDS)[number]

/**
 * #699 冻结文案映射（逐字遵守；App 端固定使用，不依赖服务端 label）。
 */
export const LEARNING_DATA_SCOPE_LABELS: Record<LearningDataScopeId, string> = {
  'student.grades.read': '全部成绩单（含各学期成绩与绩点）',
  'student.timetable.read': '完整课表'
}

/** 学习数据项的展示模型（id + 冻结文案） */
export interface LearningDataScopeItem {
  id: LearningDataScopeId
  label: string
}

/** 拆分结果：学习数据项（按冻结顺序）与其余 scope（维持现有展示方式） */
export interface SplitLearningDataScopesResult {
  learning: LearningDataScopeItem[]
  others: IdentityScopeInfo[]
}

/**
 * 从请求 scopes 中拆出学习数据项与其余 scope：
 * - 学习数据项只认冻结 id 集合，展示顺序按冻结顺序、文案用冻结映射（逐字遵守）；
 * - 其余 scope 原样保留原顺序，交回现有 IdentityScopeList 展示。
 */
export const splitLearningDataScopes = (
  scopes: IdentityScopeInfo[]
): SplitLearningDataScopesResult => {
  const list = Array.isArray(scopes) ? scopes : []
  const requested = new Set(list.map((scope) => scope.id))
  const learning: LearningDataScopeItem[] = []
  for (const id of LEARNING_DATA_SCOPE_IDS) {
    if (requested.has(id)) {
      learning.push({ id, label: LEARNING_DATA_SCOPE_LABELS[id] })
    }
  }
  const learningIds = new Set<string>(learning.map((item) => item.id))
  return {
    learning,
    others: list.filter((scope) => !learningIds.has(scope.id))
  }
}

/** 默认全选（#699：勾选状态仅存组件内存，不持久化） */
export const defaultLearningConsent = (
  learning: LearningDataScopeItem[]
): Set<string> => new Set<string>(learning.map((item) => item.id))

/** 勾选守卫状态（由选中集合计算得出） */
export interface LearningConsentState {
  /**
   * 是否可提交批准：仅当请求不含学习数据项、或全部学习数据项均被勾选。
   * 当前 Core 只接受全集批准（见文件头），存在任何取消项都不可提交。
   */
  canApprove: boolean
  /** 请求含学习数据项且全部被取消 */
  allRevoked: boolean
  /** 请求含学习数据项且取消了部分（非全部） */
  someRevoked: boolean
}

/**
 * 选中集合计算 + 提交守卫：
 * - 未勾选任何不存在于请求中的多余 id 不影响判定（健壮性：忽略未知 id）；
 * - allRevoked 时 UI 应阻断提示「该应用要求的数据权限已被取消，无法继续」。
 */
export const resolveLearningConsent = (
  requested: LearningDataScopeItem[],
  selected: ReadonlySet<string>
): LearningConsentState => {
  const total = Array.isArray(requested) ? requested.length : 0
  if (total === 0) {
    // 请求不含学习数据项：勾选逻辑不参与，维持原有批准路径
    return { canApprove: true, allRevoked: false, someRevoked: false }
  }
  let checkedCount = 0
  for (const item of requested) {
    if (selected instanceof Set && selected.has(item.id)) checkedCount += 1
  }
  return {
    canApprove: checkedCount === total,
    allRevoked: checkedCount === 0,
    someRevoked: checkedCount > 0 && checkedCount < total
  }
}

/**
 * 取消项提示文案（UI 直接插值；与 resolveLearningConsent 一一对应）：
 * - 全部取消：任务冻结文案，逐字遵守；
 * - 部分取消：如实说明「需整体授予」，引导用户恢复勾选或拒绝整个授权，
 *   绝不出现「仍会提交/未生效也会授予」类表述（不允许静默扩大授权）。
 */
export const learningConsentNotice = (state: LearningConsentState): string => {
  if (state.allRevoked) return '该应用要求的数据权限已被取消，无法继续'
  if (state.someRevoked) {
    return '应用申请的学习数据权限需要整体授予：已取消的项目无法单独排除。请重新勾选，或选择「拒绝」取消本次授权。'
  }
  return ''
}
