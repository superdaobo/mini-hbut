/**
 * 课表领域 - #750 开学日期驱动学期切换组合式函数。
 *
 * 产品语义（issue #750）：
 * 1. 时间驱动：「应显示学期」= 学期列表中 start_date <= 今天 + 3 天 的最近一个（开学前 3 天自动切换）；
 * 2. 切后不回跳：切到新学期后以 term-start reason 锁定，任何启动/探测/回前台路径不得改回更旧学期；
 * 3. 提前窗口内新学期课表未发布：保持旧学期 + 顶部横幅提示，每次启动与 visibilitychange
 *    回前台时重探（60s 节流），发布后自动再切；
 * 4. 手动查看其他学期 = 会话内临时行为（manual-select lock），会话内自动路径不与其冲突，
 *    重启后回到时间驱动应选学期；
 * 5. start_date 缺失/映射为空 → 回退现有推算链（deriveSemesterByDate），行为不劣化。
 *
 * lock 生命周期行为矩阵（ semester 显示 × 各时机 ）：
 * ┌────────────────┬─────────────────────────────┬──────────────────────────────┬───────────────┬────────────────────────────┐
 * │ lock 状态       │ 启动 onMounted               │ 探测 warmup（无锁初始探测）     │ 手动切换学期    │ 回前台 visibilitychange     │
 * ├────────────────┼─────────────────────────────┼──────────────────────────────┼───────────────┼────────────────────────────┤
 * │ 无锁            │ 时间驱动判定；pending-switch  │ #745 就近探测；picked==target  │ 写 manual-     │ 时间驱动 target 更新→探测，  │
 * │                │ 门槛消费；探测 picked==target │ 有课→term-start 锁；picked 早  │ select 锁      │ published→切+term-start 锁；│
 * │                │ →term-start 锁               │ 于 target→不写锁（等发布）      │ (会话内临时)   │ 未发布→横幅                  │
 * ├────────────────┼─────────────────────────────┼──────────────────────────────┼───────────────┼────────────────────────────┤
 * │ auto 锁         │ lock==target→保留；lock 早于  │ forceProbe 时探测结果不晚于    │ 覆写为 manual- │ manual 之外：target 更新→    │
 * │ (term-start/   │ target→清理重探；lock 晚于    │ 现有锁→不覆盖(回跳保护①)；     │ select 锁      │ 探测切换；否则保留           │
 * │ pending-switch │ target(本地数据滞后)→保留     │ picked 早于 target→不写锁②     │               │                            │
 * │ 等自动 reason) │                             │                              │               │                            │
 * ├────────────────┼─────────────────────────────┼──────────────────────────────┼───────────────┼────────────────────────────┤
 * │ manual-select  │ 启动即清（会话内临时，重启    │ warmup 非 forceProbe 尊重锁； │ 写 manual-     │ 会话内 manual 优先：整体     │
 * │                │ 以时间驱动为准）              │ forceProbe 走保护①            │ select 锁      │ 跳过自动切换                 │
 * └────────────────┴─────────────────────────────┴──────────────────────────────┴───────────────┴────────────────────────────┘
 */
import { ref } from 'vue'
import {
  isAutoScheduleLockReason,
  probeSemesterSchedule,
  readScheduleLockDetail,
  readSemesterStartDates,
  writeScheduleLock
} from '../../../utils/schedule_prefetch.js'
import { semesterIsNewer } from '../../../utils/semester.js'
import { pushDebugLog } from '../../../utils/debug_logger'
import {
  SEMESTER_SWITCH_LEAD_DAYS,
  deriveSemesterByDate,
  getNextSemesterString,
  isSemesterStartWithinLeadWindow,
  readStoredSemesterMeta,
  resolveSemesterByStartDate
} from '../utils/semester'
import type { SemesterStartDateEntry } from '../utils/semester'
import type { ScheduleData } from './useScheduleData'
import type { ScheduleSemester } from './useScheduleSemester'

/** 回前台重探节流：60s 内只探一次，避免频繁切换前台时狂发请求 */
const FOREGROUND_PROBE_COOLDOWN_MS = 60_000

export interface ScheduleTermStartOptions {
  props: any
  data: ScheduleData
  semester: ScheduleSemester
}

