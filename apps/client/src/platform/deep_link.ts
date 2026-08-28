// src/platform/deep_link.ts
//
// #621：Mini-HBUT 统一 minihbut:// 深链解析与监听层
//
// 强制单一协议入口 minihbut://（禁止另建 scheme）。覆盖：
//   - 小组件现有链接：minihbut://schedule?date=...&source=widget&period=N、
//     minihbut://electricity、minihbut://exam（解析行为与迁移前一致，保证无回归）；
//   - 身份授权：minihbut://identity?request_id=ar_xxx&handoff=<short-lived-secret>；
//   - 无效/恶意链接：只返回通用错误，绝不把 URL 或 secret 回显到 log/UI。
//
// 安全边界：
//   - request_id / handoff 只作为短期 opaque 值透传：不持久化、不打印、不进 URL 历史；
//   - 任何 student_id/name/scope 都不得由 URL 直接决定（由后续 Core GET request detail 获取）。

import { isCapacitorRuntime, isTauriRuntime } from './native'

export const MINI_HBUT_SCHEME = 'minihbut'

/** 深链总长度上限：超长输入直接拒绝（防解析放大与日志污染） */
export const MINI_HBUT_DEEPLINK_MAX_LENGTH = 2048

/** request_id 格式：ar_ + base64url(16B)（与 #619 数据模型冻结的 AuthRequest 格式对齐，见 identity-platform/core/docs/contract.md） */
export const IDENTITY_REQUEST_ID_PATTERN = /^ar_[A-Za-z0-9_-]{8,64}$/

/** handoff：opaque short-lived secret，最小熵（长度 >= 32，约 190 bit）与最大长度限制 */
export const IDENTITY_HANDOFF_MIN_LENGTH = 32
export const IDENTITY_HANDOFF_MAX_LENGTH = 128
export const IDENTITY_HANDOFF_PATTERN = /^[A-Za-z0-9._~-]{32,128}$/

/** 统一深链解析结果（单一入口的全部业务类型） */
export type MiniHbutDeepLink =
  | { kind: 'widget-schedule'; date: string; period: number; source: string }
  | { kind: 'navigate'; view: 'electricity' | 'exams'; source: string }
  | { kind: 'identity'; requestId: string; handoff: string }

/**
 * 深链投递时机（#739）：
 * - cold-start：进程启动参数自带的 URL（getCurrent），用户此刻未必主动发起过任何操作；
 * - warm：运行中收到（onOpenUrl / single-instance 转发 / Capacitor appUrlOpen），用户刚有可感知动作。
 * 消费端（IdentityCoordinator）据此决定死信（过期/不存在）是静默丢弃还是显式报错。
 */
export type DeepLinkDelivery = 'cold-start' | 'warm'

export type MiniHbutDeepLinkErrorCode =
  | 'invalid-url'
  | 'wrong-scheme'
  | 'userinfo-rejected'
  | 'oversized'
  | 'unsupported-host'
  | 'invalid-identity'

export interface MiniHbutDeepLinkError {
  code: MiniHbutDeepLinkErrorCode
  /** 通用安全消息：禁止包含原始 URL / request_id / handoff */
  message: string
}

export type MiniHbutDeepLinkResult =
  | { ok: true; link: MiniHbutDeepLink }
  | { ok: false; error: MiniHbutDeepLinkError }

const fail = (code: MiniHbutDeepLinkErrorCode, message: string): MiniHbutDeepLinkResult => ({
  ok: false,
  error: { code, message }
})

const toWidgetSource = (url: URL): string => url.searchParams.get('source') || 'widget'

/**
 * 统一深链解析器：严格 scheme/host/参数校验，拒绝 userinfo 与超长 URL。
 * - widget 链接保持迁移前行为（date 原样透传，格式校验由消费端负责，避免回归）；
 * - identity 链接做严格 request_id / handoff 校验；
 * - 无效输入只返回通用错误对象（调用方不得把 rawUrl 写入日志/UI）。
 */
