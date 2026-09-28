/**
 * SDK 测试公共夹具（#904 任务 5）。
 *
 * 说明：
 * - CI 环境为 vitest 的 node 环境（无 jsdom），因此这里用最小的 window/fetch 伪装；
 * - 夹具本身不含断言，只提供「可控宿主窗口 / 可控 fetch 路由」两件事；
 * - 所有 SDK 单测都必须通过相对路径直接 import `website/modules-src/_sdk/src/*`（与既有
 *   `hbut_stack_game.spec.ts` 引用游戏源码的方式一致），保证测的是真实源码而非副本。
 */

export type FakeHostWindow = {
  win: Record<string, unknown>
  posted: Array<{ message: Record<string, unknown>; targetOrigin: string }>
  dispatched: () => number
  listeners: Map<string, Array<(event: unknown) => void>>
  /** history.replaceState 收到的 URL（SDK 读取 ticket 后必须清理 URL） */
  historyUrls: string[]
  /** localStorage 写入记录（用于断言凭据不落盘） */
  storageWrites: Array<{ key: string; value: string }>
  /** 模拟宿主 → 游戏 postMessage（origin/source 可覆盖，用于 wrong origin 测试） */
  deliver: (
    data: Record<string, unknown>,
    options?: { origin?: string; source?: unknown; omitSource?: boolean }
  ) => void
  /** 取最近一条 SDK → 宿主的握手消息 */
  lastPosted: (type?: string) => Record<string, unknown> | null
}

/**
 * 按宿主契约把 `host_origin` 注入 iframe URL query（已存在时不覆盖）。
 * 与宿主侧 `game_center/module_context.appendModuleEnvQueryParams` 的行为一致：
 * 参数由 `URLSearchParams` 编码，值原样交给 SDK 侧归一化。
 */
const withInjectedHostOrigin = (search: string, hostOrigin: string): string => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (!params.get('host_origin')) params.set('host_origin', hostOrigin)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const createFakeHostWindow = (options: {
  search?: string
  origin?: string
  referrer?: string
  hostOrigin?: string
  /**
   * 是否模拟宿主注入 `host_origin`（P1-B 契约 C：SDK 只接受显式来源）。
   *
   * 真实宿主（MoreView.appendModuleContextQuery / MoreModuleHostView.frameSrc）都会在
   * iframe URL 上显式注入该参数；夹具默认按同一契约注入，否则所有「宿主可信」用例
   * 都会因 SDK 的 fail closed 而失真。只有专测「无任何显式来源」的用例才显式关闭。
   */
  injectHostOrigin?: boolean
} = {}): FakeHostWindow => {
  const origin = options.origin ?? 'https://app.example'
  const hostOrigin = options.hostOrigin ?? origin
  const referrer = options.referrer ?? `${hostOrigin}/more`
  const rawSearch = options.search ?? ''
  const search =
    options.injectHostOrigin === false ? rawSearch : withInjectedHostOrigin(rawSearch, hostOrigin)
  const listeners = new Map<string, Array<(event: unknown) => void>>()
  const posted: FakeHostWindow['posted'] = []
  let delivered = 0

  const parent = {
    postMessage: (message: Record<string, unknown>, targetOrigin: string) => {
      posted.push({ message, targetOrigin })
    }
  }
  const historyCalls: string[] = []
  const storageWrites: Array<{ key: string; value: string }> = []
  const storageValues = new Map<string, string>()
  const win: Record<string, unknown> = {
    location: { search, pathname: '/index.html', hash: '', origin, protocol: 'https:' },
    document: { referrer },
    parent,
    history: {
      replaceState: (_state: unknown, _title: string, url: string) => {
        historyCalls.push(String(url))
      }
    },
    localStorage: {
      getItem: (key: string) => (storageValues.has(key) ? storageValues.get(key)! : null),
      setItem: (key: string, value: string) => {
        storageWrites.push({ key, value: String(value) })
        storageValues.set(key, String(value))
      },
      removeItem: (key: string) => storageValues.delete(key),
      clear: () => storageValues.clear()
    },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      const list = listeners.get(type) || []
      list.push(handler)
      listeners.set(type, list)
    },
    // 既有游戏 game_rank.js 使用 window.setTimeout / window.clearTimeout，这里对齐
    setTimeout: (...args: unknown[]) => (globalThis.setTimeout as (...rest: unknown[]) => unknown)(...args),
    clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as Parameters<typeof globalThis.clearTimeout>[0]),
    removeEventListener: (type: string, handler: (event: unknown) => void) => {
      const list = listeners.get(type) || []
      listeners.set(
        type,
        list.filter((item) => item !== handler)
      )
    }
  }

  return {
    win,
    posted,
    listeners,
    historyUrls: historyCalls,
    storageWrites,
    dispatched: () => delivered,
    deliver: (data, deliverOptions = {}) => {
      delivered += 1
      const event = {
        data,
        origin: deliverOptions.origin ?? hostOrigin,
        source: deliverOptions.omitSource ? undefined : deliverOptions.source ?? parent
      }
      for (const handler of listeners.get('message') || []) handler(event)
    },
    lastPosted: (type?: string) => {
      const list = type ? posted.filter((item) => item.message?.type === type) : posted
      return list.length ? list[list.length - 1].message : null
    }
  }
}

