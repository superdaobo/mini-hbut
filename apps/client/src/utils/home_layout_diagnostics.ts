import { formatDebugTime, getDebugLogs } from './debug_logger'

const ERROR_STORE_KEY = '__MINI_HBUT_LAYOUT_DEBUG_ERRORS__'
const MAX_ERROR_RECORDS = 60
const MAX_DOM_NODES = 90
const MAX_DOM_DEPTH = 5

type PlainRecord = Record<string, unknown>

type ErrorRecord = {
  ts: number
  type: string
  message: string
  source?: string
  lineno?: number
  colno?: number
  stack?: string
}

declare global {
  interface Window {
    __MINI_HBUT_LAYOUT_DEBUG_ERRORS__?: ErrorRecord[]
    Capacitor?: unknown
    __TAURI__?: unknown
  }
}

let errorCaptureInstalled = false
let cleanupErrorCapture: (() => void) | null = null

const round = (value: unknown) => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return value
  return Math.round(numberValue * 100) / 100
}

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return `[unserializable: ${String(error)}]`
  }
}

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    }
  }
  if (error && typeof error === 'object') {
    return {
      message: String((error as PlainRecord).message || error),
      stack: String((error as PlainRecord).stack || '')
    }
  }
  return {
    message: String(error || ''),
    stack: ''
  }
}

const pushErrorRecord = (record: ErrorRecord) => {
  if (typeof window === 'undefined') return
  const list = Array.isArray(window[ERROR_STORE_KEY]) ? window[ERROR_STORE_KEY] || [] : []
  list.push(record)
  window[ERROR_STORE_KEY] = list.slice(-MAX_ERROR_RECORDS)
}

export const installHomeLayoutDiagnosticsErrorCapture = () => {
  if (typeof window === 'undefined') return () => {}
  if (errorCaptureInstalled && cleanupErrorCapture) return cleanupErrorCapture

  const handleError = (event: ErrorEvent) => {
    const normalized = normalizeError(event.error || event.message)
    pushErrorRecord({
      ts: Date.now(),
      type: 'error',
      message: normalized.message || String(event.message || ''),
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: normalized.stack
    })
  }

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const normalized = normalizeError(event.reason)
    pushErrorRecord({
      ts: Date.now(),
      type: 'unhandledrejection',
      message: normalized.message,
      stack: normalized.stack
    })
  }

  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  errorCaptureInstalled = true
  cleanupErrorCapture = () => {
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    errorCaptureInstalled = false
    cleanupErrorCapture = null
  }
  return cleanupErrorCapture
}

const readRect = (element: Element | null) => {
  if (!element || typeof element.getBoundingClientRect !== 'function') return null
  const rect = element.getBoundingClientRect()
  return {
    x: round(rect.x),
    y: round(rect.y),
    top: round(rect.top),
    right: round(rect.right),
    bottom: round(rect.bottom),
    left: round(rect.left),
    width: round(rect.width),
    height: round(rect.height)
  }
}

const readComputedStyle = (element: Element | null) => {
  if (!element || typeof window === 'undefined') return null
  const style = window.getComputedStyle(element)
  const pick = [
    'position',
    'display',
    'visibility',
    'top',
    'right',
    'bottom',
    'left',
    'inset',
    'width',
    'height',
    'min-height',
    'max-height',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'overflow',
    'overflow-x',
    'overflow-y',
    'transform',
    'z-index',
    'box-sizing',
    'border-radius',
    'background',
    'contain'
  ]
  return Object.fromEntries(pick.map((name) => [name, style.getPropertyValue(name)]))
}

const readElementSnapshot = (selector: string) => {
  const element = typeof document === 'undefined' ? null : document.querySelector(selector)
  return {
    selector,
    found: !!element,
    tag: element?.tagName?.toLowerCase() || '',
    id: element?.id || '',
    className: element instanceof HTMLElement ? element.className : '',
    childElementCount: element?.childElementCount || 0,
    rect: readRect(element),
    style: readComputedStyle(element)
  }
}

