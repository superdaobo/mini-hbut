// #719 冷启动校内证书探测 composable（#1001 扩展为「连接状态」单一来源）。
//
// 职责:
// 1. 通过 Tauri command `probe_school_cert_status` 触发一轮 Rust 层 TLS 探测
// 2. 把结果同时投影成两样东西：
//    - `certIssues`：仅 cert-error 域的黄色提示文案（#719 原有行为，保持不变）
//    - `certProbeTone`：连接状态三分类（ok / cert-error / network-error），供「我的」页
//      登录状态圆点判定（#1001）
// 3. 在网络状态变化后重新探测，使圆点能在断网/恢复时实时反映（#1001）
//
// ⚠️ 防 remount 重复探测（成败关键）:
// MeView 进出会 remount（项目已知特性），这里用 module-scope 的 Promise 缓存保证
// 每次应用会话只真正 invoke 一轮探测；remount 后直接复用既有结果，不发新请求。
//
// ⚠️ 为什么需要 `refreshCertProbe`（#1001 的根因之一）:
// 会话级缓存（前端 Promise + Rust 侧 OnceLock）意味着「断网时探过的那一轮」会被永久沿用：
// 恢复联网后圆点仍是红的、断网后仍是绿的。所以网络状态变化必须走**强制重探**通道。

import { ref, type Ref } from 'vue'
import { invokeNative } from '../platform/native'

/** Rust 层 `probe_school_cert_status` 返回的单域探测结果（kebab-case 序列化） */
export interface CertProbeResult {
  domain: string
  status: 'ok' | 'cert-error' | 'network-error'
}

/**
 * 连接状态三分类（外加 `unknown` = 尚未探测或结果不可用）。
 *
 * 与单域结果的区别：这是**跨域聚合**后的「能不能连上校内系统」判定。
 * 两个探测域分别对应教务系统（jwxt.hbut.edu.cn）与融合门户（e.hbut.edu.cn），
 * 任一域不可达即视为「连不上」——这正是「我的」页圆点要表达的信息。
 */
export type CertProbeTone = 'unknown' | 'ok' | 'cert-error' | 'network-error'

/**
 * 模块级缓存：保存「本轮会话」的探测 Promise。
 * null 表示尚未探测过；非 null 时任何组件 remount 都直接 await 同一个 Promise。
 */
let probePromise: Promise<unknown> | null = null

/** 最近一次探测完成时间（毫秒时间戳）；0 表示尚未完成过 */
let lastProbeAt = 0

/** 可见性恢复后触发重探的最小间隔，避免前后台频繁切换时反复打校内服务 */
const VISIBILITY_REPROBE_MIN_INTERVAL_MS = 60_000

/**
 * 将 Rust 返回的探测结果列表过滤为需要展示的黄色提示文案（纯函数，便于单测）。
 *
 * 显示条件：仅 `status === 'cert-error'` 的域逐个显示；
 * `ok` 与 `network-error` 一律不产生任何文案。
 * 文案保持中性：包含域名、提及「兼容模式」，不写死"已过期"
 * （设备时间不准也会导致过期误报）。
 */
export function certIssueMessagesFromResults(
  results: ReadonlyArray<CertProbeResult | Record<string, unknown>> | null | undefined,
): string[] {
  if (!Array.isArray(results)) return []
  return results
    .filter((item): item is CertProbeResult =>
      Boolean(item) && (item as CertProbeResult).status === 'cert-error',
    )
    .map((item) => `${item.domain} 证书校验未通过，已以兼容模式连接`)
}

/**
 * 把单域结果聚合成连接状态（纯函数，便于单测）。
 *
 * 优先级：任一域 network-error → `network-error`（明确连不上，优先于证书问题）；
 * 否则任一域 cert-error → `cert-error`；否则全 ok → `ok`；
 * 空/非法输入 → `unknown`（不据此报警，避免误红）。
 */