export const parseMiniHbutDeepLink = (rawUrl: string): MiniHbutDeepLinkResult => {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return fail('invalid-url', '无效的链接')
  }
  const trimmed = rawUrl.trim()
  if (trimmed.length > MINI_HBUT_DEEPLINK_MAX_LENGTH) {
    return fail('oversized', '链接过长')
  }
  // 前置协议检查：必须以 minihbut: 开头（大小写由 URL 解析归一）
  if (!trimmed.toLowerCase().startsWith(`${MINI_HBUT_SCHEME}:`)) {
    return fail('wrong-scheme', '不支持的链接')
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return fail('invalid-url', '无效的链接')
  }
  if (url.protocol !== `${MINI_HBUT_SCHEME}:`) {
    return fail('wrong-scheme', '不支持的链接')
  }
  // 拒绝 userinfo（username/password），防止凭据/secret 混淆注入
  if (url.username !== '' || url.password !== '') {
    return fail('userinfo-rejected', '不支持的链接')
  }

  const host = url.hostname
  if (host === 'schedule') {
    const date = url.searchParams.get('date') || ''
    const periodRaw = url.searchParams.get('period') || ''
    const period = /^\d+$/.test(periodRaw) ? Number(periodRaw) : 0
    return { ok: true, link: { kind: 'widget-schedule', date, period, source: toWidgetSource(url) } }
  }
  if (host === 'electricity') {
    return { ok: true, link: { kind: 'navigate', view: 'electricity', source: toWidgetSource(url) } }
  }
  if (host === 'exam') {
    // 历史兼容：小组件 exam 链接映射到 exams 视图
    return { ok: true, link: { kind: 'navigate', view: 'exams', source: toWidgetSource(url) } }
  }
  if (host === 'identity') {
    return parseIdentityDeepLink(url)
  }
  return fail('unsupported-host', '不支持的链接')
}

const parseIdentityDeepLink = (url: URL): MiniHbutDeepLinkResult => {
  const requestId = url.searchParams.get('request_id') || ''
  const handoff = url.searchParams.get('handoff') || ''
  if (!IDENTITY_REQUEST_ID_PATTERN.test(requestId) || !IDENTITY_HANDOFF_PATTERN.test(handoff)) {
    // 通用错误：不区分“缺哪个参数”，不回显参数值（可能含恶意内容/secret）
    return fail('invalid-identity', '授权请求无效')
  }
  return { ok: true, link: { kind: 'identity', requestId, handoff } }
}

export type MiniHbutDeepLinkHandler = (link: MiniHbutDeepLink, delivery: DeepLinkDelivery) => void

/**
 * 安装统一深链监听（唯一安装点）：
 * - Tauri desktop/mobile：getCurrent() 处理冷启动 URL + onOpenUrl() 处理热启动 URL；
 * - Capacitor 兼容路径：appUrlOpen 走同一 parser/dispatcher（不维护两套 identity 解析）；
 * - Web：无原生深链，返回空清理函数。
 * 任何平台能力缺失时静默降级（不抛未处理异常）。
 */
export const installMiniHbutDeepLinkListeners = async (
  handler: MiniHbutDeepLinkHandler
): Promise<() => void> => {
  const cleanups: Array<() => void> = []

  const handleUrls = (urls: string[], delivery: DeepLinkDelivery): void => {
    for (const raw of urls) {
      const result = parseMiniHbutDeepLink(raw)
      if (!result.ok) continue // 无效/恶意链接：静默忽略（通用错误不回显，也不落日志）
      try {
        handler(result.link, delivery)
      } catch {
        // 消费者异常不阻断后续 URL 处理
      }
    }
  }

  if (isTauriRuntime()) {
    try {
      const deepLink = await import('@tauri-apps/plugin-deep-link')
      try {
        const startUrls = await deepLink.getCurrent()
        if (Array.isArray(startUrls) && startUrls.length > 0) handleUrls(startUrls, 'cold-start')
      } catch {
        // 冷启动深链读取失败：按无启动 URL 处理（不阻断 onOpenUrl 安装）
      }
      try {
        const unlisten = await deepLink.onOpenUrl((urls) => handleUrls(urls, 'warm'))
        cleanups.push(unlisten)
      } catch {
        // 热启动监听不可用：Windows/Linux 由 single-instance 聚焦兜底，静默降级
      }
    } catch {
      // 插件未接入（如 web 测试环境）：静默降级
    }
  } else if (isCapacitorRuntime()) {
    try {
      const app = await import('@capacitor/app')
      const listener = await app.App.addListener('appUrlOpen', (event) => {
        const url = event?.url
        if (typeof url === 'string' && url) handleUrls([url], 'warm')
      })
      cleanups.push(() => {
        void listener.remove()
      })
    } catch {
      // Capacitor appUrlOpen 不可用：静默降级
    }
  }

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup()
      } catch {
        // 忽略清理异常
      }
    }
  }
}

/**
 * 构造 Widget 点击跳转的 deep link URL（生成逻辑自 utils/widget_snapshot.ts 迁移，行为不变）。
 * 基础：minihbut://schedule?date=YYYY-MM-DD&source=widget；提供 period 时追加 &period=N。
 */
export const buildMiniHbutDeepLink = (params: { date: string; period?: number }): string => {
  let url = `minihbut://schedule?date=${params.date}&source=widget`
  if (typeof params.period === 'number' && Number.isFinite(params.period) && params.period >= 1) {
    url += `&period=${Math.floor(params.period)}`
  }
  return url
}
