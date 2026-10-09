/**
 * 启动诊断（iOS 冷启动冻结取证，#991 / #992）。
 *
 * ## 为什么独立于 debug_logger
 *
 * - `debug_logger` 的环形缓冲**只驻留内存**（`debug_logger.ts` 中 `persistLogs` 为空实现，
 *   注释明确禁止持久化），且 `initDebugLogger()` 会重置 `records`。而本次故障是
 *   「首次冷启动卡死后进程被系统终止」——等用户能打开「设置-调试信息」时，
 *   崩溃那一轮的日志已随进程消失，无法事后归因。
 * - 启动页阶段（`initDebugLogger()` 之前）的日志当前**没有任何出口**：`index.html`
 *   的内联脚本只 `console.info`，而 console 尚未被 patch。
 *
 * 因此本模块把**有界、已脱敏的启动时间线**单独持久化到 localStorage，只保留最近两次
 * 启动（本次 + 上一次），并在 `initDebugLogger()` 之后回放进调试日志缓冲。
 *
 * ## 数据边界（硬约束）
 *
 * - 只记录：时间戳、事件名、阶段耗时、失败子资源的 URL（去 query/hash）与错误类型；
 * - 绝不记录：凭据、令牌、Cookie、密码、用户内容；
 * - 所有字符串在写入前统一走 `sanitizeText`（脱敏 + 截断），URL 走 `sanitizeUrl`；
 * - 容量有界：单次启动最多 `MAX_ENTRIES` 条时间线 + `MAX_STALLS` 条长阻塞记录。
 *
 * 时间线缓冲由 `index.html` 的内联脚本在 JS 之前建立（见该文件的 `__hbuBootDiag`），
 * 本模块只做读取、回放与报告格式化，不重复实现采集。
 *
 * 采集侧容量上限（与 `index.html` 保持一致）：单次启动 240 条时间线 + 8 条长阻塞记录。
 */

import { getBootMetricsSnapshot } from './boot_metrics.js'
import { getDebugLogs, pushDebugLog } from './debug_logger'
import { STATISTICS_ENVIRONMENT, STATISTICS_SERVICE_BASE_URL } from './statistics_environment'

/** localStorage 键：跨启动保留最近两次冷启动时间线（崩溃取证必需） */
export const BOOT_DIAG_STORAGE_KEY = 'hbu_boot_diag_v1'

/** 单条字符串上限，避免持久化膨胀 */
const MAX_TEXT_LEN = 240
/**
 * 回放进调试日志的条目上限。
 *
 * `pushDebugLog` 每条都会回写 Rust（`push_runtime_log`），而回放发生在启动路径上；
 * 设上限以免在正要排查的启动阶段制造大量 IPC。完整时间线始终可在
 * 「启动诊断」报告（`formatBootDiagnosticsReport`）中查看。
 */
const MAX_REPLAY_ENTRIES = 60