export type FetchCall = { url: string; method: string; headers: Record<string, string>; body: unknown }

export type FetchRoute = {
  match: string | RegExp
  method?: string
  respond: (call: FetchCall) => Response | Promise<Response> | undefined
}

export type FetchRouter = {
  calls: FetchCall[]
  callsFor: (matcher: string | RegExp) => FetchCall[]
  fetch: (url: string, init?: Record<string, unknown>) => Promise<Response>
}

const headersToObject = (headers: unknown): Record<string, string> => {
  if (!headers || typeof headers !== 'object') return {}
  return Object.fromEntries(Object.entries(headers as Record<string, string>).map(([key, value]) => [key.toLowerCase(), String(value)]))
}

/**
 * 构造可控 fetch：`routes` 按「method + url 片段」匹配，命中后返回 Response。
 * handler 返回 undefined 表示透传给下一个路由；没有任何路由命中 → 404（裸响应，模拟未部署）。
 */
export const createFetchRouter = (routes: FetchRoute[]): FetchRouter => {
  const calls: FetchCall[] = []
  const fetchImpl = async (url: string, init: Record<string, unknown> = {}) => {
    const method = String(init.method || 'GET').toUpperCase()
    const text = typeof init.body === 'string' ? init.body : ''
    let parsedBody: unknown = null
    if (text) {
      try {
        parsedBody = JSON.parse(text)
      } catch {
        parsedBody = text
      }
    }
    const call: FetchCall = { url: String(url), method, headers: headersToObject(init.headers), body: parsedBody }
    calls.push(call)
    for (const route of routes) {
      if (route.method && route.method.toUpperCase() !== method) continue
      const matched = typeof route.match === 'string' ? call.url.includes(route.match) : route.match.test(call.url)
      if (!matched) continue
      const response = await route.respond(call)
      if (response) return response
    }
    return new Response('not found', { status: 404 })
  }
  return {
    calls,
    callsFor: (matcher) =>
      calls.filter((call) => (typeof matcher === 'string' ? call.url.includes(matcher) : matcher.test(call.url))),
    fetch: fetchImpl
  }
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** 轮询等待异步条件（避免依赖固定 sleep 时长的脆弱测试） */
export const waitFor = async (predicate: () => boolean, timeoutMs = 500): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return predicate()
}

/** 协议 envelope 成功响应 */
export const okJson = (body: Record<string, unknown> = {}, status = 200): Response => jsonResponse({ success: true, ...body }, status)

/** 协议 envelope 失败响应 */
export const errJson = (code: string, status: number, extra: Record<string, unknown> = {}): Response =>
  jsonResponse({ success: false, error: { code, message: `mock ${code}`, retryable: extra.retryable === true, ...extra } }, status)

/** hbut_stack 的 registry 快照（测试用，服务端权威语义样本） */
export const HBUT_STACK_REGISTRY_ENTRY = {
  game_id: 'hbut_stack',
  display_name: '湖工叠塔',
  status: 'active',
  ranked: true,
  classic_mirror: true,
  legacy_compatible: true,
  season_eligible: true,
  result_schema_version: 1,
  metric: { name: 'layers', max: 100000, semantics: 'count' },
  min_client_version: ''
}
