// src/features/dataRights/dataRightsViewModel.ts
//
// Epic #1243（G3-05 / mini-hbut#1258）：**数据导出 / 删除**页的展示模型（纯函数）。
//
// 对应后端（OCR#64）：`GET /identity/data-rights/export`、`POST /identity/data-rights/delete`。
//
// 三条产品红线（都有测试）：
//   1. **学校权威域不可删** —— 必须显示「不可删除」及原因，不能让用户点了才发现失败；
//   2. **删除是写墓碑**（不是物理删）—— 文案必须说清「下次同步会恢复的只有学校域」；
//   3. **删除不影响学号登录** —— 必须显式说明。

export interface DataRightRow {
  domain: string
  label: string
  /** 是否可删除（只有用户域可删） */
  deletable: boolean
  /** 不可删除的原因（可删时为空） */
  reason: string
  selected: boolean
}

export interface DataRightsModel {
  rows: DataRightRow[]
  /** 可删除的行数 */
  deletableCount: number
  /** 当前选中且可删的行数 */
  selectedCount: number
  canSubmitDelete: boolean
  /** 页面说明（必须显示） */
  notice: string
}

const DOMAIN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  profile: '基本资料',
  schedule: '课表',
  grades: '成绩',
  exams: '考试',
  rank: '排名',
  custom_courses: '自定义课程',
  personal_events: '个人日程'
})

/** 与后端 `DELETABLE_DOMAINS` 同口径 */
export const DELETABLE_DOMAINS: ReadonlyArray<string> = ['custom_courses', 'personal_events']

/** 与后端 `SCHOOL_AUTHORITATIVE_DOMAINS` 同口径 */
export const SCHOOL_AUTHORITATIVE_DOMAINS: ReadonlyArray<string> = [
  'profile',
  'schedule',
  'grades',
  'exams',
  'rank'
]

/**
 * 组装数据权利页模型。
 *
 * `selected` 是用户勾选的域集合（非 Set 输入按「未选」处理，fail closed）。
 */
export const buildDataRights = (
  domains: readonly string[],
  selected: ReadonlySet<string>
): DataRightsModel => {
  const rows: DataRightRow[] = []
  for (const raw of Array.isArray(domains) ? domains : []) {
    const domain = String(raw ?? '').trim()
    if (!domain) continue
    const deletable = DELETABLE_DOMAINS.includes(domain)
    rows.push({
      domain,
      label: DOMAIN_LABELS[domain] || domain,
      deletable,
      reason: deletable
        ? ''
        : '学校权威数据：删除后下次同步会恢复，因此不提供删除',
      selected: deletable && selected instanceof Set && selected.has(domain)
    })
  }
  const deletableCount = rows.filter((row) => row.deletable).length
  const selectedCount = rows.filter((row) => row.selected).length
  return {
    rows,
    deletableCount,
    selectedCount,
    canSubmitDelete: selectedCount > 0,
    // 三条说明都必须出现在页面上（契约测试会锁）
    notice:
      '导出会包含你在云端的全部数据与授权记录；删除只作用于可删除的自定义数据，' +
      '学校权威数据不会被删除，删除也不影响你用学号登录。'
  }
}

/** 导出文件名（本地生成，避免服务端决定文件名）。 */
export const exportFileName = (now: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `mini-hbut-data-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`
}

/** 删除前的二次确认文案（必须列出将删除的域）。 */
export const deleteConfirmText = (rows: DataRightRow[]): string => {
  const targets = rows.filter((row) => row.selected).map((row) => row.label)
  if (!targets.length) return ''
  return `确认删除以下数据？${targets.join('、')}。删除后这些数据不会从学校重新同步。`
}
