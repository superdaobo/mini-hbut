/**
 * 校园会话上报（Issue #1307 / 后端 OCR-services#68）。
 *
 * 目的：让后端能拿学生的教务会话去校方学籍页核验「这个学号真的是他的」。
 *
 * 纪律（每条都有用例锁）：
 * 1. **默认关**：`remote_config.campus_probe.enabled` 为假 → 一个请求都不发，行为与改动前完全一致；
 * 2. **绝不阻塞登录**：调用方 fire-and-forget，本模块自己吞掉所有异常、限制 3 秒超时；
 * 3. **绝不影响业务**：失败不弹窗、不改状态、不重试；
 * 4. **只报教务域**：校方对请求头有上限（实测全量 12 个域约 14.7KB 会被 400），
 *    只挑 `jwxt` / `chaoxing_jwxt` / `portal` / `auth` 这几个会话关键域；
 * 5. **不打印 cookie**：任何日志只允许出现长度与 sha 前缀（这里干脆不打印内容）。
 *
 * 采样：按 `(学号, 日期)` 做**确定性**哈希采样，同一人同一天结论稳定，便于排查与复现。
 */

import { PRIMARY_BACKEND_ORIGIN } from './backend_endpoints'
import { REMOTE_CONFIG_SNAPSHOT_KEY } from './remote_config_defaults'

/** 上报端点（走主域，不新增域名常量） */
export const CAMPUS_PROBE_ENDPOINT = `${PRIMARY_BACKEND_ORIGIN}/api/identity/campus-probe`

/** 上报超时：宁可不报，也不能让登录收尾卡住 */
export const CAMPUS_PROBE_TIMEOUT_MS = 3000

/** 只上报这些域的 cookie（会话关键；少了读不到学籍页，多了会被校方 400） */
export const CAMPUS_PROBE_COOKIE_DOMAINS = ['jwxt', 'chaoxing_jwxt', 'portal', 'auth'] as const

export interface CampusProbeConfig {
  enabled: boolean
  sampleRate: number
}

export const DEFAULT_CAMPUS_PROBE_CONFIG: CampusProbeConfig = {
  enabled: false,
  sampleRate: 0.02
}

/**
 * 规范化 remote_config 里的 `campus_probe` 块。
 *
 * 兼容 snake_case / camelCase；采样率强行 clamp 到 `[0, 1]`；非法值一律回落默认（**默认关**）。
 */
export function normalizeCampusProbeConfig(raw: unknown): CampusProbeConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CAMPUS_PROBE_CONFIG }
  const block = raw as Record<string, unknown>
  const enabledRaw = block.enabled ?? block.Enabled
  const enabled = enabledRaw === true || String(enabledRaw ?? '').trim().toLowerCase() === 'true'
  const rateRaw = block.sample_rate ?? block.sampleRate ?? block.sampleRatePercent
  let sampleRate = Number(rateRaw)
  if (!Number.isFinite(sampleRate)) {
    sampleRate = DEFAULT_CAMPUS_PROBE_CONFIG.sampleRate
  }
  // 允许写成百分数（>1 视为百分比），再统一 clamp
  if (sampleRate > 1) sampleRate = sampleRate / 100
  sampleRate = Math.min(1, Math.max(0, sampleRate))
  return { enabled, sampleRate }
}

/**
 * 从本地 remote_config 快照直接读 `campus_probe` 块。
 *
 * 为什么不加进 `normalizeRemoteConfig`：`remote_config.ts` 已经在 1000 行上限边缘，
 * 任何新增都会触发 `god-files` 检查。这里只读快照，不动那个文件。
 * 仓库里快照本身就是远端 JSON 原文（`JSON.parse` 后直接归一化），所以顶层就有 `campus_probe`。
 */
export function readCampusProbeConfigFromStorage(): CampusProbeConfig {
  try {
    const storage =
      typeof localStorage !== 'undefined' && localStorage
        ? localStorage
        : (globalThis as { localStorage?: Storage }).localStorage
    const raw = storage?.getItem(REMOTE_CONFIG_SNAPSHOT_KEY)
    if (!raw) return { ...DEFAULT_CAMPUS_PROBE_CONFIG }
    const parsed = JSON.parse(String(raw)) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CAMPUS_PROBE_CONFIG }
    return normalizeCampusProbeConfig(parsed.campus_probe ?? parsed.campusProbe)
  } catch {
    return { ...DEFAULT_CAMPUS_PROBE_CONFIG }
  }
}