export function certProbeToneFromResults(
  results: ReadonlyArray<CertProbeResult | Record<string, unknown>> | null | undefined,
): CertProbeTone {
  if (!Array.isArray(results) || results.length === 0) return 'unknown'
  let sawCertError = false
  let sawOk = false
  for (const item of results) {
    const status = item ? (item as CertProbeResult).status : undefined
    if (status === 'network-error') return 'network-error'
    if (status === 'cert-error') sawCertError = true
    else if (status === 'ok') sawOk = true
  }
  if (sawCertError) return 'cert-error'
  return sawOk ? 'ok' : 'unknown'
}

/** 探测结果对应的黄色提示文案（响应式，供模板渲染） */
const certIssues: Ref<string[]> = ref([])

/** 聚合后的连接状态（响应式，供「我的」页圆点判定） */
const certProbeTone: Ref<CertProbeTone> = ref('unknown')

/** 把一轮探测结果写入响应式状态（唯一写入口，保证两个投影始终同源） */
function applyProbeResults(
  results: ReadonlyArray<CertProbeResult | Record<string, unknown>> | null | undefined,
): void {
  certIssues.value = certIssueMessagesFromResults(results)
  certProbeTone.value = certProbeToneFromResults(results)
  lastProbeAt = Date.now()
}

/**
 * 发起一轮探测。
 * `force=true` 时要求 Rust 侧跳过会话缓存；失败（非 Tauri 环境 / IPC 异常 / 网络故障）
 * 一律静默降级为「无提示 + unknown」，不影响页面。
 */
function runProbe(force: boolean): Promise<CertProbeResult[]> {
  return invokeNative<CertProbeResult[]>('probe_school_cert_status', { force })
    .then((results) => {
      applyProbeResults(results)
      return Array.isArray(results) ? (results as CertProbeResult[]) : []
    })
    .catch(() => {
      // 网络故障 / 非 Tauri 环境：不产生黄色文案；连接状态交由 unknown 兜底
      applyProbeResults([])
      return [] as CertProbeResult[]
    })
}

/** 网络状态变化监听是否已安装（幂等，整个应用会话只装一次） */
let detachRefreshTriggers: (() => void) | null = null

/**
 * 安装「网络状态变化 → 重新判定连接状态」监听（幂等）。
 *
 * - `offline`：设备明确断网，立即置为 network-error，不必等探测超时（探测最长 8s，
 *   等待期间圆点会继续显示为绿，正是用户报告的现象）；
 * - `online`：恢复联网后强制重探，用真实结果覆盖；
 * - 页面重新可见：移动端前后台切换常伴随网络切换，间隔超过阈值时重探一轮。
 *
 * 返回卸载函数；重复调用返回同一个卸载函数。
 */
export function installCertProbeRefreshTriggers(): () => void {
  if (detachRefreshTriggers) return detachRefreshTriggers
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {}
  }

  const onOnline = () => {
    void refreshCertProbe()
  }
  const onOffline = () => {
    certProbeTone.value = 'network-error'
  }
  const onVisibilityChange = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
    if (Date.now() - lastProbeAt < VISIBILITY_REPROBE_MIN_INTERVAL_MS) return
    void refreshCertProbe()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  detachRefreshTriggers = () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    detachRefreshTriggers = null
  }
  return detachRefreshTriggers
}

/**
 * 确保本会话完成一轮探测（幂等）。
 * 首次调用真正发起 invoke 并安装网络状态监听；后续调用复用模块级 Promise 缓存。
 */
export function ensureCertProbe(): Promise<unknown> {
  installCertProbeRefreshTriggers()
  if (probePromise) return probePromise
  probePromise = runProbe(false)
  return probePromise
}

/**
 * 强制重新探测并刷新缓存（网络状态变化、或需要立刻反映当前连通性时使用）。
 * 结果会替换模块级缓存，后续 `ensureCertProbe()` 复用这一轮。
 */
export function refreshCertProbe(): Promise<unknown> {
  probePromise = runProbe(true)
  return probePromise
}

/** 「我的」页面横幅与连接状态入口。 */
export function useCertProbeBanner(): {
  certIssues: Ref<string[]>
  certProbeTone: Ref<CertProbeTone>
  ensureCertProbe: () => Promise<unknown>
  refreshCertProbe: () => Promise<unknown>
} {
  return { certIssues, certProbeTone, ensureCertProbe, refreshCertProbe }
}
