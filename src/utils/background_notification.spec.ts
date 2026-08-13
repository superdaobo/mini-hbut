/**
 * Background Event Inbox 消费编排（#614）单测
 *
 * 覆盖验收标准核心场景：
 * - 场景 A：后台先发现（presented=true）→ 同步成功写 ledger + ack，前台不再重复弹；
 * - 场景 B：前台先发现（ledger 已记录）→ 后台事件消费不重复弹；
 * - 场景 C：真正的新变化（新 signature）→ 允许再次通知；
 * - sync 失败：事件不 ack、保留可重试、不重复弹已展示通知；
 * - focus/pageshow/visibilitychange 连发合并（single-flight）：同步只执行一次；
 * - 账号隔离：其他 scope 事件不消费；聚合：多事件一次同步。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeBackgroundEventsOnce,
  eventTypeToDomain,
  hasUnconsumedPresentedEvent,
  setBackgroundInboxPlatform,
  toInboxEvent,
  type BackgroundInboxPlatform,
  type DomainSyncResult
} from './background_notification'
import {
  buildLedgerEventKey,
  hasLedgerEntry,
  readLedgerState
} from './notification_event_ledger'

/** 顶层 mock：defaultSyncDomain 的 Tauri 运行时探测与 sync_grades 调用（按用例切换返回值）。 */
const nativeMock = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => false),
  isCapacitorRuntime: vi.fn(() => false),
  invokeNative: vi.fn(async () => ({}))
}))
vi.mock('../platform/native', () => nativeMock)

const installStorage = () => {
  const storage = new Map<string, string>()
  const api = {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] || null,
    get length() {
      return storage.size
    }
  }
  vi.stubGlobal('localStorage', api)
  return storage
}

/** 构造 native 事件（Rust BackgroundEvent JSON 结构）。 */
const makeEvent = (
  id: string,
  opts: {
    signature: string
    scope?: string
    presented?: boolean
    kind?: string
    type?: string
  }
): Record<string, unknown> => {
  const { signature, scope = 's1', presented = true, kind = 'grades_changed', type = 'grades-changed' } = opts
  return {
    schema: 1,
    id,
    source: 'android',
    kind,
    scope,
    occurredAt: '2026-08-13T08:00:00Z',
    payload: {
      type,
      source: 'android-workmanager',
      targetView: 'grades',
      detectedAt: '2026-08-13T08:00:00Z',
      presented,
      signature,
      meta: { notificationShown: presented }
    }
  }
}

/** fake inbox 平台（记录 peek/ack 调用与数据）。 */
class FakeInbox implements BackgroundInboxPlatform {
  events: unknown[] = []
  acked: string[] = []
  peekCalls = 0
  failPeek = false
  failAck = false

  async peek(): Promise<unknown[]> {
    this.peekCalls += 1
    if (this.failPeek) throw new Error('peek 失败')
    return [...this.events]
  }

  async ack(ids: string[]): Promise<boolean> {
    if (this.failAck) throw new Error('ack 失败')
    this.acked.push(...ids)
    return true
  }
}

const okSync = vi.fn(async (): Promise<DomainSyncResult> => ({ ok: true }))
const failSync = vi.fn(async (): Promise<DomainSyncResult> => ({ ok: false, error: '网络不可用' }))

beforeEach(() => {
  installStorage()
  setBackgroundInboxPlatform(null)
  vi.clearAllMocks()
})

afterEach(() => {
  setBackgroundInboxPlatform(null)
  vi.unstubAllGlobals()
})

describe('toInboxEvent 归一化', () => {
  it('合并外层 id/kind/scope 与 payload 契约字段；source 映射为 #609 枚举', () => {
    const evt = toInboxEvent(makeEvent('evt-1', { signature: 'S2' }))
    expect(evt).not.toBeNull()
    expect(evt?.inboxId).toBe('evt-1')
    expect(evt?.kind).toBe('grades_changed')
    expect(evt?.scope).toBe('s1')
    expect(evt?.type).toBe('grades-changed')
    expect(evt?.presented).toBe(true)
    expect(evt?.signature).toBe('S2')
    expect(evt?.source).toBe('android-workmanager')
    expect(evt?.targetView).toBe('grades')
  })

  it('结构不符（缺 id/signature/detectedAt）返回 null，调用方按无事件处理', () => {
    expect(toInboxEvent(null)).toBeNull()
    expect(toInboxEvent('string')).toBeNull()
    expect(toInboxEvent({ id: 'x' })).toBeNull()
    expect(toInboxEvent({ id: 'x', payload: { signature: 'S2' } })).toBeNull()
    expect(toInboxEvent({ id: 'x', payload: { signature: 'S2', detectedAt: '2026-08-13T08:00:00Z' } })).not.toBeNull()
  })

  it('未知/敏感字段被白名单丢弃（认证材料不得进入前端模型）', () => {
    const raw = {
      ...makeEvent('evt-secure', { signature: 'S2' }),
      password: 'p@ss',
      cookie: 'secret-cookie',
      authorization: 'Bearer xxx'
    }
    const evt = toInboxEvent(raw)
    expect(evt).not.toBeNull()
    const json = JSON.stringify(evt)
    expect(json).not.toContain('p@ss')
    expect(json).not.toContain('cookie')
    expect(json).not.toContain('Bearer')
  })
})