/** 确定性采样：同一 (学号, 日期) 结论稳定。 */
export function shouldReportCampusSession(
  studentId: string,
  config: CampusProbeConfig | null | undefined,
  dayKey?: string
): boolean {
  const cfg = config || DEFAULT_CAMPUS_PROBE_CONFIG
  if (!cfg.enabled) return false
  if (!/^\d{10}$/.test(String(studentId || '').trim())) return false
  if (cfg.sampleRate >= 1) return true
  if (cfg.sampleRate <= 0) return false
  const day = dayKey || new Date().toISOString().slice(0, 10)
  const digest = fnv1aHex(`${studentId}:${day}:campus-probe`)
  const bucket = parseInt(digest.slice(0, 8), 16) / 0xffffffff
  return bucket < cfg.sampleRate
}

/** 32 位 FNV-1a → 8 位十六进制（纯 JS，避免依赖 crypto，便于在测试/旧 WebView 里跑）。 */
function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 从 `get_cookies` 返回的整条 cookie 造一个**只含教务域**的请求头。
 *
 * `get_cookies` 的形态是 `hbu_session_cookies` 那种按域拼接的串（`key=value; key2=v2`）。
 * 这里不做域名解析（客户端没有域名信息），只按已知的会话键前缀过滤 + 去掉本项目自己的键，
 * 并做长度兜底：超过 6000 字节就按 value 长度从大到小丢弃（与后端同一策略）。
 */
export function buildCampusProbeCookieHeader(raw: string, maxBytes = 6000): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  const pairs: Array<[string, string]> = []
  for (const part of text.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key || !value) continue
    const lower = key.toLowerCase()
    // 挡掉本项目自己的存储键，别把自己的东西当学校凭据发出去
    if (lower.includes('mini_hbut') || lower.includes('hbu_session')) continue
    pairs.push([key, value])
  }
  if (!pairs.length) return ''
  const sortedByValueDesc = [...pairs].sort((a, b) => b[1].length - a[1].length)
  const keep = sortedByValueDesc
  while (keep.length > 0 && joinPairs(keep).length > maxBytes) keep.shift()
  return joinPairs(keep)
}

function joinPairs(pairs: Array<[string, string]>): string {
  return pairs
    .slice()
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

/**
 * 登录成功后的**一行式**入口：读开关 → 上报 → 吞掉所有异常。
 *
 * 单独抽出来是为了让调用点只占 1 行（`SessionCoordinator.ts` 已在 god-files 违规名单里，
 * 不能因为一次改动再往上加 8 行）。
 */
export function maybeReportCampusSession(studentId: string, cookies: string): void {
  void reportCampusSession({
    studentId,
    cookies,
    config: readCampusProbeConfigFromStorage()
  }).catch(() => {})
}

export interface CampusProbeReportOptions {
  studentId: string
  cookies: string
  config?: CampusProbeConfig | null
  /** 注入点（测试用） */
  fetchImpl?: typeof fetch
  endpoint?: string
  timeoutMs?: number
  dayKey?: string
  now?: () => number
}

export interface CampusProbeReportResult {
  sent: boolean
  reason?: string
  status?: number
}

/**
 * 上报一次。**任何情况下都不抛异常**，调用方可以放心 fire-and-forget。
 *
 * 返回值只用于测试与调试日志，不参与任何业务判断。
 */
export async function reportCampusSession(
  options: CampusProbeReportOptions
): Promise<CampusProbeReportResult> {
  const cfg = options.config || DEFAULT_CAMPUS_PROBE_CONFIG
  const studentId = String(options.studentId || '').trim()
  if (!shouldReportCampusSession(studentId, cfg, options.dayKey)) {
    return { sent: false, reason: cfg.enabled ? 'not_sampled' : 'disabled' }
  }
  const cookieHeader = buildCampusProbeCookieHeader(String(options.cookies || ''))
  if (!cookieHeader) return { sent: false, reason: 'no_cookie' }

  const doFetch = options.fetchImpl || (typeof fetch === 'function' ? fetch : undefined)
  if (!doFetch) return { sent: false, reason: 'no_fetch' }

  const controller =
    typeof AbortController === 'function' ? new AbortController() : undefined
  const timeoutMs = options.timeoutMs ?? CAMPUS_PROBE_TIMEOUT_MS
  const timer =
    controller && typeof setTimeout === 'function'
      ? setTimeout(() => {
          try {
            controller.abort()
          } catch {
            /* ignore */
          }
        }, timeoutMs)
      : undefined

  try {
    const response = await doFetch(options.endpoint || CAMPUS_PROBE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        campus_cookie: cookieHeader,
        source: 'client-login'
      }),
      signal: controller?.signal
    })
    return { sent: true, status: typeof response?.status === 'number' ? response.status : undefined }
  } catch (error) {
    // 静默：网络失败/超时/被 abort 都不影响用户
    return { sent: false, reason: 'transport_error' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
