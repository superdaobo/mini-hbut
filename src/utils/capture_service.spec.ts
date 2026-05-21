import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveCaptureBackgroundColor } from './capture_service'

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
    delete (globalThis as typeof globalThis & { getComputedStyle?: typeof getComputedStyle }).getComputedStyle
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
