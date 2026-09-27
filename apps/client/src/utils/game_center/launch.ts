/**
 * 游戏启动（HTTPS-first）与 iframe origin 白名单（#905）。
 *
 * 关键决策：
 * 1. **游戏业务层 HTTPS-first**：从湖工游乐场发起的对局一律优先使用远端 HTTPS 站点地址；
 *    本地桥（Tauri `127.0.0.1/module_bundle/content/...`、Capacitor `_capacitor_file_`/localhost）
 *    **不再删除**，只作为兼容降级路径保留（学校网页代理、模块预览、离线缓存仍依赖它）。
 * 2. **Host origin 校验**：允许集合由「实际 iframe URL 推导」+「远程配置显式追加」组成；
 *    禁止 `*`；`'null'`（opaque origin）必须显式 opt-in 才接受（默认拒绝，与 SDK 一致）。
 */

import { isSecureGamePlatformUrl, normalizeGameOrigin } from './base'

/** 11 个经典游戏 module id（与 DEFAULT_MODULE_CENTER 顺序一致，零破坏） */
export const GAME_CENTER_GAME_IDS = Object.freeze([
  'hecheng_hugongda',
  'jump_out_hbut',
  'hbut_2048',
  'clumsy_bird_hbut',
  'hbut_monopoly',
  'hbut_miner',
  'hbut_memory_match',
  'hbut_gomoku',
  'hbut_stack',
  'hbut_parking',
  'hbut_match3'
])

/** 本地桥预览 URL 形态（与 more_modules/core.js 的 isLocalModuleBridgePreviewUrl 保持同构） */
const LOCAL_BRIDGE_PREVIEW_RE = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/module_bundle\/content\//i

export const isLocalBridgePreviewUrl = (value: unknown): boolean =>
  LOCAL_BRIDGE_PREVIEW_RE.test(String(value ?? '').trim())

/**
 * 取出 URL（或 origin 字符串）的 origin；兼容 Capacitor/Tauri 自定义 scheme。
 * 非法输入返回空串。
 */
export const extractUrlOrigin = (value: unknown): string => normalizeGameOrigin(value)

/** 是否远端 HTTPS 地址（用于 HTTPS-first 判定） */
export const isRemoteHttpsUrl = (value: unknown): boolean => {
  const text = String(value ?? '').trim()
  if (!text || isLocalBridgePreviewUrl(text)) return false
  try {
    return new URL(text).protocol === 'https:'
  } catch {
    return false
  }
}

export interface SessionUrlLike {
  resolvedPreviewUrl?: string
  localPreviewUrl?: string
  openUrl?: string
  candidateUrls?: string[]
  sourceKind?: string
  preview_url?: string
  local_preview_url?: string
  open_url?: string
  package_urls?: string[]
  [key: string]: unknown
}

/**
 * HTTPS-first 选路：优先远端 HTTPS 站点，其次原解析结果（兼容本地桥/本地包），
 * 都没有时退回本地预览地址（离线可用），最后返回空串。
 */
export const resolveGameCenterLaunchUrl = (
  session?: SessionUrlLike | null,
  options: { requireHttps?: boolean } = {}
): string => {
  const raw = session && typeof session === 'object' ? session : {}
  const candidates = [
    raw.resolvedPreviewUrl,
    raw.preview_url,
    raw.open_url,
    ...(Array.isArray(raw.candidateUrls) ? raw.candidateUrls : []),
    ...(Array.isArray(raw.package_urls) ? raw.package_urls : [])
  ]
  for (const candidate of candidates) {
    if (isRemoteHttpsUrl(candidate)) return String(candidate).trim()
  }
  if (options.requireHttps) return ''
  return String(raw.resolvedPreviewUrl || raw.localPreviewUrl || raw.local_preview_url || '').trim()
}

/**
 * 组装 iframe 允许来源白名单。
 *
 * 组成：
 * 1. 实际要加载的 URL 的 origin（远端站点 / 本地桥 / 原生自定义 scheme）；
 * 2. 兼容降级 URL 的 origin（远端失败切本地、或反之）；
 * 3. 远程配置显式声明的附加 origin（仅 HTTPS / loopback，且过滤 `*`、`null`）。
 *
 * 返回值**绝不含** `*`。
 *
 * `allowOpaqueOrigin` 的语义（安全取舍，必须显式传入）：
 * - 远端 HTTPS 站点（新游乐场主路径）：**不接受** opaque origin，严格 origin 相等；
 * - 本地包 / 本地桥（Capacitor `capacitor://localhost`、Tauri `tauri://localhost` 等）：
 *   部分 WebView 会把自定义 scheme 文档的 `event.origin` 上报为字符串 `'null'`，
 *   此时若不接受会让本地包 iframe 的高度上报与 SDK 握手全部失效（真实回归）。
 *   因此本地模式下显式放行 `'null'` —— 它仍受 `event.source === iframe.contentWindow` 约束，
 *   第三方页面无法成为该 iframe 的 contentWindow。
 */
export const resolveGameFrameAllowedOrigins = (options: {
  frameUrl?: unknown
  fallbackUrl?: unknown
  extraOrigins?: unknown
  allowOpaqueOrigin?: boolean
} = {}): string[] => {
  const origins: string[] = []
  const pushOrigin = (value: unknown): void => {
    const origin = normalizeGameOrigin(extractUrlOrigin(value))
    if (origin && !origins.includes(origin)) origins.push(origin)
  }
  pushOrigin(options.frameUrl)
  pushOrigin(options.fallbackUrl)
  const extra = Array.isArray(options.extraOrigins) ? options.extraOrigins : []
  for (const item of extra) {
    const origin = normalizeGameOrigin(item)
    if (!origin) continue
    // 附加 origin 必须是安全传输（HTTPS 或 loopback），避免把明文源拉进白名单
    if (!isSecureGamePlatformUrl(origin)) continue
    if (!origins.includes(origin)) origins.push(origin)
  }
  if (options.allowOpaqueOrigin === true && !origins.includes('null')) {
    origins.push('null')
  }
  return origins
}

/** origin 是否被允许（严格相等比较；白名单为空 → 一律拒绝） */
export const isGameFrameOriginAllowed = (origin: unknown, allowList: unknown): boolean => {
  const value = String(origin ?? '').trim()
  if (!value) return false
  const list = Array.isArray(allowList) ? allowList : []
  if (list.length === 0) return false
  if (list.includes('*')) return false
  return list.includes(value)
}
