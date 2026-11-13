// src/features/identity/sso/identitySsoBootstrap.ts
//
// Epic #1243（G1-04 / mini-hbut#1248）：教务登录成功后的**幂等**无感 SSO 初始化。
//
// 目标（Epic §2.A）：学生只登录学校教务；客户端在后台尝试建立/恢复 Casdoor 学生会话，
// **不弹任何 Casdoor 登录/注册/绑定页面**，也不阻塞课表/成绩等主流程。
//
// 本模块只负责「要不要试、试几次、失败怎么办」，不负责 OIDC 细节（那在 oidcFlow.ts）：
//   - 非 Tauri 运行时（浏览器预览/演示）→ 跳过（没有原生 OIDC 能力）；
//   - 没有学号 → 跳过（调用方还没登录）；
//   - 已有有效会话 → 跳过（避免每次进首页都重开授权页）；
//   - 同一次登录内并发调用 → **合并成一次**（in-flight 去重），避免重复打开授权页；
//   - 切号（epoch 变化）→ 结果作废，绝不把旧学号的结果写进新学号；
//   - 任何异常 → 返回 `{ ok:false, reason }`，**永不抛**（调用方是 fire-and-forget）。
//
// 设计取舍：本模块**不读 localStorage、不写缓存、不发请求**，全部通过注入依赖完成，
// 因此可在 vitest 里穷举分支，不需要 Tauri 运行时或真实 Casdoor。

import { isTauriRuntime } from '../../../platform/native'

export type SsoBootstrapReason =
  | 'not_tauri'
  | 'no_student_id'
  | 'disabled'
  | 'session_valid'
  | 'begun'
  | 'begin_failed'
  | 'epoch_changed'
  | 'status_failed'

export interface SsoBootstrapResult {
  /** 是否成功建立了「需要继续授权」的流程或确认会话有效 */
  ok: boolean
  /** 是否被跳过（跳过不是错误） */
  skipped: boolean
  reason: SsoBootstrapReason
  /** 实际发起 OIDC begin 的时刻（unix 毫秒）；未发起时缺省 */
  beganAt?: number
}

export interface SsoBootstrapDeps {
  /** 是否运行在 Tauri（原生 OIDC 能力）里 */
  isTauri?: () => boolean
  /** 是否启用（可被远端配置/调试开关关掉；默认启用） */
  enabled?: () => boolean
  /** 查询现有 Casdoor 会话；`ok=true` 表示已有效 */
  sessionStatus?: () => Promise<{ ok: boolean }>
  /** 发起 OIDC 授权（幂等由本模块保证，调用方不必自己判重） */
  begin?: () => Promise<{ ok: boolean }>
  /** 当前时钟（测试注入） */
  now?: () => number
}

export interface SsoBootstrapParams {
  studentId: string
  /** 账号代际：切号时 +1；结果与代际不匹配即作废 */
  epoch: number
  /** 读当前代际（用于 await 之后复核）；缺省则不做代际复核 */
  getEpoch?: () => number
}

const RESULT_SKIPPED_NOT_TAURI: SsoBootstrapResult = { ok: false, skipped: true, reason: 'not_tauri' }
const RESULT_SKIPPED_NO_SID: SsoBootstrapResult = { ok: false, skipped: true, reason: 'no_student_id' }
const RESULT_SKIPPED_DISABLED: SsoBootstrapResult = { ok: false, skipped: true, reason: 'disabled' }

/** in-flight 去重表：key = 学号。同一学号并发调用共享同一个 Promise。 */
const inflight = new Map<string, Promise<SsoBootstrapResult>>()

/** 仅供测试：清空 in-flight 表（生产代码不应调用）。 */
export const __resetIdentitySsoBootstrapState = (): void => {
  inflight.clear()
}

