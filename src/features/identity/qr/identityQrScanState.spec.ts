// src/features/identity/qr/identityQrScanState.spec.ts
//
// #627 扫描器 UI 状态机测试（issue「Mobile」清单中可在 node 环境覆盖的部分）：
//   - camera permission denied -> 降级入口（permission_needed）；
//   - file/image fallback（取消选择 / 队列拒绝 -> 回扫描态）；
//   - background/resume（关闭/重新打开 -> RESET 不残留）；
//   - invalid_code / expired_request / loading_request / approval_opened 迁移；
//   - 未知事件不破坏状态。

import { describe, expect, it } from 'vitest'
import {
  identityQrScanReducer,
  INITIAL_QR_SCAN_STATE,
  type IdentityQrScanEvent
} from './identityQrScanState'

const run = (events: IdentityQrScanEvent[]) =>
  events.reduce(identityQrScanReducer, INITIAL_QR_SCAN_STATE)

describe('identityQrScanState: 初始与重置（background/resume 安全）', () => {
  it('初始为 scanning', () => {
    expect(INITIAL_QR_SCAN_STATE.phase).toBe('scanning')
  })

  it('打开（OPEN）一律回到 scanning（上一次的错误/终态不跨会话残留）', () => {
    expect(run([{ type: 'PARSE_INVALID' }]).phase).toBe('invalid_code')
    expect(run([{ type: 'PARSE_INVALID' }, { type: 'OPEN' }]).phase).toBe('scanning')
    expect(run([{ type: 'REQUEST_EXPIRED' }, { type: 'OPEN' }]).phase).toBe('scanning')
  })

  it('RESET（组件卸载/切后台清理）回到初始态', () => {
    const after = run([
      { type: 'PICK_STARTED' },
      { type: 'SUBMITTED' },
      { type: 'APPROVAL_OPENED' },
      { type: 'RESET' }
    ])
    expect(after).toEqual(INITIAL_QR_SCAN_STATE)
  })

  it('未知事件不改变状态（fail-safe）', () => {
    const state = run([{ type: 'PICK_STARTED' }])
    expect(identityQrScanReducer(state, { type: 'UNKNOWN' } as never)).toBe(state)
  })
})

describe('identityQrScanState: 权限与降级（Mobile: camera permission denied）', () => {
  it('PERMISSION_DENIED -> permission_needed（保留相册/手动降级入口）', () => {
    expect(run([{ type: 'PERMISSION_DENIED' }]).phase).toBe('permission_needed')
  })

  it('permission_needed 后用户仍可用相册/粘贴（PICK_STARTED 继续流程）', () => {
    const state = run([{ type: 'PERMISSION_DENIED' }, { type: 'PICK_STARTED' }])
    expect(state.phase).toBe('parsing')
  })
})

describe('identityQrScanState: file/image fallback（Mobile: file input）', () => {
  it('选择图片后进入 parsing（本地解码中）', () => {
    expect(run([{ type: 'PICK_STARTED' }]).phase).toBe('parsing')
  })

  it('用户取消选择器 / 图片无效 -> invalid_code（统一通用文案状态）', () => {
    expect(run([{ type: 'PICK_STARTED' }, { type: 'PARSE_INVALID' }]).phase).toBe('invalid_code')
  })

  it('提交被拒（重复/队列满）-> 回 scanning 可换码重扫', () => {
    const state = run([
      { type: 'PICK_STARTED' },
      { type: 'SUBMIT_REJECTED' }
    ])
    expect(state.phase).toBe('scanning')
  })

  it('扫描流程全链路：scanning -> parsing -> loading_request -> approval_opened', () => {
    const state = run([
      { type: 'PICK_STARTED' },
      { type: 'SUBMITTED' },
      { type: 'APPROVAL_OPENED' }
    ])
    expect(state.phase).toBe('approval_opened')
  })
})

describe('identityQrScanState: 过期与无效（issue UI 状态）', () => {
  it('Core 判定过期 -> expired_request（明确文案：请重新发起登录）', () => {
    const state = run([{ type: 'PICK_STARTED' }, { type: 'SUBMITTED' }, { type: 'REQUEST_EXPIRED' }])
    expect(state.phase).toBe('expired_request')
  })

  it('提交后进入 loading_request（等待详情/Overlay 接管）', () => {
    expect(run([{ type: 'PICK_STARTED' }, { type: 'SUBMITTED' }]).phase).toBe('loading_request')
  })
})
