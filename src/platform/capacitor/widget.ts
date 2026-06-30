// src/platform/capacitor/widget.ts
// 门面：封装 Widget Bridge 单例 + schema/字节数校验 + 重试
// 支持 Capacitor 和 Tauri Android 两种运行时

import type {
  ElectricityWidgetSnapshot,
  ExamWidgetSnapshot,
  TodayCourseSnapshot,
  MiniHbutWidgetPlugin
} from '@mini-hbut/capacitor-plugin-mini-hbut-widget'
import { registerPlugin } from '@capacitor/core'
import { validateSnapshot } from '@/utils/widget_snapshot_schema'
import { pushDebugLog } from '@/utils/debug_logger'
import { isTauriRuntime, isCapacitorRuntime, invokeNative } from '@/platform/native'

/** 最大 snapshot 字节数：32 KB */
const MAX_SNAPSHOT_BYTES = 32 * 1024

/** 自定义错误，携带 code 字段便于上层判断 */
export class WidgetBridgeError extends Error {
  constructor(
    public readonly code: 'INVALID_SNAPSHOT' | 'SNAPSHOT_TOO_LARGE',
    message: string,
  ) {
    super(message)
    this.name = 'WidgetBridgeError'
  }
}

// ─── Tauri Android Bridge ────────────────────────────────────────────────

/** 检测是否为 Tauri Android 环境 */
function isTauriAndroid(): boolean {
  if (!isTauriRuntime()) return false
  const ua = String(globalThis?.navigator?.userAgent || '').toLowerCase()
  return ua.includes('android')
}

/** Tauri Android 实现：通过 invokeNative 写入 SharedPreferences */
function createTauriAndroidBridge(): MiniHbutWidgetPlugin {
  return {
    async writeSnapshot(options: { snapshot: TodayCourseSnapshot }): Promise<void> {
      const json = JSON.stringify(options.snapshot)
      await invokeNative('write_widget_snapshot', { snapshotJson: json })
    },
    async writeElectricity(options: { data: ElectricityWidgetSnapshot }): Promise<void> {
      await invokeNative('write_electricity_snapshot', { json: JSON.stringify(options.data) })
    },
    async writeExam(options: { data: ExamWidgetSnapshot }): Promise<void> {
      await invokeNative('write_exam_snapshot', { json: JSON.stringify(options.data) })
    },
    async writeThemeColor(options: { color: string }): Promise<void> {
      await invokeNative('write_widget_theme_color', { color: options.color })
    },
    async clearSnapshot(): Promise<void> {
      await invokeNative('clear_widget_snapshot')
    },
    async requestRefresh(): Promise<void> {
      // Tauri 无法直接触发 AppWidgetManager 刷新，依赖系统 30 分钟周期
      // 写入 SharedPreferences 后 widget 下次刷新时会读到新数据
    },
    async getCapabilities(): Promise<{ platform: 'android-appwidget' | 'ios-widgetkit' | 'unavailable'; pinned: boolean }> {
      return { platform: 'android-appwidget', pinned: false }
    },
  }
}

// ─── No-op Proxy（桌面/Web 环境） ───────────────────────────────────────

function createNoOpProxy(): MiniHbutWidgetPlugin {
  return {
    writeSnapshot: () => Promise.resolve(),
    writeElectricity: () => Promise.resolve(),
    writeExam: () => Promise.resolve(),
    writeThemeColor: () => Promise.resolve(),
    clearSnapshot: () => Promise.resolve(),
    requestRefresh: () => Promise.resolve(),
    getCapabilities: () => Promise.resolve({ platform: 'unavailable', pinned: false }),
  }
}

// ─── 单例管理 ────────────────────────────────────────────────────────────

let _bridge: MiniHbutWidgetPlugin | null = null
let _debugLogged = false
let _capacitorWidget: MiniHbutWidgetPlugin | null = null

function getCapacitorWidgetPlugin(): MiniHbutWidgetPlugin {
  if (_capacitorWidget) return _capacitorWidget
  const cap = typeof window === 'undefined' ? undefined : (window as any).Capacitor
  const globalPlugin = cap?.Plugins?.MiniHbutWidget
  if (globalPlugin) {
    _capacitorWidget = globalPlugin as MiniHbutWidgetPlugin
    return _capacitorWidget
  }
  _capacitorWidget = registerPlugin<MiniHbutWidgetPlugin>('MiniHbutWidget')
  return _capacitorWidget
}

