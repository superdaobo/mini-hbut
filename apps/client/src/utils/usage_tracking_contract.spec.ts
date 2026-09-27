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
    expect(appSource).toContain("scheduleUsageUpload({ studentId: state.studentId.value, reason: 'login', force: true })")
    expect(appSource).toContain(':student-id="studentId"')

    expect(moreSource).toContain("import { trackModuleOpen } from '../utils/usage_tracker.js'")
    expect(moreSource).toContain('void trackModuleOpen({')
    expect(moreSource).toContain('loadMode:')
  })

  it('defines usage tracker and uploader with challenge upload flow', () => {
    const trackerSource = readSource('src/utils/usage_tracker.js')
    const uploaderSource = readSource('src/utils/usage_uploader.js')

    expect(trackerSource).toContain('usage_stats_record_event')
    expect(trackerSource).toContain('usage_stats_rebind_pending_identity')
    expect(trackerSource).toContain('trackAppLaunch')
    expect(trackerSource).toContain("eventType: 'app_launch'")
    expect(trackerSource).toContain('trackViewNavigation')
    expect(trackerSource).toContain('trackModuleOpen')
    expect(trackerSource).toContain('trackAppForeground')
    expect(trackerSource).toContain('trackAppBackground')

    expect(uploaderSource).toContain('/api/usage-stats')
    expect(uploaderSource).toContain("requestUsageStats('/heartbeat'")
    expect(uploaderSource).toContain('x-usage-stats-challenge')
    expect(uploaderSource).not.toContain('challengeState')
    expect(uploaderSource).toContain('usage_stats_list_pending_upload')
    expect(uploaderSource).toContain('fetchRemotePersonalUsageSummary')
  })

  it('registers usage_stats tauri commands in lib.rs', () => {
    const libSource = readSource('src-tauri/src/lib.rs')
    const dbSource = readSource('src-tauri/src/db.rs') + '\n' + readTree('src-tauri/src/infrastructure/db', /\.rs$/)

    expect(libSource).toContain('usage_stats_record_event')
    expect(libSource).toContain('usage_stats_rebind_pending_identity')
    expect(libSource).toContain('set_ocr_telemetry_context')
    expect(libSource).toContain('usage_stats_get_personal_summary')
    expect(libSource).toContain('usage_stats_list_pending_upload')
    expect(dbSource).toContain('app_usage_events')
    expect(dbSource).toContain('ensure_schema_migration(')
    expect(dbSource).toContain('app_usage_events/sessions/daily_rollup/device_profile')
  })

  it('keeps release statistics on production endpoints and limits raw usage retention to 14 days', () => {
    const remoteDefaults = readSource('src/utils/remote_config_defaults.ts')
    const appSettings = readSource('src/utils/app_settings.ts')
    const cloudSyncConfig = readSource('src/utils/cloud_sync_config.ts')
    const statisticsEnvironment = readSource('src/utils/statistics_environment.ts')
    const rustHttp = readSource('src-tauri/src/http_client/mod.rs')
    const rustAuth = readSource('src-tauri/src/http_client/auth.rs')
    const usageRepo = readSource('src-tauri/src/modules/usage_stats/log_repo.rs')
    const devWorkflow = readSource('../../.github/workflows/dev-build.yml')
    const releaseWorkflow = readSource('../../.github/workflows/release.yml')

    expect(remoteDefaults).toContain('mini-hbut-ocr-service.hf.space/api/ocr/recognize')
    expect(appSettings).toContain('mini-hbut-ocr-service.hf.space/api/cloud-sync')
    expect(statisticsEnvironment).toContain('resolveStatisticsEnvironment')
    expect(statisticsEnvironment).toContain("=== 'release' ? 'production' : 'test'")
    expect(statisticsEnvironment).toContain('mini-hbut-testocr1.hf.space')
    expect(statisticsEnvironment).toContain('mini-hbut-ocr-service.hf.space')
    expect(cloudSyncConfig).toContain('STATISTICS_CLOUD_SYNC_ENDPOINT')
    expect(cloudSyncConfig).toContain('isStatisticsServiceUrlCompatible')
    expect(rustHttp).toContain('DEFAULT_RELEASE_OCR_FALLBACK_ENDPOINTS: &[&str] = &[PRODUCTION_OCR_ENDPOINT]')
    expect(rustHttp).toContain('option_env!("MINI_HBUT_BUILD_PROFILE")')
    expect(rustHttp).toContain('!is_test_ocr_endpoint(endpoint)')
    expect(rustHttp).toContain('!is_production_ocr_endpoint(endpoint)')
    expect(rustAuth).toContain('x-mini-hbut-version')
    expect(rustAuth).toContain('x-mini-hbut-device')
    expect(rustAuth).toContain('is_first_party_ocr_endpoint')
    expect(usageRepo).toContain('const RETENTION_DAYS: i64 = 14')
    expect(devWorkflow).toContain('MINI_HBUT_BUILD_PROFILE: dev-fast')
    expect(releaseWorkflow).toContain('MINI_HBUT_BUILD_PROFILE: release')
  })
})
