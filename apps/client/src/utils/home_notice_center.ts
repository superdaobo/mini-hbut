/**
 * #1089：首页状态绿点的远程公告列表模型。
 * 与教务成绩/考试提醒分离，不对远端公告做隐式“已读”或确认写入。
 */
export type HomeNoticeKind = 'confirm' | 'pinned' | 'list' | 'ticker'

export interface HomeNoticeEntry {
  key: string
  kind: HomeNoticeKind
  kindLabel: string
  title: string
  summary: string
  updatedAt: string
  raw: Record<string, unknown>
}

export type HomeAnnouncementGroups = Partial<Record<HomeNoticeKind, unknown[]>>

const groups: ReadonlyArray<{ kind: HomeNoticeKind; label: string }> = [
  { kind: 'confirm', label: '重要' },
  { kind: 'pinned', label: '置顶' },
  { kind: 'list', label: '公告' },
  { kind: 'ticker', label: '动态' }
]

const plainText = (value: unknown) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function buildHomeNoticeEntries(input: HomeAnnouncementGroups): HomeNoticeEntry[] {
  const seen = new Set<string>()
  const items: HomeNoticeEntry[] = []

  for (const group of groups) {
    const list = Array.isArray(input[group.kind]) ? input[group.kind]! : []
    const inGroup: Array<HomeNoticeEntry & { order: number }> = []
    for (let index = 0; index < list.length; index += 1) {
      const raw = list[index]
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const notice = raw as Record<string, unknown>
      const summary = plainText(notice.summary || notice.content || notice.body)
      const title = plainText(notice.title || notice.name) || summary.slice(0, 40)
      if (!title) continue
      const explicitId = String(notice.id ?? notice.key ?? '').trim()
      const key = explicitId ? `id:${explicitId}` : `text:${title}\u0000${summary}`
      if (seen.has(key)) continue
      seen.add(key)
      inGroup.push({
        key,
        kind: group.kind,
        kindLabel: group.label,
        title,
        summary,
        updatedAt: String(notice.updated_at || notice.date || '').trim(),
        raw: notice,
        order: index
      })
    }
    inGroup.sort((a, b) => {
      const aTime = Date.parse(a.updatedAt) || 0
      const bTime = Date.parse(b.updatedAt) || 0
      return bTime - aTime || a.order - b.order
    })
    items.push(...inGroup.map(({ order: _order, ...item }) => item))
  }

  return items
}
