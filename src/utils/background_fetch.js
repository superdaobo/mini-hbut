import { getRuntime } from '../platform'
import { pushDebugLog } from './debug_logger'

const PREF_KEYS = {
  studentId: 'hbu_bg_student_id',
  apiBase: 'hbu_bg_api_base',
  enableBackground: 'hbu_bg_enabled',
  enableGrade: 'hbu_bg_enable_grade',
  enableExam: 'hbu_bg_enable_exam',
  enablePower: 'hbu_bg_enable_power',
  enableClass: 'hbu_bg_enable_class',
  classLeadMinutes: 'hbu_bg_class_lead_min',
  interval: 'hbu_bg_interval_min',
  dormSelection: 'hbu_bg_dorm_selection'
}

const DEFAULT_API_BASE = 'https://hbut.6661111.xyz/api'
const LOCAL_API_BASE_KEY = 'hbu_bg_api_base'

let backgroundFetchStarted = false
let backgroundFetchSetupPromise = null
let backgroundFetchEventHandler = null
let backgroundFetchStatusCode = -1
let backgroundFetchLastRunAt = ''
let backgroundFetchLastTaskId = ''
let backgroundFetchLastError = ''

const normalizeApiBase = (value) => String(value || '').replace(/\/+$/, '')

const resolveApiBaseForNative = () => {
  const raw = normalizeApiBase(import.meta.env.VITE_API_BASE || '/api')
  if (/^https?:\/\//i.test(raw)) return raw

  try {
    const origin = window.location.origin || ''
    if (!origin || /localhost|127\.0\.0\.1/i.test(origin)) {
      return DEFAULT_API_BASE
    }
    return normalizeApiBase(new URL(raw, origin).toString())
  } catch {
    return DEFAULT_API_BASE
  }
}

const getPreferences = async () => {
  if (getRuntime() !== 'capacitor') return null
  try {
    const mod = await import('@capacitor/preferences')
    return mod.Preferences
  } catch {
    return null
  }
}

const toSafeText = (value) => String(value ?? '').trim()

export const syncBackgroundFetchContext = async ({
  studentId,
  settings,
  dormSelection
} = {}) => {
  if (getRuntime() !== 'capacitor') return
  const Preferences = await getPreferences()
  if (!Preferences) return

  const sid = toSafeText(studentId || localStorage.getItem('hbu_username') || '')
  const room = Array.isArray(dormSelection) ? dormSelection : []
  const config = settings || {}
  const apiBase = resolveApiBaseForNative()

  await Preferences.set({ key: PREF_KEYS.studentId, value: sid })
  await Preferences.set({ key: PREF_KEYS.apiBase, value: apiBase })
  await Preferences.set({ key: PREF_KEYS.enableBackground, value: config.enableBackground ? '1' : '0' })
  await Preferences.set({ key: PREF_KEYS.enableGrade, value: config.enableGradeNotice ? '1' : '0' })
  await Preferences.set({ key: PREF_KEYS.enableExam, value: config.enableExamReminder ? '1' : '0' })
  await Preferences.set({ key: PREF_KEYS.enablePower, value: config.enablePowerNotice ? '1' : '0' })
  await Preferences.set({ key: PREF_KEYS.enableClass, value: config.enableClassReminder ? '1' : '0' })
  await Preferences.set({
    key: PREF_KEYS.classLeadMinutes,
    value: String(Math.max(5, Number(config.classLeadMinutes || 30)))
  })
  await Preferences.set({
    key: PREF_KEYS.interval,
    value: String(Number(config.intervalMinutes || 30))
  })
  await Preferences.set({
    key: PREF_KEYS.dormSelection,
    value: JSON.stringify(room)
  })
  localStorage.setItem(LOCAL_API_BASE_KEY, apiBase)
}

export const clearBackgroundFetchContext = async () => {
  if (getRuntime() !== 'capacitor') return
  const Preferences = await getPreferences()
  if (!Preferences) return
  await Promise.all([
    Preferences.remove({ key: PREF_KEYS.studentId }),
    Preferences.remove({ key: PREF_KEYS.enableBackground }),
    Preferences.remove({ key: PREF_KEYS.enableGrade }),
    Preferences.remove({ key: PREF_KEYS.enableExam }),
    Preferences.remove({ key: PREF_KEYS.enablePower }),
    Preferences.remove({ key: PREF_KEYS.enableClass }),
    Preferences.remove({ key: PREF_KEYS.classLeadMinutes }),
    Preferences.remove({ key: PREF_KEYS.interval }),
    Preferences.remove({ key: PREF_KEYS.dormSelection })
  ])
  localStorage.removeItem(LOCAL_API_BASE_KEY)
}

const readStudentIdFromNative = async () => {
  const Preferences = await getPreferences()
  if (!Preferences) return ''
  try {
    const result = await Preferences.get({ key: PREF_KEYS.studentId })
    return toSafeText(result?.value)
  } catch {
    return ''
  }
}

const invokeFetchEventHandler = async (taskId) => {
  if (typeof backgroundFetchEventHandler !== 'function') return
  backgroundFetchLastTaskId = String(taskId || '')
  backgroundFetchLastRunAt = new Date().toISOString()
  const sid =
    (await readStudentIdFromNative()) || toSafeText(localStorage.getItem('hbu_username') || '')
  if (!sid) return

  pushDebugLog('BackgroundFetch', `触发后台任务: ${taskId || 'unknown'}`, 'info', {
    studentId: sid
  })
  await backgroundFetchEventHandler({
    taskId,
    studentId: sid,
    reason: 'background-fetch'
  })
}

export const initBackgroundFetchScheduler = async (onEvent) => {
  if (getRuntime() !== 'capacitor') return false
  if (backgroundFetchStarted) {
    if (typeof onEvent === 'function') {
      backgroundFetchEventHandler = onEvent
    }
    return true
  }
  if (backgroundFetchSetupPromise) return backgroundFetchSetupPromise

  backgroundFetchSetupPromise = (async () => {
    if (typeof onEvent === 'function') {
      backgroundFetchEventHandler = onEvent
    }

    const mod = await import('@transistorsoft/capacitor-background-fetch')
    const { BackgroundFetch } = mod

    const status = await BackgroundFetch.configure(
      {
        minimumFetchInterval: 15,
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY
      },
      async (taskId) => {
        try {
          await invokeFetchEventHandler(taskId)
        } finally {
          await BackgroundFetch.finish(taskId)
        }
      },
      async (taskId) => {
        backgroundFetchLastTaskId = String(taskId || '')
        backgroundFetchLastRunAt = new Date().toISOString()
        backgroundFetchLastError = '后台任务超时'
        pushDebugLog('BackgroundFetch', `后台任务超时: ${taskId || 'unknown'}`, 'warn')
        await BackgroundFetch.finish(taskId)
      }
    )
    backgroundFetchStatusCode = Number(status)
    backgroundFetchLastError = ''
    pushDebugLog('BackgroundFetch', `后台调度初始化完成 status=${status}`, 'info')

    // 在 Android 上追加一个周期任务，提升被系统回收后的触发机会。
    try {
      await BackgroundFetch.scheduleTask({
        taskId: 'com.hbut.mini.notify.periodic',
        delay: 15 * 60 * 1000,
        periodic: true,
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        forceAlarmManager: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY
      })
      pushDebugLog('BackgroundFetch', '周期任务注册成功：com.hbut.mini.notify.periodic', 'debug')
    } catch (error) {
      backgroundFetchLastError = String(error || 'scheduleTask failed')
      pushDebugLog('BackgroundFetch', '周期任务注册失败', 'warn', error)
      console.warn('[BackgroundFetch] scheduleTask failed:', error)
    }

    backgroundFetchStarted = true
    return status === BackgroundFetch.STATUS_AVAILABLE
  })().catch((error) => {
    backgroundFetchLastError = String(error || 'background fetch init failed')
    pushDebugLog('BackgroundFetch', '后台调度初始化失败', 'error', error)
    throw error
  })()

  try {
    return await backgroundFetchSetupPromise
  } finally {
    backgroundFetchSetupPromise = null
  }
}

export const getBackgroundFetchRuntimeState = async () => {
  const runtime = getRuntime()
  if (runtime === 'tauri') {
    return {
      runtime,
      supported: true,
      configured: true,
      available: true,
      statusCode: 0,
      mode: 'foreground-interval',
      lastRunAt: backgroundFetchLastRunAt,
      lastTaskId: backgroundFetchLastTaskId,
      lastError: backgroundFetchLastError,
      reason: '桌面端使用前台轮询，不依赖移动端后台调度插件'
    }
  }

  if (runtime !== 'capacitor') {
    return {
      runtime,
      supported: false,
      configured: false,
      statusCode: -1,
      available: false,
      mode: 'unsupported',
      lastRunAt: backgroundFetchLastRunAt,
      lastTaskId: backgroundFetchLastTaskId,
      lastError: backgroundFetchLastError,
      reason: '当前环境不支持 BackgroundFetch'
    }
  }

  let statusCode = Number(backgroundFetchStatusCode)
  try {
    const mod = await import('@transistorsoft/capacitor-background-fetch')
    const { BackgroundFetch } = mod
    const status = await BackgroundFetch.status()
    statusCode = Number(status)
    backgroundFetchStatusCode = statusCode
    const available = statusCode === Number(BackgroundFetch.STATUS_AVAILABLE)
    return {
      runtime,
      supported: true,
      configured: backgroundFetchStarted,
      statusCode,
      available,
      lastRunAt: backgroundFetchLastRunAt,
      lastTaskId: backgroundFetchLastTaskId,
      lastError: backgroundFetchLastError
    }
  } catch (error) {
    backgroundFetchLastError = String(error || '读取后台调度状态失败')
  }
  return {
    runtime,
    supported: true,
    configured: backgroundFetchStarted,
    statusCode,
    available: false,
    lastRunAt: backgroundFetchLastRunAt,
    lastTaskId: backgroundFetchLastTaskId,
    lastError: backgroundFetchLastError
  }
}
