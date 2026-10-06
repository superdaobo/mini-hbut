import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

// ── #933 行为测试依赖的 mock（usage_uploader 仅在用例内动态导入） ──
const { pushDebugLogMock, clearQueuesMock, fetchMock } = vi.hoisted(() => ({
  pushDebugLogMock: vi.fn(),
  clearQueuesMock: vi.fn(),
  fetchMock: vi.fn()
}))

vi.mock('./debug_logger', () => ({
  pushDebugLog: (...args: unknown[]) => pushDebugLogMock(...args)
}))
vi.mock('../platform/native', () => ({
  invokeNative: vi.fn(),
  isTauriRuntime: () => false
}))
vi.mock('./cloud_sync', () => ({
  getCloudSyncRuntimeConfig: () => ({
    proxyEndpoint: 'https://usage-mock.test',
    endpoint: '',
    enabled: true,
    timeoutMs: 3000
  })
}))
vi.mock('./usage_tracker', () => ({
  getWebUsagePendingQueues: () => ({
    events: [{ event_id: 'evt-1' }, { event_id: 'evt-2' }],
    sessions: [],
    deviceProfile: null
  }),
  clearWebUsagePendingQueues: (...args: unknown[]) => clearQueuesMock(...args)
}))
vi.mock('../config/app_store_policy', () => ({
  shouldApplyAppStoreRestrictions: () => false
}))
vi.mock('./test_account.js', () => ({ isTestAccountSession: () => false }))
vi.mock('./student_id.js', () => ({ isValidStudentId: () => true }))

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

    // 两域模型（契约 §9）：主域与兜底域均由 backend_endpoints 的契约常量派生，
    // 前端不再出现第二处硬编码生产域。
    expect(remoteDefaults).toContain('PRIMARY_BACKEND_ORIGIN')
    expect(remoteDefaults).toContain('FALLBACK_BACKEND_ORIGIN')
    expect(appSettings).toContain('PRIMARY_BACKEND_ORIGIN')
    expect(statisticsEnvironment).toContain('resolveStatisticsEnvironment')
    expect(statisticsEnvironment).toContain('isProductionStatisticsEnvironment')
    // 2026-10-06 起所有档位统一走生产：测试域只作为「拒绝清单」保留，不再是任何档位的基址
    expect(statisticsEnvironment).toContain('RETIRED_TEST_HOSTS')
    expect(statisticsEnvironment).toContain('mini-hbut-testocr1.hf.space')
    expect(statisticsEnvironment).toContain('PRIMARY_BACKEND_ORIGIN')
    expect(cloudSyncConfig).toContain('STATISTICS_CLOUD_SYNC_ENDPOINT')
    expect(cloudSyncConfig).toContain('isStatisticsServiceUrlCompatible')
    expect(rustHttp).toContain('DEFAULT_OCR_FALLBACK_ENDPOINTS: &[&str] =')
    expect(rustHttp).toContain('&[PRODUCTION_OCR_ENDPOINT, FALLBACK_OCR_ENDPOINT]')
    // 档位分流已取消：Rust 侧不得再按 MINI_HBUT_BUILD_PROFILE 选 OCR 端点
    expect(rustHttp).not.toContain('option_env!("MINI_HBUT_BUILD_PROFILE")')
    expect(rustHttp).toContain('is_retired_test_ocr_endpoint(endpoint)')
    expect(rustAuth).toContain('x-mini-hbut-version')
    expect(rustAuth).toContain('x-mini-hbut-device')
    expect(rustAuth).toContain('is_first_party_ocr_endpoint')
    expect(usageRepo).toContain('const RETENTION_DAYS: i64 = 14')
    expect(devWorkflow).toContain('MINI_HBUT_BUILD_PROFILE: dev-fast')
    expect(releaseWorkflow).toContain('MINI_HBUT_BUILD_PROFILE: release')
  })

  it('keeps failure backoff and diagnostics observable in uploader and debug bridge (#933)', () => {
    const uploaderSource = readSource('src/utils/usage_uploader.js')
    const debugBridgeSource = readSource('src/utils/debug_bridge.ts')

    expect(uploaderSource).toContain('getUsageUploadDiagnostics')
    expect(uploaderSource).toContain('USAGE_UPLOAD_BACKOFF_BASE_MS')
    expect(uploaderSource).toContain('USAGE_UPLOAD_BACKOFF_MAX_MS')
    expect(uploaderSource).toContain('USAGE_UPLOAD_FAILURE_LOG_INTERVAL')
    expect(uploaderSource).toContain('backoffUntil')
    expect(uploaderSource).toContain('suppressedLogCount')
    // 诊断快照经调试状态上报（/debug/state 可读）
    expect(debugBridgeSource).toContain('getUsageUploadDiagnostics')
    expect(debugBridgeSource).toContain('usageUpload')
  })
})