/** 与 crash_reporter 同口径的敏感键值脱敏（本模块不直接依赖其内部实现） */
const SENSITIVE_PATTERN =
  /((?:access|refresh|id)?[_-]?token|cookie|authorization|password|passwd|secret|session[_-]?id)\s*[=:]\s*[^\s;&"',}]+/gi

export interface BootDiagEntry {
  /** 相对本次启动的 `performance.now()`（毫秒） */
  t: number
  /** 事件名 */
  name: string
  /** 附加信息（已脱敏、已截断） */
  detail?: Record<string, unknown>
}

export interface BootDiagStall {
  /** 冻结起点（performance.now()） */
  from: number
  /** 冻结终点（performance.now()） */
  to: number
  /** 实际间隔（毫秒） */
  gap: number
}

/**
 * 启动历史条目（最近 `MAX_HISTORY` 次，由 `index.html` 采集）。
 *
 * 为什么需要它：只保留「当前 + 上一次」会**吃掉崩溃 / 重载循环** —— 若 WebContent 反复
 * 被杀并重载，每次都会留下一条完整（`finished: true`）的记录，只看两条会以为一切正常。
 * 有了历史就能看出「两次启动只隔 3 秒」这类异常间隔。
 */
export interface BootHistoryEntry {
  at: number
  bootId?: string
  finished?: boolean
  cleanExit?: boolean
  aliveMs?: number
  navMs?: number
  finishedAt?: number
}

export interface BootDiagSnapshot {
  v: number
  bootId: string
  /** 本次启动的墙钟时间（Date.now()） */
  startedAtWall: number
  entries: BootDiagEntry[]
  stalls: BootDiagStall[]
  /** 是否走完启动（Vue 挂载 + 启动页移除） */
  finished: boolean
  finishedAt?: number
  /**
   * 是否记录到正常退出（`pagehide` / `beforeunload`）。
   *
   * iOS 上崩溃与被用户手动划掉都不会触发这两个事件，因此 `false` 的含义是
   * 「进程未正常结束（崩溃，或被划掉）」—— 报告里如实标注二者不可区分。
   */
  cleanExit?: boolean
  /** 最近若干次启动的摘要（新→旧由报告侧决定） */
  history?: BootHistoryEntry[]
  meta: Record<string, unknown>
}

/** `index.html` 内联脚本注入的桥（本模块只消费） */
export interface BootDiagBridge {
  push: (name: string, detail?: Record<string, unknown>) => void
  flush: () => void
  markFinished: (name: string) => void
  snapshot: () => BootDiagSnapshot
}

interface BootDiagWindow extends Window {
  __hbuBootDiag?: BootDiagBridge
  __HBU_BOOT_DIAG__?: BootDiagSnapshot
}

interface StoredBootDiag {
  current?: BootDiagSnapshot
  previous?: BootDiagSnapshot
}

const getDiagWindow = (): BootDiagWindow | null =>
  typeof window === 'undefined' ? null : (window as BootDiagWindow)

/** 截断 + 脱敏；任何输入都不抛错 */
export const sanitizeText = (input: unknown, max = MAX_TEXT_LEN): string => {
  let text: string
  if (typeof input === 'string') {
    text = input
  } else if (typeof input === 'number' || typeof input === 'boolean') {
    text = String(input)
  } else if (input instanceof Error) {
    text = input.message || String(input)
  } else if (input === null || input === undefined) {
    text = String(input)
  } else {
    try {
      text = JSON.stringify(input) ?? String(input)
    } catch {
      text = String(input)
    }
  }
  const redacted = text.replace(SENSITIVE_PATTERN, '$1=[已脱敏]')
  return redacted.length > max ? `${redacted.slice(0, max)}…` : redacted
}

/** 只保留 origin + pathname，丢掉 query / hash（避免令牌等随 URL 落盘） */
export const sanitizeUrl = (raw: unknown): string => {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  const base = typeof location !== 'undefined' ? location.href : 'http://localhost/'
  try {
    const url = new URL(text, base)
    // 非特殊 scheme（tauri:// / capacitor:// 等）下 `origin` 为字面量 "null"，必须回退到 protocol+host
    const origin = url.origin && url.origin !== 'null' ? url.origin : `${url.protocol}//${url.host}`
    return `${origin}${url.pathname}`
  } catch {
    return text.split('?')[0].split('#')[0]
  }
}

/** 对 detail 做逐字段净化；URL 类键走 sanitizeUrl */
export const sanitizeDetail = (
  detail: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!detail || typeof detail !== 'object') return undefined
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(detail)) {
    if (value === undefined) continue
    if (/^(url|src|href)$/i.test(key)) {
      out[key] = sanitizeUrl(value)
      continue
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value
      continue
    }
    out[key] = sanitizeText(value)
  }
  return Object.keys(out).length ? out : undefined
}

/** 取 `index.html` 注入的桥；非浏览器环境 / 桥缺失时返回 null */
export const getBootDiagBridge = (): BootDiagBridge | null => {
  const win = getDiagWindow()
  return win?.__hbuBootDiag ?? null
}

/** 记录一个启动阶段（桥缺失时静默丢弃，绝不阻断启动） */
export const recordBootStage = (name: string, detail?: Record<string, unknown>): void => {
  try {
    getBootDiagBridge()?.push(name, sanitizeDetail(detail))
  } catch {
    // 诊断代码自身绝不能再抛错
  }
}

/** 标记本次启动已走完（Vue 挂载 + 启动页移除） */
export const markBootFinished = (name = 'boot-finished'): void => {
  try {
    getBootDiagBridge()?.markFinished(name)
  } catch {
    // ignore
  }
}

const isSnapshot = (value: unknown): value is BootDiagSnapshot => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BootDiagSnapshot>
  return Array.isArray(candidate.entries) && typeof candidate.bootId === 'string'
}

