/**
 * 学号核验（goal-18 · 身份 v2 第二步）：登录后在**新版本**上静默调用 Rust 命令 `identity_school_verify`。
 *
 * 服务端：`https://mini.hbut.site/school/verify`（student-auth，契约 `docs/school-verify-contract.md`）。
 * 请求、签名、cookie 读取全部在 Rust 侧完成；**本模块不读、不传任何 cookie**。
 *
 * 纪律（每条都有用例锁）：
 * 1. **默认关**：`remote_config.school_verify.enabled` 为假 → 一个新请求都不发，行为与改动前完全一致（照旧走旧上报）；
 * 2. **只在桌面 / iOS**：Android 没有设备保险箱，继续走旧上报（用户决定 U2）；
 * 3. **绝不阻塞、绝不打扰**：fire-and-forget，吞掉所有异常，不弹窗、不改任何状态；
 * 4. **本地做不了才回退**：平台不支持 / 设备保险箱不可用 / 命令调用异常 → 回退旧上报（等价于改动前）；
 *    服务端已受理但失败（网络、限流、会话失效……）→ **不回退**，避免同一份 cookie 再发往另一个端点；
 * 5. **少打扰服务端**：同一进程内同一学号，成功后 12 小时、失败后 10 分钟内不重复发起，且同一时刻只跑一次
 *    （服务端本来就按「学号 + 设备」复用 180 天，频繁调用没有意义）。
 *
 * 旧版本不认识 `school_verify` 这个远程配置键（`normalizeRemoteConfig` 逐字段归一化），因此零影响。
 */

import { invokeNative } from '../platform/native'
import { isAndroidLike } from '../platform/runtime'
import { maybeReportCampusSession } from './campus_probe'
import { REMOTE_CONFIG_SNAPSHOT_KEY } from './remote_config_defaults'

export const SCHOOL_VERIFY_COMMAND = 'identity_school_verify'

export interface SchoolVerifyConfig {
  enabled: boolean
  /** 灰度比例 [0, 1]，按学号确定性分桶（同一人结论稳定） */
  sampleRate: number
}

/** 默认关；打开时不写比例即全量（服务端复用让成本很低，灰度用 sample_rate 显式控制）。 */
export const DEFAULT_SCHOOL_VERIFY_CONFIG: SchoolVerifyConfig = Object.freeze({
  enabled: false,
  sampleRate: 1
})

/** Rust 命令返回（字段与 `school_verify::flow::SchoolVerifyPayload` 一一对应，snake_case）。 */
export interface SchoolVerifyPayload {
  ok: boolean
  status: 'verified' | 'reused' | 'failed' | 'unsupported' | string
  reason: string | null
  http_status: number | null
  retry_after_seconds: number | null
  student_id_masked: string | null
  verified_at: number | null
  reuse_until: number | null
  casdoor: string | null
  cookie_sent: boolean
}

/** 这些结果说明「本机做不了」（与服务端无关）→ 回退旧上报，保持改动前的行为。 */
const LOCAL_INABILITY_REASONS = new Set(['unsupported_platform', 'device_key_unavailable', 'signing_failed', 'no_local_login'])

export const SUCCESS_COOLDOWN_MS = 12 * 60 * 60 * 1000
export const FAILURE_COOLDOWN_MS = 10 * 60 * 1000

/**
 * 规范化 remote_config 里的 `school_verify` 块（兼容 snake_case / camelCase，也接受本函数自己的输出形状）。
 * 非法值一律回落默认（**默认关**）；比例 >1 视为百分数，再 clamp 到 [0, 1]。
 */
export function normalizeSchoolVerifyConfig(raw: unknown): SchoolVerifyConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCHOOL_VERIFY_CONFIG }
  const block = raw as Record<string, unknown>
  const enabledRaw = block.enabled ?? block.Enabled
  const enabled = enabledRaw === true || String(enabledRaw ?? '').trim().toLowerCase() === 'true'
  const rateRaw = block.sample_rate ?? block.sampleRate
  let sampleRate = rateRaw === undefined || rateRaw === null || rateRaw === '' ? DEFAULT_SCHOOL_VERIFY_CONFIG.sampleRate : Number(rateRaw)
  if (!Number.isFinite(sampleRate)) sampleRate = DEFAULT_SCHOOL_VERIFY_CONFIG.sampleRate
  if (sampleRate > 1) sampleRate = sampleRate / 100
  sampleRate = Math.min(1, Math.max(0, sampleRate))
  return { enabled, sampleRate }
}

/** 从本地 remote_config 快照读 `school_verify` 块（快照里是归一化后的配置）。任何异常 → 默认关。 */
export function readSchoolVerifyConfigFromStorage(): SchoolVerifyConfig {
  try {
    const storage = typeof localStorage !== 'undefined' && localStorage ? localStorage : (globalThis as { localStorage?: Storage }).localStorage
    const raw = storage?.getItem(REMOTE_CONFIG_SNAPSHOT_KEY)
    if (!raw) return { ...DEFAULT_SCHOOL_VERIFY_CONFIG }
    const parsed = JSON.parse(String(raw)) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SCHOOL_VERIFY_CONFIG }
    return normalizeSchoolVerifyConfig(parsed.school_verify ?? parsed.schoolVerify)
  } catch {
    return { ...DEFAULT_SCHOOL_VERIFY_CONFIG }
  }
}

