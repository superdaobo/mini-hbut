/**
 * #715 「学习通通知」独立渠道行为测试：
 * - 开关 gating（关闭后不发起抓取）；
 * - 首次同步只建基线不推历史；
 * - 后续检查仅对未读新消息入队（domain=chaoxing-inbox，独立 eventKey）；
 * - 去重快照与「学校消息」（school-message）完全隔离。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./debug_logger', () => ({
  pushDebugLog: vi.fn()
}))

vi.mock('./widget_bridge', () => ({
  writeElectricityToWidget: vi.fn(),
  writeExamToWidget: vi.fn()
}))

const invokeNativeMock = vi.fn()
vi.mock('../platform/native', () => ({
  invokeNative: (...args: unknown[]) => invokeNativeMock(...args),
  isTauriRuntime: () => true
}))

/** 内存版 localStorage（Node 环境无全局 localStorage）。 */
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

type MemoryStorage = ReturnType<typeof createMemoryStorage>

const loadCheckChaoxingInbox = async () => {
  vi.resetModules()
  const mod = await import('./notify_center_checks.js')
  return mod.checkChaoxingInbox
}

const baseSettings = { enableChaoxingInbox: true } as Parameters<
  Awaited<ReturnType<typeof loadCheckChaoxingInbox>>
>[1]

const inboxPayload = (ids: Array<{ id: string; isRead?: boolean }>) => ({
  items: ids.map(({ id, isRead }, index) => ({
    id,
    title: `学习通消息 ${index}`,
    summary: '摘要内容',
    isRead: isRead === true,
    source: 'chaoxing',
    fetchedAt: '2026-08-25T08:00:00+08:00'
  })),
  source: 'chaoxing',
  fetchedAt: '2026-08-25T08:00:00+08:00'
})

describe('checkChaoxingInbox（#715 学习通通知独立渠道）', () => {
  let memory: MemoryStorage

  beforeEach(() => {
    memory = createMemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', {
      value: memory,
      configurable: true
    })
    invokeNativeMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('开关关闭时不发起抓取，直接返回 enabled=false', async () => {
    const checkChaoxingInbox = await loadCheckChaoxingInbox()
    const queue: unknown[] = []
    const result = await checkChaoxingInbox(
      '20260001',
      { ...baseSettings, enableChaoxingInbox: false },
      queue as never
    )
    expect(result.enabled).toBe(false)
    expect(result.success).toBe(true)
    expect(invokeNativeMock).not.toHaveBeenCalled()
    expect(queue.length).toBe(0)
  })

  it('首次同步只建立基线，不推送历史消息', async () => {
    invokeNativeMock.mockResolvedValue(
      inboxPayload([{ id: 'chaoxing:notice:1' }, { id: 'chaoxing:notice:2' }])
    )
    const checkChaoxingInbox = await loadCheckChaoxingInbox()
    const queue: unknown[] = []
    const result = await checkChaoxingInbox('20260001', baseSettings, queue as never)

    expect(result.baseline).toBe(true)
    expect(result.total).toBe(2)
    expect(queue.length).toBe(0)
    const stateRaw = memory.getItem('hbu_notify_chaoxing_inbox_state:20260001')
    expect(stateRaw).toContain('chaoxing:notice:1')
    expect(stateRaw).toContain('"initialized":true')
  })

  it('后续检查仅对新未读消息入队；domain 与学校消息隔离', async () => {
    invokeNativeMock.mockResolvedValue(
      inboxPayload([
        { id: 'chaoxing:notice:1' },
        { id: 'chaoxing:notice:2' },
        { id: 'chaoxing:notice:3', isRead: true }
      ])
    )
    const checkChaoxingInbox = await loadCheckChaoxingInbox()

    // 第一轮：建立基线
    await checkChaoxingInbox('20260001', baseSettings, [] as never)

    // 第二轮：notice:1 有更新（已读基线内不重复推）、notice:4 为新未读、notice:5 新但已读
    invokeNativeMock.mockResolvedValue(
      inboxPayload([
        { id: 'chaoxing:notice:1' },
        { id: 'chaoxing:notice:2' },
        { id: 'chaoxing:notice:3', isRead: true },
        { id: 'chaoxing:notice:4' },
        { id: 'chaoxing:notice:5', isRead: true }
      ])
    )
    const queue: Array<Record<string, unknown>> = []
    const result = await checkChaoxingInbox('20260001', baseSettings, queue as never)

    expect(result.triggered).toBe(1)
    expect(queue.length).toBe(1)
    expect(queue[0].title).toBe('学习通消息 3')
    expect(queue[0].body).toBe('摘要内容')
    expect(queue[0].targetView).toBe('notifications')
    expect(String(queue[0].eventKey)).toMatch(/^chaoxing-inbox:/)
    // 学校消息的去重快照键不被触碰
    expect(memory.getItem('hbu_notify_school_inbox_state:20260001')).toBeNull()
  })

  it('抓取异常时返回 success=false 且带错误信息，不影响主流程', async () => {
    invokeNativeMock.mockRejectedValue(new Error('学习通会话失效'))
    const checkChaoxingInbox = await loadCheckChaoxingInbox()
    const queue: unknown[] = []
    const result = await checkChaoxingInbox('20260001', baseSettings, queue as never)
    expect(result.success).toBe(false)
    expect(String(result.error)).toContain('学习通会话失效')
    expect(queue.length).toBe(0)
  })
})
