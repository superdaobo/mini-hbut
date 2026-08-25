/**
 * notify_center 通知检查模块：课表刷新、成绩/考试/电费/上课/学校消息检查，
 * 以及通知发送、快照派发、widget 同步等副作用。编排入口在 ./notify_center.ts。
 */
import axios from './axios_adapter.js'
import { setCachedData } from './api.js'
import {
  markScheduleSwitchPending,
  queueScheduleSemesterPopup,
  readScheduleLock
} from './schedule_prefetch.js'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { platformBridge } from '../platform'
import { pushDebugLog } from './debug_logger'
import { writeElectricityToWidget, writeExamToWidget } from './widget_bridge'
import {
  buildCrossEndGradeSignature,
  buildLedgerEventKey,
  hasLedgerEntry,
  recordLedgerEntry
} from './notification_event_ledger'
import { hasUnconsumedPresentedEvent } from './background_notification'
import {
  APP_BOOT_ID,
  DEFAULT_CHANNEL_ID,
  NotifySettingsFull,
  POWER_ALERT_THRESHOLD,
  buildGradesSignature,
  buildTomorrowExamSignature,
  classReminderStateKeyFor,
  chaoxingInboxStateKeyFor,
  examSigKeyFor,
  getCurrentMinutePrecise,
  getDormSelection,
  getMergedTodayClasses,
  getRequestTimeoutMs,
  getSchedulePayloadForReminder,
  getTodayWeekday,
  gradeSigKeyFor,
  nowIso,
  pickGradePreview,
  pickUpcomingExams,
  powerStateKeyFor,
  readJSON,
  resolveLoginMode,
  schoolInboxStateKeyFor,
  toApiUrl,
  toCourseReminderItems,
  toDayKey,
  toPositiveInt,
  toSafeNumber,
  toSafeText,
  writeJSON
} from './notify_center_util.js'

export interface CheckResult extends Record<string, unknown> {
  success: boolean
}

// ============================================================
// #615 考试变化/学校消息扩展（纯逻辑在 ./exams_signature.ts，避免 axios 依赖链）
// ------------------------------------------------------------
// - buildCrossEndExamSignature：跨端 ExamSignatureV1 复刻（fixture 单一事实源）；
// - examsChangeBaselineKeyFor/buildExamLedgerEventKey：前台 baseline 与 ledger 去重键。
//   （#706：per-feature 开关 readBgFeatureEnabled/BG_FEATURE_KEY_* 已随独立开关移除。）
// ============================================================

import {
  buildCrossEndExamSignature,
  buildExamLedgerEventKey,
  examsChangeBaselineKeyFor
} from './exams_signature'

export {
  buildCrossEndExamSignature,
  buildExamLedgerEventKey,
  examsChangeBaselineKeyFor
}

const isSchoolInboxItemRead = (item: unknown): boolean => {
  const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
  return !!(raw?.is_read ?? raw?.isRead)
}

const readInboxStateByKey = (
  keyFor: (studentId: string) => string,
  studentId: string
): { initialized: boolean; ids: string[] } => {
  const state = readJSON<{ initialized?: boolean; ids?: unknown[] }>(keyFor(studentId), null)
  const ids = Array.isArray(state?.ids)
    ? state.ids.map((item) => toSafeText(item)).filter(Boolean)
    : []
  return {
    initialized: state?.initialized === true,
    ids
  }
}

export const readSchoolInboxState = (studentId: string): { initialized: boolean; ids: string[] } =>
  readInboxStateByKey(schoolInboxStateKeyFor, studentId)

// #715：学习通通知独立去重快照（与学校消息互不串扰）
const readChaoxingInboxState = (studentId: string): { initialized: boolean; ids: string[] } =>
  readInboxStateByKey(chaoxingInboxStateKeyFor, studentId)

// #616：旧 Capacitor Headless 专用的 hbu_bg_* 后台预写函数已随 Headless 退役
// 整体删除；前台去重快照（schoolInboxStateKeyFor）继续生效。

const snapshotChaoxingNoticeCookie = async (loginMode: unknown): Promise<void> => {
  const mode = toSafeText(loginMode).toLowerCase()
  if (!mode.startsWith('chaoxing') || !isTauriRuntime()) return
  try {
    const cookies = await invokeNative('get_cookies')
    if (cookies) {
      localStorage.setItem('hbu_chaoxing_notice_cookie', String(cookies))
    }
  } catch {
    // ignore
  }
}

export const emitSnapshotUpdate = (snapshot: unknown): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('hbu-notify-snapshot-updated', { detail: snapshot }))
}

