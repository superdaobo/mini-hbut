import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('calendar session + SWR sticky offline contract (#489)', () => {
  it('loads calendar with remote-first semantics instead of SWR sticky offline', () => {
    const source = readText('src/components/CalendarView.vue')
    const fetchCalendarBlock =
      source.match(/const fetchCalendar = async \(options = \{\}\) => \{[\s\S]*?const handleSemesterChange/s)?.[0] ||
      ''

    expect(fetchCalendarBlock).toContain('forceRemote: true')
    expect(fetchCalendarBlock).not.toContain('staleWhileRevalidate: true')
    expect(fetchCalendarBlock).toContain('const staleApplied = applyStaleCalendarSnapshot(cacheKey)')
    expect(fetchCalendarBlock).toContain('if (!staleApplied || !options.keepOfflineBanner)')
    expect(fetchCalendarBlock).toContain('offline.value = false')
    expect(fetchCalendarBlock).toContain('sessionExpired.value = false')
    expect(fetchCalendarBlock).toContain('setCachedData(cacheKey, data)')
    expect(fetchCalendarBlock).toContain('data?.need_login')
    expect(fetchCalendarBlock).toContain('sessionExpired.value = true')
  })

  it('distinguishes session-expired banner from pure network offline banner', () => {
    const source = readText('src/components/CalendarView.vue')

    expect(source).toContain('const sessionExpired = ref(false)')
    expect(source).toContain('教务会话已失效')
    expect(source).toContain('当前显示为离线数据，更新于')
    expect(source).toContain("class=\"offline-banner\"")
    expect(source).toContain("session-banner")
    expect(source).toContain('CALENDAR_CACHE_REFRESH_RETRY_MS')
    expect(source).toContain('scheduleCalendarRealtimeRetry')
  })

  it('keeps refresh spinning while cached calendar is replaced by realtime data', () => {
    const source = readText('src/components/CalendarView.vue')

    expect(source).toContain('const refreshing = ref(false)')
    expect(source).toContain('const isInitialLoading = computed(() => loading.value && calendarData.value.length === 0)')
    expect(source).toContain('class="calendar-refresh-btn"')
    expect(source).toContain(':class="{ spinning: refreshing || loading || offline }"')
    expect(source).toContain('@click="fetchCalendar()"')
    expect(source).toContain('v-if="isInitialLoading"')
    expect(source).toContain('class="calendar-updated-at"')
  })

  it('backend does not cache failed calendar payloads and probes session before getData', () => {
    const lib = readText('src-tauri/src/lib.rs')
    const academic = readText('src-tauri/src/http_client/academic.rs')

    const fetchCmd =
      lib.match(/async fn fetch_calendar_data\([\s\S]*?async fn fetch_academic_progress/s)?.[0] || ''
    expect(fetchCmd).toContain('need_login')
    expect(fetchCmd).toContain('// 仅成功响应写缓存并刷新 sync_time')
    expect(fetchCmd).toContain('if success')
    expect(fetchCmd).toContain('if need_login')
    expect(fetchCmd).toContain('calendar_public_cache')

    const rawFetch =
      academic.match(
        /async fn fetch_calendar_raw_for_semester\([\s\S]*?async fn fetch_calendar_summary_for_semester/s
      )?.[0] || ''
    expect(rawFetch).toContain('校历请求前已完成教务会话探测/补票')
    expect(rawFetch).toContain('ensure_chaoxing_academic_session')
    expect(rawFetch).toContain('xlgl/getData')
  })

  it('does not pretend the official calendar API disappeared', () => {
    const source = readText('src/components/CalendarView.vue')
    expect(source).toContain('而非官网校历接口消失')
    expect(source).toContain('/v2/calendar')
  })
})
