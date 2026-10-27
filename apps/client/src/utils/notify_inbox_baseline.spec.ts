/**
 * #1101 / #1103 / #1104（发送侧）/ Epic #1106 行为回归：
 * - 去重快照 ids 只增不减：短抓取不得抹掉已知 id（否则下次完整抓取整段重发）；
 * - 只有「可信完整抓取」才点亮首次基线；不可信空结果不得洗掉基线；
 * - 可信空基线成立后，新消息仍能正常推送一次；
 * - 学习通登录方式下「学校消息」渠道让位给「学习通通知」渠道（同一条消息不双发）；
 * - 收件箱类通知单轮上限 3 条 + 1 条合并摘要（成绩等时效性通知不受影响）；
 * - 「标记已读」不得把首次基线提前点亮（#1102）。
 *
 * 这些用例锁定的正是「重登 / 切号后通知爆炸式重发」的根因，别再退回覆盖式写入。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./debug_logger', () => ({ pushDebugLog: vi.fn() }))
vi.mock('./widget_bridge', () => ({
  writeElectricityToWidget: vi.fn(),
  writeExamToWidget: vi.fn()
}))

/** 收件箱抓取返回值（按用例切换），get_cookies 等其它命令返回固定安全值。 */
let inboxResponse: unknown = null
const invokeNativeMock = vi.fn(async (cmd: string, _args?: unknown) => {
  if (cmd === 'get_cookies') return 'Edu_Client=1'
  if (cmd === 'school_inbox_fetch') return inboxResponse
  return null
})

vi.mock('../platform/native', () => ({
  invokeNative: (cmd: string, args?: unknown) => invokeNativeMock(cmd, args),
  isTauriRuntime: () => true
}))

interface NotifyPayloadLike {
  title?: string
  body?: string
  domain?: string
}

/** 本地通知发送记录（节流用例断言用）。 */
const sendLocalNotificationMock = vi.fn(async (_payload: NotifyPayloadLike) => true)