/** 读取持久化的启动诊断（上次 / 本次） */
export const readStoredBootDiagnostics = (): StoredBootDiag => {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(BOOT_DIAG_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredBootDiag
    if (!parsed || typeof parsed !== 'object') return {}
    return {
      current: isSnapshot(parsed.current) ? parsed.current : undefined,
      previous: isSnapshot(parsed.previous) ? parsed.previous : undefined
    }
  } catch {
    return {}
  }
}

/** 本次启动快照优先取内存中的实时值，回落到持久化值 */
export const readBootDiagnostics = (): {
  current: BootDiagSnapshot | null
  previous: BootDiagSnapshot | null
} => {
  const stored = readStoredBootDiagnostics()
  const live = getDiagWindow()?.__HBU_BOOT_DIAG__ ?? null
  return {
    current: live ?? stored.current ?? null,
    previous: stored.previous ?? null
  }
}

/**
 * 判定一次启动的「结局」，用于报告与回放时给出可读结论。
 *
 * - `abnormal-exit`：走完了启动，但没记录到正常退出 → 启动完成后进程突然消失
 *   （崩溃 / 被系统终止 / 被手动划掉，iOS 上无法进一步区分）。
 * - `incomplete-boot`：连启动都没走完 → 启动期就没了（此前那种「卡死后崩溃」）。
 * - `clean`：走完启动且记录到正常退出。
 */
export type BootOutcome = 'clean' | 'abnormal-exit' | 'incomplete-boot'

export const resolveBootOutcome = (snapshot: BootDiagSnapshot): BootOutcome => {
  if (snapshot.finished !== true) return 'incomplete-boot'
  return snapshot.cleanExit === true ? 'clean' : 'abnormal-exit'
}

/**
 * 「进程启动 → 页面开始加载」的耗时（毫秒）。
 *
 * 为什么必须单独算：`index.html` 的内联脚本把自身时刻当作时间原点，报告里所有 `+Nms`
 * 都相对它 —— 因此**页面加载本身以及更早的原生启动阶段完全不可见**。真机上出现过
 * 「白屏 10 秒但 JS 启动只要 33ms」，正是被这段盲区吃掉的。
 *
 * 算法：`time_origin`（导航开始墙钟）− `process_started_at`（Rust `run()` 开头记录的
 * 进程启动墙钟）。
 *
 * ⚠️ 依赖 Rust 侧 `mark_process_start()`。**不能用 `rust_uptime_ms` 反推**：`runtime_log`
 * 的日志状态是惰性初始化的，release 构建启动期没有日志推送时它接近 0，反推会得到假的 0ms
 * （真机上已踩到）。字段缺失时返回 `null`（报告显示「证据不足」）—— **不猜数字**。
 */
export const resolveNativePreMs = (snapshot: BootDiagSnapshot | null): number | null => {
  if (!snapshot) return null
  const timeOrigin = Number(snapshot.meta?.time_origin)
  const entry = snapshot.entries.find((item) => item.name === 'native-uptime')
  const startedAt = Number(entry?.detail?.process_started_at)
  if (!Number.isFinite(timeOrigin) || !Number.isFinite(startedAt) || startedAt <= 0) return null
  const value = timeOrigin - startedAt
  return Number.isFinite(value) ? Math.max(0, value) : null
}

/**
 * 本次页面加载时，原生进程**已经运行了多久**（毫秒）。
 *
 * 大值 ⇒ 这不是冷启动，而是**旧进程内的页面重载**（例如 #451 白屏兜底的
 * `location.reload()`）。新页面里两者长得一模一样（都有新的 boot_id），只有这个值
 * 能把它们区分开 —— 而重载循环会让应用反复白屏重来。
 */
export const resolveProcessAgeAtBootMs = (snapshot: BootDiagSnapshot | null): number | null => {
  if (!snapshot) return null
  const entry = snapshot.entries.find((item) => item.name === 'native-uptime')
  const uptime = Number(entry?.detail?.rust_uptime_ms)
  return Number.isFinite(uptime) ? Math.max(0, uptime) : null
}

/** 是否存在内存中的实时快照（有 ⇒ `current` 就是本次仍在运行的进程） */
export const hasLiveBootSnapshot = (): boolean => !!getDiagWindow()?.__HBU_BOOT_DIAG__

const OUTCOME_LABEL: Record<BootOutcome, string> = {
  clean: '正常结束',
  'abnormal-exit': '启动完成后进程未正常结束（崩溃 / 被系统终止 / 被手动划掉）',
  'incomplete-boot': '启动未走完（疑似启动期被系统终止）'
}

