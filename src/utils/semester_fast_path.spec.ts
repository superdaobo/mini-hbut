import { describe, expect, it, vi } from 'vitest'
import {
  deriveSemesterByDate,
  getPreferredSemesterFast,
  mergeSemesterOptions
} from './semester.js'

describe('semester fast path helpers', () => {
  it('derives the active semester from local date without calling the calendar API', () => {
    expect(deriveSemesterByDate(new Date('2026-06-01T12:00:00+08:00'))).toBe('2025-2026-2')
    expect(deriveSemesterByDate(new Date('2026-10-01T12:00:00+08:00'))).toBe('2026-2027-1')
    expect(deriveSemesterByDate(new Date('2026-01-10T12:00:00+08:00'))).toBe('2025-2026-1')
    expect(deriveSemesterByDate(new Date('2026-02-20T12:00:00+08:00'))).toBe('2025-2026-2')
  })

  it('prefers the locally stored schedule semester before falling back to date inference', () => {
    const getItem = vi.fn((key: string) => {
      if (key === 'hbu_schedule_meta') return JSON.stringify({ semester: '2024-2025-2' })
      return null
    })
    vi.stubGlobal('localStorage', { getItem })

    expect(getPreferredSemesterFast(new Date('2026-06-01T12:00:00+08:00'))).toBe('2024-2025-2')
  })

  it('merges the selected semester into remote options without duplication', () => {
    expect(mergeSemesterOptions(['2025-2026-1'], '2025-2026-2')).toEqual([
      '2025-2026-2',
      '2025-2026-1'
    ])
  })
})