/**
 * 获取 Widget Bridge 单例。
 * 优先级：Tauri Android > Capacitor > No-op
 */
export function getWidgetBridge(): MiniHbutWidgetPlugin {
  if (_bridge) return _bridge

  // 1. Tauri Android：通过 invokeNative 写入 SharedPreferences
  if (isTauriAndroid()) {
    if (!_debugLogged) {
      console.debug('[widget] Tauri Android detected, using native SharedPreferences bridge')
      _debugLogged = true
    }
    _bridge = createTauriAndroidBridge()
    return _bridge
  }

  // 2. Capacitor：使用 Capacitor 插件
  if (isCapacitorRuntime()) {
    if (!_debugLogged) {
      console.debug('[widget] Capacitor detected, using MiniHbutWidget plugin')
      _debugLogged = true
    }
    _bridge = getCapacitorWidgetPlugin()
    return _bridge
  }

  // 3. 其他环境（桌面 Tauri / Web dev）：no-op
  if (!_debugLogged) {
    console.debug('[widget] Non-mobile environment, widget bridge is no-op')
    _debugLogged = true
  }
  _bridge = createNoOpProxy()
  return _bridge
}

// ─── 公开 API ────────────────────────────────────────────────────────────

/**
 * 写入快照到原生 Widget 共享存储。
 * 执行 Ajv schema 校验 + UTF-8 字节数校验（≤ 32 KB）后委托写入。
 */
export async function writeSnapshot(snapshot: TodayCourseSnapshot): Promise<void> {
  // 1. Ajv schema 校验
  const valid = validateSnapshot(snapshot)
  if (!valid) {
    const errors = validateSnapshot.errors
      ?.map(e => `${e.instancePath} ${e.message}`)
      .join('; ')
    throw new WidgetBridgeError('INVALID_SNAPSHOT', `Schema validation failed: ${errors}`)
  }

  // 2. 序列化 + 字节数校验
  const json = JSON.stringify(snapshot)
  const byteLength = new TextEncoder().encode(json).length
  if (byteLength > MAX_SNAPSHOT_BYTES) {
    throw new WidgetBridgeError(
      'SNAPSHOT_TOO_LARGE',
      `Snapshot size ${byteLength} bytes exceeds limit of ${MAX_SNAPSHOT_BYTES} bytes`,
    )
  }

  // 3. 委托写入
  await getWidgetBridge().writeSnapshot({ snapshot })
}

/**
 * 清空 Widget 共享存储中的快照数据。
 */
export async function clearSnapshot(): Promise<void> {
  await getWidgetBridge().clearSnapshot()
  await requestRefresh()
}

export async function writeElectricitySnapshot(data: ElectricityWidgetSnapshot): Promise<void> {
  await getWidgetBridge().writeElectricity({ data })
  await requestRefresh()
}

export async function writeExamSnapshot(data: ExamWidgetSnapshot): Promise<void> {
  await getWidgetBridge().writeExam({ data })
  await requestRefresh()
}

export async function writeWidgetThemeColor(color: string): Promise<void> {
  await getWidgetBridge().writeThemeColor({ color })
}

/**
 * 请求原生 Widget 立即刷新渲染。
 */
export async function requestRefresh(): Promise<void> {
  await getWidgetBridge().requestRefresh()
}

// ─── 重试逻辑 ────────────────────────────────────────────────────────────

const NON_RETRYABLE_CODES = new Set(['SNAPSHOT_TOO_LARGE', 'INVALID_SNAPSHOT'])
const RETRY_DELAYS = [250, 1000, 4000] as const

/**
 * 带指数退避重试的 writeSnapshot。
 */
export async function writeSnapshotWithRetry(snapshot: TodayCourseSnapshot): Promise<void> {
  let lastError: unknown

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      await writeSnapshot(snapshot)
      await requestRefresh()
      return
    } catch (err: unknown) {
      lastError = err

      const code = (err as { code?: string })?.code
      if (code && NON_RETRYABLE_CODES.has(code)) {
        throw err
      }

      if (attempt === RETRY_DELAYS.length) break

      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[widget] writeSnapshot retry ${attempt + 1}/3: ${message}`)
      pushDebugLog('widget', `writeSnapshot retry ${attempt + 1}/3: ${message}`, 'warn', { code })

      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
    }
  }

  throw lastError
}