const resolveRoomLabel = (): string => {
  // 优先使用 ElectricityView 保存的标签文本
  const savedLabel = localStorage.getItem('last_dorm_selection_label')
  if (savedLabel && savedLabel.trim()) return savedLabel.trim()

  // 降级：从宿舍数据缓存中查找标签
  try {
    const selection = readJSON<unknown[]>('last_dorm_selection', [])
    if (!Array.isArray(selection) || selection.length !== 4) return ''

    const cacheRaw = localStorage.getItem('cache:static_resource:dormitory_data')
    if (!cacheRaw) return selection.join(' / ')
    const cached = JSON.parse(cacheRaw)
    const dormData = cached?.data?.data || cached?.data
    if (!Array.isArray(dormData)) return selection.join(' / ')

    const [areaId, buildingId, layerId] = selection
    const labels: string[] = []

    const area = dormData.find((a: Record<string, unknown>) => String(a?.value) === String(areaId))
    labels.push(area?.label || String(areaId))

    const building = area?.children?.find(
      (b: Record<string, unknown>) => String(b?.value) === String(buildingId)
    )
    labels.push(building?.label || String(buildingId))

    // 楼层：处理 merged_ 前缀
    let layer = building?.children?.find(
      (l: Record<string, unknown>) => String(l?.value) === String(layerId)
    )
    if (!layer && String(layerId).startsWith('merged_')) {
      const parts = String(layerId).split('_')
      const lightId = parts[2]
      layer = building?.children?.find(
        (l: Record<string, unknown>) => String(l?.value) === lightId
      )
    }
    const layerLabel = layer?.label || ''
    const floorMatch = String(layerLabel).match(/(\d+)/)
    labels.push(floorMatch ? `${floorMatch[0]}层` : String(layerLabel || '?'))

    return labels.join(' ')
  } catch {
    const selection = readJSON<unknown[]>('last_dorm_selection', [])
    return Array.isArray(selection) ? selection.join('/') : ''
  }
}

/**
 * 将通知中心的电费和考试数据同步到 Android 小组件
 */
const syncWidgetData = async (snapshot: Record<string, unknown> | null | undefined): Promise<void> => {
  // 电费数据
  const elec = snapshot?.electricity as Record<string, unknown> | undefined
  if (elec?.success && elec?.configured) {
    // 从 localStorage 读取宿舍标签名（ElectricityView 存储的）
    const roomLabel = resolveRoomLabel()
    await writeElectricityToWidget({
      quantity: Number(elec.quantity) || 0,
      room: roomLabel,
      acQuantity: Number(elec.acQuantity) || 0,
      isLow: !!elec.isLow
    })
  }

  // 考试数据
  const exams = snapshot?.exams as Record<string, unknown> | undefined
  if (exams?.upcoming && Array.isArray(exams.upcoming) && exams.upcoming.length > 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const futureExams = (exams.upcoming as Array<Record<string, unknown>>).filter((e) => {
      if (!e.exam_date) return true
      return new Date(String(e.exam_date)) >= today
    })
    if (futureExams.length > 0) {
      const first = futureExams[0]
      const examDate = first.exam_date ? new Date(String(first.exam_date)) : null
      const daysLeft = examDate ? Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : -1
      await writeExamToWidget({
        exams: futureExams.slice(0, 3).map((e) => ({
          course_name: String(e.course_name || ''),
          exam_date: String(e.exam_date || ''),
          exam_time: String(e.exam_time || ''),
          location: String(e.location || ''),
          seat_no: String(e.seat_no || '')
        })),
        days_left: daysLeft
      })
    }
  }
}

const ensureNotifyReady = async (allowPrompt = false): Promise<boolean> => {
  let permission = 'prompt'
  try {
    permission = await platformBridge.getNotificationPermission()
  } catch {
    return false
  }
  if (permission !== 'granted' && allowPrompt) {
    try {
      permission = await platformBridge.requestNotificationPermission()
    } catch {
      permission = 'denied'
    }
  }
  if (permission !== 'granted') return false
  try {
    await platformBridge.ensureNotificationChannel(DEFAULT_CHANNEL_ID)
  } catch {
    // ignore
  }
  return true
}

interface NoticeItem {
  title?: unknown
  body?: unknown
  targetView?: unknown
  /** #614：业务去重 eventKey（发送成功后写入 Notification Event Ledger） */
  eventKey?: unknown
  /** #614：业务域（grades/exams/...） */
  domain?: unknown
}

/** #614：由成绩数据派生统一 ledger 去重 key（跨端 GradeSignatureV1 语义）。 */
const buildGradeLedgerEventKey = async (grades: unknown): Promise<string> => {
  const signature = await buildCrossEndGradeSignature(grades)
  return signature ? buildLedgerEventKey('grades', signature) : ''
}

