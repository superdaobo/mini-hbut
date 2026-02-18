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
  if (!isTauriRuntime()) return filePath
  const core = await import('@tauri-apps/api/core')
  return core.convertFileSrc(filePath)
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
