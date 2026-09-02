// #719 冷启动校内证书探测 composable。
//
// 职责:
// 1. 挂载时通过 Tauri command `probe_school_cert_status` 触发一轮 Rust 层 TLS 探测
// 2. 将探测结果转换为「我的」页面登录状态区域的黄色提示文案（仅 cert-error 域）
//
// ⚠️ 防 remount 重复探测（成败关键）:
// MeView 进出会 remount（项目已知特性），这里用 module-scope 的 Promise 缓存保证
// 每次应用会话只真正 invoke 一轮探测；remount 后直接复用既有结果，不发新请求。

import { ref, type Ref } from 'vue'
import { invokeNative } from '../platform/native'

/** Rust 层 `probe_school_cert_status` 返回的单域探测结果（kebab-case 序列化） */
export interface CertProbeResult {
  domain: string
  status: 'ok' | 'cert-error' | 'network-error'
}

/**
 * 模块级缓存：保存「本轮会话」的探测 Promise。
 * null 表示尚未探测过；非 null 时任何组件 remount 都直接 await 同一个 Promise。
 */
let probePromise: Promise<unknown> | null = null

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

/** 探测结果对应的黄色提示文案（响应式，供模板渲染） */
const certIssues: Ref<string[]> = ref([])

/**
 * 确保本会话完成一轮探测（幂等）。
 * 首次调用真正发起 invoke；后续调用复用模块级 Promise 缓存。
 * 探测失败（非 Tauri 环境 / IPC 异常等）静默降级为空提示，不影响页面。
 */
export function ensureCertProbe(): Promise<unknown> {
  if (probePromise) return probePromise
  probePromise = invokeNative<CertProbeResult[]>('probe_school_cert_status')
    .then((results) => {
      certIssues.value = certIssueMessagesFromResults(results)
      return results
    })
    .catch(() => {
      // 网络故障 / 非 Tauri 环境：按需求不显示任何内容
      certIssues.value = []
      return [] as CertProbeResult[]
    })
  return probePromise
}

/** 「我的」页面横幅状态入口。 */
export function useCertProbeBanner(): {
  certIssues: Ref<string[]>
  ensureCertProbe: () => Promise<unknown>
} {
  return { certIssues, ensureCertProbe }
}