const sendQueuedNotifications = async (
  queue: NoticeItem[],
  allowPrompt = false,
  studentId = ''
): Promise<NoticeItem[]> => {
  if (!Array.isArray(queue) || queue.length === 0) return []
  const canNotify = await ensureNotifyReady(allowPrompt)
  if (!canNotify) return []

  const sent: NoticeItem[] = []
  for (let i = 0; i < queue.length; i += 1) {
    const notice = queue[i]
    if (!notice?.title) continue
    try {
      const ok = await platformBridge.sendLocalNotification({
        channelId: DEFAULT_CHANNEL_ID,
        title: String(notice.title),
        body: String(notice.body || ''),
        id: Math.floor(Date.now() / 1000) + i,
        targetView: String(notice.targetView || 'notifications')
      })
      if (ok) {
        sent.push(notice)
        // #614：发送成功后记录「已通知」账本（跨后台/前台去重共享语义；
        // 发送失败不记录——下次检查仍有机会补通知）
        if (studentId && notice.eventKey) {
          recordLedgerEntry(
            toSafeText(studentId),
            toSafeText(notice.eventKey),
            toSafeText(notice.domain) || 'unknown'
          )
        }
      }
    } catch {
      // ignore single notification error
    }
  }
  return sent
}

export interface ScheduleRefreshResult extends CheckResult {
  total?: number
  semester?: string
  current_week?: number
  locked_semester?: string | null
  pending_switch?: boolean
  error?: string
}

const refreshScheduleSilently = async (studentId: string): Promise<ScheduleRefreshResult> => {
  const timeoutMs = getRequestTimeoutMs()
  try {
    const res = await axios.post(
      toApiUrl('/v2/schedule/query'),
      { student_id: studentId },
      { timeout: timeoutMs }
    )
    const data = res?.data as {
      success?: boolean
      error?: unknown
      meta?: Record<string, unknown>
      data?: unknown
    } | null
    if (!data?.success) {
      return {
        success: false,
        error: toSafeText(data?.error || '课表刷新失败')
      }
    }
    const incomingSemester = toSafeText(data?.meta?.semester)
    const total = Array.isArray(data.data) ? data.data.length : 0
    const lockedSemester = readScheduleLock(studentId)

    setCachedData(`schedule:${studentId}`, data)
    if (incomingSemester) {
      setCachedData(`schedule:${studentId}:${incomingSemester}`, data)
    }

    const hasSwitchableNewSemester =
      !!lockedSemester &&
      !!incomingSemester &&
      incomingSemester !== lockedSemester &&
      total > 0

    if (hasSwitchableNewSemester) {
      // 仅标记"下次进入课表自动切换"，避免当前会话立即抖动。
      markScheduleSwitchPending(studentId, incomingSemester, 'notify-background')
      queueScheduleSemesterPopup(studentId, incomingSemester, 'new-semester')
    } else if (data?.meta) {
      const semesterForMeta = lockedSemester || incomingSemester
      localStorage.setItem(
        'hbu_schedule_meta',
        JSON.stringify({
          semester: semesterForMeta,
          start_date: toSafeText(data.meta.start_date),
          current_week: Number(data.meta.current_week || 0)
        })
      )
    }

    return {
      success: true,
      total,
      semester: incomingSemester,
      current_week: Number(data?.meta?.current_week || 0),
      locked_semester: lockedSemester,
      pending_switch: hasSwitchableNewSemester
    }
  } catch (error) {
    return {
      success: false,
      error: toSafeText((error as Error | undefined)?.message || error || '课表刷新失败')
    }
  }
}

export interface GradesCheckResult extends CheckResult {
  total: number
  changed: boolean
  latestItems: Array<Record<string, string>>
  signature?: string
  error?: string
}

const checkGrades = async (
  studentId: string,
  settings: NotifySettingsFull,
  queue: NoticeItem[]
): Promise<GradesCheckResult> => {
  const sid = toSafeText(studentId)
  const timeoutMs = getRequestTimeoutMs()
  try {
    const res = await axios.post(
      toApiUrl('/v2/quick_fetch'),
      { student_id: studentId },
      { timeout: timeoutMs }
    )
    const data = res?.data as { success?: boolean; error?: unknown; data?: unknown } | null
    if (!data?.success) {
      return {
        success: false,
        total: 0,
        changed: false,
        latestItems: [],
        error: toSafeText(data?.error || '成绩检查失败')
      }
    }

    setCachedData(`grades:${studentId}`, data)
    const grades = Array.isArray(data.data) ? data.data : []
    const signature = buildGradesSignature(grades)
    const sigKey = gradeSigKeyFor(studentId)
    const prevSignature = toSafeText(localStorage.getItem(sigKey))
    const changed = !!prevSignature && prevSignature !== signature

    localStorage.setItem(sigKey, signature)

    if (changed && settings.enableGradeNotice) {
      // #614：发送通知前必须查询统一 ledger / inbox 事件状态：
      // - ledger 已有「同 eventKey 已通知」记录（后台或前台此前已弹过）→ 只同步不重复弹；
      // - inbox 存在同账号未消费的「已展示」grades 事件（时序兜底）→ 同样抑制。
      const ledgerKey = await buildGradeLedgerEventKey(grades)
      const alreadyNotified = !!ledgerKey && hasLedgerEntry(sid, ledgerKey)
      const nativePending = !alreadyNotified && (await hasUnconsumedPresentedEvent(sid, 'grades'))
      if (!alreadyNotified && !nativePending) {
        queue.push({
          title: '成绩有更新',
          body: `检测到新的成绩变动，共 ${grades.length} 条成绩记录，请进入应用查看详情。`,
          targetView: 'grades',
          eventKey: ledgerKey || undefined,
          domain: 'grades'
        })
      }
    }

    return {
      success: true,
      total: grades.length,
      changed,
      latestItems: pickGradePreview(grades, 6),
      signature
    }
  } catch (error) {
    return {
      success: false,
      total: 0,
      changed: false,
      latestItems: [],
      error: toSafeText((error as Error | undefined)?.message || error || '成绩检查失败')
    }
  }
}