/**
 * 把启动页阶段（`initDebugLogger()` 之前）的记录回放进调试日志缓冲。
 *
 * 必须在 `initDebugLogger()` **之后**调用：该函数会重置 `records`，
 * 早于它写入的日志会被丢弃。
 *
 * 注意：`pushDebugLog` 会顺带把每条日志回写 Rust（`push_runtime_log`），
 * 因此回放条数有上限，避免在启动路径上制造大量 IPC。
 *
 * @returns 回放的条目数
 */
export const replayBootDiagnostics = (): number => {
  const { current, previous } = readBootDiagnostics()
  let replayed = 0

  const push = (level: 'info' | 'warn' | 'error', message: string, details?: unknown) => {
    if (replayed >= MAX_REPLAY_ENTRIES) return
    pushDebugLog('Boot', message, level, details)
    replayed += 1
  }

  if (previous) {
    const outcome = resolveBootOutcome(previous)
    if (outcome !== 'clean') {
      push(
        'warn',
        `上次启动结局：${OUTCOME_LABEL[outcome]}（boot=${previous.bootId}，时间线 ${previous.entries.length} 条）`,
        {
          boot_id: previous.bootId,
          outcome,
          started_at: new Date(previous.startedAtWall).toISOString(),
          finished: previous.finished,
          clean_exit: previous.cleanExit === true,
          alive_ms: previous.meta?.alive_ms,
          entries: previous.entries.length,
          stalls: previous.stalls.length
        }
      )
    }
  }

  if (current) {
    push('info', `启动时间线共 ${current.entries.length} 条（含启动页阶段）`, {
      boot_id: current.bootId
    })
    for (const entry of current.entries) {
      const level: 'info' | 'warn' | 'error' =
        entry.name === 'resource-error' ? 'error' : entry.name === 'main-thread-stall' ? 'warn' : 'info'
      const detailText = entry.detail ? ` ${sanitizeText(entry.detail)}` : ''
      push(level, `+${entry.t}ms ${entry.name}${detailText}`)
    }
    for (const stall of current.stalls) {
      push('warn', `主线程冻结 ${stall.gap}ms（${stall.from}ms → ${stall.to}ms）`, stall)
    }
  }

  // boot_metrics 的 mark 早于 initDebugLogger 写入的日志行会被丢弃，这里补一遍
  try {
    const snapshot = getBootMetricsSnapshot()
    for (const mark of Object.values(snapshot.marks ?? {})) {
      push('info', `boot_metric ${mark.name} +${mark.elapsed_ms}ms`, mark.detail)
    }
  } catch {
    // ignore
  }

  return replayed
}

const formatDuration = (ms: number) => `${Math.round(ms)}ms`

