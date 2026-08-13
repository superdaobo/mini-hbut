import type {
  BackgroundCheckConfig,
  BackgroundCheckContext,
  BackgroundCheckResult,
  BackgroundCheckState,
  BackgroundDetectedEvent,
  KeepAliveState,
  NotificationPermissionState,
  NotifyPayload,
  PlatformBridge
} from '../types'

let desktopKeepAliveActive = false

// ---- 后台检查能力：真实平台状态映射（#609）----

const isAndroidLikeUA = () => /android/i.test(String(globalThis?.navigator?.userAgent || ''))

const isIOSLikeUA = () => /(iphone|ipad|ipod)/i.test(String(globalThis?.navigator?.userAgent || ''))

const isMobileLikeUA = () => isAndroidLikeUA() || isIOSLikeUA()

const buildBackgroundCheckState = (): BackgroundCheckState => {
  const now = new Date().toISOString()
  // 移动端（Android/iOS）：系统具备真实后台调度能力，但 #611/#612/#613 插件接入前
  // 调度器不可用，明确返回 unavailable，绝不伪造 ready。
  if (isMobileLikeUA()) {
    const kind = isAndroidLikeUA() ? 'android-workmanager' : 'ios-bgapprefresh'
    return {
      supported: true,
      enabled: false,
      scheduler: { kind, status: 'unavailable' },
      auth: { status: 'unknown' },
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastResult: 'unknown',
      reason: `移动端 ${kind} 后台检查插件尚未接入（#611/#612/#613），当前不可用`,
      updatedAt: now
    }
  }
  // 桌面端：不存在系统后台调度，只有前台轮询/屏幕常亮，明确降级而非伪报。
  return {
    supported: false,
    enabled: false,
    scheduler: { kind: 'desktop-foreground', status: 'unavailable' },
    auth: { status: 'unknown' },
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastResult: 'unknown',
    reason: '桌面端无系统后台调度：仅支持前台轮询与屏幕常亮，不提供移动后台检查',
    updatedAt: now
  }
}

/**
 * #615：把插件 bg_get_state 的 BackgroundCheckState（#611 DTO）映射为
 * #609 前端契约。只映射非敏感字段；插件真实状态优先，不伪造 ready。
 */
const mapPluginStateToContract = (state: Record<string, unknown>): BackgroundCheckState => {
  const now = new Date().toISOString()
  const isMobile = isMobileLikeUA()
  const kind = isMobile
    ? isAndroidLikeUA()
      ? 'android-workmanager'
      : 'ios-bgapprefresh'
    : 'desktop-foreground'
  const enabled = state.enabled === true
  const lastRunAt = state.lastRunAt ? String(state.lastRunAt) : null
  const lastRunOk = state.lastRunOk === true
  const error = state.error ? String(state.error) : undefined
  return {
    supported: isMobile,
    enabled,
    scheduler: {
      kind,
      // 插件已配置且启用 -> ready；未启用 -> disabled（真实值，不伪造）
      status: enabled ? 'ready' : 'disabled'
    },
    auth: {
      status: error ? 'expired' : lastRunAt ? 'ready' : 'unknown'
    },
    lastAttemptAt: lastRunAt,
    lastSuccessAt: lastRunOk ? lastRunAt : null,
    lastResult: lastRunOk ? 'unchanged' : error ? 'network-error' : 'unknown',
    lastError: error,
    reason: error ? `最近一次后台检查异常：${error}` : `后台调度：${kind}`,
    updatedAt: now
  }
}

const normalizePermission = (value: string | undefined): NotificationPermissionState => {
  if (value === 'granted') return 'granted'
  if (value === 'denied') return 'denied'
  return 'prompt'
}

const invokeNative = async <T = unknown>(command: string, args?: Record<string, unknown>) => {
  const core = await import('@tauri-apps/api/core')
  if (typeof args === 'undefined') return core.invoke<T>(command)
  return core.invoke<T>(command, args)
}

const isWindowsRuntime = () => {
  if (typeof navigator === 'undefined') return false
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
  return /Windows|Win32|Win64|WinCE/i.test(
    `${navigator.userAgent || ''} ${navigator.platform || ''} ${platform || ''}`
  )
}