export interface ExamsCheckResult extends CheckResult {
  total: number
  upcoming: unknown[]
  tomorrowCount: number
  error?: string
}

const checkExams = async (
  studentId: string,
  settings: NotifySettingsFull,
  queue: NoticeItem[]
): Promise<ExamsCheckResult> => {
  const timeoutMs = getRequestTimeoutMs()
  const sid = toSafeText(studentId)
  try {
    const res = await axios.post(
      toApiUrl('/v2/exams'),
      { student_id: studentId, semester: '' },
      { timeout: timeoutMs }
    )
    const data = res?.data as { success?: boolean; error?: unknown; data?: unknown } | null
    if (!data?.success) {
      return {
        success: false,
        total: 0,
        upcoming: [],
        tomorrowCount: 0,
        error: toSafeText(data?.error || '考试检查失败')
      }
    }

    setCachedData(`exams:${studentId}:current`, data)

    const exams = Array.isArray(data.data) ? data.data : []
    const upcoming = pickUpcomingExams(exams, 8)
    const tomorrow = upcoming.filter((item) => item.is_tomorrow)
    const tomorrowKey = getTomorrowKeyForState()
    const tomorrowSignature = buildTomorrowExamSignature(tomorrow)
    const persisted = readJSON<{ day?: string; signature?: string }>(examSigKeyFor(studentId), {})
    const shouldNotify =
      settings.enableExamReminder &&
      tomorrow.length > 0 &&
      (
        toSafeText(persisted?.day) !== tomorrowKey ||
        toSafeText(persisted?.signature) !== tomorrowSignature
      )

    if (shouldNotify) {
      queue.push({
        title: '考试提醒',
        body:
          tomorrow.length === 1
            ? `明天有考试：${toSafeText(tomorrow[0].course_name)}`
            : `明天共有 ${tomorrow.length} 门考试，请提前做好准备。`,
        targetView: 'exams'
      })
    }

    writeJSON(examSigKeyFor(studentId), {
      day: tomorrowKey,
      signature: tomorrowSignature,
      updated_at: nowIso()
    })

    // #615/#706：考试安排变化前台 diff（与后台 native exams_changed 共用跨端 signature）。
    // 语义：首次成功只建立 baseline（不推历史）；后续发现可感知变化（增删/日期/时间/地点）
    // 通知一次；ledger 去重保证后台已弹过的不再重复弹。原 per-feature 独立开关已移除，
    // 检测是否运行由上方通知类型开关（enableExamReminder）经 runNotificationCheck 链路统一控制。
    {
      const changeSig = await buildCrossEndExamSignature(exams)
      const baselineKey = examsChangeBaselineKeyFor(sid)
      const prevBaseline = toSafeText(localStorage.getItem(baselineKey))
      if (changeSig && prevBaseline && prevBaseline !== changeSig) {
        const ledgerKey = await buildExamLedgerEventKey(exams)
        const alreadyNotified = !!ledgerKey && hasLedgerEntry(sid, ledgerKey)
        const nativePending = !alreadyNotified && (await hasUnconsumedPresentedEvent(sid, 'exams'))
        if (!alreadyNotified && !nativePending) {
          queue.push({
            title: '考试安排有更新',
            body: '检测到考试安排变化，请打开 Mini-HBUT 查看详情。',
            targetView: 'exams',
            eventKey: ledgerKey || undefined,
            domain: 'exams'
          })
        }
      }
      if (changeSig) {
        localStorage.setItem(baselineKey, changeSig)
      }
    }

    // #610 联动：完整考试同步成功后触发未来考试提醒 reconcile（幂等 diff，无变化零系统调用）。
    if (Array.isArray(exams)) {
      void import('./local_reminder_scheduler').then((mod) =>
        mod.reconcileLocalReminders({
          studentId: sid,
          exams,
          reason: 'notify-exams-refresh'
        }).catch(() => {})
      ).catch(() => {})
    }

    return {
      success: true,
      total: exams.length,
      upcoming,
      tomorrowCount: tomorrow.length
    }
  } catch (error) {
    return {
      success: false,
      total: 0,
      upcoming: [],
      tomorrowCount: 0,
      error: toSafeText((error as Error | undefined)?.message || error || '考试检查失败')
    }
  }
}