const formatBootSection = (
  title: string,
  snapshot: BootDiagSnapshot | null,
  live = false
): string[] => {
  if (!snapshot) return [`--- ${title} ---`, '（无记录）']
  const outcome = resolveBootOutcome(snapshot)
  // 本次启动的进程仍在运行 ⇒ 当然还没记录到退出，不能据此判成「异常结束」
  const outcomeText =
    live && snapshot.cleanExit !== true
      ? '进行中（本次进程仍在运行，尚未记录退出）'
      : OUTCOME_LABEL[outcome]
  const splashRemoved = snapshot.entries.find((entry) => entry.name === 'splash-removed')
  const splashElapsed = Number(splashRemoved?.detail?.elapsed ?? NaN)
  const lines: string[] = [
    `--- ${title} ---`,
    `boot_id: ${snapshot.bootId}`,
    `启动墙钟: ${new Date(snapshot.startedAtWall).toLocaleString()}`,
    `结局: ${outcomeText}`,
    `是否走完启动: ${snapshot.finished ? `是（${snapshot.finishedAt ?? 0}ms）` : '否'}`,
    `是否记录到正常退出: ${snapshot.cleanExit === true ? '是' : '否'}`,
    `时间线条目: ${snapshot.entries.length}，长阻塞记录: ${snapshot.stalls.length}`
  ]
  const nativePre = resolveNativePreMs(snapshot)
  if (nativePre !== null) {
    lines.push(`原生前置（进程启动 → 页面开始加载）: ${formatDuration(nativePre)}`)
  }
  const processAge = resolveProcessAgeAtBootMs(snapshot)
  if (processAge !== null) {
    lines.push(
      `本次加载时原生进程已运行: ${formatDuration(processAge)}${
        processAge >= 60_000 ? '（⚠️ 旧进程内重载，不是冷启动）' : ''
      }`
    )
  }
  // #451 硬重载是「白屏循环」最可能的来源，且新页面里与冷启动无法区分 —— 必须显式标出
  if (snapshot.meta?.hard_reload_boot) {
    lines.push(
      `本次启动由 #451 硬重载触发（${formatDuration(Number(snapshot.meta.hard_reload_age_ms) || 0)} 前，累计第 ${sanitizeText(snapshot.meta.hard_reload_count ?? '?')} 次）`
    )
  }
  const nativeStalls = snapshot.entries.filter((entry) => entry.name === 'native-stall')
  if (nativeStalls.length) {
    const costs = nativeStalls.map((entry) => formatDuration(Number(entry.detail?.cost_ms) || 0)).join(' / ')
    lines.push(`原生无响应: ${nativeStalls.length} 次（${costs}）`)
    lines.push(
      '  ⚠️ JS 未冻结但原生请求无响应 ⇒ 卡在**原生主线程**：WebView 无法呈现（白屏），随后 iOS 看门狗约 10s 杀掉进程'
    )
  }
  const navMs = Number(snapshot.meta?.nav_ms)
  if (Number.isFinite(navMs)) {
    lines.push(`页面加载（导航开始 → 内联脚本）: ${formatDuration(navMs)}`)
  }
  const fcp = Number(snapshot.meta?.paint_fcp_ms)
  const lcp = Number(snapshot.meta?.paint_lcp_ms)
  if (Number.isFinite(fcp)) {
    lines.push(
      `首帧 FCP: ${formatDuration(fcp)}${Number.isFinite(lcp) ? `，最大内容 LCP: ${formatDuration(lcp)}` : ''}`
    )
    // 这是「白屏多久」的直接答案，也是「是不是主线程被卡」的判别器
    if (fcp >= 2000 && snapshot.stalls.length === 0) {
      lines.push(
        '  ⚠️ 首帧很晚但主线程未冻结 ⇒ 瓶颈不在 JS 主线程，而在「内容何时被画出」（异步视图 chunk 未就绪 / 绘制被推迟）'
      )
    }
  }
  if (Number.isFinite(splashElapsed)) {
    lines.push(`启动页可见时长: ${formatDuration(splashElapsed)}（移除原因 ${sanitizeText(splashRemoved?.detail?.reason ?? '')}）`)
  }
  if (snapshot.meta?.alive_ms !== undefined) {
    lines.push(`进程最后存活: ${formatDuration(Number(snapshot.meta.alive_ms) || 0)}（此后无落盘 → 进程在此前后消失）`)
  }
  for (const stall of snapshot.stalls) {
    lines.push(`  [主线程冻结] ${formatDuration(stall.from)} → ${formatDuration(stall.to)}（间隔 ${formatDuration(stall.gap)}）`)
  }
  for (const entry of snapshot.entries) {
    const detailText = entry.detail ? ` ${sanitizeText(entry.detail)}` : ''
    lines.push(`  +${formatDuration(entry.t)} ${entry.name}${detailText}`)
  }
  const metaKeys = Object.keys(snapshot.meta ?? {})
  if (metaKeys.length) {
    lines.push('  环境:')
    for (const key of metaKeys) {
      lines.push(`    ${key} = ${sanitizeText(snapshot.meta[key])}`)
    }
  }
  return lines
}

/**
 * 最近启动历史（新 → 旧）。
 *
 * 关键判读：相邻两次间隔 < 5s 说明**不是用户在重新打开应用**，而是同一会话内页面被重载
 * （WebContent 被杀后 WKWebView 重载是最常见的一种）；`启动未走完` 说明那一轮连 JS 都没跑完。
 */