describe('eventTypeToDomain', () => {
  it('首批仅 grades-changed 有完整业务域；synthetic/unknown 无业务域', () => {
    expect(eventTypeToDomain('grades-changed')).toBe('grades')
    expect(eventTypeToDomain('exams-changed')).toBe('exams')
    expect(eventTypeToDomain('school-message')).toBe('school-message')
    expect(eventTypeToDomain('unknown')).toBe('')
  })
})

describe('场景 A：后台先发现（presented=true）→ 前台不再重复弹', () => {
  it('同步成功 → 写 ledger（grades:S2）+ 按 id ack + 统计 suppressed', async () => {
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-a1', { signature: 'S2' })]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', reason: 'resume', syncDomain: okSync })

    expect(result.success).toBe(true)
    expect(result.matched).toBe(1)
    expect(result.domains).toEqual(['grades'])
    expect(result.synced).toBe(1)
    expect(result.suppressed).toBe(1)
    expect(result.acked).toBe(1)
    expect(okSync).toHaveBeenCalledTimes(1)
    expect(okSync).toHaveBeenCalledWith('grades')
    // ledger 已记录「S2 已通知」→ 前台 checkGrades 查询命中，不再弹第二条
    expect(hasLedgerEntry('s1', buildLedgerEventKey('grades', 'S2'))).toBe(true)
    // 事件按 native id 精确 ack
    expect(inbox.acked).toEqual(['evt-a1'])
  })

  it('ledger 写入后前台抑制查询命中（前台不再重复弹）', async () => {
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-a1', { signature: 'S2' })]
    setBackgroundInboxPlatform(inbox)
    await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })
    // 模拟前台 checkGrades：同 eventKey 查 ledger → 命中（不 queue 通知）
    expect(hasLedgerEntry('s1', buildLedgerEventKey('grades', 'S2'))).toBe(true)
  })
})

describe('场景 B：前台先发现（ledger 已记录）→ 后台事件不重复弹', () => {
  it('ledger 已有 grades:S2（前台弹过）→ 消费同签名事件时幂等刷新，不产生第二条通知记录', async () => {
    // 前台先弹：先写 ledger
    const { recordLedgerEntry } = await import('./notification_event_ledger')
    recordLedgerEntry('s1', 'grades:S2', 'grades', '2026-08-12T10:00:00.000Z')

    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-b1', { signature: 'S2' })]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })

    // 同 eventKey 只保留一条账本记录（幂等，无重复通知）
    const state = readLedgerState('s1')
    const s2Entries = state.entries.filter((entry) => entry.eventKey === 'grades:S2')
    expect(s2Entries).toHaveLength(1)
    expect(result.acked).toBe(1)
  })
})

describe('场景 C：真正的新变化（S2 → S3）仍可再次通知', () => {
  it('去重粒度为 signature 而非当天：S3 与 S2 各自独立记录，互不抑制', async () => {
    const { recordLedgerEntry } = await import('./notification_event_ledger')
    recordLedgerEntry('s1', 'grades:S2', 'grades', '2026-08-13T08:00:00.000Z')

    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-c1', { signature: 'S3' })]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })

    // S3 是新 signature：作为独立「已通知」记录入账（未被「已通知过成绩」一刀切抑制）
    expect(result.suppressed).toBe(1)
    const state = readLedgerState('s1')
    expect(state.entries.map((entry) => entry.eventKey).sort()).toEqual(['grades:S2', 'grades:S3'])
    expect(inbox.acked).toEqual(['evt-c1'])
  })

  it('未通知过的 S3（presented=false）不入账：前台 checkGrades 对 S3 仍可正常弹通知', async () => {
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-c2', { signature: 'S3', presented: false })]
    setBackgroundInboxPlatform(inbox)

    await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })

    // 从未展示过通知 → ledger 无记录 → 前台 checkGrades 检测到 S3 变化时可正常通知（场景 C）
    expect(hasLedgerEntry('s1', 'grades:S3')).toBe(false)
    expect(inbox.acked).toEqual(['evt-c2'])
  })
})

