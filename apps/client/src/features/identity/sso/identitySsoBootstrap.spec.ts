// src/features/identity/sso/identitySsoBootstrap.spec.ts
//
// Epic #1243（G1-04 / mini-hbut#1248）契约测试：登录后无感 SSO 初始化的幂等与安全边界。
//
// 守的契约：
//   1. 非 Tauri / 无学号 / 被禁用 → **跳过且不发起授权**（不能在没有原生能力时瞎跑）；
//   2. 已有有效会话 → 跳过（不重复打开授权页）；
//   3. 无会话 → 发起一次授权；
//   4. **并发去重**：同一学号并发调用只真正跑一次（防止登录事件抖动开多个授权页）；
//   5. **切号作废**：await 后代际变化 → 结果丢弃（绝不把旧学号结果写进新学号）；
//   6. **永不抛**：依赖抛错只转成 `{ok:false, reason}`，登录主流程不受影响；
//   7. **失败不永久熔断**：一次失败后再次调用仍会重试（网络恢复能自愈）；
//   8. 不同学号互不去重（各自独立）。

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetIdentitySsoBootstrapState,
  bootstrapIdentitySso,
  scheduleIdentitySsoBootstrap
} from './identitySsoBootstrap'

const SID = 'T9000001'

const deps = (overrides: Record<string, unknown> = {}) => ({
  isTauri: () => true,
  enabled: () => true,
  sessionStatus: vi.fn(async () => ({ ok: false })),
  begin: vi.fn(async () => ({ ok: true })),
  now: () => 1_760_000_000_000,
  ...overrides
})

describe('bootstrapIdentitySso', () => {
  beforeEach(() => {
    __resetIdentitySsoBootstrapState()
  })

  it('非 Tauri 运行时跳过且不发起授权', async () => {
    const d = deps({ isTauri: () => false })
    const res = await bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    expect(res).toMatchObject({ ok: false, skipped: true, reason: 'not_tauri' })
    expect(d.begin).not.toHaveBeenCalled()
  })

  it('没有学号时跳过', async () => {
    const d = deps()
    const res = await bootstrapIdentitySso({ studentId: '   ', epoch: 1 }, d)
    expect(res).toMatchObject({ skipped: true, reason: 'no_student_id' })
    expect(d.begin).not.toHaveBeenCalled()
  })

  it('被禁用时跳过（远端/调试开关）', async () => {
    const d = deps({ enabled: () => false })
    const res = await bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    expect(res).toMatchObject({ skipped: true, reason: 'disabled' })
    expect(d.begin).not.toHaveBeenCalled()
  })

  it('已有有效会话时不重复打开授权页', async () => {
    const d = deps({ sessionStatus: vi.fn(async () => ({ ok: true })) })
    const res = await bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    expect(res).toMatchObject({ ok: true, skipped: true, reason: 'session_valid' })
    expect(d.begin).not.toHaveBeenCalled()
  })

  it('没有会话时发起一次授权', async () => {
    const d = deps()
    const res = await bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    expect(res).toMatchObject({ ok: true, skipped: false, reason: 'begun' })
    expect(d.begin).toHaveBeenCalledTimes(1)
    expect(res.beganAt).toBe(1_760_000_000_000)
  })

  it('同一学号并发调用只真正跑一次（in-flight 去重）', async () => {
    // 用对象持有 release：避免 TS 把 `let release` 收窄成 never
    const gate: { release?: () => void } = {}
    const begin = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          gate.release = () => resolve({ ok: true })
        })
    )
    const d = deps({ begin })

    const p1 = bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    const p2 = bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)

    // 让 runBootstrap 跑过 `await sessionStatus()`（异步），此时才真正进入 begin
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(begin).toHaveBeenCalledTimes(1)

    gate.release?.()
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual(r2)
    expect(begin).toHaveBeenCalledTimes(1)
  })

  it('不同学号互不去重（各自独立发起）', async () => {
    const d = deps()
    await Promise.all([
      bootstrapIdentitySso({ studentId: 'T9000001', epoch: 1 }, d),
      bootstrapIdentitySso({ studentId: 'T9000002', epoch: 1 }, d)
    ])
    expect(d.begin).toHaveBeenCalledTimes(2)
  })

  it('切号（await 后代际变化）→ 结果作废，reason=epoch_changed', async () => {
    let epoch = 1
    const begin = vi.fn(async () => {
      epoch = 2 // 授权过程中用户切号
      return { ok: true }
    })
    const d = deps({ begin })
    const res = await bootstrapIdentitySso({ studentId: SID, epoch: 1, getEpoch: () => epoch }, d)
    expect(res).toMatchObject({ ok: false, skipped: false, reason: 'epoch_changed' })
  })

  it('会话查询抛错时不抛，按「无会话」继续尝试', async () => {
    const d = deps({
      sessionStatus: vi.fn(async () => {
        throw new Error('native unavailable')
      })
    })
    const res = await bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    expect(res).toMatchObject({ ok: true, reason: 'begun' })
    expect(d.begin).toHaveBeenCalledTimes(1)
  })

  it('begin 抛错 → begin_failed 且不抛异常', async () => {
    const d = deps({
      begin: vi.fn(async () => {
        throw new Error('oidc exploded')
      })
    })
    const res = await bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    expect(res).toMatchObject({ ok: false, reason: 'begin_failed' })
  })

  it('begin 返回 ok=false → begin_failed（不假装成功）', async () => {
    const d = deps({ begin: vi.fn(async () => ({ ok: false })) })
    const res = await bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    expect(res).toMatchObject({ ok: false, reason: 'begin_failed' })
  })

  it('失败不永久熔断：下一次调用会重试', async () => {
    const begin = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true })
    const d = deps({ begin })

    const first = await bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    expect(first).toMatchObject({ ok: false, reason: 'begin_failed' })

    const second = await bootstrapIdentitySso({ studentId: SID, epoch: 1 }, d)
    expect(second).toMatchObject({ ok: true, reason: 'begun' })
    expect(begin).toHaveBeenCalledTimes(2)
  })

  it('scheduleIdentitySsoBootstrap 永不抛（fire-and-forget）', async () => {
    const d = deps({
      begin: vi.fn(async () => {
        throw new Error('boom')
      })
    })
    expect(() => scheduleIdentitySsoBootstrap({ studentId: SID, epoch: 1 }, d)).not.toThrow()
    // 让微任务跑完，确保内部 catch 生效（无未处理拒绝）
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
