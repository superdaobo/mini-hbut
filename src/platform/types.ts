export type RuntimePlatform = 'tauri' | 'capacitor' | 'web'

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt'

export interface NotifyPayload {
  title: string
  body?: string
  id?: number
  channelId?: string
  targetView?: string
}

export interface KeepAliveState {
  supported: boolean
  active: boolean
  source: string
  reason?: string
}

/**
 * 平台桥接统一接口
 *
 * 前端业务层统一依赖这里，避免直接散落调用 Tauri / Capacitor API。
 * 迁移阶段先覆盖高频能力：外链、通知、常亮、分享。
 */
// ============================================================
// 后台智能检查领域契约（#609）
// ------------------------------------------------------------
// 本段定义统一 config / state / event / bridge 契约：
// - 真实平台能力映射，禁止把“前台 interval 轮询”描述成移动后台调度；
// - 敏感认证数据（Cookie/密码/完整 Header 等）绝不进入这些 model；
// - #612（Android WorkManager）/ #613（iOS BGAppRefresh）只实现本契约，
//   不再反向修改页面业务语义。
// ============================================================

/** 后台调度来源：真实平台调度能力标识 */
export type BackgroundSchedulerKind =
  | 'android-workmanager'
  | 'ios-bgapprefresh'
  | 'capacitor-background-fetch'
  | 'desktop-foreground'
  | 'unsupported'

/** 调度器状态：ready=真实调度已接入；disabled=用户关闭；unavailable=无能力或插件未接入 */
export type BackgroundSchedulerStatus = 'ready' | 'disabled' | 'unavailable'

/** 后台认证/上下文状态：只表达抽象状态，绝不携带认证材料本身 */
export type BackgroundAuthStatus = 'ready' | 'missing' | 'expired' | 'unknown'

/** 最近一次后台检查结果 */
export type BackgroundCheckResult =
  | 'unchanged'
  | 'changed'
  | 'network-error'
  | 'auth-expired'
  | 'cancelled'
  | 'unknown'

/** 后台智能检查配置（用户开关 + 调度偏好） */
export interface BackgroundCheckConfig {
  /** 总开关 */
  enabled: boolean
  /** 成绩变化检测开关 */
  checkGradeChanges: boolean
  /** 考试变化检测开关 */
  checkExamChanges: boolean
  /** 学校消息检测开关 */
  checkSchoolInbox: boolean
  /** Android WorkManager 调度偏好（分钟），仅 Android 生效；是偏好不是严格定时器 */
  intervalMinutes?: number
  /** 配置 schema 版本，为后续迁移预留 */
  schemaVersion: number
  /** 最近一次配置更新时间 */
  updatedAt?: string
}

/** 后台智能检查状态：必须真实反映平台能力，不得伪造 ready */
export interface BackgroundCheckState {
  /** 当前平台是否真实具备后台检查能力（移动端系统能力/插件接入） */
  supported: boolean
  /** 用户开启且调度真实生效；未接入的插件不得伪造 true */
  enabled: boolean
  /** 平台调度来源与调度器状态 */
  scheduler: {
    kind: BackgroundSchedulerKind
    status: BackgroundSchedulerStatus
  }
  /** 后台认证/上下文状态（只表达抽象状态） */
  auth: {
    status: BackgroundAuthStatus
  }
  /** 最近一次执行时间（ISO），从未执行则为 null */
  lastAttemptAt: string | null
  /** 最近一次成功时间（ISO），从未成功则为 null */
  lastSuccessAt: string | null
  lastResult: BackgroundCheckResult
  /** 用户可理解的错误信息，禁止包含敏感认证数据 */
  lastError?: string
  /** 状态说明（页面展示用） */
  reason?: string
  /** 状态生成时间（ISO） */
  updatedAt: string
}

export type BackgroundDetectedEventType = 'grades-changed' | 'exams-changed' | 'school-message' | 'unknown'

/**
 * 后台发现事件（native → 前端）。
 * 安全边界：不得携带 Cookie、密码、完整 HTTP Header 等认证材料；
 * 业务摘要只能放 signature / meta 等非敏感字段。
 */
export interface BackgroundDetectedEvent {
  /** 事件唯一 ID（native 生成） */
  id: string
  type: BackgroundDetectedEventType
  /** 发现时间（ISO） */
  detectedAt: string
  /** 事件来源平台 */
  source: BackgroundSchedulerKind
  /** 点击事件后跳转的目标视图 */
  targetView?: string
  /** 是否已经展示系统本地通知 */
  presented: boolean
  /** 非敏感去重签名（业务数据摘要，可跨端比对） */
  signature: string
  /** 非敏感元数据（如变化科目名），仅允许原始值 */
  meta?: Record<string, string | number | boolean>
}

/**
 * 后台上下文同步输入：只允许非敏感控制信息。
 * 认证材料由 Rust/原生安全边界内部传递（#611 红线），JS 不得提交。
 */
