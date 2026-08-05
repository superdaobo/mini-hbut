import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourcePath = (path: string) => resolve(process.cwd(), path)
const readSource = (path: string) => {
  const resolved = sourcePath(path)
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : ''
}
const readTree = (relativePath: string, extensionPattern: RegExp) => {
  const root = sourcePath(relativePath)
  if (!existsSync(root)) return ''
  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile() && extensionPattern.test(entry.name)) files.push(absolute)
    }
  }
  walk(root)
  return files.sort().map((file) => readFileSync(file, 'utf8')).join('\n')
}

describe('usage tracking contract', () => {
  it('hooks view navigation and module open tracking in App.vue and MoreView.vue', () => {
    const appSource = readSource('src/App.vue') + '\n' + readTree('src/app', /\.(?:ts|vue)$/)
    const moreSource = readSource('src/components/MoreView.vue')

    expect(appSource).toContain('initUsageTracker')
    expect(appSource).toContain('trackViewNavigation')
    expect(appSource).toContain('startUsageUploadScheduler')
    expect(appSource).toContain('void trackViewNavigation(fromView, normalized)')
    expect(appSource).toContain("scheduleUsageUpload({ studentId: studentId.value, reason: 'login', force: true })")
    expect(appSource).toContain(':student-id="studentId"')

    expect(moreSource).toContain("import { trackModuleOpen } from '../utils/usage_tracker.js'")
    expect(moreSource).toContain('void trackModuleOpen({')
    expect(moreSource).toContain('loadMode:')
  })

  it('defines usage tracker and uploader with challenge upload flow', () => {
    const trackerSource = readSource('src/utils/usage_tracker.js')
    const uploaderSource = readSource('src/utils/usage_uploader.js')

    expect(trackerSource).toContain('usage_stats_record_event')
    expect(trackerSource).toContain('trackViewNavigation')
    expect(trackerSource).toContain('trackModuleOpen')
    expect(trackerSource).toContain('trackAppForeground')
    expect(trackerSource).toContain('trackAppBackground')

    expect(uploaderSource).toContain('/api/usage-stats')
    expect(uploaderSource).toContain('x-usage-stats-challenge')
    expect(uploaderSource).toContain('usage_stats_list_pending_upload')
    expect(uploaderSource).toContain('fetchRemotePersonalUsageSummary')
  })

  it('registers usage_stats tauri commands in lib.rs', () => {
    const libSource = readSource('src-tauri/src/lib.rs')
    const dbSource = readSource('src-tauri/src/db.rs') + '\n' + readTree('src-tauri/src/infrastructure/db', /\.rs$/)

    expect(libSource).toContain('usage_stats_record_event')
    expect(libSource).toContain('usage_stats_get_personal_summary')
    expect(libSource).toContain('usage_stats_list_pending_upload')
    expect(dbSource).toContain('app_usage_events')
    expect(dbSource).toContain('ensure_schema_migration(')
    expect(dbSource).toContain('app_usage_events/sessions/daily_rollup/device_profile')
  })
})
