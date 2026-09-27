// src/app/coordinators/loginOutcome.spec.ts
//
// GitHub #932 应用级登录成功通道测试：
//   - 归一化：适配层形状 {success,data} 与裸 UserInfo 都要被正确识别
//     （曾因只认适配层形状，把成功的登录误判为失败）
//   - publish/subscribe：不依赖任何组件实例即可交付结果
//
// 运行环境为 node（无 window/CustomEvent），此处提供最小事件实现。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOGIN_METHOD_CHAOXING_PASSWORD,
  LOGIN_METHOD_PORTAL_PASSWORD,
  LOGIN_METHOD_PORTAL_QR,
  normalizePortalLoginOutcome,
  publishPortalLoginSucceeded,
  subscribePortalLoginSucceeded,
  triggersLoginCooldown
} from './loginOutcome'

type Listener = (event: { type: string; detail?: unknown }) => void
const listeners = new Map<string, Set<Listener>>()

const installFakeWindow = () => {
  listeners.clear()
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(fn)
    },
    removeEventListener: (type: string, fn: Listener) => {
      listeners.get(type)?.delete(fn)
    },
    dispatchEvent: (event: { type: string; detail?: unknown }) => {
      listeners.get(event.type)?.forEach((fn) => fn(event))
      return true
    }
  })
  vi.stubGlobal(
    'CustomEvent',
    class {
      type: string
      detail?: unknown
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    }
  )
}

describe('门户登录结果归一化（#932）', () => {
  it('适配层形状原样透传字段', () => {
    const adapted = { success: true, data: { student_id: '2510231106' } }
    expect(normalizePortalLoginOutcome(adapted)).toEqual({
      success: true,
      data: { student_id: '2510231106' }
    })

    const failed = { success: false, error: '密码错误' }
    expect(normalizePortalLoginOutcome(failed)).toEqual({ success: false, error: '密码错误' })
  })

  it('裸 UserInfo（直连 invoke 返回）包装为成功结果', () => {
    const raw = { student_id: '2510231106', name: '张三' }
    expect(normalizePortalLoginOutcome(raw)).toEqual({ success: true, data: raw })
  })

  it('空值 / 非对象一律判为失败', () => {
    expect(normalizePortalLoginOutcome(null).success).toBe(false)
    expect(normalizePortalLoginOutcome(undefined).success).toBe(false)
    expect(normalizePortalLoginOutcome('oops').success).toBe(false)
  })

  it('有 success 但无 data 的载荷（如学习通登录）提升顶层 student_id', () => {
    const raw = { success: true, student_id: '2510231106', username: '张三' }

    const normalized = normalizePortalLoginOutcome(raw)

    expect(normalized.success).toBe(true)
    expect((normalized.data as Record<string, unknown>).student_id).toBe('2510231106')
  })

  it('triggersLoginCooldown 只认门户密码登录（其余命令不走 client.login）', () => {
    expect(triggersLoginCooldown(LOGIN_METHOD_PORTAL_PASSWORD)).toBe(true)
    expect(triggersLoginCooldown(LOGIN_METHOD_PORTAL_QR)).toBe(false)
    expect(triggersLoginCooldown(LOGIN_METHOD_CHAOXING_PASSWORD)).toBe(false)
    expect(triggersLoginCooldown('')).toBe(false)
  })
})

describe('门户登录成功通道（#932）', () => {
  beforeEach(() => {
    installFakeWindow()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('订阅者能收到发布载荷（不依赖组件实例是否仍挂载）', () => {
    const handler = vi.fn()
    subscribePortalLoginSucceeded(handler)

    publishPortalLoginSucceeded({ studentId: '2510231106', method: 'portal_password' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toMatchObject({
      studentId: '2510231106',
      method: 'portal_password'
    })
  })

  it('取消订阅后不再接收', () => {
    const handler = vi.fn()
    const dispose = subscribePortalLoginSucceeded(handler)
    dispose()

    publishPortalLoginSucceeded({ studentId: '2510231106', method: 'portal_qr_temp' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('多个订阅者都能收到同一次成功', () => {
    const first = vi.fn()
    const second = vi.fn()
    subscribePortalLoginSucceeded(first)
    subscribePortalLoginSucceeded(second)

    publishPortalLoginSucceeded({ studentId: '2510231106', method: 'portal_password' })

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })
})