const getTomorrowKeyForState = (): string => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 1)
  return toDayKey(date)
}

export interface ElectricityCheckResult extends CheckResult {
  configured: boolean
  selectedPath: string[]
  quantity?: number | null
  balance?: number | null
  acQuantity?: number | null
  acBalance?: number | null
  isDual?: boolean
  status?: string
  isLow?: boolean
  sync_time?: string
  error?: string
}

const checkElectricity = async (
  studentId: string,
  settings: NotifySettingsFull,
  queue: NoticeItem[],
  launchCheck = false
): Promise<ElectricityCheckResult> => {
  const timeoutMs = getRequestTimeoutMs()
  const selectedPath = getDormSelection()
  if (selectedPath.length !== 4) {
    return {
      success: false,
      configured: false,
      selectedPath: [],
      error: '未设置宿舍房间，请先在电费模块选择房间。'
    }
  }

  const [area_id, building_id, layer_id, room_id] = selectedPath
  const roomKey = selectedPath.join('-')
  const powerStateKey = powerStateKeyFor(studentId, roomKey)

  // 判断是否为双计费模式（照明+空调分开）
  const layerStr = String(layer_id)
  const isDual = layerStr.startsWith('merged_')
  let lightLayerId = layer_id
  let acLayerId: string | null = null
  if (isDual) {
    const parts = layerStr.split('_')
    lightLayerId = parts[2]
    acLayerId = parts[3]
  }

  // 空调房间值从 localStorage 读取（ElectricityView 选择时已存储）
  let acRoomValue = isDual ? toSafeText(readJSON<string>('last_dorm_ac_room', '')) : null
  // 回退：如果未存储空调房间值，从 room_id 推导（替换 layer_id + 房间号前缀1）
  if (isDual && !acRoomValue && acLayerId) {
    const m = String(room_id).match(/^(.+?)--(\d+)-(\d+)$/)
    if (m) {
      acRoomValue = `${m[1]}--${acLayerId}-1${m[3]}`
    }
  }

  try {
    // 照明查询（非双计费时直接用原值）
    const lightRes = await axios.post(
      toApiUrl('/v2/electricity/balance'),
      {
        area_id,
        building_id,
        layer_id: isDual ? lightLayerId : layer_id,
        room_id,
        student_id: studentId
      },
      { timeout: timeoutMs }
    )
    const lightData = lightRes?.data as {
      success?: boolean
      error?: unknown
      quantity?: unknown
      balance?: unknown
      status?: unknown
      sync_time?: unknown
    } | null
    if (!lightData?.success) {
      return {
        success: false,
        configured: true,
        selectedPath,
        error: toSafeText(lightData?.error || '电费检查失败（照明）')
      }
    }

    const quantity = toSafeNumber(lightData.quantity)
    const balance = toSafeNumber(lightData.balance)

    // 空调查询（仅双计费时）
    let acQuantity: number | null = null
    let acBalance: number | null = null
    if (isDual && acLayerId && acRoomValue) {
      try {
        const acRes = await axios.post(
          toApiUrl('/v2/electricity/balance'),
          {
            area_id,
            building_id,
            layer_id: acLayerId,
            room_id: acRoomValue,
            student_id: studentId
          },
          { timeout: timeoutMs }
        )
        const acData = acRes?.data as { success?: boolean; quantity?: unknown; balance?: unknown } | null
        if (acData?.success) {
          acQuantity = toSafeNumber(acData.quantity)
          acBalance = toSafeNumber(acData.balance)
        }
      } catch {
        // 空调查询失败不阻塞主流程
      }
    }

    const isLightLow = Number.isFinite(quantity) && quantity < POWER_ALERT_THRESHOLD
    const isAcLow = acQuantity !== null && Number.isFinite(acQuantity) && acQuantity < POWER_ALERT_THRESHOLD
    const isLow = isLightLow || isAcLow
    const state = readJSON<Record<string, unknown>>(powerStateKey, {})

    // 低电提醒去重策略
    let shouldNotify = false
    if (settings.enablePowerNotice && isLow) {
      if (launchCheck) {
        shouldNotify = toSafeText(state?.last_launch_boot) !== APP_BOOT_ID
      } else {
        shouldNotify = !state?.was_low
      }
    }

    if (shouldNotify) {
      let bodyText
      if (isDual) {
        const parts: string[] = []
        if (isLightLow) parts.push(`照明 ${Number.isFinite(quantity) ? quantity.toFixed(2) : lightData.quantity} 度`)
        if (isAcLow) parts.push(`空调 ${acQuantity !== null && Number.isFinite(acQuantity) ? acQuantity.toFixed(2) : '?'} 度`)
        bodyText = `当前宿舍 ${parts.join('、')} 不足 ${POWER_ALERT_THRESHOLD} 度，请及时充值。`
      } else {
        bodyText = `当前宿舍剩余电量 ${Number.isFinite(quantity) ? quantity.toFixed(2) : lightData.quantity} 度，已低于 ${POWER_ALERT_THRESHOLD} 度，请及时充值。`
      }
      queue.push({
        title: '电费不足提醒',
        body: bodyText,
        targetView: 'electricity'
      })
    }

    writeJSON(powerStateKey, {
      was_low: isLow,
      last_quantity: Number.isFinite(quantity) ? quantity : null,
      last_balance: Number.isFinite(balance) ? balance : null,
      ac_quantity: Number.isFinite(acQuantity) ? acQuantity : null,
      ac_balance: Number.isFinite(acBalance) ? acBalance : null,
      is_dual: isDual,
      last_launch_boot:
        launchCheck && isLow && settings.enablePowerNotice ? APP_BOOT_ID : toSafeText(state?.last_launch_boot),
      last_notified_at:
        shouldNotify ? nowIso() : toSafeText(state?.last_notified_at),
      updated_at: nowIso()
    })

    return {
      success: true,
      configured: true,
      selectedPath,
      quantity: Number.isFinite(quantity) ? quantity : null,
      balance: Number.isFinite(balance) ? balance : null,
      acQuantity: Number.isFinite(acQuantity) ? acQuantity : null,
      acBalance: Number.isFinite(acBalance) ? acBalance : null,
      isDual,
      status: toSafeText(lightData.status),
      isLow,
      sync_time: toSafeText(lightData.sync_time)
    }
  } catch (error) {
    return {
      success: false,
      configured: true,
      selectedPath,
      error: toSafeText((error as Error | undefined)?.message || error || '电费检查失败')
    }
  }
}

