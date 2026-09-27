/**
 * `platform` / `runtime` 归一（protocol-v1.md §7）。
 *
 * 硬约束：
 * - 这两个字段**绝不**用于鉴权、奖励数量、信任级别、排行榜分桶；
 * - 无法识别 → `unknown`（不拒绝请求），原值另行保留在诊断里；
 * - 桌面 OS（windows/macos/linux）不得用 UA 猜，只接受宿主注入值。
 */

import { getNavigator, getPageProtocol, getPageOrigin, readSearchParams } from './env.js'
import { safeText } from './utils.js'

export const PLATFORMS = Object.freeze(['ios', 'android', 'web', 'windows', 'macos', 'linux', 'unknown'])
export const RUNTIMES = Object.freeze([
  'tauri-local',
  'capacitor-local',
  'remote-site',
  'module-web',
  'unknown'
])

/** 宿主历史值 module-host 以及陌生值统一归为 unknown（§7.1） */
const HOST_RUNTIME_ALIASES = Object.freeze({
  'module-host': 'unknown',
  host: 'unknown',
  web: 'module-web'
})

const validOr = (value, allowed, fallback) => {
  const text = safeText(value).toLowerCase()
  return allowed.includes(text) ? text : fallback
}

/** iPadOS 桌面伪装：MacIntel + maxTouchPoints > 1（对齐 apps/client/src/platform/runtime.ts:88-97） */
const isIpadOsMasquerade = (nav) => {
  const platform = safeText(nav?.platform)
  const maxTouchPoints = Number(nav?.maxTouchPoints || 0)
  return platform === 'MacIntel' && maxTouchPoints > 1
}

/** UA 判定（仅移动/浏览器三态；桌面 OS 交给宿主注入） */
export const detectPlatformFromNavigator = (nav) => {
  if (!nav) return 'unknown'
  const ua = safeText(nav.userAgent)
  if (isIpadOsMasquerade(nav)) return 'ios'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (ua) return 'web'
  return 'unknown'
}

/** 归一化宿主注入的 platform（非法值 → 空串，调用方决定回退顺序） */
export const normalizePlatform = (value) => {
  const text = safeText(value).toLowerCase()
  return PLATFORMS.includes(text) ? text : ''
}

/** 归一化宿主注入的 runtime */
export const normalizeRuntime = (value) => {
  const text = safeText(value).toLowerCase()
  if (!text) return ''
  if (RUNTIMES.includes(text)) return text
  return HOST_RUNTIME_ALIASES[text] || 'unknown'
}

/**
 * 解析最终 platform / runtime。
 * @param {object} options
 * @param {string} [options.hostPlatform] 握手或 URL 注入的 platform
 * @param {string} [options.hostRuntime] 握手或 URL 注入的 runtime
 * @param {URLSearchParams} [options.params]
 */
export const resolvePlatformContext = (options = {}) => {
  const params = options.params || readSearchParams()
  const nav = options.navigator || getNavigator()
  const rawPlatform = safeText(options.hostPlatform || params.get('platform'))
  const rawRuntime = safeText(options.hostRuntime || params.get('runtime'))
  const injectedPlatform = normalizePlatform(rawPlatform)
  const fromUa = detectPlatformFromNavigator(nav)

  // platform 优先宿主注入（桌面 OS 唯一可信来源）；否则 UA 三态；再退 unknown
  const platform = injectedPlatform || fromUa
  // runtime：宿主值优先（非法值 → unknown）；未注入时游戏源码缺省为 module-web（§7.1）
  const runtime = rawRuntime ? normalizeRuntime(rawRuntime) || 'unknown' : 'module-web'

  return {
    platform,
    runtime,
    platformRaw: rawPlatform,
    runtimeRaw: rawRuntime,
    origin: getPageOrigin(),
    protocol: getPageProtocol()
  }
}

/** client_version（软门禁字段，可伪造，仅用于引导升级与观测） */
export const resolveClientVersion = (options = {}) => {
  const params = options.params || readSearchParams()
  const fromConfig = safeText(options.clientVersion)
  const fromParam = safeText(params.get('app_version'))
  const fromHost = safeText(options.hostClientVersion)
  const value = fromConfig || fromHost || fromParam
  return /^[0-9A-Za-z._+-]{1,64}$/.test(value) ? value : 'unknown'
}
