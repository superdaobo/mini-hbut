/**
 * 学号核验前端接线的契约测试（goal-18 T05）。
 *
 * 锁住的纪律：
 * 1. **默认关** → 不调用新命令，只走旧上报（与改动前完全一致）；
 * 2. **Android** → 不调用新命令，只走旧上报；
 * 3. 打开且桌面 / iOS → 调用 `identity_school_verify`，**不再**走旧上报；
 * 4. 本机做不了（unsupported / 保险箱不可用 / 命令异常）→ 回退旧上报；服务端失败 → 不回退；
 * 5. 进程内节流：成功 12 小时、失败 10 分钟内不重复发起；
 * 6. 远程配置新键经 `normalizeRemoteConfig` 保留；旧键 `campus_probe` 不受影响；
 * 7. 本模块从不把 cookie 交给新命令（cookie 只在 Rust 侧读取）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeRemoteConfig } from './remote_config'
import {
  DEFAULT_SCHOOL_VERIFY_CONFIG,
  FAILURE_COOLDOWN_MS,
  SCHOOL_VERIFY_COMMAND,
  SUCCESS_COOLDOWN_MS,
  decideCampusIdentityRoute,
  isLocalInability,
  normalizeSchoolVerifyConfig,
  readSchoolVerifyConfigFromStorage,
  resetSchoolVerifyThrottle,
  runCampusIdentity,
  type SchoolVerifyPayload
} from './school_verify'
import { REMOTE_CONFIG_SNAPSHOT_KEY } from './remote_config_defaults'

const STUDENT = '2510231106'
const COOKIES = 'JSESSIONID=abc; route=r1'
const ON = { enabled: true, sampleRate: 1 }

function payload(partial: Partial<SchoolVerifyPayload>): SchoolVerifyPayload {
  return {
    ok: false,
    status: 'failed',
    reason: null,
    http_status: null,
    retry_after_seconds: null,
    student_id_masked: null,
    verified_at: null,
    reuse_until: null,
    casdoor: null,
    cookie_sent: false,
    ...partial
  }
}

function harness(result: SchoolVerifyPayload | Error) {
  const invoke = vi.fn(async (command: string) => {
    if (result instanceof Error) throw result
    return { ...result, _command: command }
  })
  const reportProbe = vi.fn()
  return { invoke, reportProbe }
}

/** 测试环境是 node（无 localStorage）：装一个内存版，与 campus_probe.spec 同做法。 */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    }
  } as Storage
}

beforeEach(() => {
  resetSchoolVerifyThrottle()
  ;(globalThis as { localStorage?: Storage }).localStorage = memoryStorage()
})

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('normalizeSchoolVerifyConfig', () => {
  it('默认关；只认 true / "true"；比例缺省为全量、>1 当百分数、越界 clamp', () => {
    expect(normalizeSchoolVerifyConfig(undefined)).toEqual(DEFAULT_SCHOOL_VERIFY_CONFIG)
    expect(normalizeSchoolVerifyConfig({ enabled: 'yes' }).enabled).toBe(false)
    expect(normalizeSchoolVerifyConfig({ enabled: 1 }).enabled).toBe(false)
    expect(normalizeSchoolVerifyConfig({ enabled: true })).toEqual({ enabled: true, sampleRate: 1 })
    expect(normalizeSchoolVerifyConfig({ Enabled: 'TRUE', sample_rate: 20 })).toEqual({ enabled: true, sampleRate: 0.2 })
    expect(normalizeSchoolVerifyConfig({ enabled: true, sampleRate: -3 }).sampleRate).toBe(0)
    expect(normalizeSchoolVerifyConfig({ enabled: true, sample_rate: 'x' }).sampleRate).toBe(1)
    // 接受自己的输出形状（快照里存的是归一化结果）
    expect(normalizeSchoolVerifyConfig(normalizeSchoolVerifyConfig({ enabled: true, sample_rate: 0.3 }))).toEqual({ enabled: true, sampleRate: 0.3 })
  })

  it('经 normalizeRemoteConfig 保留新键；缺省时为默认关；旧键 campus_probe 不受影响', () => {
    const withKey = normalizeRemoteConfig({ school_verify: { enabled: true, sample_rate: 0.5 }, campus_probe: { enabled: true, sample_rate: 1 } })
    expect(withKey.school_verify).toEqual({ enabled: true, sampleRate: 0.5 })
    expect(withKey.campus_probe).toEqual({ enabled: true, sampleRate: 1 })
    const without = normalizeRemoteConfig({ campus_probe: { enabled: true, sample_rate: 1 } })
    expect(without.school_verify).toEqual(DEFAULT_SCHOOL_VERIFY_CONFIG)
    expect(without.campus_probe).toEqual({ enabled: true, sampleRate: 1 })
  })

  it('从本地快照读取；快照损坏 / 缺失 → 默认关', () => {
    expect(readSchoolVerifyConfigFromStorage()).toEqual(DEFAULT_SCHOOL_VERIFY_CONFIG)
    localStorage.setItem(REMOTE_CONFIG_SNAPSHOT_KEY, '{oops')
    expect(readSchoolVerifyConfigFromStorage()).toEqual(DEFAULT_SCHOOL_VERIFY_CONFIG)
    // 只写本键的最小快照（快照里存的是归一化形状）；不把整份远程配置写进存储（CodeQL js/clear-text-storage）
    localStorage.setItem(REMOTE_CONFIG_SNAPSHOT_KEY, JSON.stringify({ school_verify: { enabled: true, sampleRate: 1 } }))
    expect(readSchoolVerifyConfigFromStorage()).toEqual({ enabled: true, sampleRate: 1 })
  })
})

