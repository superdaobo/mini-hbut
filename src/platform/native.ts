import { detectRuntime } from './runtime'

type InvokeArgs = Record<string, unknown> | undefined

/**
 * 判断当前是否运行在 Tauri 容器中。
 */
export const isTauriRuntime = () => detectRuntime() === 'tauri'

/**
 * 判断当前是否运行在 Capacitor 原生容器中。
 */
export const isCapacitorRuntime = () => detectRuntime() === 'capacitor'

/**
 * 统一的原生命令调用入口（当前仅 Tauri 支持 invoke）。
 */
export const invokeNative = async <T = unknown>(
  command: string,
  args?: InvokeArgs
): Promise<T> => {
  if (!isTauriRuntime()) {
    throw new Error(`当前运行时不支持 invoke: ${command}`)
  }
  const core = await import('@tauri-apps/api/core')
  return core.invoke<T>(command, args)
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