const defaultDeps = (): Required<SsoBootstrapDeps> => ({
  // 静态 import：客户端是 ESM，`require` 在浏览器 bundle 里不存在（曾写成 require 会直接崩）
  isTauri: () => {
    try {
      return Boolean(isTauriRuntime())
    } catch {
      return false
    }
  },
  enabled: () => true,
  sessionStatus: async () => {
    const flow = await import('../oidc/oidcFlow')
    const res = await flow.oidcSessionStatus()
    return { ok: Boolean(res && res.ok) }
  },
  begin: async () => {
    const flow = await import('../oidc/oidcFlow')
    const res = await flow.oidcBegin()
    return { ok: Boolean(res && res.ok) }
  },
  now: () => Date.now()
})

const runBootstrap = async (
  params: SsoBootstrapParams,
  deps: Required<SsoBootstrapDeps>
): Promise<SsoBootstrapResult> => {
  const sid = String(params?.studentId || '').trim()
  if (!sid) return RESULT_SKIPPED_NO_SID

  if (!deps.enabled()) return RESULT_SKIPPED_DISABLED
  if (!deps.isTauri()) return RESULT_SKIPPED_NOT_TAURI

  // 1) 已有会话 → 不需要重开授权页（避免每次登录都弹一次浏览器）
  let sessionOk = false
  try {
    const status = await deps.sessionStatus()
    sessionOk = Boolean(status && status.ok)
  } catch {
    // 会话查询失败按「没有会话」处理（继续尝试 begin），但**不抛**
    sessionOk = false
  }
  if (sessionOk) {
    if (params.getEpoch && params.getEpoch() !== params.epoch) {
      return { ok: false, skipped: false, reason: 'epoch_changed' }
    }
    return { ok: true, skipped: true, reason: 'session_valid' }
  }

  // 2) 发起授权（await 后复核代际：切号时结果必须作废）
  const beganAt = deps.now()
  let begun = false
  try {
    const res = await deps.begin()
    begun = Boolean(res && res.ok)
  } catch {
    begun = false
  }

  if (params.getEpoch && params.getEpoch() !== params.epoch) {
    // 切号：本次结果属于旧学号，丢弃（不写任何状态、不改任何缓存）
    return { ok: false, skipped: false, reason: 'epoch_changed', beganAt }
  }
  if (!begun) {
    return { ok: false, skipped: false, reason: 'begin_failed', beganAt }
  }
  return { ok: true, skipped: false, reason: 'begun', beganAt }
}

/**
 * 幂等地初始化无感 SSO。
 *
 * - 同 `studentId` 的并发调用**共享同一个 Promise**（只真正跑一次）；
 * - 结束后自动从 in-flight 表移除，因此**失败后下次登录/下次调用可以重试**
 *   （不做永久熔断：网络恢复后应能自愈）；
 * - 永不抛异常。
 */
export const bootstrapIdentitySso = async (
  params: SsoBootstrapParams,
  deps?: SsoBootstrapDeps
): Promise<SsoBootstrapResult> => {
  const sid = String(params?.studentId || '').trim()
  const merged: Required<SsoBootstrapDeps> = { ...defaultDeps(), ...(deps || {}) } as Required<SsoBootstrapDeps>

  // 空学号不必进 in-flight 表
  if (!sid) return RESULT_SKIPPED_NO_SID

  const existing = inflight.get(sid)
  if (existing) return existing

  const task = runBootstrap({ ...params, studentId: sid }, merged)
    .catch((): SsoBootstrapResult => ({ ok: false, skipped: false, reason: 'begin_failed' }))
    .finally(() => {
      inflight.delete(sid)
    })

  inflight.set(sid, task)
  return task
}

/**
 * fire-and-forget 版本（登录主流程用）。
 *
 * **永不抛、永不阻塞**：登录成功后调用它，失败只影响「第三方无感登录」这一项，
 * 课表/成绩/电费等功能不受任何影响（Epic §2.A.5）。
 */
export const scheduleIdentitySsoBootstrap = (
  params: SsoBootstrapParams,
  deps?: SsoBootstrapDeps
): void => {
  void bootstrapIdentitySso(params, deps).catch(() => {
    // 双重保险：bootstrapIdentitySso 内部已 catch，这里再兜一层防未处理拒绝
  })
}
