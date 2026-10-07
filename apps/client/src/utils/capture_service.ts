/**
 * #993：`html2canvas` 改为按需动态 import。
 *
 * 该库约 204 KB，仅在「导出截图 / debug bridge 截图」时才会用到；此前是顶层静态
 * import，使其进入入口 chunk 的静态依赖图（构建产物 `dist/index.html` 还对其
 * `modulepreload`），冷启动时被主线程白白 parse + compile + eval。
 *
 * 动态 import 后该 chunk 脱离启动路径；`vi.mock('html2canvas')` 对动态 import 同样生效。
 */
const loadHtml2Canvas = async (): Promise<typeof import('html2canvas').default> => {
  const mod = await import('html2canvas')
  return (mod as { default?: typeof import('html2canvas').default }).default ?? (mod as unknown as typeof import('html2canvas').default)
}

const DEFAULT_LIGHT_CAPTURE_BACKGROUND = '#f4f7ff'
const DEFAULT_DARK_CAPTURE_BACKGROUND = '#0f172a'

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = (event) => reject(event)
    reader.readAsDataURL(blob)
  })

/**
 * 截图就绪等待总预算（毫秒）。
 *
 * `document.fonts.ready` 与 `<img>` 的 load 在 WebView 内可能无限悬挂
 * （字体请求 403 重试、图片长连接等）。此前无超时会让页面侧永不回包，
 * 导致 /debug/dom_screenshot 只能等满原生侧 15 秒窗口后 504（#975）。
 * 这里给出总预算：超时后按当前状态继续走兜底截图流程。
 */
export const CAPTURE_READY_TIMEOUT_MS = 3000

// 有界等待：promise 落定（成功或失败）或超时，二者先到先返回；等待值本身不重要。
const boundedWait = (promise: Promise<unknown>, timeoutMs: number): Promise<void> =>
  new Promise((resolve) => {
    if (!(timeoutMs > 0)) {
      resolve()
      return
    }
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = () => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(finish, timeoutMs)
    promise.then(finish, finish)
  })

export const waitForCaptureReady = async (
  rootEl: HTMLElement | null | undefined,
  timeoutMs: number = CAPTURE_READY_TIMEOUT_MS
) => {
  if (!rootEl) return
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0)

  const fonts = document?.fonts
  if (fonts?.ready) {
    try {
      await boundedWait(fonts.ready, Math.max(0, deadline - Date.now()))
    } catch {
      // 忽略字体检测异常，继续走兜底截图流程。
    }
  }

  const images = Array.from(rootEl.querySelectorAll('img'))
  if (images.length > 0) {
    await boundedWait(
      Promise.all(
        images.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve()
          return new Promise<void>((resolve) => {
            const done = () => resolve()
            img.addEventListener('load', done, { once: true })
            img.addEventListener('error', done, { once: true })
          })
        })
      ),
      Math.max(0, deadline - Date.now())
    )
  }

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

export const resolveCaptureTarget = (selector?: string | null): HTMLElement => {
  const explicit = String(selector || '').trim()
  if (explicit) {
    const matched = document.querySelector(explicit)
    if (matched instanceof HTMLElement) return matched
    throw new Error(`未找到截图目标：${explicit}`)
  }

  const candidates = [
    '.view-transition-root > *',
    '.view-page',
    '.app-shell',
    '#app'
  ]
  for (const item of candidates) {
    const matched = document.querySelector(item)
    if (matched instanceof HTMLElement) return matched
  }
  if (document.body instanceof HTMLElement) return document.body
  throw new Error('当前页面尚未准备完成，无法截图')
}

const isTransparentBackground = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase()
  return (
    !normalized ||
    normalized === 'transparent' ||
    normalized === 'rgba(0, 0, 0, 0)' ||
    normalized === 'rgba(0,0,0,0)'
  )
}

export const resolveCaptureBackgroundColor = (
  target: HTMLElement,
  explicitBackgroundColor?: string | null
) => {
  const explicit = String(explicitBackgroundColor || '').trim()
  if (explicit) return explicit

  const doc = target.ownerDocument || document
  const root = doc.documentElement
  const readComputedStyle = doc.defaultView?.getComputedStyle?.bind(doc.defaultView) || globalThis.getComputedStyle
  const candidates = [target, doc.body, root].filter(Boolean) as HTMLElement[]
  for (const candidate of candidates) {
    const color = readComputedStyle(candidate).backgroundColor
    if (!isTransparentBackground(color)) return color
  }

  const isDark = root.classList.contains('dark')
  return isDark ? DEFAULT_DARK_CAPTURE_BACKGROUND : DEFAULT_LIGHT_CAPTURE_BACKGROUND
}

export const captureElementToBlob = async ({
  selector,
  format = 'png',
  backgroundColor,
  scale,
  maxHeight
}: {
  selector?: string | null
  format?: 'png' | 'webp'
  backgroundColor?: string
  scale?: number
  maxHeight?: number
}) => {
  const target = resolveCaptureTarget(selector)
  const exportWidth = Math.max(
    Math.ceil(target.scrollWidth || 0),
    Math.ceil(target.clientWidth || 0),
    640
  )
  const exportHeight = Math.max(
    Math.ceil(target.clientHeight || 0),
    Number(maxHeight) > 0
      ? Math.min(
          Math.ceil(target.scrollHeight || target.clientHeight || 0),
          Math.ceil(Number(maxHeight))
        )
      : Math.ceil(target.scrollHeight || target.clientHeight || 0),
    480
  )
  target.classList.add('capture-mode')
  try {
    await waitForCaptureReady(target)
    const resolvedBackgroundColor = resolveCaptureBackgroundColor(target, backgroundColor)
    const canvas = await renderElementToCanvas(target, {
      exportWidth,
      exportHeight,
      backgroundColor: resolvedBackgroundColor,
      scale
    })
    const mime = format === 'webp' ? 'image/webp' : 'image/png'
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value)
          else reject(new Error('无法生成截图数据'))
        },
        mime,
        0.98
      )
    })
    return {
      blob,
      mime,
      width: canvas.width,
      height: canvas.height
    }
  } finally {
    target.classList.remove('capture-mode')
  }
}

export const renderElementToCanvas = async (
  element: HTMLElement,
  {
    exportWidth,
    exportHeight,
    backgroundColor = DEFAULT_LIGHT_CAPTURE_BACKGROUND,
    scale
  }: {
    exportWidth?: number
    exportHeight?: number
    backgroundColor?: string
    scale?: number
  } = {}
) => {
  const width = Math.max(
    Math.ceil(exportWidth || 0),
    Math.ceil(element.scrollWidth || 0),
    Math.ceil(element.clientWidth || 0),
    640
  )
  const height = Math.max(
    Math.ceil(
      exportHeight ||
      element.scrollHeight ||
      element.clientHeight ||
      0
    ),
    480
  )
  const baseOptions = {
    useCORS: true,
    allowTaint: false,
    imageTimeout: 15000,
    scale: scale || Math.max(2, Math.min(window.devicePixelRatio || 2, 3)),
    backgroundColor,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: width,
    windowHeight: height,
    width,
    height
  }

  try {
    const html2canvas = await loadHtml2Canvas()
    return await html2canvas(element, {
      ...baseOptions,
      foreignObjectRendering: false
    })
  } catch (error: any) {
    const message = String(error?.message || error || '')
    if (!/unsupported color function|oklab|color-mix/i.test(message)) {
      throw error
    }

    const html2canvas = await loadHtml2Canvas()
    return html2canvas(element, {
      ...baseOptions,
      foreignObjectRendering: true,
      backgroundColor
    })
  }
}
