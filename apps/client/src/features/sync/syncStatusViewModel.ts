// src/features/sync/syncStatusViewModel.ts
//
// Epic #1243（G6-01 / mini-hbut#1268）：**同步状态页**的展示模型（纯函数）。
//
// ## 这条产品红线写在这里
//
// Epic 明确废止「按数据年龄的过期告警」。本模块**只产出**：
//   - 最后成功同步时间（绝对时间，可格式化）
//   - 待同步条数（来自 T10 的队列 summarize）
//   - 每域的四态：`ok` / `no_data` / `unauthorized` / `unavailable`
//
// **绝不产出**：`expired` / `stale` / `too_old` / 「可能过期」/「请刷新」等任何按时间推断的
// 警示态。若将来有人想加，必须改这里并同步改测试 —— 测试里有一条专门断言
// 「30 天前的数据仍然是 ok」。

// 队列状态名（与 T10 的 `cloud_sync_queue` 同口径，但**不 import 它**：
// 展示层不该依赖队列模块的内部类型，否则两个 PR 会互相卡住）。
export type QueueStateName = 'dirty' | 'queued' | 'inflight' | 'acked' | 'failed' | 'blocked'

export type SyncDomainState = 'ok' | 'no_data' | 'unauthorized' | 'unavailable'

export interface SyncDomainRow {
  domain: string
  /** 本地化标签（中文优先，调用方可覆盖） */
  label: string
  state: SyncDomainState
  /** 最后成功同步时间（unix ms；0 = 从未） */
  lastSyncedAt: number
  /** 数据版本（服务端发号） */
  dataVersion: number
  /** 展示用文案（**不含任何过期判断**） */
  statusText: string
}

export interface SyncStatusSummary {
  rows: SyncDomainRow[]
  /** 待同步条数（queued + inflight + failed + blocked + dirty） */
  pendingCount: number
  /** 是否有任一域从未同步过 */
  hasNeverSynced: boolean
  /** 页面级提示：只在「完全没数据」或「全部不可用」时出现 */
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

const STATE_TEXT: Readonly<Record<SyncDomainState, string>> = Object.freeze({
  ok: '已同步',
  no_data: '暂无同步数据',
  unauthorized: '未授权',
  unavailable: '暂时不可用'
})

/** 服务端 `sync-status` 的状态码 → 展示态（未知一律按 `unavailable`，不猜成 ok）。 */
export const toSyncDomainState = (raw: string): SyncDomainState => {
  switch (String(raw || '').trim()) {
    case 'ok':
      return 'ok'
    case 'snapshot_missing':
      return 'no_data'
    case 'unauthorized':
      return 'unauthorized'
    default:
      return 'unavailable'
  }
}

/** 把 ISO 时间转成展示文案；**不做**任何「多久之前/是否过期」的推断。 */
export const formatLastSynced = (isoOrMs: string | number): string => {
  if (typeof isoOrMs === 'number') {
    if (!Number.isFinite(isoOrMs) || isoOrMs <= 0) return '从未同步'
    const date = new Date(isoOrMs)
    return `最后同步：${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  const text = String(isoOrMs || '').trim()
  if (!text) return '从未同步'
  const parsed = Date.parse(text)
  if (Number.isNaN(parsed)) return '从未同步'
  return formatLastSynced(parsed)
}

const pad = (value: number): string => String(value).padStart(2, '0')

export interface BuildSyncStatusInput {
  /** 服务端 `/api/app-data/v1/sync-status` 的 domains 数组（原样传入） */
  domains: Array<Record<string, unknown>>
  /** 队列各状态计数（来自 `summarize`） */
  queue?: Partial<Record<QueueStateName | 'pending', number>> | null
  /** 注入时钟（测试用；**不参与任何过期判断**） */
  now?: number
}

/**
 * 组装同步状态页模型。
 *
 * 注意 `now` 参数：它**只**用于「从未同步」的判定（`lastSyncedAt <= 0`），
 * **不参与**任何「数据是否过旧」的判断 —— 这是本模块最容易被误用的地方，故显式说明。
 */
export const buildSyncStatus = (input: BuildSyncStatusInput): SyncStatusSummary => {
  const domains = Array.isArray(input.domains) ? input.domains : []
  const rows: SyncDomainRow[] = []
  for (const raw of domains) {
    const domain = String(raw?.domain ?? '').trim()
    if (!domain) continue
    const state = toSyncDomainState(String(raw?.state ?? ''))
    const iso = String(raw?.last_synced_at ?? '')
    const lastSyncedAt = iso ? Date.parse(iso) || 0 : 0
    const version = Number(raw?.data_version)
    rows.push({
      domain,
      label: DOMAIN_LABELS[domain] || domain,
      state,
      lastSyncedAt,
      dataVersion: Number.isFinite(version) ? version : 0,
      statusText: STATE_TEXT[state]
    })
  }

  const pendingRaw = Number(input.queue?.pending ?? 0)
  const pendingCount = Number.isFinite(pendingRaw) && pendingRaw > 0 ? Math.floor(pendingRaw) : 0
  const hasNeverSynced = rows.some((row) => row.lastSyncedAt <= 0)

  let notice = ''
  if (rows.length === 0) {
    notice = '暂无已授权的数据类别'
  } else if (rows.every((row) => row.state === 'unauthorized')) {
    notice = '你还没有授权任何数据类别'
  } else if (rows.every((row) => row.state === 'unavailable')) {
    notice = '同步服务暂时不可用，稍后会自动重试'
  }

  return { rows, pendingCount, hasNeverSynced, notice }
}

/** 单行的副标题：只有「最后同步时间」，**没有**「可能过期」。 */
export const rowSubtitle = (row: SyncDomainRow): string => {
  if (row.state === 'unauthorized') return '在「应用授权」里开启后可同步'
  if (row.state === 'unavailable') return '稍后自动重试'
  if (row.lastSyncedAt <= 0) return '从未同步'
  return formatLastSynced(row.lastSyncedAt)
}
