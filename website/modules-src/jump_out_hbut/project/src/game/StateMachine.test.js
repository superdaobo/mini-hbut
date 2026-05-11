import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StateMachine } from './StateMachine.js'

describe('StateMachine', () => {
  let sm

  beforeEach(() => {
    sm = new StateMachine()
  })

  describe('初始状态', () => {
    it('初始状态为 idle', () => {
      expect(sm.getState()).toBe('idle')
    })

    it('初始时 canCharge() 返回 true', () => {
      expect(sm.canCharge()).toBe(true)
    })
  })

  describe('合法状态转换', () => {
    it('idle → charging', () => {
      expect(sm.transition('charging')).toBe(true)
      expect(sm.getState()).toBe('charging')
    })

    it('charging → jumping', () => {
      sm.transition('charging')
      expect(sm.transition('jumping')).toBe(true)
      expect(sm.getState()).toBe('jumping')
    })

    it('jumping → landed（成功着陆）', () => {
      sm.transition('charging')
      sm.transition('jumping')
      expect(sm.transition('landed')).toBe(true)
      expect(sm.getState()).toBe('landed')
    })

    it('jumping → gameover（坠落失败）', () => {
      sm.transition('charging')
      sm.transition('jumping')
      expect(sm.transition('gameover')).toBe(true)
      expect(sm.getState()).toBe('gameover')
    })

    it('landed → idle（着陆动画完成后回到 idle）', () => {
      sm.transition('charging')
      sm.transition('jumping')
      sm.transition('landed')
      expect(sm.transition('idle')).toBe(true)
      expect(sm.getState()).toBe('idle')
    })
  })

  describe('非法状态转换', () => {
    it('idle → jumping（跳过 charging）', () => {
      expect(sm.transition('jumping')).toBe(false)
      expect(sm.getState()).toBe('idle')
    })

    it('idle → landed', () => {
      expect(sm.transition('landed')).toBe(false)
      expect(sm.getState()).toBe('idle')
    })

    it('idle → gameover', () => {
      expect(sm.transition('gameover')).toBe(false)
      expect(sm.getState()).toBe('idle')
    })

    it('charging → idle（不能从 charging 回退到 idle）', () => {
      sm.transition('charging')
      expect(sm.transition('idle')).toBe(false)
      expect(sm.getState()).toBe('charging')
    })

    it('charging → landed', () => {
      sm.transition('charging')
      expect(sm.transition('landed')).toBe(false)
      expect(sm.getState()).toBe('charging')
    })

    it('charging → gameover', () => {
      sm.transition('charging')
      expect(sm.transition('gameover')).toBe(false)
      expect(sm.getState()).toBe('charging')
    })

    it('jumping → idle', () => {
      sm.transition('charging')
      sm.transition('jumping')
      expect(sm.transition('idle')).toBe(false)
      expect(sm.getState()).toBe('jumping')
    })

    it('jumping → charging', () => {
      sm.transition('charging')
      sm.transition('jumping')
      expect(sm.transition('charging')).toBe(false)
      expect(sm.getState()).toBe('jumping')
    })

    it('landed → charging（不能从 landed 直接蓄力）', () => {
      sm.transition('charging')
      sm.transition('jumping')
      sm.transition('landed')
      expect(sm.transition('charging')).toBe(false)
      expect(sm.getState()).toBe('landed')
    })

    it('gameover 不能转换到任何状态', () => {
      sm.transition('charging')
      sm.transition('jumping')
      sm.transition('gameover')
      expect(sm.transition('idle')).toBe(false)
      expect(sm.transition('charging')).toBe(false)
      expect(sm.transition('jumping')).toBe(false)
      expect(sm.transition('landed')).toBe(false)
      expect(sm.getState()).toBe('gameover')
    })
  })

  describe('完整循环：idle→charging→jumping→landed→idle', () => {
    it('完整一轮跳跃循环', () => {
      expect(sm.getState()).toBe('idle')

      expect(sm.transition('charging')).toBe(true)
      expect(sm.getState()).toBe('charging')

      expect(sm.transition('jumping')).toBe(true)
      expect(sm.getState()).toBe('jumping')

      expect(sm.transition('landed')).toBe(true)
      expect(sm.getState()).toBe('landed')

      expect(sm.transition('idle')).toBe(true)
      expect(sm.getState()).toBe('idle')
    })

    it('连续多轮跳跃循环', () => {
      for (let i = 0; i < 5; i++) {
        expect(sm.transition('charging')).toBe(true)
        expect(sm.transition('jumping')).toBe(true)
        expect(sm.transition('landed')).toBe(true)
        expect(sm.transition('idle')).toBe(true)
      }
      expect(sm.getState()).toBe('idle')
    })
  })

  describe('仅 idle 状态接受蓄力输入（防快速连点）', () => {
    it('idle 状态 canCharge() 为 true', () => {
      expect(sm.canCharge()).toBe(true)
    })

    it('charging 状态 canCharge() 为 false', () => {
      sm.transition('charging')
      expect(sm.canCharge()).toBe(false)
    })

    it('jumping 状态 canCharge() 为 false', () => {
      sm.transition('charging')
      sm.transition('jumping')
      expect(sm.canCharge()).toBe(false)
    })

    it('landed 状态 canCharge() 为 false', () => {
      sm.transition('charging')
      sm.transition('jumping')
      sm.transition('landed')
      expect(sm.canCharge()).toBe(false)
    })

    it('gameover 状态 canCharge() 为 false', () => {
      sm.transition('charging')
      sm.transition('jumping')
      sm.transition('gameover')
      expect(sm.canCharge()).toBe(false)
    })
  })

  describe('onChange 回调', () => {
    it('状态转换时触发回调', () => {
      const callback = vi.fn()
      sm.onChange(callback)

      sm.transition('charging')
      expect(callback).toHaveBeenCalledWith('charging', 'idle')
    })

    it('非法转换不触发回调', () => {
      const callback = vi.fn()
      sm.onChange(callback)

      sm.transition('jumping') // 非法
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('reset()', () => {
    it('从任意状态重置到 idle', () => {
      sm.transition('charging')
      sm.transition('jumping')
      sm.transition('gameover')

      sm.reset()
      expect(sm.getState()).toBe('idle')
      expect(sm.canCharge()).toBe(true)
    })

    it('reset 时触发 onChange 回调', () => {
      const callback = vi.fn()
      sm.onChange(callback)

      sm.transition('charging')
      callback.mockClear()

      sm.reset()
      expect(callback).toHaveBeenCalledWith('idle', 'charging')
    })

    it('已经是 idle 时 reset 不触发回调', () => {
      const callback = vi.fn()
      sm.onChange(callback)

      sm.reset()
      expect(callback).not.toHaveBeenCalled()
    })
  })
})
