/**
 * Background Event Inbox 消费编排（#614）
 *
 * 职责：App launch/resume 时读取 native 后台事件（BackgroundDetectedEvent），
 * 按业务域聚合后对每个域执行一次完整 Rust 同步，同步成功后才 ack 事件并
 * 写入 Notification Event Ledger（通知去重账本），最终实现：
 *
 * - 后台已弹过通知（presented=true）→ 前台不再重复弹（场景 A）；
 * - 前台已弹过通知（ledger 已记录）→ 后续不再重复弹（场景 B）；
 * - 真正的新变化（新 signature）→ 允许再次通知（场景 C）。
 *
 * 关键语义：
 * 1. at-least-once + ack：先 peek（只读不删，Rust `bg_peek_events`），
 *    完整同步成功后才按 id 精确 ack（Rust `bg_consume_events(ids)`）；
 *    同步失败的事件保留在 inbox，下次 resume 可重试——绝不提前丢事件。
 * 2. 单飞（single-flight）：同一账号并发调用只执行一次（focus/pageshow/
 *    visibilitychange 连发由 LifecycleCoordinator 320ms 节流 + 本模块合并）。
 * 3. 聚合：多个同域事件只触发一次完整同步，成功后一起 ack。
 * 4. 账号隔离：只消费 scope 匹配（或空 scope）的事件；账本按 studentId 分 scope。
 * 5. 「通知是否已展示」与「完整业务同步是否已成功」是两个独立状态：
 *    presented=false 的事件不写「已通知」账本（前台 checkGrades 仍可正常通知新变化）。
 */
import { pushDebugLog } from './debug_logger'
import {
  buildLedgerEventKey,
  recordLedgerEntry
} from './notification_event_ledger'
import { toSafeText } from './notify_center_util.js'
import { normalizeBackgroundDetectedEvent, type BackgroundDetectedEvent, type BackgroundDetectedEventType } from '../platform/types'

/** inbox 读取上限（与 Rust EVENT_INBOX_CAP=50 对齐，留余量一次读完）。 */
export const INBOX_PEEK_LIMIT = 100

/** 归一化后的 inbox 事件（含 ack 所需 native id 与 scope）。 */
export interface InboxEvent extends BackgroundDetectedEvent {
  /** native 事件 id（ack 用，Rust BackgroundEvent.id）。 */
  inboxId: string
  /** native event kind（grades_changed / synthetic_run 等）。 */
  kind: string
  /** 事件所属学生 scope；空串表示未绑定账号。 */
  scope: string
}

/** inbox 平台抽象（默认 Tauri 插件；测试注入 fake）。 */
export interface BackgroundInboxPlatform {
  /** 读取事件（不删除）。 */
  peek(limit?: number): Promise<unknown[]>
  /** 按 native id 精确 ack（删除已同步成功的事件）。 */
  ack(ids: string[]): Promise<boolean>
}

/** 域同步器：对某业务域执行一次完整同步；返回 ok=false 时事件不 ack。 */
export interface DomainSyncResult {
  ok: boolean
  error?: string
}

export interface ConsumeInboxInput {
  studentId: string
  /** 触发来源（resume / launch / notification-click 等，仅日志）。 */
  reason?: string
  /** 域同步器（默认：grades -> Rust sync_grades；exams -> Rust fetch_exams + #610 reconcile；测试注入）。 */
  syncDomain?: (domain: string, studentId: string) => Promise<DomainSyncResult>
}

export interface ConsumeInboxResult {
  success: boolean
  reason?: string
  /** 跳过原因（missing-student-id / no-events 等）。 */
  skipped?: string
  /** 读取到的事件数。 */
  peeked: number
  /** scope 匹配的事件数。 */
  matched: number
  /** 需要同步的业务域。 */
  domains: string[]
  /** 成功完成完整同步的域数。 */
  synced: number
  /** 已 ack 的事件数。 */
  acked: number
  /** native 已展示通知、前台不再重复弹的事件数。 */
  suppressed: number
  /** 非敏感错误摘要（不落盘，仅本次调用返回）。 */
  errors: string[]
}