export interface ClassReminderResult extends CheckResult {
  enabled: boolean
  totalToday: number
  triggered: number
  leadMinutes?: number
  currentWeek?: number
  nextCourse?: unknown
  reason?: string
}

const checkClassReminder = async (
  studentId: string,
  settings: NotifySettingsFull,
  queue: NoticeItem[],
  scheduleResult: ScheduleRefreshResult | null
): Promise<ClassReminderResult> => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return {
      success: false,
      enabled: false,
      totalToday: 0,
      triggered: 0,
      reason: 'missing-student-id'
    }
  }

  if (!settings.enableClassReminder) {
    return {
      success: true,
      enabled: false,
      totalToday: 0,
      triggered: 0
    }
  }

  const semesterHint = toSafeText(scheduleResult?.semester)
  const payload = getSchedulePayloadForReminder(sid, semesterHint)
  const courses: Array<Record<string, unknown>> = Array.isArray(payload?.data)
    ? (payload.data as Array<Record<string, unknown>>).slice()
    : []
  const semesterForCustom = toSafeText(payload?.meta?.semester || semesterHint)
  if (semesterForCustom) {
    try {
      const customRes = await axios.post(
        toApiUrl('/v2/schedule/custom/list'),
        { student_id: sid, semester: semesterForCustom },
        { timeout: getRequestTimeoutMs() }
      )
      const customData = (customRes?.data ?? null) as {
        success?: boolean
        data?: unknown
      } | null
      if (customData?.success && Array.isArray(customData?.data)) {
        courses.push(
          ...(customData.data as Array<Record<string, unknown>>).map((item) => ({
            ...item,
            is_custom: true
          }))
        )
      }
    } catch {
      // ignore custom fetch error
    }
  }
  const currentWeek =
    toPositiveInt(payload?.meta?.current_week, 0) ||
    toPositiveInt(readJSON<{ current_week?: number }>('hbu_schedule_meta', {})?.current_week, 1) ||
    1
  const weekday = getTodayWeekday()
  const leadMinutes = Math.min(120, Math.max(5, Number(settings.classLeadMinutes || 30)))
  const todayKey = toDayKey(new Date())
  const todayClasses = getMergedTodayClasses(courses, currentWeek, weekday)
  const candidates = toCourseReminderItems(todayClasses, leadMinutes)
  const nowMinute = getCurrentMinutePrecise()
  const nextUpcomingCourse =
    todayClasses
      .filter((course) => Number.isFinite(course?.startMinutes) && (course?.startMinutes || 0) >= nowMinute)
      .sort((a, b) => a.startPeriod - b.startPeriod)[0] || null

  const stateKey = classReminderStateKeyFor(sid)
  const state = readJSON<{ day?: string; sent_ids?: unknown[] }>(stateKey, {})
  const sentIds = state?.day === todayKey && Array.isArray(state?.sent_ids)
    ? state.sent_ids.map((item) => toSafeText(item)).filter(Boolean)
    : []
  const sentSet = new Set(sentIds)
  const toNotify = candidates.filter((item) => !sentSet.has(item.id))

  toNotify.forEach((item) => {
    const suffix = item.teacher ? `，授课教师 ${item.teacher}` : ''
    const leadText = item.minsUntilStart > 0 ? `${item.minsUntilStart} 分钟后` : '即将'
    queue.push({
      title: '上课提醒',
      body: `${leadText}开始：${item.name}（${item.startClock}，${item.room}${suffix}）`,
      targetView: 'schedule'
    })
  })

  const nextCourse = candidates[0] || null
  const nextIds = [...sentSet, ...toNotify.map((item) => item.id)]
  writeJSON(stateKey, {
    day: todayKey,
    sent_ids: nextIds.slice(-120),
    updated_at: nowIso()
  })

  pushDebugLog(
    'Notify',
    `上课提醒检查完成 total=${todayClasses.length} trigger=${toNotify.length} lead=${leadMinutes}min`,
    'debug',
    {
      semester: semesterHint,
      currentWeek,
      weekday
    }
  )

  const nextCourseItem = nextUpcomingCourse || nextCourse
  return {
    success: true,
    enabled: true,
    totalToday: todayClasses.length,
    triggered: toNotify.length,
    leadMinutes,
    currentWeek,
    nextCourse: nextCourseItem
      ? {
          name: toSafeText(nextCourseItem?.name || ''),
          room: toSafeText(nextCourseItem?.room || ''),
          teacher: toSafeText(nextCourseItem?.teacher || ''),
          startClock: toSafeText(nextCourseItem?.startClock || ''),
          minsUntilStart: Number.isFinite(Number(nextCourseItem?.minsUntilStart))
            ? Number(nextCourseItem?.minsUntilStart)
            : Math.max(0, Math.floor(Number(nextCourseItem?.startMinutes || nowMinute) - nowMinute))
        }
      : null
  }
}

