import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeBackgroundDetectedEvent } from './types'

// #609 契约测试：状态映射 / unsupported 降级 / 事件模型 / 敏感数据边界

const setUserAgent = (ua: string) => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: ua },
    configurable: true
  })
}

const clearUserAgent = () => {
  Reflect.deleteProperty(globalThis, 'navigator')
}

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0'

describe('tauriBridge 后台检查状态映射（#609）', () => {
  afterEach(() => {
    clearUserAgent()
    vi.resetModules()
  })

  it('Android 移动端：真实反映 WorkManager 能力存在但调度器未接入（不伪造 ready）', async () => {
    setUserAgent(ANDROID_UA)
    const { tauriBridge } = await import('./adapters/tauri')
    const state = await tauriBridge.getBackgroundCheckState()

    expect(state.supported).toBe(true)
    expect(state.enabled).toBe(false)
    expect(state.scheduler.kind).toBe('android-workmanager')
    expect(state.scheduler.status).toBe('unavailable')
    expect(state.lastResult).toBe('unknown')
    expect(state.lastAttemptAt).toBeNull()
    expect(state.lastSuccessAt).toBeNull()
    expect(typeof state.updatedAt).toBe('string')
  })

  it('iOS 移动端：真实反映 BGAppRefresh 能力存在但调度器未接入（不伪造 ready）', async () => {
    setUserAgent(IOS_UA)
    const { tauriBridge } = await import('./adapters/tauri')
    const state = await tauriBridge.getBackgroundCheckState()

    expect(state.supported).toBe(true)
    expect(state.enabled).toBe(false)
    expect(state.scheduler.kind).toBe('ios-bgapprefresh')
    expect(state.scheduler.status).toBe('unavailable')
  })

  it('桌面端：无系统后台调度，明确降级为 desktop-foreground 且不声称可用', async () => {
    setUserAgent(DESKTOP_UA)
    const { tauriBridge } = await import('./adapters/tauri')
    const state = await tauriBridge.getBackgroundCheckState()

    expect(state.supported).toBe(false)
    expect(state.enabled).toBe(false)
    expect(state.scheduler.kind).toBe('desktop-foreground')
    expect(state.scheduler.status).toBe('unavailable')
  })

  it('setBackgroundCheckConfig 在插件未接入时不落盘、不伪造 enabled', async () => {
    setUserAgent(ANDROID_UA)
    const { tauriBridge } = await import('./adapters/tauri')
    const state = await tauriBridge.setBackgroundCheckConfig({
      enabled: true,
      checkGradeChanges: true,
      checkExamChanges: false,
      checkSchoolInbox: false,
      intervalMinutes: 30,
      schemaVersion: 1
    })

    expect(state.enabled).toBe(false)
    expect(state.scheduler.status).toBe('unavailable')
    expect(state.reason).toContain('未接入')
  })

  it('runNow / sync / clear / consume 在未接入时返回安全降级值，不抛异常', async () => {
    setUserAgent(DESKTOP_UA)
    const { tauriBridge } = await import('./adapters/tauri')

    await expect(tauriBridge.runBackgroundCheckNow()).resolves.toBe('unknown')
    await expect(
      tauriBridge.syncBackgroundCheckContext({ studentId: '20260001' })
    ).resolves.toBe(false)
    await expect(tauriBridge.clearBackgroundCheckContext()).resolves.toBe(false)
    await expect(tauriBridge.consumeBackgroundEvents(vi.fn())).resolves.toBeNull()
  })
})

describe('webBridge unsupported 降级（#609）', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('全部后台方法返回明确降级值，不抛未处理异常', async () => {
    const { webBridge } = await import('./adapters/web')

    const state = await webBridge.getBackgroundCheckState()
    expect(state.supported).toBe(false)
    expect(state.enabled).toBe(false)
    expect(state.scheduler).toEqual({ kind: 'unsupported', status: 'unavailable' })
    expect(state.auth.status).toBe('unknown')

    await expect(webBridge.setBackgroundCheckConfig({
      enabled: true,
      checkGradeChanges: true,
      checkExamChanges: true,
      checkSchoolInbox: true,
      schemaVersion: 1
    })).resolves.toMatchObject({ supported: false, enabled: false })

    await expect(webBridge.runBackgroundCheckNow()).resolves.toBe('unknown')
    await expect(webBridge.syncBackgroundCheckContext({})).resolves.toBe(false)
    await expect(webBridge.clearBackgroundCheckContext()).resolves.toBe(false)
    await expect(webBridge.consumeBackgroundEvents(vi.fn())).resolves.toBeNull()
  })
})

describe('capacitorBridge 迁移期状态（#609）', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('迁移期不承诺新后台能力，kind 标记来源、status 保持 unavailable', async () => {
    const { capacitorBridge } = await import('./adapters/capacitor')
    const state = await capacitorBridge.getBackgroundCheckState()

    expect(state.scheduler.kind).toBe('capacitor-background-fetch')
    expect(state.scheduler.status).toBe('unavailable')
    expect(state.enabled).toBe(false)
  })
})

describe('BackgroundDetectedEvent 事件模型（#609）', () => {
  it('归一化白名单：只保留契约字段，未知/敏感字段一律丢弃', () => {
    const raw = {
      id: 'evt-001',
      type: 'grades-changed',
      detectedAt: '2026-08-13T08:00:00.000Z',
      source: 'android-workmanager',
      targetView: 'grades',
      presented: true,
      signature: 'grade-sig-v1:abc123',
      meta: { subject: '高等数学', score: 92, retaken: false },
      // 模拟插件被注入/误传的敏感字段：必须被过滤
      cookie: 'session=secret',
      password: 'hunter2',
      headers: { Authorization: 'Bearer secret' }
    }

    const event = normalizeBackgroundDetectedEvent(raw)
    expect(event).not.toBeNull()
    expect(event?.id).toBe('evt-001')
    expect(event?.type).toBe('grades-changed')
    expect(event?.source).toBe('android-workmanager')
    expect(event?.presented).toBe(true)
    expect(event?.meta).toEqual({ subject: '高等数学', score: 92, retaken: false })
    // 敏感字段不进入事件模型
    expect(event && 'cookie' in event).toBe(false)
    expect(event && 'password' in event).toBe(false)
    expect(event && 'headers' in event).toBe(false)
  })

  it('meta 只保留原始值，对象/数组等结构被丢弃', () => {
    const event = normalizeBackgroundDetectedEvent({
      id: 'evt-002',
      detectedAt: '2026-08-13T08:01:00.000Z',
      signature: 'sig:002',
      meta: {
        ok: true,
        count: 3,
        nested: { secret: 'x' },
        list: [1, 2]
      }
    })
    expect(event?.meta).toEqual({ ok: true, count: 3 })
  })

  it('非法输入返回 null，调用方按“无事件”安全处理', () => {
    expect(normalizeBackgroundDetectedEvent(null)).toBeNull()
    expect(normalizeBackgroundDetectedEvent('string')).toBeNull()
    expect(normalizeBackgroundDetectedEvent({ id: 'no-detected-at' })).toBeNull()
    expect(normalizeBackgroundDetectedEvent({ id: 'x', detectedAt: 't' })).toBeNull()
  })

  it('未知 type/source 收敛为 unknown / unsupported，不破坏契约', () => {
    const event = normalizeBackgroundDetectedEvent({
      id: 'evt-003',
      type: 'mystery-type',
      detectedAt: '2026-08-13T08:02:00.000Z',
      source: 'future-platform',
      signature: 'sig:003'
    })
    expect(event?.type).toBe('unknown')
    expect(event?.source).toBe('unsupported')
  })
})
