import { describe, expect, it, vi } from 'vitest'
import {
  DEBUG_SCREENSHOT_CAPTURE_TIMEOUT_MS,
  escapeCssAttributeValue,
  executeDebugScreenshotRequest,
  resolveDebugScreenshotBackgroundColor
} from './debug_bridge'

describe('escapeCssAttributeValue（CSS 属性值选择器转义）', () => {
  it('回退实现逐字符转义引号与反斜杠（无原生 CSS.escape 时）', () => {
    expect(escapeCssAttributeValue('a"b')).toBe('a\\"b')
    expect(escapeCssAttributeValue('a\\b')).toBe('a\\\\b')
    expect(escapeCssAttributeValue("a'b")).toBe("a\\'b")
    expect(escapeCssAttributeValue('plain-module-id')).toBe('plain-module-id')
    expect(escapeCssAttributeValue('')).toBe('')
    expect(escapeCssAttributeValue(null as unknown as string)).toBe('')
    expect(escapeCssAttributeValue('a"b\\c\'d')).toBe('a\\"b\\\\c\\\'d')
  })

  it('优先使用原生 CSS.escape 并透传原值', () => {
    const escape = vi.fn((value: string) => `native:${value}`)
    vi.stubGlobal('CSS', { escape })
    try {
      expect(escapeCssAttributeValue('a"b\\c')).toBe('native:a"b\\c')
      expect(escape).toHaveBeenCalledWith('a"b\\c')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('resolveDebugScreenshotBackgroundColor', () => {
  it('未显式传入背景色时应交给截图服务按当前夜晚模式解析', () => {
    expect(resolveDebugScreenshotBackgroundColor({})).toBeNull()
  })

  it('应兼容 camelCase 和 snake_case 背景色字段', () => {
    expect(resolveDebugScreenshotBackgroundColor({ backgroundColor: '#102030' })).toBe('#102030')
    expect(resolveDebugScreenshotBackgroundColor({ background_color: '#203040' })).toBe('#203040')
  })
})

describe('executeDebugScreenshotRequest（页面侧截图超时保护 #975）', () => {
  const flush = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

  it('捕获成功时回包 success:true 并带上捕获字段', async () => {
    const complete = vi.fn()
    await executeDebugScreenshotRequest(
      { requestId: 'req-ok' },
      {
        captureAndEncode: async () => ({
          savedPath: 'C:/capture/a.png',
          mime: 'image/png',
          width: 10,
          height: 20,
          base64: null
        }),
        complete,
        timeoutMs: 50
      }
    )

    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0][0]).toMatchObject({
      requestId: 'req-ok',
      success: true,
      savedPath: 'C:/capture/a.png',
      mime: 'image/png',
      width: 10,
      height: 20
    })
  })

  it('捕获抛错时回包 capture_failed 且错误消息透传', async () => {
    const complete = vi.fn()
    await executeDebugScreenshotRequest(
      { requestId: 'req-fail' },
      {
        captureAndEncode: async () => {
          throw new Error('未找到截图目标：.view-page')
        },
        complete,
        timeoutMs: 50
      }
    )

    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0][0]).toMatchObject({
      requestId: 'req-fail',
      success: false,
      reason: 'capture_failed'
    })
    expect(complete.mock.calls[0][0].error).toContain('未找到截图目标：.view-page')
  })

  it('捕获悬挂时应在超时后回包 capture_timeout，迟到的完成不再二次回包', async () => {
    const complete = vi.fn()
    let resolveLate: (value: Record<string, unknown>) => void = () => {}
    const hanging = new Promise<Record<string, unknown>>((resolve) => {
      resolveLate = resolve
    })

    const running = executeDebugScreenshotRequest(
      { requestId: 'req-hang' },
      { captureAndEncode: () => hanging, complete, timeoutMs: 20 }
    )

    await flush(80)
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0][0]).toMatchObject({
      requestId: 'req-hang',
      success: false,
      reason: 'capture_timeout'
    })
    expect(String(complete.mock.calls[0][0].error)).toContain('超时')

    // 迟到的捕获完成不应再回包（原生侧 waiter 已被消费）
    resolveLate({ savedPath: 'late.png', mime: 'image/png', width: 1, height: 1, base64: null })
    await running
    await flush(10)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('requestId 缺失时不执行捕获也不回包', async () => {
    const complete = vi.fn()
    const capture = vi.fn(async () => ({ mime: 'image/png' }))

    await executeDebugScreenshotRequest({}, { captureAndEncode: capture, complete, timeoutMs: 20 })

    expect(capture).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it('回包（complete）抛错时不应向事件监听外抛出未处理拒绝', async () => {
    const complete = vi.fn(async () => {
      throw new Error('invoke failed')
    })

    await expect(
      executeDebugScreenshotRequest(
        { requestId: 'req-throw' },
        {
          captureAndEncode: async () => ({
            savedPath: '',
            mime: 'image/png',
            width: 1,
            height: 1,
            base64: null
          }),
          complete,
          timeoutMs: 50
        }
      )
    ).resolves.toBeUndefined()
  })

  it('页面侧超时窗口应小于原生侧 15 秒等待窗口', () => {
    expect(DEBUG_SCREENSHOT_CAPTURE_TIMEOUT_MS).toBeLessThan(15_000)
  })
})
