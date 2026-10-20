import { describe, expect, it } from 'vitest'
import { buildHomeNoticeEntries } from './home_notice_center'

describe('home notice center aggregation (#1089)', () => {
  it('aggregates all remote categories with priority and unique ids', () => {
    const entries = buildHomeNoticeEntries({
      ticker: [{ id: 'shared', title: '重复动态' }, { id: 'ticker', title: '滚动' }],
      pinned: [{ id: 'pinned', title: '置顶' }],
      list: [{ id: 'normal', title: '普通' }],
      confirm: [{ id: 'shared', title: '重要', require_confirm: true }]
    })
    expect(entries.map(({ title }) => title)).toEqual(['重要', '置顶', '普通', '滚动'])
    expect(entries.map(({ kind }) => kind)).toEqual(['confirm', 'pinned', 'list', 'ticker'])
    expect(entries[0].raw.require_confirm).toBe(true)
  })

  it('sorts newest first inside a kind and leaves invalid entries out', () => {
    const entries = buildHomeNoticeEntries({
      list: [
        { title: '旧公告', updated_at: '2026-01-01' },
        null,
        { id: 'new', title: '新公告', updated_at: '2026-10-20', summary: '更新说明' },
        {}
      ]
    })
    expect(entries.map((entry) => entry.title)).toEqual(['新公告', '旧公告'])
  })

  it('renders fallback textual summaries safely and handles empty groups', () => {
    expect(buildHomeNoticeEntries({})).toEqual([])
    const entries = buildHomeNoticeEntries({
      list: [{ content: '<p>课程更新</p><script>alert(1)</script>' }]
    })
    expect(entries).toHaveLength(1)
    expect(entries[0].summary).not.toContain('<script>')
    expect(entries[0].title).toContain('课程更新')
  })
})
