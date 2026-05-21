import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioManager } from './AudioManager.js'

class FakeAudioContext {
  constructor() {
    this.state = 'running'
    this.destination = {}
  }

  createBufferSource() {
    return {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn()
    }
  }

  createGain() {
    return {
      gain: { value: 1 },
      connect: vi.fn()
    }
  }

  async decodeAudioData() {
    return { decoded: true }
  }

  async close() {}
}

describe('AudioManager', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('缺失音频资源时不应该发起网络请求')
    }))
    vi.stubGlobal('AudioContext', FakeAudioContext)
    window.AudioContext = FakeAudioContext
    window.webkitAudioContext = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('没有打包音频资源时不请求缺失文件，也不输出加载失败 warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const manager = new AudioManager()

    await manager.init()
    await Promise.resolve()
    await Promise.resolve()

    expect(fetch).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('加载失败'))

    await manager.destroy()
  })
})
