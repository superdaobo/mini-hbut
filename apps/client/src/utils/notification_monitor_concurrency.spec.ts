/**
 * #1104（轮询互斥）行为回归：
 * - 并发 / 秒级重复 start 不得产生多组定时器（旧实现 async 先 await stop 再建 timer，
 *   重叠调用会把先建的句柄覆盖成孤儿，每周期各跑一次全量检查）；
 * - 在飞检查期间 stop + start 不得出现两个并发检查（旧实现 stop 会把单飞标志清零）；
 * - stop 必须清干净定时器。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./debug_logger', () => ({ pushDebugLog: vi.fn() }))
vi.mock('../platform/native', () => ({ isCapacitorRuntime: () => false }))
vi.mock('../platform', () => ({ getRuntime: () => 'tauri' }))
vi.mock('./local_reminder_scheduler', () => ({
  reconcileLocalReminders: vi.fn(async () => undefined)
}))

/** 每次「完整检查」都会调用 checkGrades，用它计数即可。 */
const checkGrades = vi.fn(async () => ({ success: true }))

/** 课表静默刷新可被用例挂起，用来制造「检查在途」窗口。 */
let refreshScheduleSilently: () => Promise<{ success: boolean }> = async () => ({ success: true })

vi.mock('./notify_center_checks.js', () => ({
  emitSnapshotUpdate: vi.fn(),
  isSchoolInboxItemRead: () => false,
  readSchoolInboxState: () => ({ initialized: false, ids: [] }),
  refreshScheduleSilently: () => refreshScheduleSilently(),
  checkGrades: () => checkGrades(),
  checkExams: async () => ({ success: true }),
  checkElectricity: async () => ({ success: true }),
  checkClassReminder: async () => ({ success: true, triggered: 0 }),
  checkSchoolInbox: async () => ({ success: true, triggered: 0 }),
  checkChaoxingInbox: async () => ({ success: true, triggered: 0 }),
  sendQueuedNotifications: async () => [],
  syncWidgetData: async () => undefined
}))

const createMemoryStorage = () => {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    }
  }
}

describe('通知轮询互斥（#1104）', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true
    })
    // notify_center 通过 window.setInterval / setTimeout 建定时器：
    // 这里给一个最小 window 垫片，定时器函数实时委托到 globalThis（fake timers 接管）。
    const win = {
      setInterval: (handler: (...args: unknown[]) => void, timeout?: number) =>
        globalThis.setInterval(handler as never, timeout),
      clearInterval: (id?: number) => globalThis.clearInterval(id as never),
      setTimeout: (handler: (...args: unknown[]) => void, timeout?: number) =>
        globalThis.setTimeout(handler as never, timeout),
      clearTimeout: (id?: number) => globalThis.clearTimeout(id as never),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true)
    }
    Object.defineProperty(globalThis, 'window', { value: win, configurable: true })
    // 显式接管 Date：单飞锁的「超时抢占」判定依赖 Date.now() 随假定时器前进
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
    })
    checkGrades.mockClear()
    refreshScheduleSilently = async () => ({ success: true })
  })

  afterEach(async () => {
    const mod = await import('./notify_center.js')
    await mod.stopNotificationMonitor()
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'localStorage')
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('并发 start 三次只应存在一组定时器，7s 启动检查只跑一次', async () => {
    vi.resetModules()
    const { startNotificationMonitor } = await import('./notify_center.js')

    await Promise.all([
      startNotificationMonitor({ studentId: '20260001' }),
      startNotificationMonitor({ studentId: '20260001' }),
      startNotificationMonitor({ studentId: '20260001' })
    ])

    // 1 个轮询 interval + 1 个 7s 启动检查
    expect(vi.getTimerCount()).toBe(2)

    await vi.advanceTimersByTimeAsync(7000)
    expect(checkGrades).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('在飞检查期间 stop + start 不产生并发检查', async () => {
    vi.resetModules()
    // 用对象持有 release，避免闭包赋值被 TS 收窄成 never
    const gate: { release: null | (() => void) } = { release: null }
    refreshScheduleSilently = () =>
      new Promise((resolve) => {
        gate.release = () => resolve({ success: true })
      })

    const { startNotificationMonitor, stopNotificationMonitor } = await import('./notify_center.js')

    await startNotificationMonitor({ studentId: '20260002' })
    await vi.advanceTimersByTimeAsync(7000)
    expect(checkGrades).toHaveBeenCalledTimes(1)

    // 检查仍挂起时重启监控：单飞锁由检查自身持有，stop 不得清零
    await stopNotificationMonitor()
    await startNotificationMonitor({ studentId: '20260002' })
    await vi.advanceTimersByTimeAsync(7000)
    expect(checkGrades).toHaveBeenCalledTimes(1)

    // 放行在飞检查后单飞锁释放：换账号重建监控，7s 启动检查能正常执行第二次
    gate.release?.()
    await vi.advanceTimersByTimeAsync(1)
    await startNotificationMonitor({ studentId: '20260009' })
    await vi.advanceTimersByTimeAsync(7000)
    expect(checkGrades).toHaveBeenCalledTimes(2)
  }, 30_000)

  it('单飞锁超时后允许抢占，监控不会永久停摆', async () => {
    vi.resetModules()
    refreshScheduleSilently = () => new Promise(() => {}) // 永不 resolve，模拟平台调用挂死

    const { startNotificationMonitor } = await import('./notify_center.js')

    await startNotificationMonitor({ studentId: '20260004' })
    await vi.advanceTimersByTimeAsync(7000)
    expect(checkGrades).toHaveBeenCalledTimes(1)

    // 越过 MONITOR_CHECK_STALE_MS（5 分钟）阈值后，新一次检查允许抢占（换账号重建监控）
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
    await startNotificationMonitor({ studentId: '20260005' })
    await vi.advanceTimersByTimeAsync(7000)
    expect(checkGrades).toHaveBeenCalledTimes(2)
  }, 30_000)

  it('stop 之后定时器清零且不再触发检查', async () => {
    vi.resetModules()
    const { startNotificationMonitor, stopNotificationMonitor } = await import('./notify_center.js')

    await startNotificationMonitor({ studentId: '20260003' })
    await vi.advanceTimersByTimeAsync(7000)
    expect(checkGrades).toHaveBeenCalledTimes(1)

    await stopNotificationMonitor()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(checkGrades).toHaveBeenCalledTimes(1)
  }, 30_000)
})