const tryOpenWithRustFallback = async (target: string) => {
  try {
    await invokeNative('open_external_url', { url: target })
    return true
  } catch {
    return false
  }
}

const tryOpenDesktopPowerSettings = async () => {
  const ua = String(navigator.userAgent || '').toLowerCase()
  if (ua.includes('windows')) {
    return tryOpenWithRustFallback('ms-settings:batterysaver-settings')
  }
  if (ua.includes('mac os')) {
    return tryOpenWithRustFallback('x-apple.systempreferences:com.apple.Battery-Settings.extension')
  }
  return false
}

export const tauriBridge: PlatformBridge = {
  runtime: 'tauri',

  async openHttp(url: string) {
    return this.openUri(url)
  },

  async openUri(target: string) {
    try {
      const shell = await import('@tauri-apps/plugin-shell')
      await shell.open(target)
      return true
    } catch {
      const encodedTarget = encodeURI(target)
      if (encodedTarget !== target) {
        try {
          const shell = await import('@tauri-apps/plugin-shell')
          await shell.open(encodedTarget)
          return true
        } catch {
          // continue fallback
        }
      }
      if (await tryOpenWithRustFallback(target)) return true
      if (encodedTarget !== target) return tryOpenWithRustFallback(encodedTarget)
      return false
    }
  },

  async getNotificationPermission() {
    try {
      const state = await invokeNative<string>('get_notification_permission_native')
      return normalizePermission(String(state))
    } catch {
      // continue with plugin fallback
    }
    try {
      const mod = await import('@tauri-apps/plugin-notification')
      const granted = await mod.isPermissionGranted()
      return granted ? 'granted' : 'prompt'
    } catch {
      return 'prompt'
    }
  },

  async requestNotificationPermission() {
    try {
      const state = await invokeNative<string>('request_notification_permission_native')
      return normalizePermission(String(state))
    } catch {
      // continue with plugin fallback
    }
    try {
      const mod = await import('@tauri-apps/plugin-notification')
      const state = await mod.requestPermission()
      return normalizePermission(String(state))
    } catch {
      return 'denied'
    }
  },

  async ensureNotificationChannel(channelId: string) {
    try {
      const mod = await import('@tauri-apps/plugin-notification')
      await mod.createChannel({
        id: channelId,
        name: 'Mini-HBUT 通知',
        description: '课程、考试与系统提醒',
        importance: mod.Importance.High,
        visibility: mod.Visibility.Private
      })
      return true
    } catch {
      return false
    }
  },

  async sendLocalNotification(payload: NotifyPayload) {
    try {
      await invokeNative('send_local_notification_native', {
        id: payload.id,
        channelId: payload.channelId,
        title: payload.title,
        body: payload.body,
        targetView: payload.targetView || 'notifications'
      })
      return true
    } catch {
      // Windows 的旧 JS 通知路径可能“返回成功但系统不弹窗”，失败时必须暴露给上层。
      if (isWindowsRuntime()) return false
    }
    try {
      const mod = await import('@tauri-apps/plugin-notification')
      await mod.sendNotification({
        title: payload.title,
        body: payload.body
      })
      return true
    } catch {
      return false
    }
  },

  async addNotificationActionListener(listener: (payload: unknown) => void) {
    try {
      const mod = await import('@tauri-apps/plugin-notification')
      const unlisten = await mod.onAction((notification) => {
        listener(notification)
      })
      return () => {
        try {
          void unlisten.unregister()
        } catch {
          // ignore listener cleanup failure
        }
      }
    } catch {
      return null
    }
  },

  async keepScreenOn(enable: boolean) {
    try {
      const mod = await import('tauri-plugin-keep-screen-on-api')
      if (typeof mod.keepScreenOn === 'function') {
        await mod.keepScreenOn(enable)
        return true
      }
      return false
    } catch {
      return false
    }
  },

  async shareLinkOrFile(target: string, title?: string) {
    // Tauri 下先走外部打开，和当前产品行为保持一致。
    if (title) void title
    return this.openUri(target)
  },

  async setAggressiveKeepAlive(enable: boolean): Promise<KeepAliveState> {
    let ok = true
    try {
      ok = await this.keepScreenOn(!!enable)
    } catch {
      ok = false
    }
    desktopKeepAliveActive = !!enable && ok
    return {
      supported: true,
      active: desktopKeepAliveActive,
      source: 'tauri',
      reason: enable
        ? (ok ? '桌面端已启用前台保活策略' : '桌面端启用保活失败')
        : '桌面端已关闭前台保活策略'
    }
  },

  async getAggressiveKeepAliveState(): Promise<KeepAliveState> {
    return {
      supported: true,
      active: desktopKeepAliveActive,
      source: 'tauri',
      reason: '桌面端使用前台轮询与窗口保活策略'
    }
  },

  async openBatteryOptimizationSettings() {
    return tryOpenDesktopPowerSettings()
  },

  async openNotificationSettings() {
    return tryOpenDesktopPowerSettings()
  },

  // ---- 后台检查能力（#609 契约）：真实状态映射 + 插件接线（#615 扩展） ----

  async getBackgroundCheckState(): Promise<BackgroundCheckState> {
    // #615：优先读插件真实状态（bg_get_state），插件未接入时回退静态映射。
    try {
      const state = await invokeNative<Record<string, unknown>>('plugin:hbut-background|bg_get_state')
      if (state && typeof state === 'object' && !state.error) {
        return mapPluginStateToContract(state)
      }
    } catch {
      // 插件未注册/未接入：走静态映射（不伪造 ready）
    }
    return buildBackgroundCheckState()
  },

  async setBackgroundCheckConfig(config: BackgroundCheckConfig): Promise<BackgroundCheckState> {
    // #615：把 #609 契约配置映射为插件 BackgroundConfig 并调用 bg_configure。
    // business 列表 = 三个 per-feature 开关（grades/exams/school_inbox）；
    // 插件不可用时如实返回真实状态并说明原因（不伪造 ready、不静默假成功）。
    const business: string[] = []
    if (config?.checkGradeChanges) business.push('grades')
    if (config?.checkExamChanges) business.push('exams')
    if (config?.checkSchoolInbox) business.push('school_inbox')
    try {
      const result = await invokeNative<{ schema?: number; error?: string }>(
        'plugin:hbut-background|bg_configure',
        {
          config: {
            schema: 1,
            enabled: !!config?.enabled,
            intervalMinutes: Number(config?.intervalMinutes || 30),
            business,
            scope: null
          }
        }
      )
      if (result && typeof result === 'object' && (result as Record<string, unknown>).error) {
        const state = buildBackgroundCheckState()
        return {
          ...state,
          enabled: !!config?.enabled,
          lastError: String((result as Record<string, unknown>).error),
          reason: '后台配置同步失败（native 端错误）'
        }
      }
      return {
        ...buildBackgroundCheckState(),
        enabled: !!config?.enabled,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastResult: 'unknown',
        reason: `后台检查配置已同步（业务：${business.join(',') || '无'}）`
      }
    } catch (error) {
      // 插件未注册/未接入：返回真实状态并说明配置暂未生效（#611 语义）。
      const state = buildBackgroundCheckState()
      return {
        ...state,
        reason: `${state.reason}；配置变更暂未生效（后台插件未接入）`
      }
    }
  },

  async runBackgroundCheckNow(): Promise<BackgroundCheckResult> {
    // 无真实后台链路：返回 unknown，表示本次没有产生任何检查结果（不抛异常）。
    return 'unknown'
  },

  async syncBackgroundCheckContext(context: BackgroundCheckContext): Promise<boolean> {
    // #615：把 #609 上下文（studentId/业务列表/登录方式等非敏感信息）同步到插件
    // （bg_sync_context）；插件未接入时返回 false（不伪造成功）。
    const sid = String(context?.studentId || '').trim()
    if (!sid) return false
    const business: string[] = []
    if (context?.config?.checkGradeChanges !== false) business.push('grades')
    if (context?.config?.checkExamChanges !== false) business.push('exams')
    if (context?.config?.checkSchoolInbox !== false) business.push('school_inbox')
    try {
      const result = await invokeNative<{ error?: string }>(
        'plugin:hbut-background|bg_sync_context',
        {
          context: {
            schema: 1,
            scope: sid,
            business,
            updatedAt: new Date().toISOString()
          }
        }
      )
      return !(result && typeof result === 'object' && (result as Record<string, unknown>).error)
    } catch {
      return false
    }
  },

  async clearBackgroundCheckContext(): Promise<boolean> {
    try {
      const result = await invokeNative<{ cleared?: boolean; error?: string }>(
        'plugin:hbut-background|bg_clear_context',
        { scope: null }
      )
      return !(result && typeof result === 'object' && (result as Record<string, unknown>).error)
    } catch {
      return false
    }
  },

  async consumeBackgroundEvents(
    _handler: (event: BackgroundDetectedEvent) => void | Promise<void>
  ): Promise<(() => void) | null> {
    // 未接入 native 事件管道：返回 null 表示无订阅。
    return null
  }
}

