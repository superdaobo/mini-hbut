// src/platform/capacitor/widget.ts
// 门面：封装 Widget Bridge 单例 + schema/字节数校验 + 重试
// 对齐 design §6.2, §9.2, §9.3

import { MiniHbutWidget } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'
import type { TodayCourseSnapshot, MiniHbutWidgetPlugin } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'
import { validateSnapshot } from '@/utils/widget_snapshot_schema'
import { pushDebugLog } from '@/utils/debug_logger'

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

// ─── No-op Proxy（非 Capacitor 环境） ───────────────────────────────────

/** 创建一个所有方法静默 resolve 的 no-op 代理 */
function createNoOpProxy(): MiniHbutWidgetPlugin {
  return {
    writeSnapshot: () => Promise.resolve(),
    clearSnapshot: () => Promise.resolve(),
    requestRefresh: () => Promise.resolve(),
    getCapabilities: () => Promise.resolve({ platform: 'unavailable', pinned: false }),
  }
}

// ─── 单例管理 ────────────────────────────────────────────────────────────

let _bridge: MiniHbutWidgetPlugin | null = null
let _debugLogged = false

/**
 * 获取 Widget Bridge 单例。
 * - Capacitor 环境：返回真实插件实例
 * - 非 Capacitor 环境：console.debug 一次后返回 no-op proxy
 */
export function getWidgetBridge(): MiniHbutWidgetPlugin {
  if (_bridge) return _bridge

  // 检测 Capacitor 运行时
  const isCapacitor =
    typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!(window as any).Capacitor

  if (!isCapacitor) {
    if (!_debugLogged) {
      console.debug('[widget] Not in Capacitor environment, widget bridge is no-op')
      _debugLogged = true
    }
    _bridge = createNoOpProxy()
    return _bridge
  }

  _bridge = MiniHbutWidget
  return _bridge
}

// ─── 公开 API ────────────────────────────────────────────────────────────

/**
 * 写入快照到原生 Widget 共享存储。
 * 执行 Ajv schema 校验 + UTF-8 字节数校验（≤ 32 KB）后委托插件写入。
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

  // 3. 委托插件写入
  await getWidgetBridge().writeSnapshot({ snapshot })
}

/**
 * 清空 Widget 共享存储中的快照数据。
 * 委托插件执行清空 + 触发 Widget 刷新。
 */
export async function clearSnapshot(): Promise<void> {
  await getWidgetBridge().clearSnapshot()
}

/**
 * 请求原生 Widget 立即刷新渲染。
 */
export async function requestRefresh(): Promise<void> {
  await getWidgetBridge().requestRefresh()
}

// ─── 重试逻辑 ────────────────────────────────────────────────────────────

/** 不可重试的错误码：立即抛出，不进入退避循环 */
const NON_RETRYABLE_CODES = new Set(['SNAPSHOT_TOO_LARGE', 'INVALID_SNAPSHOT'])

/** 指数退避间隔（ms）：最多 3 次重试 */
const RETRY_DELAYS = [250, 1000, 4000] as const

/**
 * 带指数退避重试的 writeSnapshot。
 * - 不可重试错误（SNAPSHOT_TOO_LARGE / INVALID_SNAPSHOT）立即 reject
 * - 可重试错误（WRITE_FAILED / UNAVAILABLE）最多重试 3 次
 * - 退避间隔：250ms → 1000ms → 4000ms
 */
export async function writeSnapshotWithRetry(snapshot: TodayCourseSnapshot): Promise<void> {
  let lastError: unknown

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      await writeSnapshot(snapshot)
      return
    } catch (err: unknown) {
      lastError = err

      // 不可重试错误：立即抛出
      const code = (err as { code?: string })?.code
      if (code && NON_RETRYABLE_CODES.has(code)) {
        throw err
      }

      // 已用尽所有重试次数
      if (attempt === RETRY_DELAYS.length) {
        break
      }

      // 记录重试日志
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[widget] writeSnapshot retry ${attempt + 1}/3: ${message}`)
      pushDebugLog('widget', `writeSnapshot retry ${attempt + 1}/3: ${message}`, 'warn', { code })

      // 指数退避等待
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
    }
  }

  // 所有重试耗尽，抛出最后一个错误
  throw lastError
}