export interface SchoolInboxResult extends CheckResult {
  enabled: boolean
  total: number
  triggered: number
  source?: string
  checkedAt?: string
  baseline?: boolean
  reason?: string
  error?: string
}

const checkSchoolInbox = async (
  studentId: string,
  settings: NotifySettingsFull,
  queue: NoticeItem[]
): Promise<SchoolInboxResult> => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return { success: false, enabled: false, total: 0, triggered: 0, reason: 'missing-student-id' }
  }
  if (!settings.enableSchoolInbox) {
    return { success: true, enabled: false, total: 0, triggered: 0 }
  }
  if (!isTauriRuntime()) {
    return {
      success: false,
      enabled: true,
      total: 0,
      triggered: 0,
      error: '学校消息抓取需在 Tauri 桌面端前台运行'
    }
  }

  try {
    const loginMode = resolveLoginMode()
    const response = (await invokeNative('school_inbox_fetch', { loginMode })) as {
      items?: unknown[]
      source?: unknown
      fetchedAt?: unknown
    } | null
    const items = Array.isArray(response?.items) ? response.items : []
    const stateKey = schoolInboxStateKeyFor(sid)
    const state = readSchoolInboxState(sid)
    const isFirstSync = !state.initialized
    const knownSet = new Set(state.ids)
    const allIds = items.map((item) => {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return toSafeText(raw?.id)
    }).filter(Boolean)
    const toNotify = isFirstSync
      ? []
      : items.filter((item) => {
          const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
          const id = toSafeText(raw?.id)
          if (!id || knownSet.has(id)) return false
          return !isSchoolInboxItemRead(item)
        })

    // #615：按 provider + message ID 生成稳定 eventKey 进统一 ledger 去重——
    // 后台（native school_message 事件）已通知过的消息，前台不再重复弹（#614 联动）。
    const notYetNotified = []
    for (const item of toNotify) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const id = toSafeText(raw?.id)
      const eventKey = id ? buildLedgerEventKey('school-message', id) : ''
      if (eventKey && hasLedgerEntry(sid, eventKey)) continue
      notYetNotified.push({ item, eventKey })
    }

    for (const { item, eventKey } of notYetNotified) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      queue.push({
        title: toSafeText(raw?.title) || '学校通知',
        body: toSafeText(raw?.summary) || '你有新的学校消息',
        targetView: 'notifications',
        eventKey: eventKey || undefined,
        domain: 'school-message'
      })
    }

    writeJSON(stateKey, {
      initialized: true,
      ids: allIds.slice(0, 500),
      updated_at: nowIso()
    })
    await snapshotChaoxingNoticeCookie(loginMode)

    pushDebugLog(
      'Notify',
      `学校消息检查完成 total=${items.length} trigger=${notYetNotified.length} first=${isFirstSync ? '1' : '0'}`,
      'info',
      { source: toSafeText(response?.source), loginMode }
    )

    return {
      success: true,
      enabled: true,
      total: items.length,
      triggered: notYetNotified.length,
      source: toSafeText(response?.source),
      checkedAt: toSafeText(response?.fetchedAt),
      baseline: isFirstSync
    }
  } catch (error) {
    const message = toSafeText((error as Error | undefined)?.message || error)
    pushDebugLog('Notify', `学校消息检查失败: ${message}`, 'warn')
    return {
      success: false,
      enabled: true,
      total: 0,
      triggered: 0,
      error: message || '学校消息检查失败'
    }
  }
}