describe('usage 上传失败退避与降噪（#933 行为）', () => {
  const STUDENT_ID = '2023000111'
  // ambient 模块声明('*/usage_uploader.js')未覆盖测试所需的全部导出,此处显式收窄
  type UsageUploaderTestModule = {
    runUsageStatsUpload: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
    getUsageUploadDiagnostics: () => Record<string, unknown>
  }
  const loadUploader = async (): Promise<UsageUploaderTestModule> => {
    vi.resetModules()
    return (await import('./usage_uploader.js')) as unknown as UsageUploaderTestModule
  }
  const uploadFailWarnLogs = () =>
    pushDebugLogMock.mock.calls.filter(
      (call) =>
        call[0] === 'UsageStats' && call[2] === 'warn' && String(call[1]).includes('上传失败')
    )
  const jsonResponse = (status: number, body: Record<string, unknown>) => ({
    ok: status >= 200 && status < 400,
    status,
    text: async () => JSON.stringify(body)
  })

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
    })
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (store.has(key) ? store.get(key) : null),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key)
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'test-device-uuid' })
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    })
    vi.stubGlobal('fetch', fetchMock)
    // 默认:ping 200,upload 持续 401(#933 日志特征)
    fetchMock.mockImplementation(async (url: unknown) =>
      String(url).includes('/ping')
        ? jsonResponse(200, { challenge: 'chal-1' })
        : jsonResponse(401, { error: 'unauthorized' })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('首次 401 失败应记录诊断并进入退避,且只输出一条失败日志', async () => {
    const uploader = await loadUploader()
    const result = await uploader.runUsageStatsUpload({ studentId: STUDENT_ID, reason: 'view-nav' })

    expect(result.success).toBe(false)
    const diag = uploader.getUsageUploadDiagnostics()
    expect(diag.consecutiveFailures).toBe(1)
    expect(diag.totalFailures).toBe(1)
    expect(diag.lastErrorKind).toBe('http_401')
    expect(diag.backoffRemainingMs).toBeGreaterThan(0)
    expect(diag.backoffRemainingMs).toBeLessThanOrEqual(30_000)
    expect(diag.lastError).toContain('401')
    expect(uploadFailWarnLogs()).toHaveLength(1)
  })

  it('退避窗口内的自动重试应被拦截:不再请求、不累计失败、不刷日志', async () => {
    const uploader = await loadUploader()
    await uploader.runUsageStatsUpload({ studentId: STUDENT_ID, reason: 'view-nav' })
    const callsAfterFirstFailure = fetchMock.mock.calls.length
    const warnLogsAfterFirstFailure = uploadFailWarnLogs().length

    const second = await uploader.runUsageStatsUpload({ studentId: STUDENT_ID, reason: 'view-nav' })

    expect(second.success).toBe(false)
    expect(second.backoff).toBe(true)
    expect(second.remainingMs).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstFailure)
    expect(uploader.getUsageUploadDiagnostics().consecutiveFailures).toBe(1)
    expect(uploadFailWarnLogs().length).toBe(warnLogsAfterFirstFailure)
  })

  it('退避过期后恢复重试,退避时长按指数增长', async () => {
    const uploader = await loadUploader()
    await uploader.runUsageStatsUpload({ studentId: STUDENT_ID })

    await vi.advanceTimersByTimeAsync(31_000)
    const second = await uploader.runUsageStatsUpload({ studentId: STUDENT_ID })

    expect(second.success).toBe(false)
    expect(second.backoff).toBeUndefined()
    const diag = uploader.getUsageUploadDiagnostics()
    expect(diag.consecutiveFailures).toBe(2)
    // 第二次退避约 60s(30s × 2),大于首档 30s
    expect(diag.backoffRemainingMs).toBeGreaterThan(30_000)
  })

  it('连续失败时同级别日志按计数聚合:仅首次与每第 10 次输出', async () => {
    const uploader = await loadUploader()
    for (let round = 0; round < 12; round += 1) {
      await uploader.runUsageStatsUpload({ studentId: STUDENT_ID })
      // 16 分钟 > 退避封顶 15 分钟,保证下一轮退避过期
      await vi.advanceTimersByTimeAsync(16 * 60 * 1000)
    }

    const diag = uploader.getUsageUploadDiagnostics()
    expect(diag.totalFailures).toBe(12)
    expect(diag.consecutiveFailures).toBe(12)
    expect(uploadFailWarnLogs()).toHaveLength(2)
    expect(diag.suppressedLogCount).toBe(2)
    // 聚合日志必须带诊断快照,保证可观测
    expect(uploadFailWarnLogs()[0][3]).toHaveProperty('diagnostics')
  })

  it('force 上传应绕过退避立即重试(保留手动/登录强制语义)', async () => {
    const uploader = await loadUploader()
    await uploader.runUsageStatsUpload({ studentId: STUDENT_ID })
    const callsBeforeForce = fetchMock.mock.calls.length

    const forced = await uploader.runUsageStatsUpload({ studentId: STUDENT_ID, force: true })

    expect(forced.success).toBe(false)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeForce)
    expect(uploader.getUsageUploadDiagnostics().totalFailures).toBe(2)
  })

  it('上传成功应重置退避与连续失败计数,成功路径语义不变(冷却仍生效)', async () => {
    const uploader = await loadUploader()
    await uploader.runUsageStatsUpload({ studentId: STUDENT_ID })
    expect(uploader.getUsageUploadDiagnostics().consecutiveFailures).toBe(1)

    // 服务端恢复:upload 返回 2xx
    fetchMock.mockImplementation(async (url: unknown) =>
      String(url).includes('/ping')
        ? jsonResponse(200, { challenge: 'chal-2' })
        : jsonResponse(200, { accepted: 2 })
    )
    await vi.advanceTimersByTimeAsync(16 * 60 * 1000)
    const okResult = await uploader.runUsageStatsUpload({ studentId: STUDENT_ID })

    expect(okResult.success).toBe(true)
    expect(clearQueuesMock).toHaveBeenCalled()
    const diag = uploader.getUsageUploadDiagnostics()
    expect(diag.consecutiveFailures).toBe(0)
    expect(diag.backoffRemainingMs).toBe(0)
    expect(diag.totalFailures).toBe(1)
    expect(diag.lastSuccessAt).toBeGreaterThan(0)

    // 成功路径语义不变:成功后仍受 15 分钟上传冷却约束
    const again = await uploader.runUsageStatsUpload({ studentId: STUDENT_ID })
    expect(again.cooldown).toBe(true)
  })

  it('500 与 401 应归类为不同失败级别', async () => {
    const uploader = await loadUploader()
    fetchMock.mockImplementation(async (url: unknown) =>
      String(url).includes('/ping')
        ? jsonResponse(200, { challenge: 'chal-1' })
        : jsonResponse(500, { error: 'internal error' })
    )

    await uploader.runUsageStatsUpload({ studentId: STUDENT_ID })

    expect(uploader.getUsageUploadDiagnostics().lastErrorKind).toBe('http_500')
  })
})
