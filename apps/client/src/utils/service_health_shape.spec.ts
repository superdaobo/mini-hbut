import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  formatHealthTimestamp,
  healthServiceFields,
  healthStatusOf,
  isRichHealthPayload
} from './service_health_shape'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

/** 生产 `/health` 实测载荷（P3-4 轻量存活探针，124B） */
const MINIMAL_HEALTH = {
  ok: true,
  service: 'ocr-service',
  version: '1.4.1',
  uptime_seconds: 14825,
  started_at: '2026-11-15T17:49:02.214290+08:00'
}

/** 生产 `/health/deps` 实测载荷（完整依赖聚合，节选） */
const RICH_DEPS = {
  status: 'ok',
  ok: true,
  checked_at: '2026-11-15T22:00:00+08:00',
  service: {
    version: '1.4.1',
    started_at: '2026-11-15T17:49:02.214290+08:00',
    uptime_seconds: 15057,
    uptime: '4小时 10分钟',
    timezone: 'Asia/Shanghai'
  },
  daily_usage: { date: '2026-11-15', ocr_count: 752, upload_count: 1, grade_dist_query_count: 55 },
  cloud_sync: { total_records: 5883, latest_version: '1.4.13', latest_version_user_count: 868 },
  version_usage: { latest_version: '1.4.13' },
  trend: { last_7_days: [{ date: '2026-11-15', ocr_count: 752 }] }
}

describe('service health shape (#1313)', () => {
  it('区分完整载荷与轻量存活载荷', () => {
    expect(isRichHealthPayload(RICH_DEPS)).toBe(true)
    expect(isRichHealthPayload(MINIMAL_HEALTH)).toBe(false)
    expect(isRichHealthPayload(null)).toBe(false)
    expect(isRichHealthPayload([])).toBe(false)
    expect(isRichHealthPayload({})).toBe(false)
    // 只有 status 也算完整
    expect(isRichHealthPayload({ status: 'degraded' })).toBe(true)
    // 只有 cloud_sync 也算完整
    expect(isRichHealthPayload({ cloud_sync: { total_records: 1 } })).toBe(true)
  })

  it('轻量载荷不再退化成「状态未知」', () => {
    expect(healthStatusOf(RICH_DEPS)).toBe('ok')
    expect(healthStatusOf(MINIMAL_HEALTH)).toBe('ok')
    expect(healthStatusOf({ ok: false })).toBe('degraded')
    expect(healthStatusOf({ status: 'degraded' })).toBe('degraded')
    expect(healthStatusOf({})).toBe('unknown')
    expect(healthStatusOf(null)).toBe('unknown')
  })

  it('两种形状都能取到版本/启动时间/运行秒数', () => {
    expect(healthServiceFields(RICH_DEPS)).toEqual({
      version: '1.4.1',
      started_at: '2026-11-15T17:49:02.214290+08:00',
      uptime_seconds: 15057
    })
    expect(healthServiceFields(MINIMAL_HEALTH)).toEqual({
      version: '1.4.1',
      started_at: '2026-11-15T17:49:02.214290+08:00',
      uptime_seconds: 14825
    })
    expect(healthServiceFields({})).toEqual({ version: '', started_at: '', uptime_seconds: 0 })
  })

  it('缓存时间跨天补日期，避免把昨天误读成刚才', () => {
    const now = new Date(2026, 10, 15, 22, 0, 0)
    const today = new Date(2026, 10, 15, 21, 5, 0).getTime()
    const yesterday = new Date(2026, 10, 14, 1, 25, 0).getTime()
    const lastYear = new Date(2025, 11, 31, 23, 59, 0).getTime()
    expect(formatHealthTimestamp(today, now)).toBe('21:05')
    expect(formatHealthTimestamp(yesterday, now)).toBe('11-14 01:25')
    expect(formatHealthTimestamp(lastYear, now)).toBe('2025-12-31 23:59')
    expect(formatHealthTimestamp(0, now)).toBe('')
    expect(formatHealthTimestamp(Number.NaN, now)).toBe('')
  })

  it('视图改为先 /health/deps 再回落 /health，并对轻量载荷兜底', () => {
    const view = read('src/components/ServiceStatsView.vue')
    expect(view).toContain('STATISTICS_HEALTH_DEPS_ENDPOINT')
    expect(view).toContain('isRichHealthPayload')
    expect(view).toContain('healthStatusOf')
    expect(view).toContain('healthServiceFields')
    expect(view).toContain('formatHealthTimestamp')
    // 端点顺序：deps 优先
    expect(view).toMatch(/HEALTH_ENDPOINTS\s*=\s*\[[\s\S]*HEALTH_DEPS_URL[\s\S]*HEALTH_URL/)
  })

  it('statistics_environment 暴露 /health/deps 常量', () => {
    const source = read('src/utils/statistics_environment.ts')
    expect(source).toContain('STATISTICS_HEALTH_DEPS_ENDPOINT')
    expect(source).toContain('/health/deps')
  })
})