// ---- 平台注入（与 #610 local_reminder_scheduler 同模式） ----

let injectedPlatform: BackgroundInboxPlatform | null = null

/** 测试注入专用：替换 inbox 平台实现。 */
export const setBackgroundInboxPlatform = (platform: BackgroundInboxPlatform | null): void => {
  injectedPlatform = platform
}

const getInboxPlatform = (): BackgroundInboxPlatform => {
  if (injectedPlatform) return injectedPlatform
  return {
    async peek(limit) {
      const mod = await import('../platform/adapters/tauri')
      return mod.peekBackgroundEvents(limit)
    },
    async ack(ids) {
      const mod = await import('../platform/adapters/tauri')
      return mod.ackBackgroundEvents(ids)
    }
  }
}

// ---- 事件归一化（native Rust BackgroundEvent -> #609 BackgroundDetectedEvent） ----

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** Rust source 枚举 -> #609 BackgroundSchedulerKind（契约字符串）。 */
const mapEventSource = (value: unknown): unknown => {
  const text = toSafeText(value)
  if (text === 'android') return 'android-workmanager'
  if (text === 'ios') return 'ios-bgapprefresh'
  return value
}

/**
 * 归一化 native 事件：
 * - Rust BackgroundEvent 外层（id/kind/scope/occurredAt）+ payload（#609 契约字段）合并；
 * - 白名单提取（normalizeBackgroundDetectedEvent 守卫），未知/敏感字段一律丢弃；
 * - 结构不符返回 null，调用方按「无事件」安全处理。
 */
export const toInboxEvent = (raw: unknown): InboxEvent | null => {
  if (!isPlainObject(raw)) return null
  const payload = isPlainObject(raw.payload) ? raw.payload : {}
  const merged = {
    id: toSafeText(raw.id),
    detectedAt: toSafeText(payload.detectedAt) || toSafeText(raw.occurredAt),
    signature: toSafeText(payload.signature),
    type: payload.type,
    source: mapEventSource(toSafeText(payload.source) || raw.source),
    targetView: payload.targetView,
    presented: payload.presented,
    meta: payload.meta
  }
  const normalized = normalizeBackgroundDetectedEvent(merged)
  if (!normalized) return null
  return {
    ...normalized,
    inboxId: toSafeText(raw.id),
    kind: toSafeText(raw.kind),
    scope: raw.scope == null ? '' : toSafeText(raw.scope)
  }
}

/** #609 event type -> ledger 业务域；unknown（如 synthetic_run）返回空串（无业务域）。 */
export const eventTypeToDomain = (type: BackgroundDetectedEventType): string => {
  if (type === 'grades-changed') return 'grades'
  if (type === 'exams-changed') return 'exams'
  if (type === 'school-message') return 'school-message'
  return ''
}

// ---- 默认域同步器 ----

/**
 * 默认域同步器：
 * - grades：#614 首批闭环，Rust sync_grades 完整同步；
 * - exams：#615 扩展——完整 fetch_exams 成功后同步更新 cache，并触发
 *   Scheduled Exam Reminder reconcile（#610 联动：resume 完整考试同步后重建
 *   未来考试提醒，幂等 diff 保证无变化时零系统调用）；
 * - 其他域（school-message 等）：只消费不触发业务请求（前台完整同步路径另行处理）。
 */