describe('完整同步失败语义（sync 失败不删 event）', () => {
  it('sync 失败 → 不 ack、事件保留、错误记录、不写 ledger、不重复弹已展示通知', async () => {
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-f1', { signature: 'S2' })]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: failSync })

    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.synced).toBe(0)
    expect(result.suppressed).toBe(0)
    // 核心：事件不得被 ack（保留在 inbox，下次 resume 重试补同步）
    expect(inbox.acked).toHaveLength(0)
    // 未同步成功 → 不得写「已通知」账本（通知状态与同步状态独立）
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(false)
  })

  it('多个域中一个失败不影响其他域成功消费（失败域事件保留）', async () => {
    const inbox = new FakeInbox()
    inbox.events = [
      makeEvent('evt-ok', { signature: 'S2' }),
      makeEvent('evt-bad', { signature: 'S3', type: 'exams-changed' })
    ]
    setBackgroundInboxPlatform(inbox)
    const sync = vi.fn(async (domain: string): Promise<DomainSyncResult> =>
      domain === 'grades' ? { ok: true } : { ok: false, error: '考试域暂不可用' }
    )

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: sync })

    expect(result.synced).toBe(1)
    expect(result.acked).toBe(1) // 仅 grades 事件被 ack
    expect(inbox.acked).toEqual(['evt-ok'])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(true)
  })
})

describe('连发合并（single-flight）', () => {
  it('同一账号并发调用共享同一执行：peek 与 sync 各一次', async () => {
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-m1', { signature: 'S2' })]
    setBackgroundInboxPlatform(inbox)

    let resolveSync!: (value: DomainSyncResult) => void
    const sync = vi.fn(() => new Promise<DomainSyncResult>((resolve) => {
      resolveSync = resolve
    }))

    const p1 = consumeBackgroundEventsOnce({ studentId: 's1', reason: 'visibilitychange', syncDomain: sync })
    const p2 = consumeBackgroundEventsOnce({ studentId: 's1', reason: 'focus', syncDomain: sync })
    const p3 = consumeBackgroundEventsOnce({ studentId: 's1', reason: 'pageshow', syncDomain: sync })

    // 等微任务推进：task 需先完成 async peek 才进入 syncDomain
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(resolveSync).not.toBeNull()
    resolveSync({ ok: true })
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])

    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(inbox.peekCalls).toBe(1)
    expect(inbox.acked).toEqual(['evt-m1'])
  })

  it('不同账号互不合并（各自独立执行）', async () => {
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-x1', { signature: 'S2', scope: 'account-b' })]
    setBackgroundInboxPlatform(inbox)

    const sync = vi.fn(async (): Promise<DomainSyncResult> => ({ ok: true }))
    const [ra, rb] = await Promise.all([
      consumeBackgroundEventsOnce({ studentId: 'account-a', syncDomain: sync }),
      consumeBackgroundEventsOnce({ studentId: 'account-b', syncDomain: sync })
    ])
    expect(ra.matched).toBe(0) // account-b 的事件不进入 account-a 消费
    expect(rb.matched).toBe(1)
    expect(sync).toHaveBeenCalledTimes(1) // 只有 account-b 需要同步
    expect(inbox.acked).toEqual(['evt-x1'])
  })
})

describe('账号隔离与聚合', () => {
  it('其他 scope 的事件不消费（不 sync 不 ack）；空 scope 事件视为当前账号', async () => {
    const inbox = new FakeInbox()
    inbox.events = [
      makeEvent('evt-other', { signature: 'S9', scope: 'someone-else' }),
      makeEvent('evt-null-scope', { signature: 'S2', scope: '' })
    ]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })

    expect(result.matched).toBe(1) // 只匹配空 scope 事件
    expect(result.acked).toBe(1)
    expect(inbox.acked).toEqual(['evt-null-scope'])
    expect(hasLedgerEntry('s1', 'grades:S9')).toBe(false)
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(true)
  })

  it('多个同域事件聚合：一次完整同步 + 全部写 ledger + 全部 ack', async () => {
    const inbox = new FakeInbox()
    inbox.events = [
      makeEvent('evt-1', { signature: 'S2' }),
      makeEvent('evt-2', { signature: 'S2' }),
      makeEvent('evt-3', { signature: 'S3' })
    ]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })

    expect(okSync).toHaveBeenCalledTimes(1) // 聚合：只同步一次
    expect(result.synced).toBe(1)
    expect(result.acked).toBe(3)
    expect(inbox.acked).toEqual(['evt-1', 'evt-2', 'evt-3'])
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(true)
    expect(hasLedgerEntry('s1', 'grades:S3')).toBe(true)
  })

  it('非业务事件（synthetic_run / unknown）直接 ack，不写 ledger、不触发同步', async () => {
    const inbox = new FakeInbox()
    inbox.events = [
      makeEvent('evt-syn', { signature: 'synthetic-1', kind: 'synthetic_run', type: 'unknown' })
    ]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })

    expect(result.domains).toEqual([])
    expect(okSync).not.toHaveBeenCalled()
    expect(result.acked).toBe(1)
    expect(inbox.acked).toEqual(['evt-syn'])
    expect(readLedgerState('s1').entries).toHaveLength(0)
  })

  it('presented=false（native 未展示通知）不写「已通知」账本：前台对新变化仍可正常通知', async () => {
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-not-shown', { signature: 'S2', presented: false })]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })

    expect(result.suppressed).toBe(0)
    expect(result.acked).toBe(1)
    expect(inbox.acked).toEqual(['evt-not-shown'])
    // 未展示过通知 → ledger 不得记录「已通知」
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(false)
  })
})

