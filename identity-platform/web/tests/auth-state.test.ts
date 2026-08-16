/**
 * 授权接力状态机测试（#630 Component/State 验收项）。
 * 覆盖：valid request / missing handoff / loading→waiting→opened→approved /
 * denied / expired / 网络错误恢复 / countdown 本地过期 / 终态幂等 / duplicate resume only once。
 */
import { describe, expect, it } from 'vitest'
import {
  handoffReducer,
  INITIAL_HANDOFF_STATE,
  isPollTerminalPhase,
  isTerminalPhase,
  type HandoffState,
} from '../lib/auth/state'
import { BASE_DETAIL } from './fixtures'

function step(state: HandoffState, events: Parameters<typeof handoffReducer>[1][]): HandoffState {
  return events.reduce((s, e) => handoffReducer(s, e), state)
}

describe('状态机主流程', () => {
  it('完整 happy path：LOADING → WAITING_APP → APP_OPENED → APPROVED → REDIRECTING', () => {
    const final = step(INITIAL_HANDOFF_STATE, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'STATUS', status: 'waiting_app' },
      { type: 'STATUS', status: 'app_opened' },
      { type: 'STATUS', status: 'approved' },
      { type: 'RESUME_OK', redirectTo: 'https://course.example.com/cb?code=x' },
    ])
    expect(final.phase).toBe('REDIRECTING')
    expect(final.redirectTo).toBe('https://course.example.com/cb?code=x')
    expect(final.detail).toEqual(BASE_DETAIL)
  })

  it('valid request：DETAIL_OK 后进入 WAITING_APP 且保存详情', () => {
    const s = handoffReducer(INITIAL_HANDOFF_STATE, { type: 'DETAIL_OK', detail: BASE_DETAIL })
    expect(s.phase).toBe('WAITING_APP')
    expect(s.detail).toEqual(BASE_DETAIL)
    expect(s.lastError).toBeNull()
  })

  it('missing handoff：进入 INVALID 并带专属错误码', () => {
    const s = handoffReducer(INITIAL_HANDOFF_STATE, { type: 'MISSING_HANDOFF' })
    expect(s.phase).toBe('INVALID')
    expect(s.lastError).toBe('missing_handoff')
  })

  it('denied：STATUS denied 进入 DENIED', () => {
    const s = step(INITIAL_HANDOFF_STATE, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'STATUS', status: 'denied' },
    ])
    expect(s.phase).toBe('DENIED')
  })

  it('expired：DETAIL_ERROR expired 与 STATUS expired 都进入 EXPIRED', () => {
    const a = handoffReducer(INITIAL_HANDOFF_STATE, { type: 'DETAIL_ERROR', code: 'expired' })
    expect(a.phase).toBe('EXPIRED')
    const b = step(INITIAL_HANDOFF_STATE, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'STATUS', status: 'expired' },
    ])
    expect(b.phase).toBe('EXPIRED')
  })

  it('client unavailable：进入 CLIENT_UNAVAILABLE', () => {
    const s = handoffReducer(INITIAL_HANDOFF_STATE, { type: 'DETAIL_ERROR', code: 'client_unavailable' })
    expect(s.phase).toBe('CLIENT_UNAVAILABLE')
  })

  it('handoff 非法/请求不存在：进入 INVALID', () => {
    expect(handoffReducer(INITIAL_HANDOFF_STATE, { type: 'DETAIL_ERROR', code: 'invalid_handoff' }).phase).toBe('INVALID')
    expect(handoffReducer(INITIAL_HANDOFF_STATE, { type: 'DETAIL_ERROR', code: 'not_found' }).phase).toBe('INVALID')
    expect(handoffReducer(INITIAL_HANDOFF_STATE, { type: 'DETAIL_ERROR', code: 'invalid_request' }).phase).toBe('INVALID')
  })

  it('未知/内部错误：视为网络级错误进入 NETWORK_ERROR（可恢复，非终态）', () => {
    const s = handoffReducer(INITIAL_HANDOFF_STATE, { type: 'DETAIL_ERROR', code: 'internal' })
    expect(s.phase).toBe('NETWORK_ERROR')
    expect(isTerminalPhase(s.phase)).toBe(false)
  })
})

describe('网络错误恢复', () => {
  it('详情已加载时 NETWORK_ERROR → RETRY 回到 WAITING_APP', () => {
    const s = step(INITIAL_HANDOFF_STATE, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'NETWORK_ERROR' },
      { type: 'RETRY' },
    ])
    expect(s.phase).toBe('WAITING_APP')
    expect(s.lastError).toBeNull()
  })

  it('详情未加载时 NETWORK_ERROR → RETRY 回到 LOADING', () => {
    const s = step(INITIAL_HANDOFF_STATE, [{ type: 'NETWORK_ERROR' }, { type: 'RETRY' }])
    expect(s.phase).toBe('LOADING')
  })

  it('非 NETWORK_ERROR 阶段 RETRY 是 no-op', () => {
    const s = handoffReducer({ ...INITIAL_HANDOFF_STATE, phase: 'WAITING_APP', detail: BASE_DETAIL }, { type: 'RETRY' })
    expect(s.phase).toBe('WAITING_APP')
  })
})