describe('decideCampusIdentityRoute', () => {
  it('关闭 / Android / 非法学号 / 比例 0 → 旧上报；打开且桌面 → 新认证', () => {
    expect(decideCampusIdentityRoute(STUDENT, DEFAULT_SCHOOL_VERIFY_CONFIG, { android: false })).toBe('campus_probe')
    expect(decideCampusIdentityRoute(STUDENT, null, { android: false })).toBe('campus_probe')
    expect(decideCampusIdentityRoute(STUDENT, ON, { android: true })).toBe('campus_probe')
    expect(decideCampusIdentityRoute('abc', ON, { android: false })).toBe('campus_probe')
    expect(decideCampusIdentityRoute(STUDENT, { enabled: true, sampleRate: 0 }, { android: false })).toBe('campus_probe')
    expect(decideCampusIdentityRoute(STUDENT, ON, { android: false })).toBe('school_verify')
  })

  it('灰度按学号确定性分桶：同一人结论稳定，比例约等于目标', () => {
    const half = { enabled: true, sampleRate: 0.5 }
    const first = decideCampusIdentityRoute(STUDENT, half, { android: false })
    for (let i = 0; i < 5; i += 1) expect(decideCampusIdentityRoute(STUDENT, half, { android: false })).toBe(first)
    let inside = 0
    for (let i = 0; i < 2000; i += 1) {
      if (decideCampusIdentityRoute(String(2500000000 + i * 7919), half, { android: false }) === 'school_verify') inside += 1
    }
    expect(inside).toBeGreaterThan(850)
    expect(inside).toBeLessThan(1150)
  })
})

