/**
 * 校园网认证服务：探测、登录与 best-effort 自动认证防抖。
 */

import { invokeNative, isTauriRuntime } from '../platform/native'
import {
  buildCampusAccountKey,
  loadRememberedCredential,
  saveRememberedCredential
} from './credential_storage'
import {
  type CampusCarrier,
  type CampusNetworkStatus,
  readCampusNetworkSettings,
  writeCampusNetworkSettings
} from './campus_network_settings'
import { getFeaturePolicy, isAppStoreBuild } from '../config/app_store_policy'

const FAIL_DEBOUNCE_MS = 10 * 60 * 1000
const SUCCESS_SKIP_MS = 30 * 60 * 1000

let autoLoginInFlight = false
let lastAutoAttemptAt = 0
let lastAutoSuccessAt = 0
let lastAutoFailAt = 0

export interface CampusProbeResult {
  status: CampusNetworkStatus
  gateway?: string | null
  query_string?: string | null
  client_ip?: string | null
  message?: string | null
}

export interface CampusLoginResult {
  success: boolean
  message: string
  adapter_used?: string | null
}

const mapProbeStatus = (status: string): CampusNetworkStatus => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'authenticated') return 'authenticated'
  if (normalized === 'needs_auth') return 'needs_auth'
  if (normalized === 'checking') return 'checking'
  if (normalized === 'error') return 'error'
  return 'unknown'
}

export const probeCampusNetwork = async (gatewayOverride = ''): Promise<CampusProbeResult | null> => {
  if (!isTauriRuntime()) {
    return {
      status: 'unknown',
      message: '当前运行环境不支持校园网探测'
    }
  }
  try {
    const result = await invokeNative<CampusProbeResult>('campus_network_probe', {
      gatewayOverride: gatewayOverride || null
    })
    const status = mapProbeStatus(result?.status as string)
    writeCampusNetworkSettings({
      last_status: status,
      last_message: String(result?.message || ''),
      last_probe_at: Date.now()
    })
    return { ...result, status }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeCampusNetworkSettings({
      last_status: 'error',
      last_message: message,
      last_probe_at: Date.now()
    })
    return { status: 'error', message }
  }
}

export const loginCampusNetwork = async (options: {
  studentId: string
  password: string
  carrier: CampusCarrier
  gatewayOverride?: string
  queryString?: string
  rememberPassword?: boolean
}): Promise<CampusLoginResult> => {
  if (!isTauriRuntime()) {
    return { success: false, message: '当前运行环境不支持校园网认证' }
  }

  const studentId = String(options.studentId || '').trim()
  const password = String(options.password || '')
  if (!studentId || !password) {
    return { success: false, message: '请填写学号和密码' }
  }

  try {
    const result = await invokeNative<CampusLoginResult>('campus_network_login', {
      studentId,
      password,
      carrier: options.carrier,
      gatewayOverride: options.gatewayOverride || null,
      queryString: options.queryString || null
    })

    writeCampusNetworkSettings({
      last_login_at: Date.now(),
      last_login_success: Boolean(result?.success),
      last_status: result?.success ? 'authenticated' : 'error',
      last_message: String(result?.message || '')
    })

    if (options.rememberPassword !== false) {
      const settings = readCampusNetworkSettings()
      if (settings.remember_password) {
        await saveRememberedCredential(buildCampusAccountKey(studentId), password)
      }
    }

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeCampusNetworkSettings({
      last_login_at: Date.now(),
      last_login_success: false,
      last_status: 'error',
      last_message: message
    })
    return { success: false, message }
  }
}

const shouldSkipAutoLogin = (): boolean => {
  const now = Date.now()
  if (autoLoginInFlight) return true
  if (now - lastAutoAttemptAt < 15_000) return true
  if (lastAutoSuccessAt && now - lastAutoSuccessAt < SUCCESS_SKIP_MS) return true
  if (lastAutoFailAt && now - lastAutoFailAt < FAIL_DEBOUNCE_MS) return true
  return false
}

/**
 * best-effort 自动认证：前台恢复 / BackgroundFetch 调用。
 */
export const runCampusNetworkAutoLogin = async (options: {
  studentId?: string
  reason?: string
} = {}): Promise<CampusLoginResult | null> => {
  // App Store / TestFlight 合规构建：校园网自动认证对所有用户关闭（与 UI 隐藏一致）
  if (isAppStoreBuild() || !getFeaturePolicy().campusNetwork) {
    return null
  }
  const settings = readCampusNetworkSettings()
  if (!settings.auto_login) return null
  if (!isTauriRuntime()) return null
  if (shouldSkipAutoLogin()) return null

  const studentId =
    String(options.studentId || localStorage.getItem('hbu_username') || '').trim()
  if (!studentId) return null

  const password = await loadRememberedCredential(buildCampusAccountKey(studentId))
  if (!password) return null

  autoLoginInFlight = true
  lastAutoAttemptAt = Date.now()
  try {
    const probe = await probeCampusNetwork(settings.gateway_override)
    if (!probe || probe.status === 'authenticated') {
      if (probe?.status === 'authenticated') {
        lastAutoSuccessAt = Date.now()
      }
      return null
    }
    if (probe.status !== 'needs_auth' && probe.status !== 'unknown') {
      return null
    }

    const result = await loginCampusNetwork({
      studentId,
      password,
      carrier: settings.carrier,
      gatewayOverride: settings.gateway_override,
      queryString: probe.query_string || undefined,
      rememberPassword: true
    })

    if (result.success) {
      lastAutoSuccessAt = Date.now()
    } else {
      lastAutoFailAt = Date.now()
    }
    return result
  } finally {
    autoLoginInFlight = false
  }
}

/** 测试用：重置自动登录防抖状态 */
export const resetCampusNetworkAutoLoginStateForTests = () => {
  autoLoginInFlight = false
  lastAutoAttemptAt = 0
  lastAutoSuccessAt = 0
  lastAutoFailAt = 0
}