describe('通知前抑制兜底查询（hasUnconsumedPresentedEvent）', () => {
  it('inbox 存在同账号未消费的已展示事件 → true 且顺手写 ledger（时序兜底）', async () => {
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-p1', { signature: 'S2' })]
    setBackgroundInboxPlatform(inbox)

    const found = await hasUnconsumedPresentedEvent('s1', 'grades')
    expect(found).toBe(true)
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(true)
  })

  it('无已展示事件 / 其他 scope → false', async () => {
    const inbox = new FakeInbox()
    inbox.events = [
      makeEvent('evt-not-shown', { signature: 'S2', presented: false }),
      makeEvent('evt-other', { signature: 'S3', scope: 'someone-else' })
    ]
    setBackgroundInboxPlatform(inbox)

    expect(await hasUnconsumedPresentedEvent('s1', 'grades')).toBe(false)
  })

  it('读取失败按无事件安全降级（正常走前台检测，不抛异常）', async () => {
    const inbox = new FakeInbox()
    inbox.failPeek = true
    setBackgroundInboxPlatform(inbox)
    expect(await hasUnconsumedPresentedEvent('s1', 'grades')).toBe(false)
  })
})

describe('默认域同步器（Rust sync_grades）', () => {
  it('grades 域走 Rust sync_grades；非 Tauri 运行时报错且事件不 ack', async () => {
    vi.mocked(nativeMock.isTauriRuntime).mockReturnValue(false)
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-d1', { signature: 'S2' })]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: undefined })

    expect(result.success).toBe(false)
    expect(nativeMock.invokeNative).not.toHaveBeenCalled()
    expect(inbox.acked).toHaveLength(0) // 同步失败 → 不 ack
    expect(result.errors.join()).toContain('grades')
  })

  it('Tauri 运行时调用 invokeNative(sync_grades) 成功后 ack', async () => {
    vi.mocked(nativeMock.isTauriRuntime).mockReturnValue(true)
    nativeMock.invokeNative.mockClear()
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-d2', { signature: 'S2' })]
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: undefined })

    expect(result.success).toBe(true)
    expect(nativeMock.invokeNative).toHaveBeenCalledWith('sync_grades', { currentOnly: false })
    expect(inbox.acked).toEqual(['evt-d2'])
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(true)
  })
})

describe('边界输入', () => {
  it('空 studentId 直接跳过', async () => {
    const inbox = new FakeInbox()
    setBackgroundInboxPlatform(inbox)
    const result = await consumeBackgroundEventsOnce({ studentId: '', syncDomain: okSync })
    expect(result.skipped).toBe('missing-student-id')
    expect(inbox.peekCalls).toBe(0)
    expect(okSync).not.toHaveBeenCalled()
  })

  it('peek 失败返回错误结果且不崩坏（无事件可消费）', async () => {
    const inbox = new FakeInbox()
    inbox.failPeek = true
    setBackgroundInboxPlatform(inbox)
    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(okSync).not.toHaveBeenCalled()
    expect(inbox.acked).toHaveLength(0)
  })

  it('ack 失败返回错误但事件已记录（重复处理幂等安全）', async () => {
    const inbox = new FakeInbox()
    inbox.events = [makeEvent('evt-ack-fail', { signature: 'S2' })]
    inbox.failAck = true
    setBackgroundInboxPlatform(inbox)

    const result = await consumeBackgroundEventsOnce({ studentId: 's1', syncDomain: okSync })
    expect(result.success).toBe(false)
    expect(result.errors.join()).toContain('确认后台事件')
    // ledger 已写：即使 ack 失败导致事件重复处理，也不会重复弹通知
    expect(hasLedgerEntry('s1', 'grades:S2')).toBe(true)
  })
})