describe('本地倒计时过期（真正过期判断仍以 Core 为准）', () => {
  it('详情存在时 EXPIRE_LOCAL 进入 EXPIRED', () => {
    const s = step(INITIAL_HANDOFF_STATE, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'EXPIRE_LOCAL' },
    ])
    expect(s.phase).toBe('EXPIRED')
    expect(s.lastError).toBe('expired')
  })

  it('详情缺失时 EXPIRE_LOCAL 是 no-op', () => {
    const s = handoffReducer(INITIAL_HANDOFF_STATE, { type: 'EXPIRE_LOCAL' })
    expect(s.phase).toBe('LOADING')
  })
})

describe('resume 流程（幂等与单次语义）', () => {
  it('RESUME_OK 进入 REDIRECTING 并保存回调', () => {
    const s = step(INITIAL_HANDOFF_STATE, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'STATUS', status: 'approved' },
      { type: 'RESUME_OK', redirectTo: 'https://app.example.com/cb' },
    ])
    expect(s.phase).toBe('REDIRECTING')
  })

  it('duplicate resume only once：REDIRECTING 后任何事件（含再次 RESUME_OK）都是 no-op', () => {
    const once = step(INITIAL_HANDOFF_STATE, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'STATUS', status: 'approved' },
      { type: 'RESUME_OK', redirectTo: 'https://app.example.com/cb' },
    ])
    const twice = handoffReducer(once, { type: 'RESUME_OK', redirectTo: 'https://evil.example.com/' })
    expect(twice).toEqual(once)
    // 终态后 STATUS 事件同样 no-op
    expect(handoffReducer(twice, { type: 'STATUS', status: 'denied' })).toEqual(once)
  })

  it('RESUME_ERROR 留在 APPROVED；RETRY_RESUME 递增计数后可再次成功', () => {
    const failed = step(INITIAL_HANDOFF_STATE, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'STATUS', status: 'approved' },
      { type: 'RESUME_ERROR' },
    ])
    expect(failed.phase).toBe('APPROVED')
    expect(failed.lastError).toBe('resume')
    const retried = handoffReducer(failed, { type: 'RETRY_RESUME' })
    expect(retried.resumeAttempt).toBe(1)
    const done = handoffReducer(retried, { type: 'RESUME_OK', redirectTo: 'https://app.example.com/cb' })
    expect(done.phase).toBe('REDIRECTING')
  })

  it('APPROVED 阶段不接受 STATUS 事件（轮询已停，resume 是唯一通道）', () => {
    const approved = step(INITIAL_HANDOFF_STATE, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'STATUS', status: 'approved' },
    ])
    expect(handoffReducer(approved, { type: 'STATUS', status: 'denied' }).phase).toBe('APPROVED')
    expect(handoffReducer(approved, { type: 'EXPIRE_LOCAL' }).phase).toBe('APPROVED')
  })

  it('硬终态（DENIED/EXPIRED/INVALID）不再接受任何事件', () => {
    for (const phase of ['DENIED', 'EXPIRED', 'INVALID', 'CLIENT_UNAVAILABLE'] as const) {
      const terminal = { ...INITIAL_HANDOFF_STATE, phase }
      const after = handoffReducer(terminal, { type: 'DETAIL_OK', detail: BASE_DETAIL })
      expect(after).toEqual(terminal)
      const afterStatus = handoffReducer(terminal, { type: 'STATUS', status: 'approved' })
      expect(afterStatus).toEqual(terminal)
    }
  })
})

describe('轮询阶段判定', () => {
  it('等待/网络错误阶段可轮询；终态与 APPROVED 不再轮询', () => {
    expect(isPollTerminalPhase('WAITING_APP')).toBe(false)
    expect(isPollTerminalPhase('APP_OPENED')).toBe(false)
    expect(isPollTerminalPhase('NETWORK_ERROR')).toBe(false)
    expect(isPollTerminalPhase('APPROVED')).toBe(true) // 轮询停，resume 单独驱动
    expect(isPollTerminalPhase('REDIRECTING')).toBe(true)
    expect(isPollTerminalPhase('DENIED')).toBe(true)
    expect(isPollTerminalPhase('EXPIRED')).toBe(true)
    expect(isPollTerminalPhase('INVALID')).toBe(true)
    expect(isPollTerminalPhase('CLIENT_UNAVAILABLE')).toBe(true)
  })
})

describe('刷新页面场景', () => {
  it('刷新后状态机从 INITIAL 重新初始化，可再次完成 resume（Core 幂等兜底）', () => {
    // 刷新 = 全新 reducer；hash 仍在 → 详情/状态重新拉取
    const fresh = INITIAL_HANDOFF_STATE
    const afterRefresh = step(fresh, [
      { type: 'DETAIL_OK', detail: BASE_DETAIL },
      { type: 'STATUS', status: 'approved' },
      { type: 'RESUME_OK', redirectTo: null },
    ])
    expect(afterRefresh.phase).toBe('REDIRECTING')
  })
})
