import html2canvas from 'html2canvas'

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = (event) => reject(event)
    reader.readAsDataURL(blob)
  })

export const waitForCaptureReady = async (rootEl: HTMLElement | null | undefined) => {
  if (!rootEl) return

  const fonts = document?.fonts
  if (fonts?.ready) {
    try {
      await fonts.ready
    } catch {
      // 忽略字体检测异常，继续走兜底截图流程。
    }
  }

  const images = Array.from(rootEl.querySelectorAll('img'))
  if (images.length > 0) {
    await Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve()
        return new Promise<void>((resolve) => {
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        })
      })
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

export const captureElementToBlob = async ({
  selector,
  format = 'png',
  backgroundColor = '#f4f7ff',
  scale
}: {
  selector?: string | null
  format?: 'png' | 'webp'
  backgroundColor?: string
  scale?: number
}) => {
  const target = resolveCaptureTarget(selector)
  const exportWidth = Math.max(
    Math.ceil(target.scrollWidth || 0),
    Math.ceil(target.clientWidth || 0),
    640
  )
  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-99999px'
  wrapper.style.top = '0'
  wrapper.style.width = `${exportWidth}px`
  wrapper.style.opacity = '0'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.zIndex = '0'
  wrapper.style.background = backgroundColor
  wrapper.style.padding = '0'
  wrapper.style.overflow = 'visible'

  const clone = target.cloneNode(true) as HTMLElement
  clone.classList.add('capture-mode')
  clone.style.width = `${exportWidth}px`
  clone.style.minWidth = `${exportWidth}px`
  clone.style.maxWidth = `${exportWidth}px`
  clone.style.boxSizing = 'border-box'
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    await waitForCaptureReady(clone)
    const canvas = await renderElementToCanvas(clone, {
      exportWidth,
      backgroundColor,
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
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper)
    }
  }
}

export const renderElementToCanvas = async (
  element: HTMLElement,
  {
    exportWidth,
    backgroundColor = '#f4f7ff',
    scale
  }: {
    exportWidth?: number
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
    windowHeight: Math.ceil(element.scrollHeight + 64),
    width
  }

  try {
    return await html2canvas(element, {
      ...baseOptions,
      foreignObjectRendering: false
    })
  } catch (error: any) {
    const message = String(error?.message || error || '')
    if (!/unsupported color function|oklab|color-mix/i.test(message)) {
      throw error
    }

    return html2canvas(element, {
      ...baseOptions,
      foreignObjectRendering: true,
      backgroundColor: null
    })
  }
}