export const useScheduleTermStart = (options: ScheduleTermStartOptions) => {
  const { props, data, semester } = options

  /** 提前窗口内新学期未发布的顶部提示文案（空 = 不展示） */
  const termStartNotice = ref('')

  let ensureInflight: Promise<void> | null = null
  let lastForegroundProbeAt = 0

  /**
   * 计算时间驱动应选学期（纯本地）：
   * 输入 = 本地「学期 → 开学日」映射 + hbu_schedule_meta 兜底；映射为空/无合格学期时
   * 回退 deriveSemesterByDate()（仅用于 lock 清理比较，不用于自动切换，保证不劣化）。
   */
  const resolveTimeDrivenSemester = () => {
    const map = readSemesterStartDates()
    const entries: SemesterStartDateEntry[] = Object.entries(map).map(([semesterKey, startDate]) => ({
      semester: semesterKey,
      start_date: startDate
    }))
    // meta 兜底：旧版本升级后映射可能缺失当前学期 start_date
    const storedMeta = readStoredSemesterMeta()
    const storedSemester = String(storedMeta?.semester || '').trim()
    const storedStartDate = String(storedMeta?.start_date || '').trim()
    if (storedSemester && storedStartDate && !map[storedSemester]) {
      entries.push({ semester: storedSemester, start_date: storedStartDate })
    }

    const byStartDate = resolveSemesterByStartDate(entries, new Date(), SEMESTER_SWITCH_LEAD_DAYS)
    const fallbackTarget = byStartDate ? '' : deriveSemesterByDate()
    pushDebugLog(
      'Schedule',
      `#750 时间驱动应选学期判定 entries=${entries.length} target=${byStartDate || 'null'} fallback=${fallbackTarget || '无'}`,
      'debug'
    )
    return {
      target: byStartDate || fallbackTarget,
      /** true = 由开学日期数据驱动；false = 回退月份推算 */
      fromStartDate: !!byStartDate,
      entryCount: entries.length
    }
  }

  /** 最近更新学期候选：学期列表（降序）中第一个比当前学期新的；列表缺失时按学期键推算 */
  const pickUpcomingSemesterCandidate = (currentSemester: string): string => {
    const list = Array.isArray(data.semesterOptions.value) ? data.semesterOptions.value : []
    for (const item of list) {
      const sem = String(item || '').trim()
      if (sem && sem !== currentSemester && semesterIsNewer(sem, currentSemester)) {
        return sem
      }
    }
    return getNextSemesterString(currentSemester)
  }

  const setTermStartNotice = (targetSemester: string, startDate: string) => {
    const current = String(semester.semester.value || '').trim()
    if (!current || targetSemester === current) return
    const dateText = String(startDate || '').trim()
    const next = dateText
      ? `新学期（${targetSemester}）将于 ${dateText} 开学，课表发布后自动切换显示`
      : `新学期（${targetSemester}）即将开始，课表发布后自动切换显示`
    if (termStartNotice.value === next) return
    termStartNotice.value = next
    pushDebugLog(
      'Schedule',
      `#750 提前窗口内新学期课表未发布，保持学期 ${current}，等待 semester=${targetSemester} start_date=${dateText || '未知'}`,
      'info'
    )
  }

  /** 时间驱动切换落地：写 term-start 锁（启动不误清）+ 应用课表渲染 */
  const switchToTimeDrivenSemester = async (targetSemester: string, probe: any, reason: string) => {
    const sid = String(props.studentId || '').trim()
    if (!sid || !targetSemester) return
    const previous = String(semester.semester.value || '').trim()
    if (previous === targetSemester) return
    writeScheduleLock(sid, targetSemester, 'term-start')
    termStartNotice.value = ''
    pushDebugLog(
      'Schedule',
      `#750 时间驱动切换学期 ${previous || '无'}→${targetSemester}（reason=${reason}，探测课数=${Number(probe?.count ?? 0)}）`,
      'info'
    )
    semester.semester.value = targetSemester
    semester.semesterDraft.value = targetSemester
    const appliedFromProbe = probe?.payload ? data.applySchedulePayload(probe.payload, targetSemester) : false
    if (!appliedFromProbe) {
      const cached = data.applyCachedScheduleImmediately(targetSemester)
      if (!cached) {
        await data.fetchSchedule(targetSemester)
        return
      }
    }
    await data.loadCustomCourses(targetSemester)
  }

  /**
   * 发现型探测：本地尚无合格 target（映射缺新学期开学日）时，轻量探测「最近更新学期」
   * 以发现其 start_date / 课表发布状态。仅当其开学日未知，或已知且已进提前窗口时才发起。
   */
  const discoverUpcomingSemester = async (sid: string, currentSemester: string, reason: string) => {
    const upcoming = pickUpcomingSemesterCandidate(currentSemester)
    if (!upcoming || upcoming === currentSemester) return
    const knownStart = String(readSemesterStartDates()[upcoming] || '').trim()
    if (knownStart && !isSemesterStartWithinLeadWindow(knownStart)) return // 已知开学日且窗口外：无需探测

    const probe = await probeSemesterSchedule(sid, upcoming) as {
      ok?: boolean
      published?: boolean
      count?: number
      startDate?: string
      needLogin?: boolean
      payload?: any
    }
    if (probe?.needLogin) return
    const startDate = String(probe?.startDate || knownStart || '').trim()
    if (probe?.published) {
      // 已发布：仅当进入提前窗口才切换（窗口外静默，等窗口到点由时间驱动接管）
      if (startDate && isSemesterStartWithinLeadWindow(startDate)) {
        await switchToTimeDrivenSemester(upcoming, probe, `${reason}/discovery`)
      }
      return
    }
    // 未发布：进入提前窗口 → 横幅提示；窗口外静默
    if (startDate && isSemesterStartWithinLeadWindow(startDate)) {
      setTermStartNotice(upcoming, startDate)
    }
  }

  /**
   * 时间驱动学期决策主入口（启动 / 回前台共用）。
   * 只会「向前切」（target 必须比当前显示学期更新），绝不自动回退到更旧学期。
   */
  const ensureTimeDrivenSemester = async (reason: string): Promise<void> => {
    const sid = String(props.studentId || '').trim()
    if (!sid) return
    if (ensureInflight) return ensureInflight

    // 会话内 manual 优先：手动选择锁定期间不做任何自动切换（重启后 manual lock 被清除，恢复时间驱动）
    const lockDetail = readScheduleLockDetail(sid) as { semester?: string; reason?: string } | null
    if (lockDetail && !isAutoScheduleLockReason(lockDetail.reason)) {
      pushDebugLog(
        'Schedule',
        `#750 会话内手动锁定(${lockDetail.semester})优先，跳过时间驱动自动切换 reason=${reason}`,
        'debug'
      )
      return
    }

    const run = (async () => {
      const decision = resolveTimeDrivenSemester()
      const current = String(semester.semester.value || semester.semesterDraft.value || '').trim()

      if (decision.fromStartDate && decision.target) {
        if (decision.target === current) {
          termStartNotice.value = ''
        } else if (!semesterIsNewer(decision.target, current)) {
          // target 早于当前显示：不回跳（时间驱动只向前切）
          pushDebugLog(
            'Schedule',
            `#750 时间驱动 target(${decision.target}) 早于当前显示(${current || '无'})，跳过切换`,
            'debug'
          )
          return
        } else {
          // 进入提前窗口：探测新学期课表是否已发布
          const probe = await probeSemesterSchedule(sid, decision.target) as {
            published?: boolean
            count?: number
            startDate?: string
            needLogin?: boolean
            payload?: any
          }
          if (probe?.needLogin) return
          if (probe?.published) {
            await switchToTimeDrivenSemester(decision.target, probe, reason)
            return
          }
          // 窗口内但课表未发布：保持旧学期 + 横幅（启动/回前台会重探，发布后自动再切）
          setTermStartNotice(decision.target, String(probe?.startDate || '').trim())
          return
        }
      }

      // 发现型探测（两种情况走到这里）：
      // a) 无开学日期驱动的 target（映射为空/无合格学期）——补充数据；
      // b) target==当前显示学期——本地可能尚不知「更更新学期」的开学日，
      //    不探测会死锁（提前窗口内永远发现不了新学期 start_date）。
      // discoverUpcomingSemester 自带节流：已知开学日且窗口外 → 零请求。
      await discoverUpcomingSemester(sid, current, reason)
    })().finally(() => {
      ensureInflight = null
    })

    ensureInflight = run
    return run
  }

  /** visibilitychange 回前台：节流后轻量重探（60s cooldown） */
  const handleForegroundVisibility = () => {
    if (document.hidden) return
    const now = Date.now()
    if (now - lastForegroundProbeAt < FOREGROUND_PROBE_COOLDOWN_MS) return
    lastForegroundProbeAt = now
    void ensureTimeDrivenSemester('visibility-foreground')
  }

  /** 手动切换到横幅所指的新学期时即时清除横幅 */
  const clearNoticeIfMatches = (targetSemester: string) => {
    const sem = String(targetSemester || '').trim()
    if (sem && termStartNotice.value && termStartNotice.value.includes(sem)) {
      termStartNotice.value = ''
    }
  }

  return {
    termStartNotice,
    resolveTimeDrivenSemester,
    ensureTimeDrivenSemester,
    handleForegroundVisibility,
    clearNoticeIfMatches
  }
}

export type ScheduleTermStart = ReturnType<typeof useScheduleTermStart>
