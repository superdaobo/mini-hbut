import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('semester fast path page contracts', () => {
  it('loads exams immediately instead of blocking on the remote semesters endpoint', () => {
    const source = readSource('src/components/ExamView.vue')

    expect(source).toContain('initializeFastSemester()')
    expect(source).toMatch(/fetchExams\(\)\s*\n\s*fetchSemesters\(\)/)
    expect(source).not.toMatch(/await\s+fetchSemesters\(\)\s*\n\s*await\s+fetchExams\(\)/)
  })

  it('loads calendar data immediately instead of blocking on the remote semesters endpoint', () => {
    const source = readSource('src/components/CalendarView.vue')

    expect(source).toContain('initializeFastSemester()')
    expect(source).toMatch(/fetchCalendar\(\)\s*\n\s*fetchSemesters\(\)/)
    expect(source).not.toMatch(/await\s+fetchSemesters\(\)\s*\n\s*await\s+fetchCalendar\(\)/)
  })

  it('loads ranking immediately while the semester list refreshes in the background', () => {
    const source = readSource('src/components/RankingView.vue')

    expect(source).toMatch(/fetchRanking\(\)\s*\n\s*fetchSemesters\(\)/)
    expect(source).not.toMatch(/await\s+fetchSemesters\(\)\s*\n\s*await\s+fetchRanking\(\)/)
  })
})
