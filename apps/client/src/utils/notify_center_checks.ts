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
import { t, tf } from './app_i18n'
import { filterVisibleOfficialCourses } from './schedule_visibility'
export type { ElectricityCheckResult } from './notify_center_electricity.js'
// E3 #1023：教师身份隔离（学生通知检测的教师安全分支）。
import {
  checkElectricityTeacherSafe,
  isTeacherNotificationContext,
  TEACHER_SCOPE_SKIPPED
} from './notify_teacher_scope.js'
import {
  DEFAULT_CHANNEL_ID,
  NotifySettingsFull,
  buildGradesSignature,
  buildTomorrowExamSignature,
  classReminderStateKeyFor,
  chaoxingInboxStateKeyFor,
  examSigKeyFor,
  getCurrentMinutePrecise,
  getMergedTodayClasses,
  getRequestTimeoutMs,
  getSchedulePayloadForReminder,
  getTodayWeekday,
  gradeSigKeyFor,
  mergeInboxDedupeIds,
  normalizeInboxDedupeState,
  nowIso,
  pickGradePreview,
  pickUpcomingExams,
  readJSON,
  resolveLoginMode,
  schoolInboxStateKeyFor,
  toApiUrl,
  toCourseReminderItems,
  toDayKey,
  toPositiveInt,
  toSafeText,
  UNTRUSTED_DOWNGRADE_THRESHOLD,
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

// #1106：读取旧版/缺失快照时统一走 schema v2 归一化
// （initialized 缺失 → false、ids 非数组 → 空数组、streak 缺失 → 0）。
/** 收件箱去重快照的内部形态（含 #1106 的「连续不可信抓取」计数）。 */
interface InboxDedupeSnapshot {
  initialized: boolean
  ids: string[]
  untrustedStreak: number
}

const readInboxSnapshotByKey = (
  keyFor: (studentId: string) => string,
  studentId: string
): InboxDedupeSnapshot => {
  const state = normalizeInboxDedupeState(readJSON<unknown>(keyFor(studentId), null))
  return {
    initialized: state?.initialized ?? false,
    ids: state?.ids ?? [],
    untrustedStreak: state?.untrustedStreak ?? 0
  }
}

/** 对外保持旧形状：notify_center.markSchoolInboxNotified 只关心 initialized / ids。 */
const readInboxStateByKey = (
  keyFor: (studentId: string) => string,
  studentId: string
): { initialized: boolean; ids: string[] } => {
  const { initialized, ids } = readInboxSnapshotByKey(keyFor, studentId)
  return { initialized, ids }
}

export const readSchoolInboxState = (studentId: string): { initialized: boolean; ids: string[] } =>
  readInboxStateByKey(schoolInboxStateKeyFor, studentId)

const readSchoolInboxSnapshot = (studentId: string): InboxDedupeSnapshot =>
  readInboxSnapshotByKey(schoolInboxStateKeyFor, studentId)

// #715：学习通通知独立去重快照（与学校消息互不串扰）
const readChaoxingInboxSnapshot = (studentId: string): InboxDedupeSnapshot =>
  readInboxSnapshotByKey(chaoxingInboxStateKeyFor, studentId)

// ============================================================
// #1106：收件箱去重「基线规划」
// ------------------------------------------------------------
// 一次检查只回答三件事：本轮推不推、推哪些、快照写成什么。
// 关键约束（issue #1101 的根因）：
//   · ids 只增不减 —— 一次变短的抓取不得抹掉已知 id。旧实现用「本次抓到的
//     id」整体覆盖快照，学习通翻页中断 / 浅抓深抓切换 / 空结果都会把基线洗短，
//     下一次完整抓取便把短缺那段整段判成「新消息」→ 重登即爆炸式重发；
//   · 只有「可信完整抓取」才把 initialized 置 true（旧实现是只要抓成功就置位，
//     连空结果也置位 → 首次基线被永久点亮）；
//   · 连续 UNTRUSTED_DOWNGRADE_THRESHOLD 次不可信时一次性降级为「已初始化」，
//     避免某类账号永远拿不到完整抓取而彻底收不到通知；
//   · 只在「列表头部窗口」内判新 —— 新消息总在列表最前面，深抓补回来的历史
//     只会追加在尾部；对整个列表判新会让一次深抓（最多 1000 条）把历史全量
//     当成新消息（issue #1101 的另一条爆发路径）。
// ============================================================

/** #1106：单轮「新消息」判定只看列表前 N 条（新消息总在头部；尾部是历史回填）。 */
const MAX_NEW_INBOX_CANDIDATES = 50

interface InboxPlan {
  /** 本轮候选入队条目（已知 id / 已读已排除；ledger 去重由调用方完成）。 */
  candidates: unknown[]
  /** 需要写回的快照。 */
  nextState: InboxDedupeSnapshot
  /** 本轮是否为首次同步（只建基线、不推送）。 */
  baseline: boolean
  /** 是否触发了「连续不可信」降级。 */
  downgraded: boolean
}

/** #1106：抓取可信度。`complete` 缺失（旧 Rust / 门户旧语义）按可信处理，避免永不推送。 */
const isInboxFetchTrusted = (response: { complete?: unknown } | null | undefined): boolean => {
  const flag = response?.complete
  if (flag === undefined || flag === null) return true
  return !(flag === false || flag === 'false')
}

const planInboxSnapshot = (input: {
  items: unknown[]
  state: InboxDedupeSnapshot
  trusted: boolean
}): InboxPlan => {
  const { items, state, trusted } = input
  const allIds = items
    .map((item) => {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return toSafeText(raw?.id)
    })
    .filter(Boolean)
  // ids 只增：新 ∪ 旧（上限 INBOX_DEDUPE_ID_CAP，超出淘汰最旧）
  const mergedIds = mergeInboxDedupeIds(allIds, state.ids)

  if (!trusted) {
    const streak = state.untrustedStreak + 1
    if (streak < UNTRUSTED_DOWNGRADE_THRESHOLD) {
      // 不可信：不推进 initialized、不推送，**也不推进已知 id**。
      // 若在这里把本次抓到的 id 并入基线，抓到的新消息会被永久标成"已知"
      // 而再也没机会通知（静默丢通知）；下次可信抓取再来判新即可。
      return {
        candidates: [],
        nextState: { initialized: state.initialized, ids: state.ids, untrustedStreak: streak },
        baseline: state.initialized,
        downgraded: false
      }
    }
    // 降级护栏：连续多次不可信 → 把当前并集设为基线，恢复后续通知能力（本轮不推）
    return {
      candidates: [],
      nextState: { initialized: true, ids: mergedIds, untrustedStreak: 0 },
      baseline: true,
      downgraded: true
    }
  }

  const isFirstSync = !state.initialized
  const knownSet = new Set(state.ids)
  const candidates = isFirstSync
    ? []
    : items.slice(0, MAX_NEW_INBOX_CANDIDATES).filter((item) => {
        const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
        const id = toSafeText(raw?.id)
        if (!id || knownSet.has(id)) return false
        return !isSchoolInboxItemRead(item)
      })
  return {
    candidates,
    nextState: { initialized: true, ids: mergedIds, untrustedStreak: 0 },
    baseline: isFirstSync,
    downgraded: false
  }
}

/** 写回快照（schema v2）；与读取端的 normalizeInboxDedupeState 字段名保持一致。 */
const persistInboxSnapshot = (
  keyFor: (studentId: string) => string,
  studentId: string,
  next: InboxDedupeSnapshot
): void => {
  writeJSON(keyFor(studentId), {
    schema: 2,
    initialized: next.initialized,
    ids: next.ids,
    untrustedStreak: next.untrustedStreak,
    updated_at: nowIso()
  })
}

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
    labels.push(floorMatch ? tf('notify.room.floor', { n: floorMatch[0] }) : String(layerLabel || '?'))

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

// #1106（#1104 的发送侧）：收件箱类通知单轮最多真实发送条数，其余合并为 1 条摘要。
// 旧实现逐条发送、无上限：一次差异 50 条就弹 50 个系统通知（刷屏观感的主因之一）。
const MAX_INBOX_NOTIFY_PER_ROUND = 3
/** 参与「收件箱节流」的业务域；成绩/考试/上课提醒等时效性通知不受影响。 */
const INBOX_NOTICE_DOMAINS = new Set(['school-message', 'chaoxing-inbox'])

const isInboxNotice = (notice: NoticeItem): boolean =>
  INBOX_NOTICE_DOMAINS.has(toSafeText(notice?.domain))

/** 发送单条本地通知；成功且提供 eventKey 时写「已通知」账本。 */
const sendNoticeItem = async (
  notice: NoticeItem,
  index: number,
  studentId: string
): Promise<boolean> => {
  if (!notice?.title) return false
  try {
    const ok = await platformBridge.sendLocalNotification({
      channelId: DEFAULT_CHANNEL_ID,
      title: String(notice.title),
      body: String(notice.body || ''),
      id: Math.floor(Date.now() / 1000) + index,
      targetView: String(notice.targetView || 'notifications')
    })
    if (!ok) return false
    // #614：发送成功后记录「已通知」账本（跨后台/前台去重共享语义；
    // 发送失败不记录——下次检查仍有机会补通知）
    if (studentId && notice.eventKey) {
      recordLedgerEntry(
        toSafeText(studentId),
        toSafeText(notice.eventKey),
        toSafeText(notice.domain) || 'unknown'
      )
    }
    return true
  } catch {
    // ignore single notification error
    return false
  }
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
  let index = 0

  // 非收件箱类（成绩/考试/上课提醒/电费）保持原有逐条发送语义 ——
  // 这些是时效性提醒，不能被收件箱的突发量挤进摘要。
  for (const notice of queue) {
    if (isInboxNotice(notice)) continue
    if (await sendNoticeItem(notice, index, studentId)) sent.push(notice)
    index += 1
  }

  // 收件箱类：最多 MAX_INBOX_NOTIFY_PER_ROUND 条，其余合并为 1 条摘要。
  // 摘要刻意不带 eventKey：这些 id 已在检查阶段并入去重快照，不会被再次判新，
  // 写 ledger 只会白占容量。
  const inboxNotices = queue.filter(isInboxNotice)
  for (const notice of inboxNotices.slice(0, MAX_INBOX_NOTIFY_PER_ROUND)) {
    if (await sendNoticeItem(notice, index, studentId)) sent.push(notice)
    index += 1
  }
  const restCount = inboxNotices.length - MAX_INBOX_NOTIFY_PER_ROUND
  if (restCount > 0) {
    const digest: NoticeItem = {
      title: t('notify.notice.inboxDigestTitle'),
      body: tf('notify.notice.inboxDigestBody', { n: restCount }),
      targetView: 'notifications',
      domain: 'inbox-digest'
    }
    if (await sendNoticeItem(digest, index, '')) sent.push(digest)
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
  // E3 #1023：教师身份不刷新学生课表（教师课表走教师只读链路）。
  if (isTeacherNotificationContext()) {
    return { success: false, error: TEACHER_SCOPE_SKIPPED }
  }
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
        error: toSafeText(data?.error || t('notify.error.scheduleRefresh'))
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
      error: toSafeText((error as Error | undefined)?.message || error || t('notify.error.scheduleRefresh'))
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
  // E3 #1023：教师身份绝不请求学生成绩（不走 /v2/quick_fetch 学生分支）。
  if (isTeacherNotificationContext()) {
    return { success: false, total: 0, changed: false, latestItems: [], error: TEACHER_SCOPE_SKIPPED }
  }
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
        error: toSafeText(data?.error || t('notify.error.gradesCheck'))
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
          title: t('notify.notice.gradesChanged'),
          body: tf('notify.notice.gradesChangedBody', { total: grades.length }),
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
      error: toSafeText((error as Error | undefined)?.message || error || t('notify.error.gradesCheck'))
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
  // E3 #1023：教师身份不请求学生考试（监考提醒由 E6 数据源接入后另行处理）。
  if (isTeacherNotificationContext()) {
    return { success: false, total: 0, upcoming: [], tomorrowCount: 0, error: TEACHER_SCOPE_SKIPPED }
  }
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
        error: toSafeText(data?.error || t('notify.error.examsCheck'))
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
        title: t('reminder.exam.title'),
        body:
          tomorrow.length === 1
            ? tf('notify.notice.examTomorrowOne', { course: toSafeText(tomorrow[0].course_name) })
            : tf('notify.notice.examTomorrowMany', { total: tomorrow.length }),
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
            title: t('notify.notice.examsUpdated'),
            body: t('notify.notice.examsUpdatedBody'),
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
      error: toSafeText((error as Error | undefined)?.message || error || t('notify.error.examsCheck'))
    }
  }
}

