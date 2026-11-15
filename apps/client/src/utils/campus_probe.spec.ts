/**
 * 校园会话上报的契约测试（Issue #1307）。
 *
 * 锁住的纪律：
 * 1. **默认关** → 零请求；
 * 2. 采样是**确定性**的（同一人同一天结论稳定）；
 * 3. 上报**任何失败都不抛**（网络错误/超时/abort 都不影响登录）；
 * 4. cookie 只挑教务域、去掉本项目自己的键、超长按 value 长度裁剪；
 * 5. 端点走主域，不新增域名常量。
 */
import { describe, expect, it, vi } from 'vitest'

import {
  CAMPUS_PROBE_ENDPOINT,
  DEFAULT_CAMPUS_PROBE_CONFIG,
  buildCampusProbeCookieHeader,
  normalizeCampusProbeConfig,
  readCampusProbeConfigFromStorage,
  reportCampusSession,
  shouldReportCampusSession
} from './campus_probe'
import { PRIMARY_BACKEND_ORIGIN } from './backend_endpoints'

const STUDENT = '2510231106'
const COOKIE = 'JSESSIONID=abc123; route=deadbeef; jw_uf=x; hbu_session_cookies=zzz'

describe('campus_probe · 配置规范化', () => {
  it('缺省时默认关闭', () => {
    expect(normalizeCampusProbeConfig(undefined)).toEqual(DEFAULT_CAMPUS_PROBE_CONFIG)
    expect(DEFAULT_CAMPUS_PROBE_CONFIG.enabled).toBe(false)
  })

  it('支持 snake_case 与 camelCase', () => {
    expect(normalizeCampusProbeConfig({ enabled: true, sample_rate: 0.5 })).toEqual({
      enabled: true,
      sampleRate: 0.5
    })
    expect(normalizeCampusProbeConfig({ enabled: true, sampleRate: 0.25 })).toEqual({
      enabled: true,
      sampleRate: 0.25
    })
  })

  it('采样率 clamp 到 [0,1]，>1 视为百分数', () => {
    expect(normalizeCampusProbeConfig({ enabled: true, sample_rate: 5 }).sampleRate).toBe(0.05)
    expect(normalizeCampusProbeConfig({ enabled: true, sample_rate: 1 }).sampleRate).toBe(1)
    expect(normalizeCampusProbeConfig({ enabled: true, sample_rate: -3 }).sampleRate).toBe(0)
    expect(normalizeCampusProbeConfig({ enabled: true, sample_rate: 'x' }).sampleRate).toBe(
      DEFAULT_CAMPUS_PROBE_CONFIG.sampleRate
    )
  })

  it('enabled 只认 true/字符串 true，其它一律关', () => {
    expect(normalizeCampusProbeConfig({ enabled: 'true' }).enabled).toBe(true)
    expect(normalizeCampusProbeConfig({ enabled: 1 }).enabled).toBe(false)
    expect(normalizeCampusProbeConfig({ enabled: 'yes' }).enabled).toBe(false)
  })
})

describe('campus_probe · 采样', () => {
  it('关闭时一律不报', () => {
    expect(shouldReportCampusSession(STUDENT, { enabled: false, sampleRate: 1 })).toBe(false)
  })

  it('非 10 位学号不报', () => {
    expect(shouldReportCampusSession('abc', { enabled: true, sampleRate: 1 })).toBe(false)
    expect(shouldReportCampusSession('251023110', { enabled: true, sampleRate: 1 })).toBe(false)
  })

  it('sampleRate=1 必报、=0 必不报', () => {
    expect(shouldReportCampusSession(STUDENT, { enabled: true, sampleRate: 1 })).toBe(true)
    expect(shouldReportCampusSession(STUDENT, { enabled: true, sampleRate: 0 })).toBe(false)
  })

  it('确定性：同一人同一天结论稳定，不同天可不同', () => {
    const cfg = { enabled: true, sampleRate: 0.5 }
    const first = shouldReportCampusSession(STUDENT, cfg, '2026-11-15')
    for (let i = 0; i < 20; i += 1) {
      expect(shouldReportCampusSession(STUDENT, cfg, '2026-11-15')).toBe(first)
    }
    let changed = false
    for (let day = 1; day <= 28; day += 1) {
      const key = `2026-11-${String(day).padStart(2, '0')}`
      if (shouldReportCampusSession(STUDENT, cfg, key) !== first) changed = true
    }
    expect(changed).toBe(true)
  })

  it('采样率越高命中越多（统计口径）', () => {
    const low = Array.from({ length: 200 }, (_, i) =>
      shouldReportCampusSession(`25102${String(i).padStart(5, '0')}`, { enabled: true, sampleRate: 0.1 }, '2026-11-15')
    ).filter(Boolean).length
    const high = Array.from({ length: 200 }, (_, i) =>
      shouldReportCampusSession(`25102${String(i).padStart(5, '0')}`, { enabled: true, sampleRate: 0.9 }, '2026-11-15')
    ).filter(Boolean).length
    expect(low).toBeLessThan(high)
  })
})