describe('runCampusIdentity', () => {
  it('默认关：只走旧上报，新命令一次都不调用（与改动前一致）', async () => {
    const h = harness(payload({ ok: true, status: 'verified' }))
    const out = await runCampusIdentity({ studentId: STUDENT, cookies: COOKIES, config: DEFAULT_SCHOOL_VERIFY_CONFIG, android: false, ...h })
    expect(out.route).toBe('campus_probe')
    expect(h.invoke).not.toHaveBeenCalled()
    expect(h.reportProbe).toHaveBeenCalledWith(STUDENT, COOKIES)
  })

  it('Android：即便打开也只走旧上报', async () => {
    const h = harness(payload({ ok: true, status: 'verified' }))
    const out = await runCampusIdentity({ studentId: STUDENT, cookies: COOKIES, config: ON, android: true, ...h })
    expect(out.route).toBe('campus_probe')
    expect(h.invoke).not.toHaveBeenCalled()
    expect(h.reportProbe).toHaveBeenCalledTimes(1)
  })

  it('打开且桌面：调用新命令（不带任何参数，cookie 不经前端），成功则不再走旧上报', async () => {
    const h = harness(payload({ ok: true, status: 'reused', cookie_sent: false }))
    const out = await runCampusIdentity({ studentId: STUDENT, cookies: COOKIES, config: ON, android: false, ...h })
    expect(out.route).toBe('school_verify')
    expect(out.fellBack).toBe(false)
    expect(h.invoke).toHaveBeenCalledTimes(1)
    expect(h.invoke.mock.calls[0]).toEqual([SCHOOL_VERIFY_COMMAND])
    expect(h.reportProbe).not.toHaveBeenCalled()
  })

  it.each([
    ['unsupported', payload({ status: 'unsupported', reason: 'unsupported_platform' })],
    ['保险箱不可用', payload({ reason: 'device_key_unavailable' })],
    ['签名失败', payload({ reason: 'signing_failed' })],
    ['本地无会话', payload({ reason: 'no_local_login' })]
  ])('本机做不了（%s）→ 回退旧上报', async (_name, result) => {
    const h = harness(result)
    const out = await runCampusIdentity({ studentId: STUDENT, cookies: COOKIES, config: ON, android: false, ...h })
    expect(out.fellBack).toBe(true)
    expect(h.reportProbe).toHaveBeenCalledWith(STUDENT, COOKIES)
  })

  it('命令调用异常（如旧壳 / 非 Tauri 环境）→ 回退旧上报，且不抛出', async () => {
    const h = harness(new Error('command not found'))
    const out = await runCampusIdentity({ studentId: STUDENT, cookies: COOKIES, config: ON, android: false, ...h })
    expect(out.fellBack).toBe(true)
    expect(h.reportProbe).toHaveBeenCalledTimes(1)
  })

  it.each(['network_error', 'rate_limited', 'landed_on_login_page', 'daily_budget_exhausted', 'unknown'])(
    '服务端已受理但失败（%s）→ 不回退旧上报（不把 cookie 再发往另一个端点）',
    async (reason) => {
      const h = harness(payload({ reason, http_status: 429, cookie_sent: true }))
      const out = await runCampusIdentity({ studentId: STUDENT, cookies: COOKIES, config: ON, android: false, ...h })
      expect(out.fellBack).toBe(false)
      expect(h.reportProbe).not.toHaveBeenCalled()
    }
  )

  it('进程内节流：成功后 12 小时、失败后 10 分钟内不重复发起', async () => {
    let now = 1_000_000
    const ok = harness(payload({ ok: true, status: 'verified' }))
    const opts = { studentId: STUDENT, cookies: COOKIES, config: ON, android: false, now: () => now, ...ok }
    await runCampusIdentity(opts)
    now += SUCCESS_COOLDOWN_MS - 1
    expect((await runCampusIdentity(opts)).route).toBe('throttled')
    now += 1
    await runCampusIdentity(opts)
    expect(ok.invoke).toHaveBeenCalledTimes(2)

    resetSchoolVerifyThrottle()
    const bad = harness(payload({ reason: 'network_error' }))
    const badOpts = { ...opts, ...bad }
    await runCampusIdentity(badOpts)
    now += FAILURE_COOLDOWN_MS - 1
    expect((await runCampusIdentity(badOpts)).route).toBe('throttled')
    now += 1
    await runCampusIdentity(badOpts)
    expect(bad.invoke).toHaveBeenCalledTimes(2)
    expect(bad.reportProbe).not.toHaveBeenCalled()
  })

  it('同一学号并发触发只跑一次（登录 / 恢复会话可能连续调用）', async () => {
    let release: (value: unknown) => void = () => {}
    const invoke = vi.fn(() => new Promise((resolve) => (release = resolve)))
    const reportProbe = vi.fn()
    const opts = { studentId: STUDENT, cookies: COOKIES, config: ON, android: false, now: () => 1, invoke, reportProbe }
    const first = runCampusIdentity(opts)
    const second = await runCampusIdentity(opts)
    expect(second.route).toBe('throttled')
    release(payload({ ok: true, status: 'reused' }))
    expect((await first).route).toBe('school_verify')
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(reportProbe).not.toHaveBeenCalled()
  })

  it('本机做不了时不记节流（下次登录照常尝试）', async () => {
    const h = harness(payload({ reason: 'device_key_unavailable' }))
    const opts = { studentId: STUDENT, cookies: COOKIES, config: ON, android: false, now: () => 5, ...h }
    await runCampusIdentity(opts)
    await runCampusIdentity(opts)
    expect(h.invoke).toHaveBeenCalledTimes(2)
    expect(h.reportProbe).toHaveBeenCalledTimes(2)
  })
})

describe('isLocalInability', () => {
  it('空值 / 非对象视为本机做不了；成功或服务端原因码不算', () => {
    expect(isLocalInability(null)).toBe(true)
    expect(isLocalInability(undefined)).toBe(true)
    expect(isLocalInability(payload({ ok: true, status: 'verified' }))).toBe(false)
    expect(isLocalInability(payload({ reason: 'student_id_mismatch' }))).toBe(false)
  })
})