export interface BackgroundCheckContext {
  /** 学生学号（业务 scope 标识，非认证凭据） */
  studentId?: string
  /** 用户配置 */
  config?: BackgroundCheckConfig
  /** 宿舍选择（电费域，仅非敏感枚举） */
  dormSelection?: unknown[]
  /** 学校消息已读 ID 列表（仅 ID） */
  schoolInboxState?: unknown[]
  /** 登录方式标识（非敏感） */
  loginMethod?: string
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const toSafeString = (value: unknown): string => {
  const text = String(value ?? '').trim()
  return text === 'null' || text === 'undefined' ? '' : text
}

const toEventType = (value: unknown): BackgroundDetectedEventType => {
  const text = toSafeString(value)
  if (text === 'grades-changed' || text === 'exams-changed' || text === 'school-message') return text
  return 'unknown'
}

const toSchedulerKind = (value: unknown): BackgroundSchedulerKind => {
  const text = toSafeString(value)
  if (
    text === 'android-workmanager' ||
    text === 'ios-bgapprefresh' ||
    text === 'capacitor-background-fetch' ||
    text === 'desktop-foreground'
  ) {
    return text
  }
  return 'unsupported'
}

/**
 * 事件归一化守卫：白名单提取字段，任何未知字段（可能混入的认证数据）一律丢弃。
 * 输入不符合最小结构时返回 null，调用方按“无事件”安全处理。
 */
export const normalizeBackgroundDetectedEvent = (raw: unknown): BackgroundDetectedEvent | null => {
  if (!isPlainObject(raw)) return null
  const id = toSafeString(raw.id)
  const detectedAt = toSafeString(raw.detectedAt)
  const signature = toSafeString(raw.signature)
  if (!id || !detectedAt || !signature) return null

  const targetView = raw.targetView ? toSafeString(raw.targetView) : undefined
  const presented = raw.presented === true || raw.presented === 'true' || raw.presented === 1
  const source = toSchedulerKind(raw.source)

  let meta: Record<string, string | number | boolean> | undefined
  if (isPlainObject(raw.meta)) {
    meta = {}
    for (const [key, value] of Object.entries(raw.meta)) {
      // 只保留原始值类型，避免对象/函数等结构混入
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        meta[key] = value
      }
    }
    if (Object.keys(meta).length === 0) meta = undefined
  }

  return { id, type: toEventType(raw.type), detectedAt, source, targetView, presented, signature, meta }
}

/**
 * 后台检查能力统一入口。
 * 后续 #611/#612/#613 在 Tauri mobile adapter 中实现真实能力；
 * 本阶段各 adapter 提供安全降级实现（不伪造 ready、不抛未处理异常）。
 */
export interface BackgroundCheckBridge {
  /** 读取后台检查真实状态（#611 getState 语义） */
  getBackgroundCheckState(): Promise<BackgroundCheckState>
  /** 配置/关闭后台检查（#611 configure/disable 语义）；未接入时返回真实状态而非伪造 */
  setBackgroundCheckConfig(config: BackgroundCheckConfig): Promise<BackgroundCheckState>
  /** 开发/调试态立即执行一次后台检查（#611 runNow 语义）；不可用时返回 unknown */
  runBackgroundCheckNow(): Promise<BackgroundCheckResult>
  /** 同步后台最小上下文（#611 syncContext 语义）；仅非敏感信息，成功返回 true */
  syncBackgroundCheckContext(context: BackgroundCheckContext): Promise<boolean>
  /** 账号退出/切换时清理后台上下文、状态与事件（#611 clearContext 语义） */
  clearBackgroundCheckContext(): Promise<boolean>
  /** 订阅并消费 native 后台事件（#611 consumeEvents 的订阅式包装）；不支持时返回 null */
  consumeBackgroundEvents(
    handler: (event: BackgroundDetectedEvent) => void | Promise<void>
  ): Promise<(() => void) | null>
}

// ============================================================
// 系统预调度本地通知契约（#609 预留，由 #610 实现）
// ------------------------------------------------------------
// 课程/考试等已知时间事件由系统 Scheduled Local Notification 承担，
// 页面只依赖统一 service（NotificationScheduler），不直接依赖平台插件。
// 具体实现落在 #610 的 src/utils/local_reminder_scheduler.*，本文件只定义接口。
// ============================================================

/** 预调度提醒输入（业务方只提供稳定 reminderKey 与内容，ID 派生由实现负责） */
export interface ScheduledReminderInput {
  /** 稳定业务键（account scope + type + identity + occurrence + lead time 派生） */
  reminderKey: string
  title: string
  body?: string
  /** 提醒触发时间（ISO） */
  fireAt: string
  channelId?: string
  targetView?: string
}

/** 已登记的系统 pending 提醒摘要 */
export interface ScheduledReminderInfo {
  reminderKey: string
  fireAt: string
  title: string
  targetView?: string
}

/**
 * 系统预调度本地通知统一入口（#610 实现）。
 * 能力：登记 / 取消 / 查询 pending；reconciliation 由 #610 领域服务内部完成。
 */
export interface NotificationScheduler {
  scheduleReminder(input: ScheduledReminderInput): Promise<boolean>
  cancelReminder(reminderKey: string): Promise<boolean>
  queryPendingReminders(): Promise<ScheduledReminderInfo[]>
}

/**
 * 平台桥接统一接口
 *
 * 前端业务层统一依赖这里，避免直接散落调用 Tauri / Capacitor API。
 * 迁移阶段先覆盖高频能力：外链、通知、常亮、分享；后台检查能力见 BackgroundCheckBridge。
 */
export interface PlatformBridge extends BackgroundCheckBridge {
  runtime: RuntimePlatform
  openHttp(url: string): Promise<boolean>
  openUri(target: string): Promise<boolean>
  getNotificationPermission(): Promise<NotificationPermissionState>
  requestNotificationPermission(): Promise<NotificationPermissionState>
  ensureNotificationChannel(channelId: string): Promise<boolean>
  sendLocalNotification(payload: NotifyPayload): Promise<boolean>
  addNotificationActionListener(listener: (payload: unknown) => void): Promise<(() => void) | null>
  keepScreenOn(enable: boolean): Promise<boolean>
  shareLinkOrFile(target: string, title?: string): Promise<boolean>
  setAggressiveKeepAlive(enable: boolean): Promise<KeepAliveState>
  getAggressiveKeepAliveState(): Promise<KeepAliveState>
  openBatteryOptimizationSettings(): Promise<boolean>
  openNotificationSettings(): Promise<boolean>
}