// ============================================================================
// #614 Background Event Inbox 适配（与 Rust 插件 tauri-plugin-hbut-background 对接）
// 说明：插件是 pull 模型（无 push 订阅），因此不走 PlatformBridge.consumeBackgroundEvents
// （#609 冻结的订阅式契约，未接入 push 时保持返回 null），而是由
// src/utils/background_notification.ts 通过本导出函数主动 peek/ack：
//   peek：bg_peek_events（只读不删，#614 at-least-once 消费前提）；
//   ack ：bg_consume_events(ids)（按 native id 精确 ack，账号隔离不误删）。
// 非 Tauri 运行时（web/capacitor/测试）返回空数组/false，上层安全降级。
// ============================================================================

/** 读取 native background event inbox（不删除；无插件/非 Tauri 返回空数组）。 */
export const peekBackgroundEvents = async (limit?: number): Promise<unknown[]> => {
  try {
    const result = await invokeNative<{ events?: unknown }>(
      'plugin:hbut-background|bg_peek_events',
      { limit: limit ?? null }
    )
    return Array.isArray(result?.events) ? result.events : []
  } catch {
    return []
  }
}

/** 按 native id 精确 ack（删除已完整同步成功的事件；无插件/非 Tauri 返回 false）。 */
export const ackBackgroundEvents = async (ids: string[]): Promise<boolean> => {
  const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id.length > 0) : []
  if (list.length === 0) return true
  try {
    await invokeNative('plugin:hbut-background|bg_consume_events', {
      limit: null,
      ids: list
    })
    return true
  } catch {
    return false
  }
}

