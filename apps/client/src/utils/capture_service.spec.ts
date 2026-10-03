import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CAPTURE_READY_TIMEOUT_MS, resolveCaptureBackgroundColor, waitForCaptureReady } from './capture_service'

vi.mock('html2canvas', () => ({
  default: vi.fn()
}))

describe('resolveCaptureBackgroundColor', () => {
  let root: HTMLElement
  let body: HTMLElement
  let target: HTMLElement

  beforeEach(() => {
    root = {
      classList: { contains: vi.fn(() => false) },
      getAttribute: vi.fn(() => null)
    } as unknown as HTMLElement
    body = {} as HTMLElement
    target = {
      ownerDocument: { documentElement: root, body } as Document
    } as HTMLElement

    globalThis.getComputedStyle = vi.fn((element: Element) => {
      if (element === target) {
        return { backgroundColor: 'rgba(0, 0, 0, 0)' } as CSSStyleDeclaration
      }
      if (element === body) {
        return { backgroundColor: 'rgba(0, 0, 0, 0)' } as CSSStyleDeclaration
      }
      return { backgroundColor: 'rgba(0, 0, 0, 0)' } as CSSStyleDeclaration
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle
  })

  it('显式传入背景色时应优先使用该背景色', () => {
    expect(resolveCaptureBackgroundColor(target, '#ffffff')).toBe('#ffffff')
  })

  it('暗色类名生效但元素透明时应使用暗色截图背景', () => {
    root.classList.contains = vi.fn((name: string) => name === 'dark')

    expect(resolveCaptureBackgroundColor(target)).toBe('#0f172a')
  })

  it('元素有不透明背景时应使用元素计算背景色', () => {
    globalThis.getComputedStyle = vi.fn((element: Element) => {
      if (element === target) {
        return { backgroundColor: 'rgb(30, 41, 59)' } as CSSStyleDeclaration
      }
      return { backgroundColor: 'rgba(0, 0, 0, 0)' } as CSSStyleDeclaration
    })

    expect(resolveCaptureBackgroundColor(target)).toBe('rgb(30, 41, 59)')
  })

  it('非夜晚模式且元素透明时应使用默认浅色截图背景', () => {
    expect(resolveCaptureBackgroundColor(target)).toBe('#f4f7ff')
  })
})

describe('waitForCaptureReady 就绪等待总预算（#975）', () => {
  beforeEach(() => {
    // node 测试环境补齐 DOM 时序原语
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: (time: number) => void) => setTimeout(() => cb(0), 0)
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('字体 ready 无限悬挂时应在预算内返回而不是永久等待', async () => {
    vi.stubGlobal('document', { fonts: { ready: new Promise(() => {}) } })
    const rootEl = { querySelectorAll: () => [] } as unknown as HTMLElement

    const start = Date.now()
    await waitForCaptureReady(rootEl, 30)
    expect(Date.now() - start).toBeLessThan(2000)
  })

  it('图片加载悬挂时同样应在预算内返回', async () => {
    vi.stubGlobal('document', { fonts: undefined })
    // addEventListener 注册后无人触发 load/error，模拟悬挂的图片
    const hangingImg = { complete: false, naturalWidth: 0, addEventListener: vi.fn() }
    const rootEl = { querySelectorAll: () => [hangingImg] } as unknown as HTMLElement

    const start = Date.now()
    await waitForCaptureReady(rootEl, 30)
    expect(Date.now() - start).toBeLessThan(2000)
  })

  it('字体与图片均已就绪时应立即返回（不空等预算）', async () => {
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } })
    const readyImg = { complete: true, naturalWidth: 8, addEventListener: vi.fn() }
    const rootEl = { querySelectorAll: () => [readyImg] } as unknown as HTMLElement

    const start = Date.now()
    await waitForCaptureReady(rootEl, 5000)
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('默认预算常量应保持小窗口（远小于原生侧 15 秒等待）', () => {
    expect(CAPTURE_READY_TIMEOUT_MS).toBeLessThanOrEqual(5000)
  })
})