const defaultSyncDomain = async (domain: string, studentId: string): Promise<DomainSyncResult> => {
  const sid = toSafeText(studentId)
  if (domain === 'exams') {
    try {
      const native = await import('../platform/native')
      if (!native.isTauriRuntime()) return { ok: false, error: 'unsupported-runtime' }
      const res = (await native.invokeNative('fetch_exams', { semester: '' })) as
        | { success?: boolean; data?: unknown; error?: unknown }
        | null
      if (!res?.success) {
        const message = toSafeText(res?.error || 'fetch_exams 失败')
        return { ok: false, error: message ? message.slice(0, 120) : 'fetch_exams 失败' }
      }
      const exams = Array.isArray(res.data) ? (res.data as Array<Record<string, unknown>>) : []
      // 同步 cache（与前台 checkExams 写同一 key，供后续 UI/读取兜底）
      if (sid) {
        const api = await import('./api.js')
        api.setCachedData(`exams:${sid}:current`, { success: true, data: exams })
      }
      // #610 联动：完整考试同步成功后触发未来考试提醒 reconcile（幂等 diff）。
      if (sid) {
        void import('./local_reminder_scheduler').then((mod) =>
          mod.reconcileLocalReminders({ studentId: sid, exams, reason: 'bg-inbox-exams' }).catch(() => {})
        ).catch(() => {})
      }
      return { ok: true }
    } catch (error) {
      const message = toSafeText((error as Error | undefined)?.message || error)
      return { ok: false, error: message ? message.slice(0, 120) : 'fetch_exams 调用失败' }
    }
  }
  if (domain !== 'grades') return { ok: true }
  try {
    const native = await import('../platform/native')
    if (!native.isTauriRuntime()) return { ok: false, error: 'unsupported-runtime' }
    await native.invokeNative('sync_grades', { currentOnly: false })
    return { ok: true }
  } catch (error) {
    const message = toSafeText((error as Error | undefined)?.message || error)
    return { ok: false, error: message ? message.slice(0, 120) : 'sync_grades 调用失败' }
  }
}

// ---- 消费编排 ----

/** 模块级单飞：同一账号的消费链串行执行，连发 resume/focus 合并为一次。 */
const inflight = new Map<string, Promise<ConsumeInboxResult>>()

/**
 * App launch/resume 消费链入口：
 * peek -> 聚合域 -> 每域一次完整同步 -> 同步成功写 ledger + ack；失败保留事件。
 */