vi.mock('../platform', () => ({
  platformBridge: {
    getNotificationPermission: async () => 'granted',
    requestNotificationPermission: async () => 'granted',
    ensureNotificationChannel: async () => undefined,
    sendLocalNotification: (payload: NotifyPayloadLike) => sendLocalNotificationMock(payload)
  },
  getRuntime: () => 'tauri'
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

const SID = '20260001'
const SCHOOL_KEY = `hbu_notify_school_inbox_state:${SID}`
const CHAOXING_KEY = `hbu_notify_chaoxing_inbox_state:${SID}`

const item = (id: string, isRead = false) => ({
  id,
  title: `标题 ${id}`,
  summary: '摘要',
  isRead,
  source: 'chaoxing'
})

/** 组装 school_inbox_fetch 的响应；complete 缺省 = 旧版语义（视为可信）。 */
const response = (items: unknown[], complete?: boolean) => ({
  items,
  source: 'chaoxing',
  fetchedAt: '2026-10-24T00:00:00Z',
  ...(complete === undefined ? {} : { complete })
})

const readState = (memory: MemoryStorage, key: string) =>
  JSON.parse(memory.getItem(key) || 'null') as {
    schema?: number
    initialized?: boolean
    ids?: string[]
    untrustedStreak?: number
  } | null

const loadChecks = async () => {
  vi.resetModules()
  return import('./notify_center_checks.js')
}

const baseSettings = { enableSchoolInbox: true, enableChaoxingInbox: true } as never

describe('收件箱去重基线加固（Epic #1106）', () => {
  let memory: MemoryStorage

  beforeEach(() => {
    memory = createMemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true })
    invokeNativeMock.mockClear()
    sendLocalNotificationMock.mockClear()
    inboxResponse = null
    localStorage.setItem('hbu_login_method', 'portal_password')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('短抓取不得缩短已知 id（#1101 核心）', async () => {
    const { checkChaoxingInbox } = await loadChecks()

    // 第一次：3 条未读 → 首次同步只建基线
    inboxResponse = response([item('c1'), item('c2'), item('c3')], true)
    const queue1: unknown[] = []
    const r1 = await checkChaoxingInbox(SID, baseSettings, queue1 as never)
    expect(r1.baseline).toBe(true)
    expect(queue1.length).toBe(0)
    expect(readState(memory, CHAOXING_KEY)?.ids?.length).toBe(3)

    // 第二次：只抓到 1 条（翻页中断 / 浅抓）→ 快照不得被洗短
    inboxResponse = response([item('c1')], true)
    const queue2: unknown[] = []
    await checkChaoxingInbox(SID, baseSettings, queue2 as never)
    const afterShort = readState(memory, CHAOXING_KEY)
    expect(afterShort?.ids).toEqual(expect.arrayContaining(['c1', 'c2', 'c3']))
    expect(queue2.length).toBe(0)

    // 第三次：完整 3 条回来 → 已记录的 id 不得再次入队
    inboxResponse = response([item('c1'), item('c2'), item('c3')], true)
    const queue3: unknown[] = []
    await checkChaoxingInbox(SID, baseSettings, queue3 as never)
    expect(queue3.length).toBe(0)
  }, 30_000)

  it('不可信空结果不得点亮首次基线（#1101）', async () => {
    const { checkChaoxingInbox } = await loadChecks()

    // complete=false + 空列表：不写 initialized，不推送
    inboxResponse = response([], false)
    const queue0: unknown[] = []
    await checkChaoxingInbox(SID, baseSettings, queue0 as never)
    expect(readState(memory, CHAOXING_KEY)?.initialized).not.toBe(true)
    expect(queue0.length).toBe(0)

    // 随后的可信完整抓取仍应被当作首次同步（只建基线，不推历史）
    inboxResponse = response([item('c1'), item('c2'), item('c3')], true)
    const queue1: unknown[] = []
    const r1 = await checkChaoxingInbox(SID, baseSettings, queue1 as never)
    expect(r1.baseline).toBe(true)
    expect(queue1.length).toBe(0)
  }, 30_000)

  it('不可信抓取不推进已知 id：其中的新消息留给后续可信抓取通知（#1101）', async () => {
    const { checkChaoxingInbox } = await loadChecks()

    inboxResponse = response([item('k1')], true)
    await checkChaoxingInbox(SID, baseSettings, [] as never)

    // 不可信抓取里带着新消息 k2 —— 不得并入已知 id（否则 k2 被永久吞掉）
    inboxResponse = response([item('k2'), item('k1')], false)
    const q1: unknown[] = []
    await checkChaoxingInbox(SID, baseSettings, q1 as never)
    expect(q1.length).toBe(0)
    expect(readState(memory, CHAOXING_KEY)?.ids).toEqual(['k1'])

    // 下一次可信抓取 → k2 正常通知一次
    inboxResponse = response([item('k2'), item('k1')], true)
    const q2: unknown[] = []
    const r = await checkChaoxingInbox(SID, baseSettings, q2 as never)
    expect(r.triggered).toBe(1)
    expect(q2.length).toBe(1)
  }, 30_000)

  it('可信空基线成立后，新消息仍能正常推送一次（#1101）', async () => {
    const { checkChaoxingInbox } = await loadChecks()

    inboxResponse = response([], true)
    await checkChaoxingInbox(SID, baseSettings, [] as never)
    expect(readState(memory, CHAOXING_KEY)?.initialized).toBe(true)

    inboxResponse = response([item('c9')], true)
    const queue: unknown[] = []
    const r = await checkChaoxingInbox(SID, baseSettings, queue as never)
    expect(r.baseline).toBe(false)
    expect(r.triggered).toBe(1)
    expect(queue.length).toBe(1)

    // 再检查一次不得重复推送
    const queueAgain: unknown[] = []
    await checkChaoxingInbox(SID, baseSettings, queueAgain as never)
    expect(queueAgain.length).toBe(0)
  }, 30_000)

  it('深→浅→深往返不重复入队（#1101）', async () => {
    const { checkChaoxingInbox } = await loadChecks()

    inboxResponse = response([1, 2, 3, 4, 5].map((n) => item(`d${n}`)), true)
    await checkChaoxingInbox(SID, baseSettings, [] as never)

    inboxResponse = response([item('d1'), item('d2')], true)
    await checkChaoxingInbox(SID, baseSettings, [] as never)

    inboxResponse = response([1, 2, 3, 4, 5].map((n) => item(`d${n}`)).concat([item('d6')]), true)
    const queue: unknown[] = []
    const r = await checkChaoxingInbox(SID, baseSettings, queue as never)
    expect(r.triggered).toBe(1)
    expect(queue.length).toBe(1)
  }, 30_000)

  it('连续 3 次不可信后降级为已初始化，避免永久静默（#1101 护栏）', async () => {
    const { checkChaoxingInbox } = await loadChecks()

    for (let i = 0; i < 3; i += 1) {
      inboxResponse = response([item('u1')], false)
      await checkChaoxingInbox(SID, baseSettings, [] as never)
    }
    const downgraded = readState(memory, CHAOXING_KEY)
    expect(downgraded?.initialized).toBe(true)
    expect(downgraded?.untrustedStreak).toBe(0)

    // 降级已把 u1 计入基线；可信抓取到来时只有真正的新消息 u2 会被推送
    inboxResponse = response([item('u1'), item('u2')], true)
    const queue: unknown[] = []
    const r = await checkChaoxingInbox(SID, baseSettings, queue as never)
    expect(r.triggered).toBe(1)
    expect(queue.length).toBe(1)
  }, 30_000)

  it('学习通登录方式下学校消息渠道让位，学习通渠道单发（#1103）', async () => {
    localStorage.setItem('hbu_login_method', 'chaoxing_qr_temp')
    const { checkSchoolInbox, checkChaoxingInbox } = await loadChecks()

    inboxResponse = response([item('x1')], true)
    const schoolQueue: unknown[] = []
    const school = await checkSchoolInbox(SID, baseSettings, schoolQueue as never)
    expect(school.enabled).toBe(false)
    expect(String(school.reason)).toContain('chaoxing')
    expect(schoolQueue.length).toBe(0)
    // 学校消息渠道不得发起抓取
    expect(invokeNativeMock.mock.calls.some((call) => call[0] === 'school_inbox_fetch')).toBe(false)

    // 学习通渠道：首次建基线
    const cxQueue: unknown[] = []
    await checkChaoxingInbox(SID, baseSettings, cxQueue as never)
    expect(cxQueue.length).toBe(0)

    // 新消息 → 只由学习通渠道发一次
    inboxResponse = response([item('x1'), item('x2')], true)
    const cxQueue2: unknown[] = []
    const cx = await checkChaoxingInbox(SID, baseSettings, cxQueue2 as never)
    expect(cx.triggered).toBe(1)
    expect(cxQueue2.length).toBe(1)
  }, 30_000)

  it('学习通登录方式下关掉学习通渠道时，学校消息渠道接回该来源（不漏推）', async () => {
    localStorage.setItem('hbu_login_method', 'chaoxing')
    const { checkSchoolInbox } = await loadChecks()

    inboxResponse = response([item('y1')], true)
    const queue: unknown[] = []
    const r = await checkSchoolInbox(
      SID,
      { enableSchoolInbox: true, enableChaoxingInbox: false } as never,
      queue as never
    )
    // 学习通渠道关闭 → 学校消息渠道必须接管这份来源，否则该账号一条收件箱通知都收不到
    expect(r.enabled).toBe(true)
    expect(r.baseline).toBe(true)
    expect(invokeNativeMock.mock.calls.some((call) => call[0] === 'school_inbox_fetch')).toBe(true)
  }, 30_000)

  it('收件箱类通知单轮最多 3 条 + 1 条摘要，其它类型不受限（#1104）', async () => {
    const { sendQueuedNotifications } = await loadChecks()
    const { t } = await import('./app_i18n')

    const queue = [
      { title: '成绩有更新', body: 'x', domain: 'grades', eventKey: 'grades:s1' },
      ...Array.from({ length: 10 }, (_, i) => ({
        title: `消息 ${i}`,
        body: 'y',
        domain: 'school-message',
        eventKey: `school-message:m${i}`
      }))
    ]
    const sent = await sendQueuedNotifications(queue as never, false, SID)

    // 1 条成绩 + 3 条收件箱 + 1 条摘要
    expect(sent.length).toBe(5)
    expect(sendLocalNotificationMock).toHaveBeenCalledTimes(5)
    const payloads = sendLocalNotificationMock.mock.calls.map((call) => call[0])
    expect(payloads[0].title).toBe('成绩有更新')
    expect(payloads[4].title).toBe(t('notify.notice.inboxDigestTitle'))
  }, 30_000)

  it('深抓补回的历史只并入基线、不逐条推送（头部窗口，#1101）', async () => {
    const { checkChaoxingInbox } = await loadChecks()

    // 浅抓基线：最近 60 条
    const base = Array.from({ length: 60 }, (_, i) => item(`b${i}`))
    inboxResponse = response(base, true)
    await checkChaoxingInbox(SID, baseSettings, [] as never)

    // 深抓：多带回 140 条更老的历史（全未读）——它们落在列表尾部，不是「新消息」
    const deep = base.concat(Array.from({ length: 140 }, (_, i) => item(`old${i}`)))
    inboxResponse = response(deep, true)
    const queue: unknown[] = []
    const r = await checkChaoxingInbox(SID, baseSettings, queue as never)
    expect(r.triggered).toBe(0)
    expect(queue.length).toBe(0)
    // 但已并入基线，下一次不会再被判新
    expect(readState(memory, CHAOXING_KEY)?.ids?.length).toBe(200)

    // 真正的新消息出现在列表最前面 → 正常推送一次
    inboxResponse = response([item('new1')].concat(deep), true)
    const queue2: unknown[] = []
    const r2 = await checkChaoxingInbox(SID, baseSettings, queue2 as never)
    expect(r2.triggered).toBe(1)
    expect(queue2.length).toBe(1)
  }, 30_000)

  it('「标记已读」不得把首次基线提前点亮（#1102）', async () => {
    const notifyCenter = await import('./notify_center.js')
    const { checkSchoolInbox, readSchoolInboxState } = await loadChecks()

    // 快照不存在时标记一条已读
    notifyCenter.markSchoolInboxNotified(SID, 'portal:tzsjx:a1')
    const state = readSchoolInboxState(SID)
    expect(state.initialized).toBe(false)
    expect(state.ids).toContain('portal:tzsjx:a1')
    expect(readState(memory, SCHOOL_KEY)?.schema).toBe(2)

    // 首次可信抓取仍走基线：不得把整表未读一次性弹出
    inboxResponse = response([item('portal:tzsjx:a1'), item('portal:tzsjx:a2')], true)
    const queue: unknown[] = []
    const r = await checkSchoolInbox(SID, baseSettings, queue as never)
    expect(r.baseline).toBe(true)
    expect(queue.length).toBe(0)
  }, 30_000)
})
