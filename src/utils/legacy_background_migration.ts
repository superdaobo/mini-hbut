/**
 * 旧 Capacitor BackgroundFetch 后台状态迁移（#616）
 *
 * 背景：旧架构（v1.4.x 及更早）通过 @transistorsoft/capacitor-background-fetch +
 * Headless 任务 + KeepAliveForegroundService 提供移动后台检查，并把用户开关写进
 * `hbu_bg_*` 键（@capacitor/preferences 原生存储 + 少量 localStorage）。#608 系列
 * （#609–#615）落地后，正式移动后台已由 Tauri 原生插件（Android WorkManager /
 * iOS BGAppRefresh）承担，旧路径整体退役（#616）。
 *
 * 本模块只做一件事：**幂等的旧状态清理与可迁移值搬迁**。
 *
 * 迁移规则（先新后旧，#608 红线 10）：
 * 1. 仅当新 config 键（hbu_notify_*）尚未设置时，才把旧键值搬迁过去；
 *    新键已存在则一律以新键为准（不覆盖用户新选择）。
 * 2. 迁移完成后删除旧键；重复执行（升级后再启动）因键已删除而自然幂等。
 * 3. `hbu_bg_feature_*`（成绩/考试/学校消息 per-feature 开关）是 #615 新 config，
 *    不属于旧 Capacitor 键，**绝不删除**。
 * 4. 旧原生 Preferences（CapacitorStorage / NSUserDefaults）在正式 Tauri 应用中
 *    不可达（WebView 存储空间不同），且旧插件类已从构建中移除，其残留为惰性数据：
 *    没有任何代码读取，也不会注册任何系统调度，无需也无法从 JS 侧清除；
 *    Capacitor 壳同源升级时 localStorage 中的旧键由本模块清除。
 * 5. 旧 BackgroundFetch 周期任务（com.hbut.mini.notify.periodic）与
 *    KeepAliveForegroundService 的取消是**结构性退役**：新构建不再包含对应类与
 *    manifest 注册，Android 升级安装时会停止旧服务；旧 Alarm/Receiver 类不存在后
 *    系统调度自然失效，不会与新 WorkManager 调度双跑。
 *
 * baseline/去重语义（#616 验收「不把旧成绩当新成绩」）：
 * - 新原生插件（#612/#613/#615）首次成功只建立 baseline 不通知（native 侧语义）；
 * - 前台 diff 使用的通知快照与学校消息去重快照不会被本模块触碰，
 *   升级后继续生效，不会把历史数据当新变化重推。
 */

import { pushDebugLog } from './debug_logger'

/**
 * 旧键 → 新 config 键映射（仅用户真正能感知的开关做搬迁；其余旧键直接清除）。
 * 旧键值为 '1'/'0'（boolean 字符串），新键值为 'true'/'false'。
 */
const LEGACY_TO_NEW_KEY_MAP: ReadonlyArray<readonly [legacy: string, next: string]> = [
  ['hbu_bg_enabled', 'hbu_notify_bg'],
  ['hbu_bg_enable_grade', 'hbu_notify_grade'],
  ['hbu_bg_enable_exam', 'hbu_notify_exam'],
  ['hbu_bg_enable_power', 'hbu_notify_power'],
  ['hbu_bg_enable_class', 'hbu_notify_class'],
  ['hbu_bg_enable_school_inbox', 'hbu_notify_school_inbox'],
  ['hbu_bg_class_lead_min', 'hbu_notify_class_lead_min'],
  ['hbu_bg_interval_min', 'hbu_notify_interval']
]

/** 只清理、不搬迁的旧键（无新 config 对应物或已无消费者）。 */
const LEGACY_DISCARD_KEYS: readonly string[] = [
  'hbu_bg_student_id',
  'hbu_bg_api_base',
  'hbu_bg_login_method',
  'hbu_bg_dorm_selection',
  'hbu_bg_chaoxing_notice_cookie'
]

/** 迁移完成的落盘标记（额外幂等保险，防止键清除失败时反复尝试）。 */
const MIGRATED_MARKER_KEY = 'hbu_legacy_bg_migrated_v1'

const toBooleanString = (value: unknown): string | null => {
  const text = String(value ?? '').trim()
  if (text === '1' || text === 'true') return 'true'
  if (text === '0' || text === 'false') return 'false'
  return null
}

const migrateLocalStorageKeys = (): void => {
  // 1) 搬迁可迁移开关（新键未设置时才写入）。
  for (const [legacy, next] of LEGACY_TO_NEW_KEY_MAP) {
    const raw = localStorage.getItem(legacy)
    if (raw === null) continue
    const converted = toBooleanString(raw)
    if (converted !== null && localStorage.getItem(next) === null) {
      localStorage.setItem(next, converted)
    }
    localStorage.removeItem(legacy)
  }
  // 2) 清除无迁移价值的旧键（含历史登录方式/API base/学生 id 等）。
  for (const key of LEGACY_DISCARD_KEYS) {
    localStorage.removeItem(key)
  }
  // 3) 旧学校消息去重快照（Headless 专用副本）按学生维度清除；
  //    前台去重快照 hbu_notify_school_inbox_state:* 不受影响。
  const staleKeys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key && key.startsWith('hbu_bg_school_inbox_state:')) staleKeys.push(key)
  }
  for (const key of staleKeys) {
    localStorage.removeItem(key)
  }
}

/** 尽力读取旧原生 Preferences 中可迁移开关（不静态依赖 @capacitor/preferences）。 */
const tryMigrateNativePreferences = async (): Promise<void> => {
  try {
    const w = window as Window & {
      Capacitor?: { Plugins?: { Preferences?: { get?: (opts: { key: string }) => Promise<{ value?: string | null } | null> } } }
    }
    const preferences = w.Capacitor?.Plugins?.Preferences
    if (!preferences?.get) return
    for (const [legacy, next] of LEGACY_TO_NEW_KEY_MAP) {
      if (localStorage.getItem(next) !== null) continue
      const result = await preferences.get({ key: legacy })
      const converted = toBooleanString(result?.value)
      if (converted !== null) {
        localStorage.setItem(next, converted)
      }
    }
  } catch {
    // 原生 Preferences 不可达（正式 Tauri 应用/浏览器）：忽略，迁移不阻塞启动。
  }
}

/**
 * 执行旧 Capacitor 后台状态迁移（幂等，可在应用启动时安全调用）。
 *
 * - localStorage 旧键：搬迁 + 清除（同一 WebView 存储空间内可达）；
 * - 原生 Preferences：仅当插件代理存在时尽力读取（正常构建下不存在，安全跳过）；
 * - 新 config 键已存在时不覆盖。
 */
export const migrateLegacyBackgroundState = async (): Promise<void> => {
  try {
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem(MIGRATED_MARKER_KEY) === '1') return
    migrateLocalStorageKeys()
    await tryMigrateNativePreferences()
    localStorage.setItem(MIGRATED_MARKER_KEY, '1')
    pushDebugLog('LegacyMigration', '旧 Capacitor 后台状态迁移完成（幂等）', 'info')
  } catch (error) {
    // 迁移失败不阻塞应用启动；下次启动会重试（键未清除前幂等）。
    pushDebugLog('LegacyMigration', '旧后台状态迁移失败，将在下次启动重试', 'warn', error)
  }
}