// ============================================================================
// #610 系统预调度分支（Local Reminder Scheduler 使用）
// 说明：PlatformBridge 契约定义由 #609 独占，本处以独立导出函数提供 scheduled
// 能力，不改动 src/platform/types.ts。与 #609 NotificationScheduler 的对接：
//   reminderKey（#609）≡ buildReminderKey() 输出的稳定 raw key；
//   fireAt（#609，ISO）≡ new Date(atEpochSecs * 1000).toISOString()；
//   数字 id ≡ stableHash31(reminderKey)，由领域层负责派生。
// ============================================================================

export interface ScheduledLocalNotificationInput {
  id: number
  title: string
  body?: string
  channelId?: string
  targetView?: string
  /** 触发时刻（UTC epoch 秒，绝对时间） */
  atEpochSecs: number
}

export interface PendingLocalNotificationInfo {
  id: number
  title?: string | null
  body?: string | null
  atEpochSecs?: number | null
}

/** 登记一条未来时刻的系统本地通知（稳定 id 重复登记为系统侧幂等替换） */
export const scheduleLocalNotification = async (
  input: ScheduledLocalNotificationInput
): Promise<boolean> => {
  try {
    await invokeNative('schedule_local_notification_native', {
      id: input.id,
      channelId: input.channelId,
      title: input.title,
      body: input.body,
      targetView: input.targetView || 'notifications',
      atEpochSecs: input.atEpochSecs
    })
    return true
  } catch {
    return false
  }
}

/** 查询系统当前 pending 通知列表（含 id 与触发时刻） */
export const getPendingLocalNotifications = async (): Promise<PendingLocalNotificationInfo[]> => {
  try {
    const items = await invokeNative<PendingLocalNotificationInfo[]>(
      'get_pending_local_notifications_native'
    )
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

/** 取消指定 id 的系统 pending 通知（只应由台账持有者调用，避免误删其他用途通知） */
export const cancelLocalNotifications = async (ids: number[]): Promise<boolean> => {
  try {
    await invokeNative('cancel_local_notifications_native', { ids: Array.isArray(ids) ? ids : [] })
    return true
  } catch {
    return false
  }
}
