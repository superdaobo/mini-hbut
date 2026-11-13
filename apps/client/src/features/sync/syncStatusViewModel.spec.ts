// src/features/sync/syncStatusViewModel.spec.ts
//
// Epic #1243（G6-01 / mini-hbut#1268）契约测试：同步状态页展示模型。
//
// **本文件最重要的一条**：Epic 废止「按数据年龄的过期告警」。
// 所以这里有一条专门断言「30 天前的数据仍然显示已同步」，且全量断言文案里
// **不存在**「过期 / 可能过期 / 请刷新」等字样。

import { describe, expect, it } from 'vitest'

import {
  buildSyncStatus,
  formatLastSynced,
  rowSubtitle,
  toSyncDomainState
} from './syncStatusViewModel'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-13T12:00:00Z')

const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

describe('syncStatusViewModel', () => {
  it('服务端状态码 → 展示态；未知按 unavailable（不猜成 ok）', () => {
    expect(toSyncDomainState('ok')).toBe('ok')
    expect(toSyncDomainState('snapshot_missing')).toBe('no_data')
    expect(toSyncDomainState('unauthorized')).toBe('unauthorized')
    expect(toSyncDomainState('weird_new_state')).toBe('unavailable')
    expect(toSyncDomainState('')).toBe('unavailable')
  })

  it('30 天前的数据仍然显示「已同步」——不存在按年龄的过期判定', () => {
    const summary = buildSyncStatus({
      domains: [{ domain: 'grades', state: 'ok', last_synced_at: iso(30 * DAY), data_version: 5 }],
      queue: { pending: 0 },
      now: NOW
    })
    expect(summary.rows[0].state).toBe('ok')
    expect(summary.rows[0].statusText).toBe('已同步')
    expect(summary.rows[0].statusText).not.toContain('过期')
    expect(rowSubtitle(summary.rows[0])).toContain('最后同步：')
    expect(rowSubtitle(summary.rows[0])).not.toContain('过期')
  })

  it('全量文案不含任何过期/强制刷新类字样', () => {
    const summary = buildSyncStatus({
      domains: [
        { domain: 'schedule', state: 'ok', last_synced_at: iso(90 * DAY), data_version: 1 },
        { domain: 'grades', state: 'snapshot_missing' },
        { domain: 'exams', state: 'unauthorized' },
        { domain: 'rank', state: 'unavailable' }
      ],
      queue: { pending: 3 },
      now: NOW
    })
    const text = [
      summary.notice,
      ...summary.rows.map((row) => `${row.statusText} ${rowSubtitle(row)}`)
    ].join(' ')
    for (const banned of ['过期', '可能过期', '请刷新', '数据陈旧', 'stale']) {
      expect(text).not.toContain(banned)
    }
  })

  it('四态映射到正确文案', () => {
    const summary = buildSyncStatus({
      domains: [
        { domain: 'schedule', state: 'ok', last_synced_at: iso(1000) },
        { domain: 'grades', state: 'snapshot_missing' },
        { domain: 'exams', state: 'unauthorized' },
        { domain: 'rank', state: 'unavailable' }
      ]
    })
    expect(summary.rows.map((row) => row.statusText)).toEqual([
      '已同步',
      '暂无同步数据',
      '未授权',
      '暂时不可用'
    ])
  })

  it('待同步条数来自队列 summarize.pending', () => {
    expect(buildSyncStatus({ domains: [], queue: { pending: 7 } }).pendingCount).toBe(7)
    expect(buildSyncStatus({ domains: [], queue: null }).pendingCount).toBe(0)
    expect(buildSyncStatus({ domains: [], queue: { pending: -3 } }).pendingCount).toBe(0)
  })

  it('从未同步的域被标记', () => {
    const summary = buildSyncStatus({ domains: [{ domain: 'rank', state: 'ok' }] })
    expect(summary.hasNeverSynced).toBe(true)
    expect(rowSubtitle(summary.rows[0])).toBe('从未同步')
  })

  it('页面级提示只在三种情况出现', () => {
    expect(buildSyncStatus({ domains: [] }).notice).toBe('暂无已授权的数据类别')
    expect(
      buildSyncStatus({ domains: [{ domain: 'a', state: 'unauthorized' }] }).notice
    ).toBe('你还没有授权任何数据类别')
    expect(
      buildSyncStatus({ domains: [{ domain: 'a', state: 'unavailable' }] }).notice
    ).toBe('同步服务暂时不可用，稍后会自动重试')
    // 有任一 ok 就不出页面级提示
    expect(
      buildSyncStatus({
        domains: [
          { domain: 'a', state: 'ok', last_synced_at: iso(1000) },
          { domain: 'b', state: 'unavailable' }
        ]
      }).notice
    ).toBe('')
  })

  it('跳过缺 domain 的条目；非法时间按「从未同步」处理', () => {
    const summary = buildSyncStatus({
      domains: [{ state: 'ok' }, { domain: 'grades', state: 'ok', last_synced_at: 'not-a-date' }]
    })
    expect(summary.rows).toHaveLength(1)
    expect(summary.rows[0].lastSyncedAt).toBe(0)
  })

  it('formatLastSynced：0/空/非法 → 从未同步；正常 → 最后同步：YYYY-MM-DD HH:mm', () => {
    expect(formatLastSynced(0)).toBe('从未同步')
    expect(formatLastSynced('')).toBe('从未同步')
    expect(formatLastSynced('garbage')).toBe('从未同步')
    expect(formatLastSynced(Date.parse('2026-11-13T08:05:00Z'))).toMatch(
      /^最后同步：\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
    )
  })
})
