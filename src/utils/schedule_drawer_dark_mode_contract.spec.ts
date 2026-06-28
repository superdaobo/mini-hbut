import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readDarkModeCss = () =>
  readFileSync(resolve(process.cwd(), 'src/styles/dark-mode.css'), 'utf8')

describe('schedule drawer dark mode contract', () => {
  it('keeps step badges and drawer actions readable in dark mode', () => {
    const source = readDarkModeCss()

    expect(source).toContain('html.dark .schedule-view .drawer-subtitle::before')
    expect(source).toContain('html.dark .schedule-view .drawer-action.add-course')
    expect(source).toContain('html.dark .schedule-view .drawer-action.manage-course')
    expect(source).toContain('html.dark .schedule-view .drawer-action.sync-upload')
    expect(source).toContain('html.dark .schedule-view .drawer-action.sync-download')
    expect(source).toContain('html.dark .schedule-view .drawer-action.sync-json-export')
    expect(source).toContain('html.dark .schedule-view .drawer-action.sync-json-import')
    expect(source).toContain('html.dark .schedule-view .drawer-style-chip.active')
    expect(source).not.toMatch(
      /html\.dark \.schedule-view \.drawer-action\s*\{[^}]*background:\s*#334155/,
    )
  })
})