export const consumeBackgroundEventsOnce = async (
  input: ConsumeInboxInput
): Promise<ConsumeInboxResult> => {
  const sid = toSafeText(input.studentId)
  if (!sid) {
    return {
      success: true,
      reason: input.reason,
      skipped: 'missing-student-id',
      peeked: 0,
      matched: 0,
      domains: [],
      synced: 0,
      acked: 0,
      suppressed: 0,
      errors: []
    }
  }
  const running = inflight.get(sid)
  if (running) return running

  const task = (async (): Promise<ConsumeInboxResult> => {
    const errors: string[] = []
    const platform = getInboxPlatform()

    // 1. peek（只读不删）
    let raw: unknown[] = []
    try {
      raw = await platform.peek(INBOX_PEEK_LIMIT)
    } catch (error) {
      const message = toSafeText((error as Error | undefined)?.message || error)
      errors.push(`读取后台事件失败: ${message ? message.slice(0, 120) : 'unknown'}`)
      return {
        success: false,
        reason: input.reason,
        peeked: 0,
        matched: 0,
        domains: [],
        synced: 0,
        acked: 0,
        suppressed: 0,
        errors
      }
    }
    const allEvents = raw.map(toInboxEvent).filter((evt): evt is InboxEvent => !!evt)
    if (allEvents.length === 0) {
      return {
        success: true,
        reason: input.reason,
        skipped: 'no-events',
        peeked: raw.length,
        matched: 0,
        domains: [],
        synced: 0,
        acked: 0,
        suppressed: 0,
        errors
      }
    }

    // 2. 账号隔离：只消费 scope 匹配（或未绑定 scope）的事件
    const matched = allEvents.filter((evt) => !evt.scope || evt.scope === sid)

    // 3. 聚合业务域；无业务域事件（synthetic_run 等）直接进 ack 队列
    const byDomain = new Map<string, InboxEvent[]>()
    const nonBusiness: InboxEvent[] = []
    for (const evt of matched) {
      const domain = eventTypeToDomain(evt.type)
      if (!domain) {
        nonBusiness.push(evt)
        continue
      }
      const list = byDomain.get(domain) || []
      list.push(evt)
      byDomain.set(domain, list)
    }
    const domains = Array.from(byDomain.keys())
    const syncDomain = input.syncDomain || defaultSyncDomain

    // 4. 每域一次完整同步；成功后写 ledger + 收集 ack
    const ackIds: string[] = []
    let synced = 0
    let suppressed = 0
    for (const domain of domains) {
      const list = byDomain.get(domain) || []
      let result: DomainSyncResult
      try {
        result = await syncDomain(domain, sid)
      } catch (error) {
        const message = toSafeText((error as Error | undefined)?.message || error)
        result = { ok: false, error: message ? message.slice(0, 120) : 'sync 调用异常' }
      }
      if (!result.ok) {
        // 完整同步失败：事件保留在 inbox，不 ack，下次 resume 重试；不重复弹已展示通知。
        errors.push(`${domain} 完整同步失败（事件已保留待重试）: ${result.error || 'unknown'}`)
        continue
      }
      synced += 1
      for (const evt of list) {
        if (evt.presented && evt.signature) {
          // native 已展示系统通知：记录「已通知」账本（场景 A），前台不再重复弹
          recordLedgerEntry(sid, buildLedgerEventKey(domain, evt.signature), domain, evt.detectedAt)
          suppressed += 1
        }
        // presented=false（native 未展示通知）不写账本：前台 checkGrades 对新变化可正常通知
        ackIds.push(evt.inboxId)
      }
    }
    for (const evt of nonBusiness) {
      ackIds.push(evt.inboxId)
    }

    // 5. ack：同步成功的业务事件 + 无业务事件
    if (ackIds.length > 0) {
      try {
        const ok = await platform.ack(ackIds)
        if (!ok) {
          errors.push('确认后台事件失败（事件保留，重复处理幂等安全）')
        }
      } catch {
        errors.push('确认后台事件异常（事件保留，重复处理幂等安全）')
      }
    }

    pushDebugLog(
      'Notify',
      `后台事件消费完成 reason=${input.reason || 'unknown'} peek=${allEvents.length} matched=${matched.length} domains=${domains.join(',') || '-'} synced=${synced} acked=${ackIds.length} suppressed=${suppressed}`,
      'debug'
    )

    return {
      success: errors.length === 0,
      reason: input.reason,
      peeked: allEvents.length,
      matched: matched.length,
      domains,
      synced,
      acked: ackIds.length,
      suppressed,
      errors
    }
  })()

  inflight.set(sid, task)
  try {
    return await task
  } finally {
    inflight.delete(sid)
  }
}

// ---- 通知前抑制查询（notify_center_checks 弹通知前兜底） ----

/**
 * 前台发送通知前查询：inbox 中是否存在「同账号、同域、已展示系统通知且未消费」的事件。
 *
 * 用途：时序兜底。resume 消费链与前台 checkGrades 存在执行窗口差时，
 * 即使 ledger 尚未写入（或跨端 signature 算法存在偏差），只要 native 已弹过通知
 * 且事件还在 inbox，前台就不再重复弹；同时顺手写入 ledger（幂等）。
 * 读取失败按「无事件」安全降级（正常走前台检测）。
 */
export const hasUnconsumedPresentedEvent = async (
  studentId: string,
  domain: string
): Promise<boolean> => {
  const sid = toSafeText(studentId)
  if (!sid) return false
  try {
    const platform = getInboxPlatform()
    const raw = await platform.peek(INBOX_PEEK_LIMIT)
    for (const item of raw) {
      const evt = toInboxEvent(item)
      if (!evt) continue
      if (evt.scope && evt.scope !== sid) continue
      if (eventTypeToDomain(evt.type) !== domain) continue
      if (evt.presented && evt.signature) {
        recordLedgerEntry(sid, buildLedgerEventKey(domain, evt.signature), domain, evt.detectedAt)
        return true
      }
    }
  } catch {
    // 读取失败按无事件处理（安全降级）
  }
  return false
}
