import { detectRuntime } from './runtime'
import { pushDebugLog } from '../utils/debug_logger'
import { isTestAccountSession } from '../utils/test_account.js'
import { resolveTestAccountNativeResponse } from '../utils/test_account_fixtures.js'

type InvokeArgs = Record<string, unknown> | undefined

/**
 * 判断当前是否运行在 Tauri 容器中。
 */
export const isTauriRuntime = () => detectRuntime() === 'tauri'

/**
 * 判断当前是否运行在 Capacitor 原生容器中。
 */
export const isCapacitorRuntime = () => detectRuntime() === 'capacitor'

export const isLikelyIOSUserAgent = () =>
  /(iphone|ipad|ipod)/i.test(String(globalThis?.navigator?.userAgent || ''))

export const isLikelyAndroidUserAgent = () =>
  /android/i.test(String(globalThis?.navigator?.userAgent || ''))

export const isTauriDesktopRuntime = () =>
  isTauriRuntime() && !isLikelyIOSUserAgent() && !isLikelyAndroidUserAgent()

export const isTauriMobileRuntime = () =>
  isTauriRuntime() && (isLikelyIOSUserAgent() || isLikelyAndroidUserAgent())

/** 调试管道命令：禁止再打 pushDebugLog，否则会与 runtime_log 形成死循环白屏 */
const SILENT_NATIVE_COMMANDS = new Set([
  'push_runtime_log',
  'get_runtime_logs',
  'clear_runtime_logs',
  'get_runtime_diag'
])

/**
 * 统一的原生命令调用入口（当前仅 Tauri 支持 invoke）。
 */
export const invokeNative = async <T = unknown>(
  command: string,
  args?: InvokeArgs
): Promise<T> => {
  const silent = SILENT_NATIVE_COMMANDS.has(command)
  if (isTestAccountSession()) {
    const testAccountResponse = resolveTestAccountNativeResponse(command, args)
    if (testAccountResponse !== null && testAccountResponse !== undefined) {
      if (!silent) {
        pushDebugLog('Native', `测试账号 invoke 命中演示数据：${command}`, 'debug', args)
      }
      return testAccountResponse as T
    }
    return {
      success: false,
      demo_disabled: true,
      error: '未知测试账号 invoke 已拦截'
    } as T
  }
  if (!isTauriRuntime()) {
    if (!silent) {
      pushDebugLog('Native', `invoke 调用被拒绝：${command}`, 'warn')
    }
    throw new Error(`当前运行时不支持 invoke: ${command}`)
  }
  const startedAt = Date.now()
  if (!silent) {
    pushDebugLog('Native', `invoke 开始：${command}`, 'debug', args)
  }
  const core = await import('@tauri-apps/api/core')
  try {
    const result = await core.invoke<T>(command, args)
    if (!silent) {
      pushDebugLog('Native', `invoke 成功：${command} (${Date.now() - startedAt}ms)`, 'info')
    }
    return result
  } catch (error) {
    if (!silent) {
      pushDebugLog('Native', `invoke 失败：${command} (${Date.now() - startedAt}ms)`, 'error', error)
    }
    throw error
  }
}

/**
 * 获取当前 Tauri 窗口对象。非 Tauri 运行时返回 null。
 */
export const getCurrentNativeWindow = async () => {
  if (!isTauriRuntime()) return null
  const windowApi = await import('@tauri-apps/api/window')
  return windowApi.getCurrentWindow()
}

/**
 * 统一退出应用行为：
 * - Tauri：走 Rust `exit_app`
 * - Capacitor：调用 App.exitApp（iOS 可能被系统忽略）
 * - Web：尝试关闭浏览器窗口
 */
export const exitNativeApp = async () => {
  if (isTauriRuntime()) {
    await invokeNative('exit_app')
    return
  }

  if (isCapacitorRuntime()) {
    try {
      const app = await import('@capacitor/app')
      await app.App.exitApp()
      return
    } catch {
      // Capacitor 不可用时继续走浏览器兜底
    }
  }

  window.close()
}

/**
 * 获取应用版本号：
 * - Tauri：@tauri-apps/api/app.getVersion
 * - Capacitor：App.getInfo().version
 * - Web：返回空字符串（由上层使用默认值）
 */
export const getNativeAppVersion = async (): Promise<string> => {
  if (isTauriRuntime()) {
    const app = await import('@tauri-apps/api/app')
    return (await app.getVersion()) || ''
  }

  if (isCapacitorRuntime()) {
    try {
      const app = await import('@capacitor/app')
      const info = await app.App.getInfo()
      return info?.version || ''
    } catch {
      return ''
    }
  }

  return ''
}

/**
 * 将 Tauri 本地绝对路径转换为可用于 <img>/<video> 的资源地址。
 * 非 Tauri 运行时直接返回原路径。
 */
export const toNativeFileSrc = async (filePath: string): Promise<string> => {
  if (isTauriRuntime()) {
    const core = await import('@tauri-apps/api/core')
    return core.convertFileSrc(filePath)
  }
  if (isCapacitorRuntime()) {
    const core = await import('@capacitor/core')
    return core.Capacitor.convertFileSrc(filePath)
  }
  return filePath
}

/**
 * 读取本地二进制文件内容（仅 Tauri 可用）。
 */
export const readNativeBinaryFile = async (filePath: string): Promise<Uint8Array> => {
  if (!isTauriRuntime()) {
    throw new Error('当前运行时不支持读取本地文件')
  }
  const fsPlugin = await import('@tauri-apps/plugin-fs')
  return fsPlugin.readFile(filePath)
}

// ── Identity 设备命令封装（#622 Rust identity_ 命令；#623 消费） ─────────────
// 安全约定：任何 identity_ 命令都不接受/返回私钥材料；签名在 Rust 侧完成。

/** 查询本机设备身份状态（keyring 可用性 + 是否已有密钥） */
export const identityDeviceStatus = <T = Record<string, unknown>>() =>
  invokeNative<T>('identity_device_status')

/** 获取本机设备公钥（首次调用自动创建密钥；无私钥材料） */
export const identityGetPublicKey = <T = Record<string, unknown>>() =>
  invokeNative<T>('identity_get_public_key')

/** 设备注册（enrollment）：Rust 用新私钥签名 assertion 并提交 Core */
export const identityEnrollDevice = <T = Record<string, unknown>>(args: {
  base_url: string
  challenge: string
  device_name: string
}) => invokeNative<T>('identity_enroll_device', args)

/** 对 AuthRequest 授权上下文签名（approve；私钥不进 JS） */
export const identitySignAuthRequest = <T = Record<string, unknown>>(args: {
  request_id: string
  challenge: string
  client_id: string
  scopes: string[]
  device_id: string
}) => invokeNative<T>('identity_sign_auth_request', args)

/** 撤销当前设备（提供 base_url 时先调 Core revoke 成功后再删本地 key） */
export const identityRevokeCurrentDeviceLocal = <T = Record<string, unknown>>(args: {
  base_url?: string | null
  device_id?: string | null
}) => invokeNative<T>('identity_revoke_current_device_local', args)

/** 设备展示名（enrollment device_name 用；不包含任何敏感信息） */
export const getIdentityDeviceDisplayName = (): string => {
  const ua = String(globalThis?.navigator?.userAgent || '')
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS 设备'
  if (/android/i.test(ua)) return 'Android 设备'
  if (/windows/i.test(ua)) return 'Windows PC'
  if (/mac/i.test(ua)) return 'Mac'
  if (/linux/i.test(ua)) return 'Linux'
  return 'Mini-HBUT 设备'
}