const readSafeAreaProbe = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.body) {
    return null
  }
  const probe = document.createElement('div')
  probe.setAttribute('data-home-layout-diagnostics-safe-area-probe', 'true')
  probe.style.cssText = [
    'position: fixed',
    'left: 0',
    'bottom: 0',
    'width: 0',
    'height: 0',
    'padding-top: env(safe-area-inset-top, 0px)',
    'padding-right: env(safe-area-inset-right, 0px)',
    'padding-bottom: env(safe-area-inset-bottom, 0px)',
    'padding-left: env(safe-area-inset-left, 0px)',
    'visibility: hidden',
    'pointer-events: none',
    'z-index: -1'
  ].join(';')
  document.body.appendChild(probe)
  const style = window.getComputedStyle(probe)
  const result = {
    top: style.paddingTop,
    right: style.paddingRight,
    bottom: style.paddingBottom,
    left: style.paddingLeft
  }
  probe.remove()
  return result
}

const readCssVariables = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return {}
  const root = document.documentElement
  const style = window.getComputedStyle(root)
  const variables = [
    '--app-vh',
    '--app-safe-bottom',
    '--app-safe-bottom-fallback',
    '--safe-top-fallback',
    '--ui-nav-style',
    '--ux-bottom-safe'
  ]
  return Object.fromEntries(
    variables.map((name) => [
      name,
      {
        inline: root.style.getPropertyValue(name).trim(),
        computed: style.getPropertyValue(name).trim()
      }
    ])
  )
}

const readViewport = () => {
  if (typeof window === 'undefined') return null
  const vv = window.visualViewport
  return {
    innerWidth: round(window.innerWidth),
    innerHeight: round(window.innerHeight),
    outerWidth: round(window.outerWidth),
    outerHeight: round(window.outerHeight),
    devicePixelRatio: round(window.devicePixelRatio),
    scrollX: round(window.scrollX),
    scrollY: round(window.scrollY),
    visualViewport: vv
      ? {
          width: round(vv.width),
          height: round(vv.height),
          offsetLeft: round(vv.offsetLeft),
          offsetTop: round(vv.offsetTop),
          pageLeft: round(vv.pageLeft),
          pageTop: round(vv.pageTop),
          scale: round(vv.scale)
        }
      : null,
    screen: typeof screen === 'undefined'
      ? null
      : {
          width: round(screen.width),
          height: round(screen.height),
          availWidth: round(screen.availWidth),
          availHeight: round(screen.availHeight),
          orientation: screen.orientation?.type || ''
        }
  }
}

const describeElementLine = (element: Element, depth: number) => {
  const rect = readRect(element)
  const style = typeof window === 'undefined' ? null : window.getComputedStyle(element)
  const id = element.id ? `#${element.id}` : ''
  const className = element instanceof HTMLElement && element.className
    ? `.${String(element.className).trim().split(/\s+/).slice(0, 5).join('.')}`
    : ''
  const layout = rect
    ? ` x=${rect.x} y=${rect.y} w=${rect.width} h=${rect.height} b=${rect.bottom}`
    : ''
  const css = style
    ? ` display=${style.display} position=${style.position} overflow=${style.overflow}/${style.overflowY}`
    : ''
  return `${'  '.repeat(depth)}${element.tagName.toLowerCase()}${id}${className}${layout}${css} children=${element.childElementCount}`
}

const readDomTree = () => {
  if (typeof document === 'undefined') return []
  const root = document.querySelector('#app') || document.body
  if (!root) return []
  const lines: string[] = []
  const walk = (element: Element, depth: number) => {
    if (lines.length >= MAX_DOM_NODES || depth > MAX_DOM_DEPTH) return
    lines.push(describeElementLine(element, depth))
    Array.from(element.children).forEach((child) => walk(child, depth + 1))
  }
  walk(root, 0)
  if (lines.length >= MAX_DOM_NODES) {
    lines.push(`... truncated at ${MAX_DOM_NODES} nodes`)
  }
  return lines
}