describe('campus_probe · cookie 头构造', () => {
  it('去掉本项目自己的键', () => {
    const header = buildCampusProbeCookieHeader(COOKIE)
    expect(header).not.toContain('hbu_session_cookies')
    expect(header).toContain('JSESSIONID=abc123')
    expect(header).toContain('route=deadbeef')
  })

  it('空串返回空串（上层据此跳过上报）', () => {
    expect(buildCampusProbeCookieHeader('')).toBe('')
    expect(buildCampusProbeCookieHeader('   ')).toBe('')
    expect(buildCampusProbeCookieHeader('hbu_session_cookies=only')).toBe('')
  })

  it('超长时按 value 长度从大到小裁剪，保留短的关键键', () => {
    const fat = `JSESSIONID=short; route=tiny; huge=${'x'.repeat(9000)}`
    const header = buildCampusProbeCookieHeader(fat, 6000)
    expect(header).not.toContain('huge=')
    expect(header).toContain('JSESSIONID=short')
    expect(header.length).toBeLessThanOrEqual(6000)
  })
})

describe('campus_probe · 上报', () => {
  it('关闭时一个请求都不发', async () => {
    const fetchImpl = vi.fn()
    const result = await reportCampusSession({
      studentId: STUDENT,
      cookies: COOKIE,
      config: { enabled: false, sampleRate: 1 },
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('disabled')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('打开时发一次 POST，body 带学号与 cookie', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 202 }))
    const result = await reportCampusSession({
      studentId: STUDENT,
      cookies: COOKIE,
      config: { enabled: true, sampleRate: 1 },
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.sent).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(CAMPUS_PROBE_ENDPOINT)
    expect(url.startsWith(PRIMARY_BACKEND_ORIGIN)).toBe(true)
    const body = JSON.parse(String(init.body))
    expect(body.student_id).toBe(STUDENT)
    expect(body.campus_cookie).toContain('JSESSIONID')
    expect(body.campus_cookie).not.toContain('hbu_session_cookies')
  })

  it('网络异常不抛（登录流程不受影响）', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const result = await reportCampusSession({
      studentId: STUDENT,
      cookies: COOKIE,
      config: { enabled: true, sampleRate: 1 },
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('transport_error')
  })

  it('没有可上报的 cookie 直接跳过，不发请求', async () => {
    const fetchImpl = vi.fn()
    const result = await reportCampusSession({
      studentId: STUDENT,
      cookies: 'hbu_session_cookies=zzz',
      config: { enabled: true, sampleRate: 1 },
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('no_cookie')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('未被采样时也不发请求', async () => {
    const fetchImpl = vi.fn()
    const result = await reportCampusSession({
      studentId: STUDENT,
      cookies: COOKIE,
      config: { enabled: true, sampleRate: 0 },
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('not_sampled')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})


describe('campus_probe · 从本地快照读开关', () => {
  it('无快照时默认关闭', () => {
    const storage = { getItem: () => null } as unknown as Storage
    ;(globalThis as any).localStorage = storage
    expect(readCampusProbeConfigFromStorage()).toEqual(DEFAULT_CAMPUS_PROBE_CONFIG)
  })

  it('快照里 enabled=true 且采样率生效', () => {
    const payload = JSON.stringify({ campus_probe: { enabled: true, sample_rate: 0.05 } })
    ;(globalThis as any).localStorage = { getItem: () => payload } as unknown as Storage
    expect(readCampusProbeConfigFromStorage()).toEqual({ enabled: true, sampleRate: 0.05 })
  })

  it('快照损坏时回落默认关（不抛）', () => {
    ;(globalThis as any).localStorage = { getItem: () => '{not json' } as unknown as Storage
    expect(readCampusProbeConfigFromStorage()).toEqual(DEFAULT_CAMPUS_PROBE_CONFIG)
  })
})
