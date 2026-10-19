/**
 * 图书馆预约 · 官方页面内嵌模式判定（issue #1081）
 *
 * ## 为什么 iOS 不能走桌面那条路
 *
 * 桌面端用 Rust 子 WebView（`Window::add_child`）内嵌官方页，但 tauri-2.11 里
 * `add_child` 的 cfg 是 `all(desktop, feature = "unstable")` —— **iOS 上不存在**；
 * 移动端多窗口还会替换当前 UI（不是「内嵌」）。因此 iOS 复用仓库既有的「学校官网」配方：
 * **Bridge 反向代理 + iframe**（`/reserve-embed/…`，见 `src-tauri/src/modules/library_reserve_proxy.rs`）。
 *
 * ## 三条分支
 *
 * - `native-webview`：桌面端，走 `library_reserve_embed_open/resize/close`（行为与 #1078 一致）；
 * - `proxy-iframe`：桥可达（iOS），在 `embed__host` 里渲染 `<iframe :src>`；
 * - `external-open`：桥不可达 / Android / 纯浏览器，降级为「用系统浏览器打开官方入口」。
 *
 * 探测思路与 `school_website_embed.ts` 一致：先 `/health`（轻量），失败再探代理路径。
 * 凭证短时效：iframe 地址**每次打开都现取**（`library_reserve_embed_proxy_url`），不缓存。
 */
import { detectRuntime } from '../platform/runtime'
import {
  isLikelyAndroidUserAgent,
  isLikelyIOSUserAgent,
  isTauriDesktopRuntime,
  isTauriRuntime,
  invokeNative
} from '../platform/native'

/** 桥内代理前缀（与 Rust `modules/library_reserve_proxy.rs` 的 `RESERVE_EMBED_PREFIX` 对齐） */
export const LIBRARY_RESERVE_EMBED_PREFIX = '/reserve-embed/'

const LOCAL_BRIDGE_BASE =
  detectRuntime() === 'tauri' ? 'http://127.0.0.1:4399' : '/bridge'

const bridgeBase = () => LOCAL_BRIDGE_BASE.replace(/\/$/, '')

export type LibraryReserveEmbedMode = 'native-webview' | 'proxy-iframe' | 'external-open'

/** `library_reserve_embed_proxy_url` 的返回（字段为 Rust 侧 camelCase 序列化结果） */
export type LibraryReserveEmbedProxyInfo = {
  /** 桥内 iframe 地址（含短时效凭证） */
  url: string
  /** 官方原始入口地址（含短时效凭证），供「用系统浏览器打开」降级 */
  entryUrl: string
  /** Bridge 监听基址（诊断用） */
  bridgeBase?: string
}

type EnsureBridgeResult = {
  enabled?: boolean
  healthy?: boolean
  respawned?: boolean
  status?: string
}

/** 探测 loopback Bridge 是否活着（1.5s 超时，绝不阻塞用户操作） */
export const probeLibraryReserveProxyReachable = async (): Promise<boolean> => {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 1500)
    try {
      const health = await fetch(`${bridgeBase()}/health`, {
        method: 'GET',
        signal: controller.signal
      })
      if (health.ok) {
        window.clearTimeout(timer)
        return true
      }
    } catch {
      // /health 不通：继续探代理路径（可能是旧版 Bridge 或短暂抖动）
    }
    // 只要能收到 HTTP 响应，就说明 loopback 上的 Bridge 进程活着；
    // 只有连接被拒（fetch 抛错）才算「桥不可达」。路由是否存在由 iframe 自身暴露。
    const response = await fetch(`${bridgeBase()}${LIBRARY_RESERVE_EMBED_PREFIX}`, {
      method: 'HEAD',
      signal: controller.signal
    })
    window.clearTimeout(timer)
    return response.status > 0
  } catch {
    return false
  }
}

/**
 * 解析内嵌模式（无副作用，只做平台判定 + 探测）。
 */
export const resolveLibraryReserveEmbedMode = async (): Promise<LibraryReserveEmbedMode> => {
  // 桌面：沿用子 WebView（不要破坏 #1078 的既有行为）
  if (isTauriDesktopRuntime()) return 'native-webview'

  // Android 发布构建默认不启 Bridge（`mobile-slim`），且同样没有 add_child → 只能外开
  if (isTauriRuntime() && isLikelyAndroidUserAgent()) return 'external-open'

  // iOS：无 add_child，靠 Bridge 反向代理 + iframe
  if (isTauriRuntime() && isLikelyIOSUserAgent()) {
    return (await probeLibraryReserveProxyReachable()) ? 'proxy-iframe' : 'external-open'
  }

  // 纯浏览器：拿不到超星会话（cookie 在 Rust 侧 jar 里），iframe 必然跳登录页
  return 'external-open'
}

/**
 * 重试解析：先让原生 `ensure_http_bridge` 尝试拉起 Bridge，再探测（供「重试」按钮使用）。
 */
export const retryLibraryReserveEmbedMode = async (): Promise<LibraryReserveEmbedMode> => {
  if (isTauriDesktopRuntime()) return 'native-webview'
  if (!isTauriRuntime() || isLikelyAndroidUserAgent()) return 'external-open'

  try {
    const result = await invokeNative<EnsureBridgeResult>('ensure_http_bridge')
    if (result?.healthy === true) return 'proxy-iframe'
    // enabled=false 表示该构建没编入 Bridge，探测也不会有结果
    if (result?.enabled === false) return 'external-open'
  } catch {
    // 命令不可用（未启用 bridge feature）→ 落到探测
  }
  return (await probeLibraryReserveProxyReachable()) ? 'proxy-iframe' : 'external-open'
}

/**
 * 现取桥内 iframe 地址与官方入口地址（**含短时效凭证，禁止缓存**）。
 */
export const fetchLibraryReserveEmbedProxyInfo = async (input: {
  app: string
  kind?: string
  force?: boolean
}): Promise<LibraryReserveEmbedProxyInfo> => {
  const info = await invokeNative<LibraryReserveEmbedProxyInfo>(
    'library_reserve_embed_proxy_url',
    {
      req: {
        app: input.app,
        kind: input.kind ?? 'live',
        force: input.force ?? false
      }
    }
  )
  if (!info || typeof info.url !== 'string' || !info.url || typeof info.entryUrl !== 'string') {
    throw new Error('library_reserve_embed_proxy_url returned empty')
  }
  return info
}