const readDocumentMetrics = () => {
  if (typeof document === 'undefined') return null
  const html = document.documentElement
  const body = document.body
  return {
    html: {
      clientWidth: html.clientWidth,
      clientHeight: html.clientHeight,
      scrollWidth: html.scrollWidth,
      scrollHeight: html.scrollHeight,
      className: html.className,
      dataset: { ...html.dataset }
    },
    body: body
      ? {
          clientWidth: body.clientWidth,
          clientHeight: body.clientHeight,
          scrollWidth: body.scrollWidth,
          scrollHeight: body.scrollHeight,
          className: body.className,
          style: body.getAttribute('style') || ''
        }
      : null
  }
}

const readRuntimeInfo = (context: PlainRecord) => {
  if (typeof window === 'undefined') return { context }
  const nav = window.navigator
  return {
    context,
    location: {
      href: window.location.href,
      hash: window.location.hash,
      pathname: window.location.pathname,
      search: window.location.search
    },
    navigator: {
      userAgent: nav.userAgent,
      platform: nav.platform,
      maxTouchPoints: nav.maxTouchPoints,
      standalone: (nav as Navigator & { standalone?: boolean }).standalone === true,
      language: nav.language
    },
    runtimeFlags: {
      hasTauriGlobal: !!window.__TAURI__,
      hasCapacitorGlobal: !!window.Capacitor,
      userAgentIncludesIOS: /iPad|iPhone|iPod/i.test(nav.userAgent || ''),
      iPadDesktopMode: nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1
    }
  }
}

const readRelationship = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  const tab = document.querySelector('.bottom-tab-bar')
  const shell = document.querySelector('.app-shell')
  const tabRect = readRect(tab)
  const shellRect = readRect(shell)
  const visualHeight = window.visualViewport?.height || window.innerHeight
  const bottomGap = tabRect ? round(window.innerHeight - Number(tabRect.bottom)) : null
  const visualBottomGap = tabRect ? round(visualHeight - Number(tabRect.bottom)) : null
  return {
    tabToLayoutViewportBottom: bottomGap,
    tabToVisualViewportBottom: visualBottomGap,
    tabToShellBottom: tabRect && shellRect ? round(Number(shellRect.bottom) - Number(tabRect.bottom)) : null,
    shellBottomToLayoutViewportBottom: shellRect ? round(window.innerHeight - Number(shellRect.bottom)) : null
  }
}

const readRecentDebugLogs = () => getDebugLogs(80).map((item) => ({
  time: formatDebugTime(item.ts),
  level: item.level,
  scope: item.scope,
  message: item.message,
  details: item.details
}))

export const collectHomeLayoutDiagnostics = (context: PlainRecord = {}) => {
  const report = {
    title: 'Mini-HBUT 首页布局诊断',
    generatedAt: new Date().toISOString(),
    runtime: readRuntimeInfo(context),
    viewport: readViewport(),
    document: readDocumentMetrics(),
    cssVariables: readCssVariables(),
    safeAreaProbe: readSafeAreaProbe(),
    trackedElements: [
      '#app',
      'html',
      'body',
      '.app-shell',
      '.view-transition-root',
      '.dashboard-root',
      '.bottom-tab-bar'
    ].map(readElementSnapshot),
    bottomTabRelationship: readRelationship(),
    capturedErrors: typeof window === 'undefined' ? [] : (window[ERROR_STORE_KEY] || []).slice(-MAX_ERROR_RECORDS),
    recentDebugLogs: readRecentDebugLogs(),
    domTree: readDomTree()
  }

  return [
    'Mini-HBUT 首页布局调试报告',
    '请完整复制这段文本返回给开发者。',
    '',
    safeJson(report),
    '',
    'DOM 树摘要:',
    ...report.domTree
  ].join('\n')
}
