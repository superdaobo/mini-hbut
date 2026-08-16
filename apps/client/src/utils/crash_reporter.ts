import { pushDebugLog } from './debug_logger'
import type { App } from 'vue'

/**
 * 全局错误诊断（iOS 课程中心间歇性闪退归因）：
 * - window 'error'：同步 JS 错误 / 资源加载错误
 * - window 'unhandledrejection'：未处理的 Promise 拒绝
 * - Vue app.config.errorHandler：组件渲染 / 生命周期错误（附组件上下文）
 * 全部写入本地调试日志（debug_logger），不做任何网络上传。
 */

/** 单条摘要最大长度，避免日志过大 */
const MAX_SNIPPET = 500

let installed = false

/** 脱敏：粗粒度抹掉 token / cookie / 密码等敏感键值，避免写入日志 */
const redactSensitive = (text: string) =>
  text.replace(
    /((?:access|refresh|id)?[_-]?token|cookie|authorization|password|passwd|secret|session[_-]?id)\s*[=:]\s*[^\s;&"',}]+/gi,
    '$1=[已脱敏]'
  )

/** 截断 + 脱敏，生成安全摘要 */
const toSnippet = (input: unknown, max = MAX_SNIPPET) => {
  let text = ''
  if (typeof input === 'string') {
    text = input
  } else if (input instanceof Error) {
    text = String(input.stack || input.message || input)
  } else if (input === null || input === undefined) {
    text = String(input)
  } else {
    try {
      text = JSON.stringify(input)
    } catch {
      text = String(input)
    }
  }
  text = redactSensitive(String(text || '').trim())
  return text.length > max ? `${text.slice(0, max)}…(截断)` : text
}

const handleWindowError = (event: ErrorEvent) => {
  try {
    const stack = toSnippet(event.error?.stack || '')
    const parts = [
      `未捕获异常: ${toSnippet(event.message || '(无消息)', 200)}`,
      `位置: ${toSnippet(event.filename || '(未知文件)', 160)}:${event.lineno || 0}:${event.colno || 0}`
    ]
    if (stack) parts.push(`堆栈: ${stack}`)
    pushDebugLog('GlobalError', parts.join(' | '), 'error')
  } catch {
    // 诊断代码自身绝不能再抛错
  }
}

const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
  try {
    const reason = event.reason as { stack?: unknown } | undefined
    const stack = toSnippet(reason?.stack || '')
    const parts = [`未处理的 Promise 拒绝: ${toSnippet(String(event.reason), 200)}`]
    if (stack) parts.push(`堆栈: ${stack}`)
    pushDebugLog('GlobalError', parts.join(' | '), 'error')
  } catch {
    // ignore
  }
}

/**
 * 安装全局错误捕获（幂等，重复调用不会重复注册）。
 * 应在应用入口尽早调用（initDebugLogger 之后）。
 */
export const installGlobalErrorCapture = () => {
  if (installed || typeof window === 'undefined') return
  window.addEventListener('error', handleWindowError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  installed = true
  pushDebugLog('GlobalError', '全局错误捕获已安装（error / unhandledrejection）', 'info')
}

/**
 * 为 Vue 应用挂接 errorHandler，补充组件名 / 生命周期钩子上下文。
 * 记录后不吞错：继续 console.error，保持既有控制台行为。
 */
export const attachVueErrorCapture = (app: App) => {
  const previous = app.config.errorHandler
  app.config.errorHandler = (error, instance, info) => {
    try {
      const componentName =
        (instance?.$options && (instance.$options.name || instance.$options.__name)) || '(匿名组件)'
      pushDebugLog(
        'GlobalError',
        `Vue 错误 [${toSnippet(String(info), 80)}] 组件: ${toSnippet(String(componentName), 80)} | ${toSnippet(error)}`,
        'error'
      )
    } catch {
      // ignore
    }
    if (typeof previous === 'function') {
      previous(error, instance, info)
      return
    }
    console.error('[Vue] 组件错误:', error)
  }
}
