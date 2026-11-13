// src/features/identity/consent/consentManagementViewModel.ts
//
// Epic #1243（G3-03 / mini-hbut#1256）：**授权管理页**的展示模型（纯函数）。
//
// 输入是服务端 `/identity/app-consents` 的 domains 数组（逐域状态），
// 输出是可渲染的行 + 汇总。**不拉取、不 import API 客户端**（展示层与传输层解耦）。
//
// 三条产品红线（都写进测试）：
//   1. 撤销**不影响学号登录** —— 页面必须显式说明，不能让人以为撤销=登出；
//   2. 逐项独立：一行一个域，**没有「全部开启」的强制**（可一键撤销全部，但不可一键强制授予）；
//   3. 重新申请只由**用户主动点击**触发（本模型只产出按钮，不自动发请求）。

export type ConsentRowState = 'granted' | 'revoked' | 'never' | 'stale'

export interface ConsentRow {
  domain: string
  label: string
  state: ConsentRowState
  stateText: string
  /** 是否已授权（决定勾选态） */
  granted: boolean
  /** 该行可执行的动作 */
  action: 'grant' | 'revoke' | 'renew'
  actionText: string
}

export interface ConsentManagementModel {
  rows: ConsentRow[]
  grantedCount: number
  /** 是否存在可撤销项（决定「一键撤销全部」是否可用） */
  canRevokeAll: boolean
  /** 页面说明（学号登录不受影响 —— 必须显示） */
  notice: string
}

const DOMAIN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  profile: '基本资料',
  schedule: '课表',
  grades: '成绩',
  exams: '考试',
  rank: '排名'
})

const STATE_TEXT: Readonly<Record<ConsentRowState, string>> = Object.freeze({
  granted: '已授权',
  revoked: '已撤销',
  never: '未授权',
  stale: '需要重新确认'
})

const toState = (raw: unknown): ConsentRowState => {
  switch (String(raw ?? '').trim()) {
    case 'granted':
      return 'granted'
    case 'revoked':
      return 'revoked'
    case 'stale':
      return 'stale'
    default:
      return 'never' // 未知一律按「未授权」（默认拒绝）
  }
}

/**
 * 逐域状态 → 行模型。
 *
 * 动作映射（冻结）：
 * - `granted` → 可撤销
 * - `revoked` / `never` → 可授予
 * - `stale` → **重新确认**（策略版本变了，旧的同意不再自动生效）
 */
export const buildConsentManagement = (domains: unknown): ConsentManagementModel => {
  const rows: ConsentRow[] = []
  if (Array.isArray(domains)) {
    for (const raw of domains) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const item = raw as Record<string, unknown>
      const domain = String(item.domain ?? '').trim()
      if (!domain) continue
      const state = toState(item.state)
      const granted = state === 'granted'
      const action: ConsentRow['action'] =
        state === 'granted' ? 'revoke' : state === 'stale' ? 'renew' : 'grant'
      rows.push({
        domain,
        label: DOMAIN_LABELS[domain] || domain,
        state,
        stateText: STATE_TEXT[state],
        granted,
        action,
        actionText: action === 'revoke' ? '撤销' : action === 'renew' ? '重新确认' : '开启'
      })
    }
  }

  const grantedCount = rows.filter((row) => row.granted).length
  return {
    rows,
    grantedCount,
    canRevokeAll: grantedCount > 0,
    // 这条说明是产品硬要求：撤销只影响额外数据类别，不影响学号登录
    notice: '撤销只影响这些数据类别的读取，不影响你用学号登录 Mini-HBUT。'
  }
}

/** 勾选态变更 → 要提交的域列表（只提交**已勾选**的，未勾选不提交）。 */
export const selectedDomains = (rows: ConsentRow[], selected: ReadonlySet<string>): string[] =>
  rows.filter((row) => selected instanceof Set && selected.has(row.domain)).map((row) => row.domain)

/** 汇总文案：`已授权 2 / 5 项`。 */
export const summaryText = (model: ConsentManagementModel): string =>
  model.rows.length === 0
    ? '该应用未申请任何数据类别'
    : `已授权 ${model.grantedCount} / ${model.rows.length} 项`
