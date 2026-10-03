/**
 * backend_failover 状态机单测（契约 §6.3）。
 * 覆盖：主组优先 / 冷却跳过 / 冷却到期回归 / 全冷却回退 / 持久化 / 事件广播 / 存储不可用降级。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKEND_ENDPOINTS_UPDATED_EVENT,
  BACKEND_FAILED_GROUPS_KEY,
  isGroupCooling,
  markGroupFailed,
  markGroupSucceeded,
  planAttemptOrder,
  readFailoverSnapshot,
  resetBackendFailover,
  writeFailoverSnapshot
} from './backend_failover'
import { DEFAULT_BACKEND_FAILOVER, type BackendGroup } from './backend_endpoints'

const createMemoryStorage = (): Storage => {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value))
    },
    removeItem(key: string) {
      map.delete(key)
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    }
  } as Storage
}

const GROUPS: BackendGroup[] = [
  { id: 'mini', base: 'https://mini.hbut.site', enabled: true, paths: {} },
  { id: 'hf-prod', base: 'https://mini-hbut-ocr-service.hf.space', enabled: true, paths: {} }
]

const globalRef = globalThis as Record<string, unknown>
let originalLocalStorage: unknown
let originalDispatchEvent: unknown
let originalCustomEvent: unknown

beforeEach(() => {
  originalLocalStorage = globalRef.localStorage
  originalDispatchEvent = globalRef.dispatchEvent
  originalCustomEvent = globalRef.CustomEvent
  globalRef.localStorage = createMemoryStorage()
})

afterEach(() => {
  if (originalLocalStorage === undefined) delete globalRef.localStorage
  else globalRef.localStorage = originalLocalStorage
  if (originalDispatchEvent === undefined) delete globalRef.dispatchEvent
  else globalRef.dispatchEvent = originalDispatchEvent
  if (originalCustomEvent === undefined) delete globalRef.CustomEvent
  else globalRef.CustomEvent = originalCustomEvent
  vi.restoreAllMocks()
})

describe('planAttemptOrder（主组优先，冷却跳过）', () => {
  it('默认按数组顺序返回全部候选', () => {
    const order = planAttemptOrder({ groups: GROUPS, failover: DEFAULT_BACKEND_FAILOVER })
    expect(order.map((group) => group.id)).toEqual(['mini', 'hf-prod'])
  })

  it('failover.enabled=false 时只返回首组（等价旧单端点行为）', () => {
    const order = planAttemptOrder({
      groups: GROUPS,
      failover: { ...DEFAULT_BACKEND_FAILOVER, enabled: false }
    })
    expect(order.map((group) => group.id)).toEqual(['mini'])
  })

  it('过滤 enabled:false 的组', () => {
    const groups: BackendGroup[] = [
      { id: 'off', base: 'https://off.example.com', enabled: false, paths: {} },
      ...GROUPS
    ]
    const order = planAttemptOrder({ groups, failover: DEFAULT_BACKEND_FAILOVER })
    expect(order.map((group) => group.id)).toEqual(['mini', 'hf-prod'])
  })

  it('主组冷却时只返回兜底组', () => {
    markGroupFailed('mini', DEFAULT_BACKEND_FAILOVER)
    const order = planAttemptOrder({ groups: GROUPS, failover: DEFAULT_BACKEND_FAILOVER })
    expect(order.map((group) => group.id)).toEqual(['hf-prod'])
  })

  it('冷却到期后主组自动回归候选（无需轮询）', () => {
    const now = Date.now()
    markGroupFailed('mini', { ...DEFAULT_BACKEND_FAILOVER, failureTtlSeconds: 30 }, now)
    // 冷却中
    expect(
      planAttemptOrder({ groups: GROUPS, failover: DEFAULT_BACKEND_FAILOVER, now: now + 1000 }).map(
        (group) => group.id
      )
    ).toEqual(['hf-prod'])
    // 冷却到期（31s 后）
    expect(
      planAttemptOrder({
        groups: GROUPS,
        failover: DEFAULT_BACKEND_FAILOVER,
        now: now + 31_000
      }).map((group) => group.id)
    ).toEqual(['mini', 'hf-prod'])
  })

  it('全部冷却时优先返回上次成功的组', () => {
    markGroupSucceeded('hf-prod')
    markGroupFailed('mini', { ...DEFAULT_BACKEND_FAILOVER, failureTtlSeconds: 600 })
    markGroupFailed('hf-prod', { ...DEFAULT_BACKEND_FAILOVER, failureTtlSeconds: 600 })
    const order = planAttemptOrder({ groups: GROUPS, failover: DEFAULT_BACKEND_FAILOVER })
    expect(order.map((group) => group.id)).toEqual(['hf-prod'])
  })

  it('全部冷却且无成功记录时返回首组（保证至少尝试一次）', () => {
    markGroupFailed('mini', { ...DEFAULT_BACKEND_FAILOVER, failureTtlSeconds: 600 })
    markGroupFailed('hf-prod', { ...DEFAULT_BACKEND_FAILOVER, failureTtlSeconds: 600 })
    const order = planAttemptOrder({ groups: GROUPS, failover: DEFAULT_BACKEND_FAILOVER })
    expect(order.map((group) => group.id)).toEqual(['mini'])
  })

  it('maxAttemptsPerRequest 截断候选数', () => {
    const order = planAttemptOrder({
      groups: GROUPS,
      failover: { ...DEFAULT_BACKEND_FAILOVER, maxAttemptsPerRequest: 1 }
    })
    expect(order.map((group) => group.id)).toEqual(['mini'])
  })

  it('空组列表返回空', () => {
    expect(planAttemptOrder({ groups: [], failover: DEFAULT_BACKEND_FAILOVER })).toEqual([])
  })
})

describe('冷却表读写与持久化', () => {
  it('markGroupFailed 写入冷却截止时间', () => {
    const now = Date.now()
    markGroupFailed('mini', { ...DEFAULT_BACKEND_FAILOVER, failureTtlSeconds: 120 }, now)
    const snapshot = readFailoverSnapshot(now)
    expect(snapshot.failedUntil.mini).toBe(now + 120_000)
    expect(isGroupCooling('mini', now)).toBe(true)
    expect(isGroupCooling('mini', now + 121_000)).toBe(false)
  })

  it('冷却状态跨"重启"保留（localStorage 持久化）', () => {
    markGroupFailed('mini', DEFAULT_BACKEND_FAILOVER)
    // 模拟重启：仅重新读快照（内存态不保留，storage 保留）
    expect(isGroupCooling('mini')).toBe(true)
    expect(readFailoverSnapshot().failedUntil.mini).toBeGreaterThan(Date.now())
  })

  it('清空存储后冷却失效', () => {
    markGroupFailed('mini', DEFAULT_BACKEND_FAILOVER)
    resetBackendFailover()
    expect(isGroupCooling('mini')).toBe(false)
    expect(globalRef.localStorage as Storage).toBeTruthy()
    expect((globalRef.localStorage as Storage).getItem(BACKEND_FAILED_GROUPS_KEY)).toBeNull()
  })

  it('超过 24h 的陈旧记录被清理', () => {
    const now = Date.now()
    writeFailoverSnapshot(
      { failedUntil: { old: now - 25 * 60 * 60 * 1000 }, lastSucceededGroupId: 'mini' },
      now
    )
    const snapshot = readFailoverSnapshot(now)
    expect(snapshot.failedUntil.old).toBeUndefined()
    expect(snapshot.lastSucceededGroupId).toBe('mini')
  })

  it('存储损坏时安全降级为空快照', () => {
    ;(globalRef.localStorage as Storage).setItem(BACKEND_FAILED_GROUPS_KEY, '{ not json')
    expect(readFailoverSnapshot()).toEqual({ failedUntil: {}, lastSucceededGroupId: '' })
    expect(isGroupCooling('mini')).toBe(false)
  })

  it('空快照必须是独立新对象：历史失败记录不得污染空读取（回归护栏）', () => {
    markGroupFailed('mini', DEFAULT_BACKEND_FAILOVER)
    resetBackendFailover()
    // 清空后连续两次读取都应干净，且 failedUntil 不是同一引用
    const first = readFailoverSnapshot()
    const second = readFailoverSnapshot()
    expect(first.failedUntil).toEqual({})
    expect(second.failedUntil).toEqual({})
    expect(first.failedUntil).not.toBe(second.failedUntil)
  })

  it('无 localStorage 时不抛错且返回空快照', () => {
    delete globalRef.localStorage
    expect(() => markGroupFailed('mini', DEFAULT_BACKEND_FAILOVER)).not.toThrow()
    expect(readFailoverSnapshot()).toEqual({ failedUntil: {}, lastSucceededGroupId: '' })
    expect(
      planAttemptOrder({ groups: GROUPS, failover: DEFAULT_BACKEND_FAILOVER }).map((g) => g.id)
    ).toEqual(['mini', 'hf-prod'])
  })
})

describe('markGroupSucceeded（成功固化与事件）', () => {
  it('清除该组冷却并记录最后成功组', () => {
    markGroupFailed('hf-prod', DEFAULT_BACKEND_FAILOVER)
    expect(isGroupCooling('hf-prod')).toBe(true)
    markGroupSucceeded('hf-prod')
    expect(isGroupCooling('hf-prod')).toBe(false)
    expect(readFailoverSnapshot().lastSucceededGroupId).toBe('hf-prod')
  })

  it('成功组变化时广播事件（含 detail.groupId）', () => {
    const dispatched: Array<{ type: string; detail?: Record<string, unknown> }> = []
    class FakeCustomEvent {
      detail: Record<string, unknown> | undefined
      constructor(
        public type: string,
        init?: { detail?: Record<string, unknown> }
      ) {
        this.detail = init?.detail
      }
    }
    globalRef.CustomEvent = FakeCustomEvent
    globalRef.dispatchEvent = (event: unknown) => {
      const typed = event as { type: string; detail?: Record<string, unknown> }
      dispatched.push({ type: typed.type, detail: typed.detail })
      return true
    }

    markGroupSucceeded('hf-prod')
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]).toEqual({
      type: BACKEND_ENDPOINTS_UPDATED_EVENT,
      detail: { groupId: 'hf-prod' }
    })
  })

  it('成功组不变时不广播', () => {
    markGroupSucceeded('mini')
    const dispatch = vi.fn(() => true)
    class FakeCustomEvent {
      constructor(public type: string) {}
    }
    globalRef.CustomEvent = FakeCustomEvent
    globalRef.dispatchEvent = dispatch
    markGroupSucceeded('mini')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('空 groupId 安全返回', () => {
    expect(markGroupSucceeded('')).toEqual({ changed: false })
    expect(markGroupSucceeded(null as unknown as string)).toEqual({ changed: false })
  })
})