/** 32 位 FNV-1a → [0, 1)，按学号确定性分桶（与天无关：同一人要么一直在灰度里，要么一直不在）。 */
function bucketOf(studentId: string): number {
  let hash = 0x811c9dc5
  const text = `${studentId}:school-verify`
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return (hash >>> 0) / 0x100000000
}

export type CampusIdentityRoute = 'school_verify' | 'campus_probe'

/** 走新认证还是旧上报（纯函数）。任何不满足 → 旧上报，即改动前的行为。 */
export function decideCampusIdentityRoute(
  studentId: string,
  config: SchoolVerifyConfig | null | undefined,
  { android }: { android: boolean }
): CampusIdentityRoute {
  const cfg = config || DEFAULT_SCHOOL_VERIFY_CONFIG
  if (!cfg.enabled || android) return 'campus_probe'
  if (!/^\d{10}$/.test(String(studentId || '').trim())) return 'campus_probe'
  if (cfg.sampleRate <= 0) return 'campus_probe'
  if (cfg.sampleRate < 1 && bucketOf(String(studentId).trim()) >= cfg.sampleRate) return 'campus_probe'
  return 'school_verify'
}

/** 本次结果是否属于「本机做不了」（→ 回退旧上报）。 */
export function isLocalInability(payload: SchoolVerifyPayload | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') return true
  if (payload.status === 'unsupported') return true
  return !payload.ok && LOCAL_INABILITY_REASONS.has(String(payload.reason || ''))
}

const lastAttempt = new Map<string, { at: number; ok: boolean }>()
/** 同一学号同一时刻只跑一次（登录 / 恢复会话可能连续触发多次 persistSessionCookies）。 */
const inFlight = new Set<string>()

/** 测试用：清空进程内节流记录。 */
export function resetSchoolVerifyThrottle(): void {
  lastAttempt.clear()
  inFlight.clear()
}

function throttled(studentId: string, now: number): boolean {
  const prev = lastAttempt.get(studentId)
  if (!prev) return false
  return now - prev.at < (prev.ok ? SUCCESS_COOLDOWN_MS : FAILURE_COOLDOWN_MS)
}

export interface CampusIdentityOptions {
  studentId: string
  cookies: string
  config?: SchoolVerifyConfig | null
  /** 注入点（测试用） */
  android?: boolean
  invoke?: (command: string) => Promise<unknown>
  reportProbe?: (studentId: string, cookies: string) => void
  now?: () => number
}

export interface CampusIdentityResult {
  route: CampusIdentityRoute | 'throttled'
  /** 新认证本地做不了而回退了旧上报 */
  fellBack: boolean
  payload?: SchoolVerifyPayload
}

/**
 * 跑一次：决定路线 → 新认证（必要时回退旧上报）或直接旧上报。**任何情况下都不抛异常。**
 * 返回值只用于测试与调试，不参与任何业务判断。
 */
export async function runCampusIdentity(options: CampusIdentityOptions): Promise<CampusIdentityResult> {
  const studentId = String(options.studentId || '').trim()
  const cookies = String(options.cookies || '')
  const reportProbe = options.reportProbe || maybeReportCampusSession
  const config = options.config === undefined ? readSchoolVerifyConfigFromStorage() : options.config
  const android = options.android ?? isAndroidLike()
  const route = decideCampusIdentityRoute(studentId, config, { android })
  if (route === 'campus_probe') {
    reportProbe(studentId, cookies)
    return { route, fellBack: false }
  }
  const now = (options.now || Date.now)()
  if (throttled(studentId, now) || inFlight.has(studentId)) return { route: 'throttled', fellBack: false }
  const invoke = options.invoke || ((command: string) => invokeNative<SchoolVerifyPayload>(command))
  let payload: SchoolVerifyPayload | undefined
  inFlight.add(studentId)
  try {
    payload = (await invoke(SCHOOL_VERIFY_COMMAND)) as SchoolVerifyPayload
  } catch {
    payload = undefined
  } finally {
    inFlight.delete(studentId)
  }
  if (isLocalInability(payload)) {
    // 本机做不了（含命令调用异常）：不记节流，回退旧上报 = 改动前的行为
    reportProbe(studentId, cookies)
    return { route, fellBack: true, payload }
  }
  lastAttempt.set(studentId, { at: now, ok: Boolean(payload?.ok) })
  return { route, fellBack: false, payload }
}

/**
 * 登录成功后的**一行式**入口（替换原来的 `maybeReportCampusSession` 调用点，调用点仍只占 1 行：
 * `SessionCoordinator.ts` 在 god-files 名单里，不能再加行）。
 */
export function maybeVerifyCampusIdentity(studentId: string, cookies: string): void {
  void runCampusIdentity({ studentId, cookies }).catch(() => {})
}