// #715：「学习通通知」独立渠道——固定 chaoxing 源（复用 school_inbox_fetch 的
// loginMode 门控，与 ChaoxingInboxView 同一取数路径），与「学校消息」（教务）
// 并行检测；已读基线快照与 ledger domain 独立（chaoxing-inbox），互不串扰。
export const checkChaoxingInbox = async (
  studentId: string,
  settings: NotifySettingsFull,
  queue: NoticeItem[]
): Promise<SchoolInboxResult> => {
  const sid = toSafeText(studentId)
  if (!sid) {
    return { success: false, enabled: false, total: 0, triggered: 0, reason: 'missing-student-id' }
  }
  if (!settings.enableChaoxingInbox) {
    return { success: true, enabled: false, total: 0, triggered: 0 }
  }
  if (!isTauriRuntime()) {
    return {
      success: false,
      enabled: true,
      total: 0,
      triggered: 0,
      error: '学习通通知抓取需在客户端内运行'
    }
  }

  try {
    const response = (await invokeNative('school_inbox_fetch', {
      loginMode: 'chaoxing'
    })) as {
      items?: unknown[]
      source?: unknown
      fetchedAt?: unknown
    } | null
    const items = Array.isArray(response?.items) ? response.items : []
    const stateKey = chaoxingInboxStateKeyFor(sid)
    const state = readChaoxingInboxState(sid)
    const isFirstSync = !state.initialized
    const knownSet = new Set(state.ids)
    const allIds = items
      .map((item) => {
        const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
        return toSafeText(raw?.id)
      })
      .filter(Boolean)
    // 仅通知未读的新消息；首次同步只建立基线，不推历史
    const toNotify =
      isFirstSync
        ? []
        : items.filter((item) => {
            const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
            const id = toSafeText(raw?.id)
            if (!id || knownSet.has(id)) return false
            return !isSchoolInboxItemRead(item)
          })

    // ledger 去重：后台未来接入 chaoxing 事件时共享同一 domain，不与学校消息串扰
    const notYetNotified = []
    for (const item of toNotify) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const id = toSafeText(raw?.id)
      const eventKey = id ? buildLedgerEventKey('chaoxing-inbox', id) : ''
      if (eventKey && hasLedgerEntry(sid, eventKey)) continue
      notYetNotified.push({ item, eventKey })
    }

    for (const { item, eventKey } of notYetNotified) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      queue.push({
        title: toSafeText(raw?.title) || '学习通通知',
        body: toSafeText(raw?.summary) || '你有新的学习通消息',
        targetView: 'notifications',
        eventKey: eventKey || undefined,
        domain: 'chaoxing-inbox'
      })
    }

    writeJSON(stateKey, {
      initialized: true,
      ids: allIds.slice(0, 500),
      updated_at: nowIso()
    })
    await snapshotChaoxingNoticeCookie('chaoxing')

    pushDebugLog(
      'Notify',
      `学习通通知检查完成 total=${items.length} trigger=${notYetNotified.length} first=${isFirstSync ? '1' : '0'}`,
      'info'
    )

    return {
      success: true,
      enabled: true,
      total: items.length,
      triggered: notYetNotified.length,
      source: toSafeText(response?.source) || 'chaoxing',
      checkedAt: toSafeText(response?.fetchedAt),
      baseline: isFirstSync
    }
  } catch (error) {
    const message = toSafeText((error as Error | undefined)?.message || error)
    pushDebugLog('Notify', `学习通通知检查失败: ${message}`, 'warn')
    return {
      success: false,
      enabled: true,
      total: 0,
      triggered: 0,
      error: message || '学习通通知检查失败'
    }
  }
}

export {
  isSchoolInboxItemRead,
  syncWidgetData,
  refreshScheduleSilently,
  checkGrades,
  checkExams,
  checkElectricity,
  checkClassReminder,
  checkSchoolInbox,
  sendQueuedNotifications
}