const formatBootHistory = (snapshot: BootDiagSnapshot | null): string[] => {
  const lines: string[] = ['--- 最近启动历史（新 → 旧） ---']
  const raw = Array.isArray(snapshot?.history) ? snapshot?.history ?? [] : []
  if (!raw.length) {
    lines.push('（无）')
    return lines
  }
  const ordered = [...raw].reverse()
  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index]
    const older = ordered[index + 1]
    const gap = older ? Number(item.at) - Number(older.at) : NaN
    const flags: string[] = [
      item.finished === false ? '启动未走完' : '走完启动',
      item.cleanExit === true ? '正常退出' : '未记录正常退出'
    ]
    if (Number.isFinite(gap)) {
      flags.push(`距上一次 ${Math.round(gap / 1000)}s`)
      if (gap > 0 && gap < 5000) flags.push('⚠️ 间隔 <5s（疑似页面重载 / 崩溃循环）')
    } else {
      flags.push('（最早一条）')
    }
    if (item.aliveMs) flags.push(`存活 ${Math.round(Number(item.aliveMs) / 1000)}s`)
    lines.push(`  ${new Date(Number(item.at)).toLocaleTimeString()} ${flags.join(' | ')}`)
  }
  return lines
}

/**
 * 生成可一键复制的「启动诊断」纯文本报告。
 * 包含：构建环境 → 本次启动时间线 → 上次启动时间线 → 启动阶段指标 → 资源加载失败汇总。
 */
export const formatBootDiagnosticsReport = (): string => {
  const { current, previous } = readBootDiagnostics()
  // Vite / Vitest 均注入 import.meta.env；非 Vite 运行时回落空对象，报告仍可用
  const env: Partial<ImportMetaEnv> = (import.meta as ImportMeta).env ?? {}
  const lines: string[] = [
    '=== Mini-HBUT 启动诊断报告 ===',
    `生成时间: ${new Date().toLocaleString()}`,
    `构建版本: ${sanitizeText(env.VITE_APP_VERSION || '(未知)')}`,
    `构建档位: ${sanitizeText(env.VITE_BUILD_PROFILE || '(未知)')}`,
    // #999：后端环境必须出现在报告里。dev / beta 档位会被环境隔离强制指向测试域，
    // 而「测试域不可用」在界面上只表现为泛化的「无效响应」——没有这一行就无法一眼定位。
    `后端环境: ${sanitizeText(STATISTICS_ENVIRONMENT)}`,
    `后端主域: ${sanitizeText(STATISTICS_SERVICE_BASE_URL)}`,
    `App Store 构建: ${sanitizeText(env.VITE_APP_STORE_BUILD || '0')}`,
    `平台: ${typeof navigator !== 'undefined' ? sanitizeText(navigator.userAgent) : '(未知)'}`,
    `可见性: ${typeof document !== 'undefined' ? document.visibilityState : '(未知)'}`,
    ''
  ]

  // 结论置顶：上一轮是否异常结束，是本次取证最想回答的问题
  if (previous) {
    lines.push(`上次启动结局: ${OUTCOME_LABEL[resolveBootOutcome(previous)]}`)
  } else {
    lines.push('上次启动结局: （无记录 —— 这是本次诊断上线后的第一次启动）')
  }
  lines.push('')

  lines.push(...formatBootSection('本次启动时间线', current, hasLiveBootSnapshot()))
  lines.push('')
  lines.push(...formatBootSection('上次启动时间线', previous))
  lines.push('')
  lines.push(...formatBootHistory(current))

  lines.push('')
  lines.push('--- 资源加载失败汇总（本次启动） ---')
  const failures = (current?.entries ?? []).filter((entry) => entry.name === 'resource-error')
  if (!failures.length) {
    lines.push('（无）')
  } else {
    for (const failure of failures) {
      lines.push(`  +${formatDuration(failure.t)} ${sanitizeText(failure.detail)}`)
    }
  }

  lines.push('')
  lines.push('--- 启动阶段指标（boot_metrics） ---')
  try {
    const snapshot = getBootMetricsSnapshot()
    const marks = Object.values(snapshot.marks ?? {})
    if (!marks.length) {
      lines.push('（无）')
    } else {
      for (const mark of marks) {
        lines.push(`  ${mark.name} +${formatDuration(mark.elapsed_ms)} ${sanitizeText(mark.detail ?? {})}`)
      }
    }
  } catch {
    lines.push('（读取失败）')
  }

  lines.push('')
  lines.push('--- 最近错误日志（最多 20 条） ---')
  const errorLogs = getDebugLogs(400).filter((item) => item.level === 'error').slice(-20)
  if (!errorLogs.length) {
    lines.push('（无）')
  } else {
    for (const item of errorLogs) {
      lines.push(`  ${new Date(item.ts).toLocaleTimeString()} [${item.scope}] ${sanitizeText(item.message)}`)
    }
  }

  lines.push('')
  lines.push('=== 报告结束 ===')
  return lines.join('\n')
}