const getTomorrowKeyForState = (): string => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 1)
  return toDayKey(date)
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
  // E3 #1023：教师课前提醒走 local_reminder_scheduler 的教师分支，不消费学生课表。
  if (isTeacherNotificationContext()) {
    return { success: true, enabled: false, totalToday: 0, triggered: 0, reason: 'teacher-scope' }
  }
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
  // Issue #871：通知中心课前提醒与课表页消费同一份有效课表——
  // 已移除（整学期/按周）的教务课程不再触发提醒；自定义课程不受可见性影响。
  const visibleCourses = filterVisibleOfficialCourses(sid, semesterForCustom, courses)
  const weekday = getTodayWeekday()
  const leadMinutes = Math.min(120, Math.max(5, Number(settings.classLeadMinutes || 30)))
  const todayKey = toDayKey(new Date())
  const todayClasses = getMergedTodayClasses(visibleCourses, currentWeek, weekday)
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
    const suffix = item.teacher ? tf('reminder.class.withTeacher', { teacher: item.teacher }) : ''
    const leadText = item.minsUntilStart > 0 ? tf('notify.class.inMinutes', { n: item.minsUntilStart }) : t('notify.class.soon')
    queue.push({
      title: t('reminder.class.title'),
      body: tf('notify.class.foregroundBody', {
        lead: leadText,
        course: item.name,
        clock: item.startClock,
        room: item.room,
        teacher: suffix
      }),
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
    `class reminder check done total=${todayClasses.length} trigger=${toNotify.length} lead=${leadMinutes}min`,
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
  // E3 #1023：教师通知由只读视图直接消费，不写入学生域去重快照 / ledger。
  if (isTeacherNotificationContext()) {
    return { success: true, enabled: false, total: 0, triggered: 0, reason: 'teacher-scope' }
  }
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
      error: t('notify.error.schoolInboxDesktopOnly')
    }
  }

  // #1103：学习通登录方式下，学习通列表由「学习通通知」渠道独占。
  // 旧实现两个渠道各拉同一份列表、各用自己的快照与 ledger domain 判定，
  // 同一条新消息会被弹两次（且去重状态互不相干，关掉一个开关也挡不住另一个）。
  //
  // 只在「学习通渠道确实在跑」时让位：若用户关掉了学习通通知开关，学校消息
  // 渠道必须接回这份来源，否则该账号会一条收件箱通知都收不到（静默漏推）。
  // 任一时刻只有一个渠道处理同一来源，所以不会重新引入双发。
  const loginMode = resolveLoginMode()
  const chaoxingChannelActive = !!settings.enableChaoxingInbox
  if (loginMode.toLowerCase().startsWith('chaoxing') && chaoxingChannelActive) {
    pushDebugLog('Notify', 'school inbox skipped: chaoxing source owned by chaoxing channel', 'debug', {
      loginMode
    })
    return {
      success: true,
      enabled: false,
      total: 0,
      triggered: 0,
      reason: 'chaoxing-source-owned-by-chaoxing-channel'
    }
  }

  try {
    const response = (await invokeNative('school_inbox_fetch', { loginMode })) as {
      items?: unknown[]
      source?: unknown
      fetchedAt?: unknown
      complete?: unknown
    } | null
    const items = Array.isArray(response?.items) ? response.items : []
    const state = readSchoolInboxSnapshot(sid)
    // #1106：抓取是否可信 —— 旧实现不看完整性，任何「成功但变短」的抓取都会
    // 覆盖掉已知 id，下一次完整抓取便把短缺那段整段当成新消息。
    const trusted = isInboxFetchTrusted(response)
    const plan = planInboxSnapshot({ items, state, trusted })

    // #615：按 provider + message ID 生成稳定 eventKey 进统一 ledger 去重——
    // 后台（native school_message 事件）已通知过的消息，前台不再重复弹（#614 联动）。
    const notYetNotified = []
    for (const item of plan.candidates) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const id = toSafeText(raw?.id)
      const eventKey = id ? buildLedgerEventKey('school-message', id) : ''
      if (eventKey && hasLedgerEntry(sid, eventKey)) continue
      notYetNotified.push({ item, eventKey })
    }

    for (const { item, eventKey } of notYetNotified) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      queue.push({
        title: toSafeText(raw?.title) || t('notify.notice.schoolTitle'),
        body: toSafeText(raw?.summary) || t('notify.notice.schoolBody'),
        targetView: 'notifications',
        eventKey: eventKey || undefined,
        domain: 'school-message'
      })
    }

    persistInboxSnapshot(schoolInboxStateKeyFor, sid, plan.nextState)
    await snapshotChaoxingNoticeCookie(loginMode)

    pushDebugLog(
      'Notify',
      `school inbox check done total=${items.length} trigger=${notYetNotified.length} first=${plan.baseline ? '1' : '0'} trusted=${trusted ? '1' : '0'} union=${plan.nextState.ids.length} downgraded=${plan.downgraded ? '1' : '0'}`,
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
      baseline: plan.baseline
    }
  } catch (error) {
    const message = toSafeText((error as Error | undefined)?.message || error)
    pushDebugLog('Notify', `school inbox check failed: ${message}`, 'warn')
    return {
      success: false,
      enabled: true,
      total: 0,
      triggered: 0,
      error: message || t('notify.error.schoolInboxCheck')
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
  // E3 #1023：教师身份不使用学习通渠道（教师端不提供学习通入口）。
  if (isTeacherNotificationContext()) {
    return { success: true, enabled: false, total: 0, triggered: 0, reason: 'teacher-scope' }
  }
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
      error: t('notify.error.chaoxingClientOnly')
    }
  }

  try {
    const response = (await invokeNative('school_inbox_fetch', {
      loginMode: 'chaoxing'
    })) as {
      items?: unknown[]
      source?: unknown
      fetchedAt?: unknown
      complete?: unknown
    } | null
    const items = Array.isArray(response?.items) ? response.items : []
    const state = readChaoxingInboxSnapshot(sid)
    // #1106：与「学校消息」同构 —— 只有可信完整抓取才推进 initialized；
    // 学习通翻页中断（complete=false）不再把部分列表当成完整基线。
    const trusted = isInboxFetchTrusted(response)
    const plan = planInboxSnapshot({ items, state, trusted })

    // ledger 去重：与「学校消息」的 domain 隔离（chaoxing-inbox），互不串扰
    const notYetNotified = []
    for (const item of plan.candidates) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const id = toSafeText(raw?.id)
      const eventKey = id ? buildLedgerEventKey('chaoxing-inbox', id) : ''
      if (eventKey && hasLedgerEntry(sid, eventKey)) continue
      notYetNotified.push({ item, eventKey })
    }

    for (const { item, eventKey } of notYetNotified) {
      const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      queue.push({
        title: toSafeText(raw?.title) || t('notify.notice.chaoxingTitle'),
        body: toSafeText(raw?.summary) || t('notify.notice.chaoxingBody'),
        targetView: 'notifications',
        eventKey: eventKey || undefined,
        domain: 'chaoxing-inbox'
      })
    }

    persistInboxSnapshot(chaoxingInboxStateKeyFor, sid, plan.nextState)
    await snapshotChaoxingNoticeCookie('chaoxing')

    pushDebugLog(
      'Notify',
      `chaoxing inbox check done total=${items.length} trigger=${notYetNotified.length} first=${plan.baseline ? '1' : '0'} trusted=${trusted ? '1' : '0'} union=${plan.nextState.ids.length} downgraded=${plan.downgraded ? '1' : '0'}`,
      'info'
    )

    return {
      success: true,
      enabled: true,
      total: items.length,
      triggered: notYetNotified.length,
      source: toSafeText(response?.source) || 'chaoxing',
      checkedAt: toSafeText(response?.fetchedAt),
      baseline: plan.baseline
    }
  } catch (error) {
    const message = toSafeText((error as Error | undefined)?.message || error)
    pushDebugLog('Notify', `chaoxing inbox check failed: ${message}`, 'warn')
    return {
      success: false,
      enabled: true,
      total: 0,
      triggered: 0,
      error: message || t('notify.error.chaoxingCheck')
    }
  }
}

export {
  isSchoolInboxItemRead,
  syncWidgetData,
  refreshScheduleSilently,
  checkGrades,
  checkExams,
  checkElectricityTeacherSafe as checkElectricity,
  checkClassReminder,
  checkSchoolInbox,
  sendQueuedNotifications
}
